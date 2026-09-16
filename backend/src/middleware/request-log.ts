import type { FastifyRequest } from "fastify";
import type { Logger } from "../logger.js";

/**
 * Operation-level observability. Logs a compact trace line per request with
 * bounded fields: method, path, status, duration, and user id. No bodies are
 * logged and secrets are redacted by the logger config.
 */
export function makeRequestLogHook(logger: Logger) {
  return function requestLogHook(req: FastifyRequest) {
    const startedAt = performance.now();
    req.raw.on("close", () => {
      const durationMs = Math.round(performance.now() - startedAt);
      const res = req.raw.res;
      logger.info(
        {
          rel: req.id,
          method: req.method,
          path: req.url.split("?")[0],
          status: res.statusCode,
          durationMs,
        },
        "request finished",
      );
    });
  };
}