import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import { isIngestionJobKind, type IngestionJobKind, type IngestionJobStore } from "../jobs/types.js";
import { badRequest, notFound } from "../errors.js";

const enqueueBody = z.object({
  kind: z.string(),
  externalId: z.string().min(1).max(128),
  provider: z.string().min(1).max(64).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  scheduleFor: z.string().datetime().optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
});

const idParam = z.object({ id: z.string().min(1).max(128) });

/**
 * Admin ingestion job endpoints. Enqueueing returns 202 immediately; the
 * worker performs the actual provider fetches + database writes.
 */
export function registerJobRoutes(
  app: FastifyInstance,
  deps: {
    jobStore: IngestionJobStore;
    requireAuth?: preHandlerHookHandler;
    requireAdmin?: preHandlerHookHandler;
  },
): void {
  const preHandler = [deps.requireAuth, deps.requireAdmin].filter(
    (h): h is preHandlerHookHandler => h !== undefined,
  );

  app.post("/admin/jobs", { preHandler }, async (req, reply) => {
    const input = enqueueBody.safeParse(req.body);
    if (!input.success) throw badRequest("Invalid job payload");
    const kind: IngestionJobKind = isIngestionJobKind(input.data.kind)
      ? input.data.kind
      : "refresh_movie";
    const job = await deps.jobStore.enqueue({
      kind,
      provider: input.data.provider ?? "tmdb",
      externalId: input.data.externalId,
      payload: input.data.payload,
      scheduleFor: input.data.scheduleFor,
      maxAttempts: input.data.maxAttempts,
    });
    return reply.code(202).send({ job });
  });

  app.get("/admin/jobs", { preHandler }, async (req) => {
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
        status: z.string().optional(),
        kind: z.string().optional(),
      })
      .safeParse(req.query);
    if (!query.success) throw badRequest("Invalid query");
    const jobs = await deps.jobStore.list({
      limit: query.data.limit,
      status: query.data.status as never,
      kind: query.data.kind as never,
    });
    return { jobs };
  });

  app.get("/admin/jobs/:id", { preHandler }, async (req) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) throw badRequest("Invalid job id");
    const job = await deps.jobStore.get(params.data.id);
    if (!job) throw notFound("Job not found");
    return { job };
  });
}