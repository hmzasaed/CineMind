import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import type { MovieDataProvider } from "../providers/types.js";
import { badRequest, conflict, notFound } from "../errors.js";
import type { ReportReason, ReviewStore, SortOrder } from "../social/types.js";

const movieIdParam = z.object({ id: z.string().min(1).max(64) });
const reviewIdParam = z.object({ id: z.string().min(1).max(64) });

const SORT_ORDERS: [SortOrder, ...SortOrder[]] = ["newest", "oldest", "top_rated", "most_liked"];
const REPORT_REASONS: [ReportReason, ...ReportReason[]] = ["spam", "harassment", "incorrect", "spoilers", "other"];

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  sort: z.enum(SORT_ORDERS).default("newest"),
});

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

const createBody = z.object({
  title: z.string().max(200).optional(),
  body: z.string().min(20).max(20000),
  rating: z.number().int().min(1).max(10).optional(),
  languageCode: z
    .string()
    .regex(/^[a-z]{2}$/)
    .default("en"),
  hasSpoilers: z.boolean().default(false),
});

const updateBody = z.object({
  title: z.string().max(200).optional(),
  body: z.string().min(20).max(20000).optional(),
  rating: z.number().int().min(1).max(10).optional(),
  languageCode: z
    .string()
    .regex(/^[a-z]{2}$/)
    .optional(),
  hasSpoilers: z.boolean().optional(),
  status: z.enum(["published", "hidden"]).optional(),
});

const reportBody = z.object({
  reason: z.enum(REPORT_REASONS),
  details: z.string().max(2000).optional(),
});

export interface ReviewRouteDeps {
  provider: MovieDataProvider;
  store: ReviewStore;
  requireAuth: preHandlerHookHandler;
  optionalAuth: preHandlerHookHandler;
  reviewRateLimit?: { max: number; timeWindow: number };
  reportRateLimit?: { max: number; timeWindow: number };
}

/**
 * Review CRUD, likes, and reports. Ownership is always enforced at the store
 * layer scoped to (id, req.auth.userId) — a non-owner's edit/delete attempt
 * looks identical to "not found" (404), never 403, so existence of another
 * user's review is never leaked. req.auth!.userId is the only source of the
 * acting user id; it is never taken from the body or a route param.
 */
export function registerReviewRoutes(app: FastifyInstance, deps: ReviewRouteDeps): void {
  const { provider, store, requireAuth, optionalAuth } = deps;

  app.get("/movies/:id/reviews", { preHandler: optionalAuth }, async (req) => {
    const params = movieIdParam.safeParse(req.params);
    if (!params.success) throw badRequest("Invalid movie id");
    const query = listQuery.safeParse(req.query);
    if (!query.success) throw badRequest("Invalid query");
    const movie = await provider.getMovie(params.data.id);
    if (!movie.value) throw notFound("Movie not found");

    const { reviews, meta } = await store.list(params.data.id, {
      ...query.data,
      viewerId: req.auth?.userId,
    });
    return { reviews, meta };
  });

  app.post(
    "/movies/:id/reviews",
    { preHandler: requireAuth, config: deps.reviewRateLimit ? { rateLimit: deps.reviewRateLimit } : undefined },
    async (req, reply) => {
      const params = movieIdParam.safeParse(req.params);
      if (!params.success) throw badRequest("Invalid movie id");
      const body = createBody.safeParse(req.body);
      if (!body.success) throw badRequest("Invalid review payload");
      const movie = await provider.getMovie(params.data.id);
      if (!movie.value) throw notFound("Movie not found");

      const userId = req.auth!.userId;
      const existing = await store.getByUserAndMovie(userId, params.data.id);
      if (existing) throw conflict("You already reviewed this movie");

      const review = await store.create(userId, params.data.id, body.data);
      return reply.code(201).send({ review });
    },
  );

  app.get("/reviews/mine", { preHandler: requireAuth }, async (req) => {
    const query = pageQuery.safeParse(req.query);
    if (!query.success) throw badRequest("Invalid query");
    const { reviews, meta } = await store.listMine(req.auth!.userId, query.data);
    return { reviews, meta };
  });

  app.patch("/reviews/:id", { preHandler: requireAuth }, async (req) => {
    const params = reviewIdParam.safeParse(req.params);
    if (!params.success) throw badRequest("Invalid review id");
    const body = updateBody.safeParse(req.body);
    if (!body.success) throw badRequest("Invalid review payload");

    const review = await store.update(req.auth!.userId, params.data.id, body.data);
    if (!review) throw notFound("Review not found");
    return { review };
  });

  app.delete("/reviews/:id", { preHandler: requireAuth }, async (req, reply) => {
    const params = reviewIdParam.safeParse(req.params);
    if (!params.success) throw badRequest("Invalid review id");
    const removed = await store.remove(req.auth!.userId, params.data.id);
    if (!removed) throw notFound("Review not found");
    return reply.code(204).send();
  });

  app.put("/reviews/:id/like", { preHandler: requireAuth }, async (req, reply) => {
    const params = reviewIdParam.safeParse(req.params);
    if (!params.success) throw badRequest("Invalid review id");
    const review = await store.getById(params.data.id, req.auth!.userId);
    if (!review) throw notFound("Review not found");
    await store.like(req.auth!.userId, params.data.id);
    return reply.code(204).send();
  });

  app.delete("/reviews/:id/like", { preHandler: requireAuth }, async (req, reply) => {
    const params = reviewIdParam.safeParse(req.params);
    if (!params.success) throw badRequest("Invalid review id");
    await store.unlike(req.auth!.userId, params.data.id);
    return reply.code(204).send();
  });

  app.post(
    "/reviews/:id/report",
    { preHandler: requireAuth, config: deps.reportRateLimit ? { rateLimit: deps.reportRateLimit } : undefined },
    async (req, reply) => {
      const params = reviewIdParam.safeParse(req.params);
      if (!params.success) throw badRequest("Invalid review id");
      const body = reportBody.safeParse(req.body);
      if (!body.success) throw badRequest("Invalid report payload");

      const userId = req.auth!.userId;
      const review = await store.getById(params.data.id, userId);
      if (!review) throw notFound("Review not found");
      if (await store.hasReported(userId, params.data.id)) {
        throw conflict("You already reported this review");
      }
      const report = await store.report(userId, params.data.id, body.data);
      return reply.code(201).send({ report });
    },
  );
}
