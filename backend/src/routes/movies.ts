import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { MovieDataAdapter } from "../providers/types.js";
import { badRequest, notFound } from "../errors.js";

const idParam = z.object({ id: z.string().min(1).max(64) });
const searchQuery = z.object({
  title: z.string().min(1).max(200),
  year: z.coerce.number().int().min(1888).max(2100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
const upcomingQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/**
 * Public, read-only movie endpoints backed by the provider-agnostic adapter.
 * Every response carries provenance + attribution and, when a cache was
 * involved, a `x-provider-cache` header (hit|miss|stale).
 */
export function registerMovieRoutes(app: FastifyInstance, adapter: MovieDataAdapter): void {
  app.get("/movies", async (req, reply) => {
    const query = searchQuery.safeParse(req.query);
    if (!query.success) throw badRequest("Invalid search query");
    const fact = await adapter.search(query.data);
    reply.header("x-provider", adapter.name);
    reply.header("x-provider-cache", adapter.lastCacheStatus());
    return { movies: fact.value, provenance: fact.provenance, attribution: adapter.attribution };
  });

  app.get("/movies/upcoming", async (req, reply) => {
    const query = upcomingQuery.safeParse(req.query);
    if (!query.success) throw badRequest("Invalid limit");
    const fact = await adapter.getUpcoming(query.data);
    reply.header("x-provider", adapter.name);
    reply.header("x-provider-cache", adapter.lastCacheStatus());
    return { movies: fact.value, provenance: fact.provenance, attribution: adapter.attribution };
  });

  app.get("/movies/:id", async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) throw badRequest("Invalid movie id");
    const fact = await adapter.getMovie(params.data.id);
    if (!fact.value) throw notFound("Movie not found");
    reply.header("x-provider", adapter.name);
    reply.header("x-provider-cache", adapter.lastCacheStatus());
    return { movie: fact.value, provenance: fact.provenance, attribution: adapter.attribution };
  });

  app.get("/movies/:id/credits", async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) throw badRequest("Invalid movie id");
    const fact = await adapter.getCredits(params.data.id);
    if (!fact.value) throw notFound("Movie not found");
    reply.header("x-provider", adapter.name);
    reply.header("x-provider-cache", adapter.lastCacheStatus());
    return { credits: fact.value, provenance: fact.provenance, attribution: adapter.attribution };
  });

  app.get("/movies/:id/images", async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) throw badRequest("Invalid movie id");
    const fact = await adapter.getImages(params.data.id);
    if (!fact.value) throw notFound("Movie not found");
    reply.header("x-provider", adapter.name);
    reply.header("x-provider-cache", adapter.lastCacheStatus());
    return { images: fact.value, provenance: fact.provenance, attribution: adapter.attribution };
  });

  app.get("/movies/:id/ratings", async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) throw badRequest("Invalid movie id");
    const fact = await adapter.getRatings(params.data.id);
    if (!fact.value) throw notFound("Movie not found");
    reply.header("x-provider", adapter.name);
    reply.header("x-provider-cache", adapter.lastCacheStatus());
    return { ratings: fact.value, provenance: fact.provenance, attribution: adapter.attribution };
  });

  app.get("/movies/:id/companies", async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) throw badRequest("Invalid movie id");
    const fact = await adapter.getProductionCompanies(params.data.id);
    if (!fact.value) throw notFound("Movie not found");
    reply.header("x-provider", adapter.name);
    reply.header("x-provider-cache", adapter.lastCacheStatus());
    return { companies: fact.value, provenance: fact.provenance, attribution: adapter.attribution };
  });

  app.get("/movies/:id/financials", async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) throw badRequest("Invalid movie id");
    const fact = await adapter.getFinancials(params.data.id);
    if (!fact.value) throw notFound("Movie not found");
    reply.header("x-provider", adapter.name);
    reply.header("x-provider-cache", adapter.lastCacheStatus());
    return { financials: fact.value, provenance: fact.provenance, attribution: adapter.attribution };
  });
}