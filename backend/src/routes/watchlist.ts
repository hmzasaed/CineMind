import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { MovieDataProvider, WatchlistStore } from "../providers/types.js";
import { requireAuth } from "../middleware/auth.js";
import { badRequest, conflict } from "../errors.js";

const addBody = z.object({
  movieId: z.string().min(1).max(64),
});

function userIdOf(req: { user?: unknown }): string | undefined {
  const u = req.user as { userId?: string } | undefined;
  return u?.userId;
}

/**
 * User-owned data with conflict handling. Adding a movie you already have is a
 * 409 so the client can present a choice instead of a silent overwrite.
 */
export function registerWatchlistRoutes(app: FastifyInstance, provider: MovieDataProvider, store: WatchlistStore): void {
  app.get("/watchlist", { preHandler: requireAuth }, async (req, reply) => {
    const userId = userIdOf(req);
    if (!userId) throw badRequest("Missing user id in token");
    const entries = await store.list(userId);
    return reply.send({ watchlist: entries });
  });

  app.post("/watchlist", { preHandler: requireAuth }, async (req, reply) => {
    const userId = userIdOf(req);
    if (!userId) throw badRequest("Missing user id in token");
    const body = addBody.safeParse(req.body);
    if (!body.success) throw badRequest("Invalid watchlist payload");

    const existing = await store.list(userId);
    if (existing.some((e) => e.movie.value.id === body.data.movieId)) {
      throw conflict(`Movie ${body.data.movieId} is already on the watchlist`);
    }
    const movie = await provider.getMovie(body.data.movieId);
    if (!movie.value) throw badRequest("Movie not found in the data source");

    const entry = await store.add(userId, { value: movie.value, provenance: movie.provenance });
    return reply.code(201).send({ watchlistEntry: entry });
  });

  app.delete("/watchlist/:movieId", { preHandler: requireAuth }, async (req, reply) => {
    const userId = userIdOf(req);
    if (!userId) throw badRequest("Missing user id in token");
    const params = z.object({ movieId: z.string().min(1).max(64) }).safeParse(req.params);
    if (!params.success) throw badRequest("Invalid movie id");
    await store.remove(userId, params.data.movieId);
    return reply.code(204).send();
  });
}