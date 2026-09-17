import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Loads .env for the process entrypoints (server, worker) before any config is
 * read. Import this first — `loadConfig` only ever reads `process.env`, so
 * nothing here can be deferred.
 *
 * The repo keeps one .env at the workspace root (see README), but `pnpm
 * --filter` runs with cwd = backend/, so the root file has to be resolved
 * relative to this module. A backend-local .env wins if one exists, which is
 * what a per-service override would use. Tests never import this: they build
 * their config explicitly.
 */
const here = dirname(fileURLToPath(import.meta.url));

const candidates = [
  resolve(here, "../../.env"), // workspace root (src/ and dist/ are both one level deep)
  resolve(here, "../.env"), // backend/.env — optional per-service override
  resolve(process.cwd(), ".env"),
];

for (const path of candidates) {
  if (existsSync(path)) loadDotenv({ path, quiet: true });
}
