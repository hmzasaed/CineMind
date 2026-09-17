import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import type { MovieDataProvider } from "../providers/types.js";
import { badRequest, notFound } from "../errors.js";
import type { FavoritesStore, WatchHistoryStore, WatchStatus } from "../social/types.js";

const movieIdParam = z.object({ movieId: z.string().min(1).max(64) });
const idParam = z.object({ id: z.string().min(1).max(64) });

const WATCH_STATUSES: [WatchStatus, ...WatchStatus[]] = [
  "planned",
  "watching",
  "paused",
  "finished",
  "abandoned",
];

const addWatchHistoryBody = z.object({
  movieId: z.string().min(1).max(64),
  status: z.enum(WATCH_STATUSES),
  progressSeconds: z.number().int().min(0).optional(),
});

/**
 * Favorites: idempotent PUT/DELETE toggle (unlike watchlist's 409-on-duplicate
 * POST), matching the like/favorite relationship's boolean nature.
 */
export function registerFavoritesRoutes(
  app: FastifyInstance,
  provider: MovieDataProvider,
  store: FavoritesStore,
  requireAuth: preHandlerHookHandler,
): void {
  app.get("/favorites", { preHandler: requireAuth }, async (req) => {
    const favorites = await store.list(req.auth!.userId);
    return { favorites };
  });

  app.put("/favorites/:movieId", { preHandler: requireAuth }, async (req, reply) => {
    const params = movieIdParam.safeParse(req.params);
    if (!params.success) throw badRequest("Invalid movie id");
    const userId = req.auth!.userId;
    const existing = await store.list(userId);
    if (existing.some((e) => e.movie.value.id === params.data.movieId)) {
      return reply.code(204).send();
    }
    const movie = await provider.getMovie(params.data.movieId);
    if (!movie.value) throw badRequest("Movie not found in the data source");
    await store.add(userId, { value: movie.value, provenance: movie.provenance });
    return reply.code(204).send();
  });

  app.delete("/favorites/:movieId", { preHandler: requireAuth }, async (req, reply) => {
    const params = movieIdParam.safeParse(req.params);
    if (!params.success) throw badRequest("Invalid movie id");
    await store.remove(req.auth!.userId, params.data.movieId);
    return reply.code(204).send();
  });
}

/** Watch history: a rewatch log, so repeated adds for the same movie are new rows. */
export function registerWatchHistoryRoutes(
  app: FastifyInstance,
  provider: MovieDataProvider,
  store: WatchHistoryStore,
  requireAuth: preHandlerHookHandler,
): void {
  app.get("/watch-history", { preHandler: requireAuth }, async (req) => {
    const history = await store.list(req.auth!.userId);
    return { history };
  });

  app.post("/watch-history", { preHandler: requireAuth }, async (req, reply) => {
    const body = addWatchHistoryBody.safeParse(req.body);
    if (!body.success) throw badRequest("Invalid watch history payload");
    const movie = await provider.getMovie(body.data.movieId);
    if (!movie.value) throw badRequest("Movie not found in the data source");
    const entry = await store.add(
      req.auth!.userId,
      { value: movie.value, provenance: movie.provenance },
      { status: body.data.status, progressSeconds: body.data.progressSeconds },
    );
    return reply.code(201).send({ entry });
  });

  app.delete("/watch-history/:id", { preHandler: requireAuth }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) throw badRequest("Invalid entry id");
    const removed = await store.remove(req.auth!.userId, params.data.id);
    if (!removed) throw notFound("Watch history entry not found");
    return reply.code(204).send();
  });
}
