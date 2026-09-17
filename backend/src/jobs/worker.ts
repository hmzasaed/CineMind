import type { MovieDataAdapter } from "../providers/types.js";
import { ingestMovie, type IngestionStore } from "../services/ingestion.js";
import { getErrorMessage } from "../util.js";
import type { IngestionJob, IngestionJobStore } from "./types.js";

export interface WorkerLogger {
  info(obj?: Record<string, unknown>, msg?: string): void;
  warn(obj?: Record<string, unknown>, msg?: string): void;
  error(obj?: Record<string, unknown>, msg?: string): void;
}

export interface WorkerDeps {
  adapter: MovieDataAdapter;
  store: IngestionStore;
  jobStore: IngestionJobStore;
  logger?: WorkerLogger;
  /** Delay before a failed job becomes claimable again (default 60s). */
  retryDelayMs?: number;
}

const NOOP_LOGGER: WorkerLogger = { info: () => {}, warn: () => {}, error: () => {} };

/**
 * Process one claimed job. Heavy fetch+persist work happens only here — never
 * in an HTTP request handler. Failures reschedule until maxAttempts, then the
 * job is marked failed (it stays visible for ops).
 */
export async function processJob(job: IngestionJob, deps: WorkerDeps): Promise<void> {
  const log = deps.logger ?? NOOP_LOGGER;
  try {
    if (job.kind === "refresh_movie") {
      const ref = await ingestMovie(deps.adapter, deps.store, job.externalId);
      await deps.jobStore.complete(job.id);
      log.info({ kind: job.kind, externalId: job.externalId, movieId: ref.movieId }, "job completed");
      return;
    }
    if (job.kind === "refresh_upcoming") {
      const upcoming = await deps.adapter.getUpcoming({ limit: 20 });
      let enqueued = 0;
      for (const movie of upcoming.value) {
        const existing = await deps.store.getMovieId(deps.adapter.name, movie.id);
        if (existing) continue;
        await deps.jobStore.enqueue({
          kind: "refresh_movie",
          provider: deps.adapter.name,
          externalId: movie.id,
          payload: { source: "upcoming", title: movie.title, retrievedAt: upcoming.provenance.retrievedAt },
        });
        enqueued += 1;
      }
      await deps.jobStore.complete(job.id);
      log.info({ kind: job.kind, found: upcoming.value.length, enqueued }, "upcoming refresh done");
      return;
    }
    await deps.jobStore.fail(job.id, `unknown job kind: ${job.kind}`);
  } catch (error) {
    const message = getErrorMessage(error);
    log.warn({ jobId: job.id, kind: job.kind, attempt: job.attempts, error: message }, "job failed");
    await deps.jobStore.fail(job.id, message, { rescheduleInMs: deps.retryDelayMs ?? 60_000 });
  }
}

/** Drain all due jobs (bounded). Returns number processed. */
export async function runPendingJobs(
  deps: WorkerDeps,
  opts: { limit?: number } = {},
): Promise<number> {
  const limit = opts.limit ?? Number.POSITIVE_INFINITY;
  let processed = 0;
  for (;;) {
    if (processed >= limit) break;
    const job = await deps.jobStore.claimNext();
    if (!job) break;
    await processJob(job, deps);
    processed += 1;
  }
  return processed;
}

export interface WorkerHandle {
  stop(): void;
}

/** Polling worker loop. Call `stop()` (or abort via signal) to shut down. */
export function startWorker(
  deps: WorkerDeps,
  opts: { pollIntervalMs?: number; signal?: AbortSignal } = {},
): WorkerHandle {
  const log = deps.logger ?? NOOP_LOGGER;
  const pollIntervalMs = opts.pollIntervalMs ?? 5000;
  const timer = setInterval(() => {
    void runPendingJobs(deps).catch((error: unknown) => {
      log.error({ error: getErrorMessage(error) }, "worker cycle failed");
    });
  }, pollIntervalMs);
  timer.unref?.();
  const onAbort = () => {
    clearInterval(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  };
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  return {
    stop: () => {
      clearInterval(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    },
  };
}