import { z } from "zod";
import { getErrorMessage } from "../util.js";
import type { Fact } from "../types.js";
import { mkProvenance, type MovieDataProvider, type MovieRecord } from "./types.js";

/**
 * TMDB is an approved structured API for movie facts. Responses are decoded
 * with a strict schema and returned only when they validate. If the API key is
 * missing the provider refuses to start rather than silently returning stub data.
 */
const movieSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  original_title: z.string().optional(),
  release_date: z.string().regex(/^\d{4}(-\d{2}){2}$/).optional(),
  runtime: z.number().int().nonnegative().optional(),
  overview: z.string().optional(),
  genres: z.array(z.object({ id: z.number(), name: z.string() })).default([]),
  vote_average: z.number().min(0).max(10).optional(),
  vote_count: z.number().int().nonnegative().optional(),
  poster_path: z.string().nullable().optional(),
});

const searchSchema = z.object({
  page: z.number().int().nonnegative().default(1),
  total_results: z.number().int().default(0),
  results: z.array(movieSchema).default([]),
});

export class TmdbProvider implements MovieDataProvider {
  readonly name = "tmdb";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!apiKey) throw new Error("TMDB_API_KEY is required when MOVIE_PROVIDER=tmdb");
  }

  async getMovie(id: string): Promise<Fact<MovieRecord | null>> {
    const res = await this.fetchImpl(`${this.baseUrl}/movie/${encodeURIComponent(id)}`, {
      headers: this.headers(),
    });
    const json = await this.parseResponse(res, `GET /movie/${id}`);
    const parsed = movieSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`TMDB returned an invalid movie payload for ${id}: ${getErrorMessage(parsed.error)}`);
    }
    return {
      value: parsed.success ? toRecord(parsed.data, this.baseUrl) : null,
      provenance: mkProvenance("tmdb", "api", `tmdb:movie:${id}`, 0.99),
    };
  }

  async search(query: { title: string; year?: number; limit?: number }): Promise<Fact<MovieRecord[]>> {
    const params = new URLSearchParams({ query: query.title, page: "1" });
    if (query.year) params.set("year", String(query.year));
    const res = await this.fetchImpl(`${this.baseUrl}/search/movie?${params}`, { headers: this.headers() });
    const json = await this.parseResponse(res, "GET /search/movie");
    const parsed = searchSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`TMDB returned an invalid search payload: ${getErrorMessage(parsed.error)}`);
    }
    const results = (parsed.success ? parsed.data.results : [])
      .slice(0, query.limit ?? 10)
      .map((m) => toRecord(m, this.baseUrl));
    return {
      value: results,
      provenance: mkProvenance("tmdb", "api", `tmdb:search:${query.title}`, 0.9),
    };
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" };
  }

  private async parseResponse(res: Response, endpoint: string): Promise<unknown> {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      throw new Error(`TMDB ${endpoint} failed with ${res.status}`);
    }
    return body;
  }
}

function toRecord(m: z.infer<typeof movieSchema>, baseUrl: string): MovieRecord {
  return {
    id: String(m.id),
    title: m.title,
    originalTitle: m.original_title,
    releaseYear: m.release_date ? Number(m.release_date.slice(0, 4)) : undefined,
    runtimeMinutes: m.runtime,
    overview: m.overview,
    genre: m.genres.map((g) => g.name),
    rating:
      m.vote_average !== undefined && m.vote_count ? { average: m.vote_average, votes: m.vote_count } : undefined,
    posterPath: m.poster_path ? `${baseUrl}/t/p/w500${m.poster_path}` : undefined,
  };
}