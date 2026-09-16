import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { MovieDataProvider } from "../providers/types.js";
import { badRequest, notFound } from "../errors.js";

const getMovieParams = z.object({ id: z.string().min(1).max(64) });
const searchQuery = z.object({
  title: z.string().min(1).max(200),
  year: z.coerce.number().int().min(1888).max(2100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export function registerMovieRoutes(app: FastifyInstance, provider: MovieDataProvider): void {
  /**
   * Movie facts come only from the structured provider. The response includes
   * provenance (source + confidence) so clients and the AI service can cite facts.
   */
  app.get("/movies/:id", async (req, reply) => {
    const params = getMovieParams.safeParse(req.params);
    if (!params.success) return badRequest("Invalid movie id");
    const fact = await provider.getMovie(params.data.id);
    if (!fact.value) return notFound("Movie not found");
    return { movie: fact.value, provenance: fact.provenance };
  });

  app.get("/movies", async (req, reply) => {
    const query = searchQuery.safeParse(req.query);
    if (!query.success) return badRequest("Invalid search query");
    const fact = await provider.search(query.data);
    return { movies: fact.value, provenance: fact.provenance };
  });
}