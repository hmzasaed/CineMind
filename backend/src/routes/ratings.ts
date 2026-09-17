import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import { mkProvenance, type MovieDataProvider } from "../providers/types.js";
import { badRequest, notFound } from "../errors.js";
import { RATING_CATEGORIES, type MovieRatingCategoryDto, type RatingStore } from "../social/types.js";

const movieIdParam = z.object({ id: z.string().min(1).max(64) });

const categorySchema = z.object({
  category: z.enum(RATING_CATEGORIES as [string, ...string[]]),
  score: z.number().int().min(1).max(10),
});

const putRatingBody = z
  .object({
    score: z.number().int().min(1).max(10),
    categories: z.array(categorySchema).max(RATING_CATEGORIES.length).optional(),
  })
  .refine(
    (v) => !v.categories || new Set(v.categories.map((c) => c.category)).size === v.categories.length,
    { message: "Duplicate category in categories[]" },
  );

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

/**
 * User movie ratings (1-10, optional acting/story/visuals/sound/pacing
 * sub-scores) and the DB-only aggregate summary. Deliberately separate from
 * the existing GET /movies/:id/ratings (external/critic scores only, see
 * routes/movies.ts) — user ratings never merge with external or AI scores.
 */
export function registerRatingRoutes(
  app: FastifyInstance,
  provider: MovieDataProvider,
  store: RatingStore,
  requireAuth: preHandlerHookHandler,
): void {
  app.get("/movies/:id/rating", { preHandler: requireAuth }, async (req) => {
    const params = movieIdParam.safeParse(req.params);
    if (!params.success) throw badRequest("Invalid movie id");
    const movie = await provider.getMovie(params.data.id);
    if (!movie.value) throw notFound("Movie not found");
    const rating = await store.getMine(req.auth!.userId, params.data.id);
    return { rating };
  });

  app.put("/movies/:id/rating", { preHandler: requireAuth }, async (req, reply) => {
    const params = movieIdParam.safeParse(req.params);
    if (!params.success) throw badRequest("Invalid movie id");
    const body = putRatingBody.safeParse(req.body);
    if (!body.success) throw badRequest("Invalid rating payload");
    const movie = await provider.getMovie(params.data.id);
    if (!movie.value) throw notFound("Movie not found");

    const rating = await store.upsert(req.auth!.userId, params.data.id, {
      score: body.data.score,
      categories: body.data.categories as MovieRatingCategoryDto[] | undefined,
    });
    return reply.code(200).send({ rating });
  });

  app.delete("/movies/:id/rating", { preHandler: requireAuth }, async (req, reply) => {
    const params = movieIdParam.safeParse(req.params);
    if (!params.success) throw badRequest("Invalid movie id");
    const movie = await provider.getMovie(params.data.id);
    if (!movie.value) throw notFound("Movie not found");
    await store.remove(req.auth!.userId, params.data.id);
    return reply.code(204).send();
  });

  app.get("/movies/:id/ratings/summary", async (req) => {
    const params = movieIdParam.safeParse(req.params);
    if (!params.success) throw badRequest("Invalid movie id");
    const movie = await provider.getMovie(params.data.id);
    if (!movie.value) throw notFound("Movie not found");
    const summary = await store.summary(params.data.id);
    return {
      summary,
      provenance: mkProvenance("movie_ratings", "database", `movie_ratings:${params.data.id}`, 1),
    };
  });

  app.get("/ratings/mine", { preHandler: requireAuth }, async (req) => {
    const query = pageQuery.safeParse(req.query);
    if (!query.success) throw badRequest("Invalid query");
    const { ratings, meta } = await store.listMine(req.auth!.userId, query.data);
    return { ratings, meta };
  });
}
