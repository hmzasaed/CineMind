import type { FastifyReply, FastifyRequest } from "fastify";
import type { Logger } from "../logger.js";

/**
 * Operation-level observability. Logs a compact trace line per request with
 * bounded fields: method, path, status, duration. No bodies are logged and
 * secrets are redacted by the logger config.
 *
 * Uses only onResponse + reply.elapsedTime so it works correctly with
 * light-my-request inject() and Fastify v5/Node 25.
 */
export function makeRequestLogHook(logger: Logger) {
  return function onResponse(req: FastifyRequest, reply: FastifyReply): void {
    logger.info(
      {
        rel: req.id,
        method: req.method,
        path: req.url.split("?")[0],
        status: reply.statusCode,
        durationMs: reply.elapsedTime,
      },
      "request finished",
    );
  };
}