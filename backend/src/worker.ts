import "./env.js"; // must precede loadConfig — it only reads process.env
import { createMovieDataAdapter } from "./providers/index.js";
import { createIngestionStore } from "./services/ingestion.js";
import { createIngestionJobStore } from "./jobs/store.js";
import { runPendingJobs, startWorker, type WorkerDeps } from "./jobs/worker.js";
import { loadConfig } from "./config.js";

/**
 * Ingestion worker process. Claims jobs from the database, pulls provider
 * facts, and persists them; runs fully outside the HTTP request path.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const adapter = createMovieDataAdapter(config);
  const store = createIngestionStore(config);
  const jobStore = createIngestionJobStore(config);
  const deps: WorkerDeps = { adapter, store, jobStore };

  const abort = new AbortController();
  const shutdown = () => {
    abort.abort();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  startWorker(deps, { pollIntervalMs: config.jobPollIntervalMs, signal: abort.signal });
  // First sweep immediately so a startup backlog is drained.
  await runPendingJobs(deps);
}

void main();