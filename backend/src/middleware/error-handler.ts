import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { AppError } from "../errors.js";
import { getErrorMessage } from "../util.js";
import type { Logger } from "../logger.js";

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
    logger.error({ rel: req.id, err: getErrorMessage(error) }, "unhandled error");
    void reply.code(500).send({
      error: { code: "INTERNAL", message: "Internal server error", requestId: req.id },
    });
  };
}