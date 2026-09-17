import {
  isProviderError,
  isRetryable,
  isTransient,
  ProviderError,
} from "./errors.js";
import type {
  CacheStatus,
  MovieDataAdapter,
  MovieCredits,
  MovieFinancials,
  MovieImages,
  MovieRating,
  MovieRecord,
  ProductionCompany,
} from "./types.js";
import type { Fact } from "../types.js";

export interface DecorateOptions {
  /** Hard timeout per upstream attempt (ms). */
  timeoutMs: number;
  /** Total attempts per call, including the first. 1 disables retries. */
  maxAttempts: number;
  /** Base exponential backoff between attempts (ms). */
  baseDelayMs: number;
  /** Fresh-cache TTL (ms). 0 disables caching. */
  cacheTtlMs: number;
  /** Serve a stale cached value on transient upstream failure. */
  serveStaleOnError: boolean;
}

interface CacheEntry {
  expiresAt: number;
  fact: unknown;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Hard per-attempt timeout. A slow provider never holds the HTTP handler open. */
async function withTimeout<T>(
  run: () => Promise<T>,
  ms: number,
  provider: string,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new ProviderError(
                "UPSTREAM_TIMEOUT",
                `${provider} ${label} timed out after ${ms}ms`,
                provider,
              ),
            ),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function backoff(attempt: number, baseDelayMs: number): number {
  const jitter = 0.5 + Math.random() * 0.5;
  return Math.min(baseDelayMs * 2 ** (attempt - 1) * jitter, 15_000);
}

async function withRetry<T>(
  run: () => Promise<T>,
  opts: { maxAttempts: number; baseDelayMs: number },
): Promise<T> {
  if (opts.maxAttempts <= 1) return run();
  let lastError: ProviderError | undefined;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (!isProviderError(error)) throw error;
      if (!isRetryable(error.code)) throw error;
      lastError = error;
      if (attempt === opts.maxAttempts) throw error;
      const delay = Math.min(error.retryAfterMs ?? backoff(attempt, opts.baseDelayMs), 10_000);
      await sleep(delay);
    }
  }
  throw lastError;
}

/** Concise retry/cooldown gate: after a 429 happens it blocks until it passes. */
class QuotaGate {
  private until = 0;

  constructor(readonly defaultCooldownMs: number) {}

  permit(now = Date.now()): boolean {
    return now >= this.until;
  }

  remainingMs(now = Date.now()): number {
    return Math.max(this.until - now, 0);
  }

  blockFor(ms: number): void {
    this.until = Date.now() + Math.max(ms, 0);
  }
}

class Cache {
  private readonly entries = new Map<string, CacheEntry>();

  get(key: string): CacheEntry | undefined {
    return this.entries.get(key);
  }

  set(key: string, entry: CacheEntry): void {
    if (this.entries.size >= 512) this.entries.clear();
    this.entries.set(key, entry);
  }
}

interface CallContext {
  provider: string;
  label: string;
  timeoutMs: number;
  maxAttempts: number;
  baseDelayMs: number;
  cacheTtlMs: number;
  serveStaleOnError: boolean;
  gate: QuotaGate;
  cache: Cache;
  cacheStatus: { value: CacheStatus };
}

/** Wrap one adapter method behind timeout → retry → quota-gate → TTL cache. */
function wrap<A extends unknown[]>(
  fn: (...args: A) => Promise<Fact<unknown>>,
  ctx: CallContext,
): (...args: A) => Promise<Fact<unknown>> {
  return async (...args: A): Promise<Fact<unknown>> => {
    const key = JSON.stringify([ctx.label, args]);
    const cached = ctx.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      ctx.cacheStatus.value = "hit";
      return clone(cached.fact) as Fact<unknown>;
    }
    const runAttempt = () =>
      withTimeout(() => fn(...args), ctx.timeoutMs, ctx.provider, ctx.label);
    const runWithRetry = () =>
      withRetry(runAttempt, { maxAttempts: ctx.maxAttempts, baseDelayMs: ctx.baseDelayMs });

    async function run() {
      if (!ctx.gate.permit()) {
        throw new ProviderError(
          "UPSTREAM_QUOTA",
          `${ctx.provider} ${ctx.label}: quota cooldown active`,
          ctx.provider,
          { retryAfterMs: ctx.gate.remainingMs() },
        );
      }
      try {
        const fact = await runWithRetry();
        ctx.cacheStatus.value = "miss";
        if (ctx.cacheTtlMs > 0) {
          ctx.cache.set(key, { expiresAt: Date.now() + ctx.cacheTtlMs, fact });
        }
        return fact;
      } catch (error) {
        if (isProviderError(error, "UPSTREAM_RATE_LIMITED")) {
          ctx.gate.blockFor(error.retryAfterMs ?? ctx.gate.defaultCooldownMs);
        }
        throw error;
      }
    }

    try {
      return await run();
    } catch (error) {
      if (
        ctx.serveStaleOnError &&
        isProviderError(error) &&
        isTransient(error.code) &&
        cached !== undefined &&
        cached.expiresAt <= Date.now()
      ) {
        ctx.cacheStatus.value = "stale";
        return clone(cached.fact) as Fact<unknown>;
      }
      throw error;
    }
  };
}

/**
 * Compose the raw adapter behind timeout → retry → quota-gate → TTL cache.
 * The result still satisfies the plain MovieDataAdapter interface; only
 * `lastCacheStatus()` gains cache-visibility for the most recent call.
 */
export function decorateAdapter(raw: MovieDataAdapter, options: DecorateOptions): MovieDataAdapter {
  const cache = new Cache();
  const gate = new QuotaGate(options.baseDelayMs * 2);
  const cacheStatus: { value: CacheStatus } = { value: "miss" };

  const ctx = (label: string): CallContext => ({
    provider: raw.name,
    label,
    timeoutMs: options.timeoutMs,
    maxAttempts: options.maxAttempts,
    baseDelayMs: options.baseDelayMs,
    cacheTtlMs: options.cacheTtlMs,
    serveStaleOnError: options.serveStaleOnError,
    gate,
    cache: cache,
    cacheStatus,
  });

  const adapter: MovieDataAdapter = {
    name: raw.name,
    attribution: raw.attribution,
    getMovie: wrap(raw.getMovie.bind(raw), ctx("getMovie")) as MovieDataAdapter["getMovie"],
    search: wrap(raw.search.bind(raw), ctx("search")) as (args: {
      title: string;
      year?: number;
      limit?: number;
    }) => Promise<Fact<MovieRecord[]>>,
    getUpcoming: wrap(raw.getUpcoming.bind(raw), ctx("getUpcoming")) as (args?: {
      limit?: number;
    }) => Promise<Fact<MovieRecord[]>>,
    getCredits: wrap(raw.getCredits.bind(raw), ctx("getCredits")) as (id: string) => Promise<Fact<MovieCredits | null>>,
    getImages: wrap(raw.getImages.bind(raw), ctx("getImages")) as (id: string) => Promise<Fact<MovieImages | null>>,
    getRatings: wrap(raw.getRatings.bind(raw), ctx("getRatings")) as (id: string) => Promise<Fact<MovieRating | null>>,
    getProductionCompanies: wrap(raw.getProductionCompanies.bind(raw), ctx("getProductionCompanies")) as (
      id: string,
    ) => Promise<Fact<ProductionCompany[] | null>>,
    getFinancials: wrap(raw.getFinancials.bind(raw), ctx("getFinancials")) as (
      id: string,
    ) => Promise<Fact<MovieFinancials | null>>,
    lastCacheStatus: () => cacheStatus.value,
  };
  return adapter;
}

/** Build adapters with resilience disabled (used by deterministic tests). */
export const noResilienceOptions: DecorateOptions = {
  timeoutMs: 30_000,
  maxAttempts: 1,
  baseDelayMs: 200,
  cacheTtlMs: 0,
  serveStaleOnError: false,
};