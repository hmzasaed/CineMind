import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { AppError } from "../errors.js";
import { getErrorMessage } from "../util.js";
import type { Logger } from "../logger.js";

/**
 * Client-safe messages for Fastify's own 4xx errors (JSON body parse errors,
 * oversized payloads, schema validation). Everything else is logged and
 * returned generically - never internal details.
 */
const SAFE_FASTIFY_ERRORS: Record<string, string> = {
  FST_ERR_CTP_INVALID_MEDIA_TYPE: "Content-Type must be application/json",
  FST_ERR_CTP_EMPTY_JSON_BODY: "Request body must be JSON",
  FST_ERR_CTP_INVALID_JSON_BODY: "Request body must be valid JSON",
  FST_ERR_CTP_BODY_TOO_LARGE: "Request body too large",
  FST_ERR_VALIDATION: "Request failed validation",
};

function isFastifyError(error: unknown): { statusCode: number; code?: string } | null {
  if (typeof error !== "object" || error === null) return null;
  const e = error as { statusCode?: unknown; code?: unknown };
  if (typeof e.statusCode !== "number") return null;
  return {
    statusCode: e.statusCode,
    code: typeof e.code === "string" ? e.code : undefined,
  };
}

/**
 * Central error → response mapping. Only bounded operational fields leak to
 * clients; unknown errors are logged with a request id and returned generically.
 */
export function errorHandler(logger: Logger) {
  return function (
    error: unknown,
    req: FastifyRequest,
    reply: FastifyReply,
  ): void {
    if (error instanceof AppError) {
      void reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message },
      });
      return;
    }
    if (error instanceof ZodError) {
      void reply.code(422).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request failed validation",
          details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      });
      return;
    }

    const fastifyError = isFastifyError(error);
    if (fastifyError) {
      if (fastifyError.statusCode === 429) {
        const retryAfter =
          reply.getHeader("retry-after") ??
          (error as { retryAfter?: unknown }).retryAfter;
        void reply.code(429).send({
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many requests, please slow down",
            retryAfter: retryAfter === undefined ? undefined : String(retryAfter),
          },
        });
        return;
      }
      if (fastifyError.statusCode >= 400 && fastifyError.statusCode < 500) {
        const message =
          (fastifyError.code && SAFE_FASTIFY_ERRORS[fastifyError.code]) || "Malformed request";
        void reply
          .code(fastifyError.statusCode)
          .send({ error: { code: "INVALID_REQUEST", message } });
        return;
      }
    }

    logger.error({ rel: req.id, err: getErrorMessage(error) }, "unhandled error");
    void reply.code(500).send({
      error: { code: "INTERNAL", message: "Internal server error", requestId: req.id },
    });
  };
}