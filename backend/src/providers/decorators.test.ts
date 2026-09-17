import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "./errors.js";
import { decorateAdapter, type DecorateOptions } from "./decorators.js";
import type { Fact } from "../types.js";
import type {
  MovieDataAdapter,
  MovieDetail,
  MovieCredits,
  MovieImages,
  MovieRating,
  ProductionCompany,
  MovieFinancials,
  MovieRecord,
} from "./types.js";
import { mkProvenance } from "./types.js";

const detail: MovieDetail = {
  id: "550",
  title: "Fight Club",
  releaseYear: 1999,
  genre: ["Drama"],
  rating: { average: 8.8, votes: 2200000 },
};

function fact<T>(value: T, sourceId = "fake:550"): Fact<T> {
  return { value, provenance: mkProvenance("fake", "api", sourceId, 0.9) };
}

function makeAdapter(handlers: Partial<Record<keyof MovieDataAdapter, (...args: never[]) => Promise<unknown>>>): MovieDataAdapter {
  const base: MovieDataAdapter = {
    name: "fake",
    attribution: { provider: "fake", licensed: false },
    getMovie: async (id) => fact<MovieDetail | null>(id === "550" ? detail : null),
    search: async () => fact<MovieRecord[]>([detail]),
    getUpcoming: async () => fact<MovieRecord[]>([detail]),
    getCredits: async () =>
      fact<MovieCredits | null>({ id: "550", cast: [], crew: [] }),
    getImages: async () => fact<MovieImages | null>({ id: "550", posters: [], backdrops: [] }),
    getRatings: async () => fact<MovieRating | null>({ id: "550", average: 8.8, votes: 2200000 }),
    getProductionCompanies: async () => fact<ProductionCompany[] | null>([]),
    getFinancials: async () =>
      fact<MovieFinancials | null>({ id: "550", budget: 63000000, currency: "USD" }),
    lastCacheStatus: () => "miss",
  };
  return Object.assign(base, handlers as Partial<MovieDataAdapter>);
}

function never(): Promise<never> {
  return new Promise<never>(() => {});
}

const noRetry: DecorateOptions = { timeoutMs: 50, maxAttempts: 1, baseDelayMs: 10, cacheTtlMs: 0, serveStaleOnError: false };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("timeout", () => {
  it("aborts a hanging provider call with UPSTREAM_TIMEOUT", async () => {
    const adapter = decorateAdapter(
      makeAdapter({ getMovie: () => never() }),
      { ...noRetry, timeoutMs: 30 },
    );
    await expect(adapter.getMovie("550")).rejects.toMatchObject({ code: "UPSTREAM_TIMEOUT" });
  });
});

describe("retry", () => {
  it("retries transient failures up to maxAttempts then succeeds", async () => {
    let calls = 0;
    const adapter = decorateAdapter(
      makeAdapter({
        getMovie: async () => {
          calls += 1;
          if (calls < 3) {
            throw new ProviderError("UPSTREAM", "boom", "fake");
          }
          return fact<MovieDetail | null>(detail);
        },
      }),
      { ...noRetry, maxAttempts: 3, baseDelayMs: 1 },
    );
    const result = await adapter.getMovie("550");
    expect(calls).toBe(3);
    expect(result.value?.title).toBe("Fight Club");
  });

  it("exhausts the budget and throws the last error", async () => {
    let calls = 0;
    const adapter = decorateAdapter(
      makeAdapter({
        getMovie: async () => {
          calls += 1;
          throw new ProviderError("UPSTREAM", "boom", "fake");
        },
      }),
      { ...noRetry, maxAttempts: 2, baseDelayMs: 1 },
    );
    await expect(adapter.getMovie("550")).rejects.toMatchObject({ code: "UPSTREAM" });
    expect(calls).toBe(2);
  });

  it("never retries INVALID_RESPONSE or NOT_FOUND", async () => {
    for (const code of ["INVALID_RESPONSE", "NOT_FOUND"] as const) {
      let calls = 0;
      const adapter = decorateAdapter(
        makeAdapter({
          getMovie: async () => {
            calls += 1;
            throw new ProviderError(code, "no", "fake");
          },
        }),
        { ...noRetry, maxAttempts: 3, baseDelayMs: 1 },
      );
      await expect(adapter.getMovie("550")).rejects.toMatchObject({ code });
      expect(calls).toBe(1);
    }
  });

  it("honors retry-after on 429 rate-limit errors", async () => {
    let calls = 0;
    const adapter = decorateAdapter(
      makeAdapter({
        getMovie: async () => {
          calls += 1;
          if (calls === 1) {
            throw new ProviderError("UPSTREAM_RATE_LIMITED", "slow down", "fake", { retryAfterMs: 10 });
          }
          return fact<MovieDetail | null>(detail);
        },
      }),
      { ...noRetry, maxAttempts: 2, baseDelayMs: 1 },
    );
    await expect(adapter.getMovie("550")).resolves.toMatchObject({ value: { title: "Fight Club" } });
    expect(calls).toBe(2);
  });
});

describe("quota gate", () => {
  it("fast-fails with UPSTREAM_QUOTA after a rate-limit is exhausted", async () => {
    const adapter = decorateAdapter(
      makeAdapter({
        getMovie: async () => {
          throw new ProviderError("UPSTREAM_RATE_LIMITED", "nope", "fake", { retryAfterMs: 5000 });
        },
      }),
      { ...noRetry, maxAttempts: 1, baseDelayMs: 10 },
    );
    await expect(adapter.getMovie("550")).rejects.toMatchObject({ code: "UPSTREAM_RATE_LIMITED" });
    await expect(adapter.getMovie("550")).rejects.toMatchObject({ code: "UPSTREAM_QUOTA" });
  });
});

describe("cache", () => {
  it("serves a fresh hit from cache on the second call", async () => {
    let calls = 0;
    const adapter = decorateAdapter(
      makeAdapter({
        getMovie: async () => {
          calls += 1;
          return fact<MovieDetail | null>(detail);
        },
      }),
      { ...noRetry, cacheTtlMs: 60_000 },
    );
    const first = await adapter.getMovie("550");
    expect(adapter.lastCacheStatus()).toBe("miss");
    const second = await adapter.getMovie("550");
    expect(second.value?.id).toBe(first.value?.id);
    expect(calls).toBe(1);
    expect(adapter.lastCacheStatus()).toBe("hit");
  });

  it("serves stale-on-error for transient failures after TTL expiry", async () => {
    let calls = 0;
    const adapter = decorateAdapter(
      makeAdapter({
        getMovie: async () => {
          calls += 1;
          if (calls > 1) throw new ProviderError("UPSTREAM", "down", "fake");
          return fact<MovieDetail | null>(detail);
        },
      }),
      { ...noRetry, cacheTtlMs: 30, serveStaleOnError: true },
    );
    await adapter.getMovie("550");
    const stale = await adapter.getMovie("550"); // still within TTL -> hit
    expect(adapter.lastCacheStatus()).toBe("hit");
    await new Promise((r) => setTimeout(r, 40));
    const after = await adapter.getMovie("550"); // TTL expired -> stale fallback
    expect(after.value?.id).toBe(stale.value?.id);
    expect(adapter.lastCacheStatus()).toBe("stale");
  });
});