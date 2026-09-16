import { z } from "zod";
import { getErrorMessage } from "../util.js";
import type { Fact } from "../types.js";
import { ProviderError, providerHttpError, retryAfterMsFrom } from "./errors.js";
import {
  mkProvenance,
  type Attribution,
  type CastCredit,
  type CrewCredit,
  type MovieCredits,
  type MovieDetail,
  type MovieDataAdapter,
  type MovieFinancials,
  type MovieImages,
  type MovieRating,
  type MovieRecord,
  type PersonGender,
  type ProductionCompany,
} from "./types.js";

/**
 * TMDB is the approved licensed API for movie facts. Responses are decoded
 * with strict Zod schemas and never passed through unsanitized. If the API key
 * is missing the provider refuses to start rather than silently falling back to
 * scraped or invented data.
 */

const genreSchema = z.object({ id: z.number().int(), name: z.string() });
const companySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  logo_path: z.string().nullable().optional(),
  origin_country: z.string().optional(),
});

const movieSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  original_title: z.string().optional(),
  release_date: z.string().regex(/^\d{4}(-\d{2}){2}$/).optional(),
  runtime: z.number().int().nonnegative().nullable().optional(),
  overview: z.string().nullable().optional(),
  tagline: z.string().nullable().optional(),
  imdb_id: z.string().nullable().optional(),
  backdrop_path: z.string().nullable().optional(),
  poster_path: z.string().nullable().optional(),
  genres: z.array(genreSchema).default([]),
  vote_average: z.number().min(0).max(10).optional(),
  vote_count: z.number().int().nonnegative().optional(),
  budget: z.number().int().nonnegative().optional(),
  revenue: z.number().int().nonnegative().optional(),
  production_companies: z.array(companySchema).default([]),
});

const listSchema = z.object({
  page: z.number().int().nonnegative().default(1),
  total_results: z.number().int().default(0),
  results: z.array(movieSchema).default([]),
});

const castMemberSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  character: z.string().min(1),
  order: z.number().int().nonnegative().default(0),
  gender: z.number().int().optional(),
  profile_path: z.string().nullable().optional(),
  credit_id: z.string(),
});

const crewMemberSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  department: z.string().min(1),
  job: z.string().min(1),
  gender: z.number().int().optional(),
  profile_path: z.string().nullable().optional(),
  credit_id: z.string(),
});

const creditsSchema = z.object({
  id: z.number().int(),
  cast: z.array(castMemberSchema).default([]),
  crew: z.array(crewMemberSchema).default([]),
});

const imageSchema = z.object({
  file_path: z.string().min(1),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  iso_639_1: z.string().nullable().optional(),
});

const imagesSchema = z.object({
  id: z.number().int(),
  backdrops: z.array(imageSchema).default([]),
  posters: z.array(imageSchema).default([]),
});

const releaseDatesSchema = z.object({
  id: z.number().int(),
  results: z
    .array(
      z.object({
        iso_3166_1: z.string(),
        release_dates: z.array(z.object({ certification: z.string().nullable().optional() })).default([]),
      }),
    )
    .default([]),
});

type ParsedMovie = z.infer<typeof movieSchema>;

function gender(tmdbGender?: number): PersonGender {
  switch (tmdbGender) {
    case 1:
      return "female";
    case 2:
      return "male";
    case 3:
      return "non_binary";
    default:
      return "unknown";
  }
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function posterUrl(baseUrl: string, path?: string | null): string | undefined {
  return path ? joinUrl(baseUrl, `t/p/w500${path}`) : undefined;
}

function backdropUrl(baseUrl: string, path?: string | null): string | undefined {
  return path ? joinUrl(baseUrl, `t/p/w780${path}`) : undefined;
}

function toRecord(m: ParsedMovie, baseUrl: string): MovieRecord {
  return {
    id: String(m.id),
    title: m.title,
    originalTitle: m.original_title,
    releaseYear: m.release_date ? Number(m.release_date.slice(0, 4)) : undefined,
    runtimeMinutes: m.runtime ?? undefined,
    overview: m.overview ?? undefined,
    genre: m.genres.map((g) => g.name),
    rating:
      m.vote_average !== undefined && m.vote_count !== undefined
        ? { average: m.vote_average, votes: m.vote_count }
        : undefined,
    posterPath: posterUrl(baseUrl, m.poster_path),
    backdropPath: backdropUrl(baseUrl, m.backdrop_path),
  };
}

function toDetail(m: ParsedMovie, baseUrl: string): MovieDetail {
  return {
    ...toRecord(m, baseUrl),
    tagline: m.tagline ?? undefined,
    imdbId: m.imdb_id ?? undefined,
    externalIds:
      m.imdb_id !== undefined
        ? { id: m.id, imdb_id: m.imdb_id }
        : { id: m.id },
    budget: m.budget,
    revenue: m.revenue,
    productionCompanies: m.production_companies.map(
      (c) =>
        ({
          id: String(c.id),
          name: c.name,
          logoPath: c.logo_path ? joinUrl(baseUrl, `t/p/w92${c.logo_path}`) : undefined,
          originCountry: c.origin_country,
        }) satisfies ProductionCompany,
    ),
  };
}

export class TmdbProvider implements MovieDataAdapter {
  readonly name = "tmdb";
  readonly attribution: Attribution = {
    provider: "tmdb",
    licensed: true,
    notice: "Data provided by The Movie Database (TMDB)",
    termsUrl: "https://www.themoviedb.org/documentation/api/terms-of-use",
  };

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!apiKey) throw new Error("TMDB_API_KEY is required when MOVIE_PROVIDER=tmdb");
  }

  lastCacheStatus() {
    return "miss" as const;
  }

  async getMovie(id: string): Promise<Fact<MovieDetail | null>> {
    return this.asNullable(`tmdb:movie:${id}`, async () => {
      const movie = await this.fetchMovie(id);
      return {
        value: toDetail(movie, this.baseUrl),
        provenance: mkProvenance("tmdb", "api", `tmdb:movie:${id}`, 0.99),
      };
    });
  }

  async search(query: { title: string; year?: number; limit?: number }): Promise<Fact<MovieRecord[]>> {
    const params = new URLSearchParams({ query: query.title, page: "1" });
    if (query.year) params.set("year", String(query.year));
    const json = await this.getJson(`/search/movie?${params}`, "GET /search/movie");
    const parsed = listSchema.safeParse(json);
    if (!parsed.success) {
      throw this.invalidResponse("search", query.title, parsed.error);
    }
    const results = parsed.data.results
      .slice(0, query.limit ?? 10)
      .map((m) => toRecord(m, this.baseUrl));
    return {
      value: results,
      provenance: mkProvenance("tmdb", "api", `tmdb:search:${query.title}`, 0.9),
    };
  }

  async getUpcoming(options?: { limit?: number }): Promise<Fact<MovieRecord[]>> {
    const json = await this.getJson("/movie/upcoming?page=1", "GET /movie/upcoming");
    const parsed = listSchema.safeParse(json);
    if (!parsed.success) {
      throw this.invalidResponse("upcoming", "", parsed.error);
    }
    const results = parsed.data.results
      .slice(0, options?.limit ?? 10)
      .map((m) => toRecord(m, this.baseUrl));
    return {
      value: results,
      provenance: mkProvenance("tmdb", "api", "tmdb:upcoming", 0.9),
    };
  }

  async getCredits(id: string): Promise<Fact<MovieCredits | null>> {
    return this.asNullable(`tmdb:movie:${id}`, async () => {
      const json = await this.getJson(`/movie/${encodeURIComponent(id)}/credits`, "GET /movie/:id/credits");
      const parsed = creditsSchema.safeParse(json);
      if (!parsed.success) {
        throw this.invalidResponse("credits", id, parsed.error);
      }
      const cast: CastCredit[] = parsed.data.cast.map((c) => ({
        personId: String(c.id),
        name: c.name,
        character: c.character,
        order: c.order,
        gender: gender(c.gender),
        profilePath: posterUrl(this.baseUrl, c.profile_path),
        creditId: c.credit_id,
      }));
      const crew: CrewCredit[] = parsed.data.crew.map((c) => ({
        personId: String(c.id),
        name: c.name,
        department: c.department,
        job: c.job,
        gender: gender(c.gender),
        profilePath: posterUrl(this.baseUrl, c.profile_path),
        creditId: c.credit_id,
      }));
      return {
        value: { id: String(parsed.data.id), cast, crew },
        provenance: mkProvenance("tmdb", "api", `tmdb:movie:${id}:credits`, 0.99),
      };
    });
  }

  async getImages(id: string): Promise<Fact<MovieImages | null>> {
    return this.asNullable(`tmdb:movie:${id}`, async () => {
      const json = await this.getJson(`/movie/${encodeURIComponent(id)}/images`, "GET /movie/:id/images");
      const parsed = imagesSchema.safeParse(json);
      if (!parsed.success) {
        throw this.invalidResponse("images", id, parsed.error);
      }
      const toRef = (i: z.infer<typeof imageSchema>) => ({
        path: joinUrl(this.baseUrl, `t/p/original${i.file_path}`),
        width: i.width,
        height: i.height,
        language: i.iso_639_1 ?? undefined,
      });
      return {
        value: {
          id: String(parsed.data.id),
          posters: parsed.data.posters.map(toRef),
          backdrops: parsed.data.backdrops.map(toRef),
        },
        provenance: mkProvenance("tmdb", "api", `tmdb:movie:${id}:images`, 0.99),
      };
    });
  }

  async getProductionCompanies(id: string): Promise<Fact<ProductionCompany[] | null>> {
    return this.asNullable(`tmdb:movie:${id}`, async () => {
      const movie = await this.fetchMovie(id);
      return {
        value: movie.production_companies.map(
          (c) =>
            ({
              id: String(c.id),
              name: c.name,
              logoPath: c.logo_path ? joinUrl(this.baseUrl, `t/p/w92${c.logo_path}`) : undefined,
              originCountry: c.origin_country,
            }) satisfies ProductionCompany,
        ),
        provenance: mkProvenance("tmdb", "api", `tmdb:movie:${id}:companies`, 0.99),
      };
    });
  }

  async getFinancials(id: string): Promise<Fact<MovieFinancials | null>> {
    return this.asNullable(`tmdb:movie:${id}`, async () => {
      const movie = await this.fetchMovie(id);
      return {
        value: { id: String(movie.id), budget: movie.budget, revenue: movie.revenue, currency: "USD" },
        provenance: mkProvenance("tmdb", "api", `tmdb:movie:${id}:financials`, 0.99),
      };
    });
  }

  async getRatings(id: string): Promise<Fact<MovieRating | null>> {
    return this.asNullable(`tmdb:movie:${id}`, async () => {
      const movie = await this.fetchMovie(id);
      const json = await this.getJson(
        `/movie/${encodeURIComponent(id)}/release_dates`,
        "GET /movie/:id/release_dates",
      );
      const parsed = releaseDatesSchema.safeParse(json);
      if (!parsed.success) {
        throw this.invalidResponse("ratings", id, parsed.error);
      }
      const us = parsed.data.results.find((r) => r.iso_3166_1 === "US");
      const certification = us?.release_dates
        .map((d) => d.certification)
        .find((c) => c && c.length > 0);
      return {
        value: {
          id: String(movie.id),
          average: movie.vote_average,
          votes: movie.vote_count,
          certification: certification ?? undefined,
        },
        provenance: mkProvenance("tmdb", "api", `tmdb:movie:${id}:ratings`, 0.98),
      };
    });
  }

  private async fetchMovie(id: string): Promise<ParsedMovie> {
    const json = await this.getJson(`/movie/${encodeURIComponent(id)}`, "GET /movie/:id");
    const parsed = movieSchema.safeParse(json);
    if (!parsed.success) {
      throw this.invalidResponse("movie", id, parsed.error);
    }
    return parsed.data;
  }

  /** Run a fact fetch, mapping NOT_FOUND to a null-value fact (404 semantics). */
  private async asNullable<T>(
    sourceId: string,
    run: () => Promise<Fact<T>>,
  ): Promise<Fact<T | null>> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ProviderError && error.code === "NOT_FOUND") {
        return { value: null, provenance: mkProvenance("tmdb", "api", sourceId, 0.99) };
      }
      throw error;
    }
  }

  private invalidResponse(capability: string, id: string, error: z.ZodError): ProviderError {
    return new ProviderError(
      "INVALID_RESPONSE",
      `tmdb ${capability} ${id ? `for ${id} ` : ""}failed validation: ${getErrorMessage(error)}`,
      "tmdb",
    );
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" };
  }

  private async getJson(path: string, endpoint: string): Promise<unknown> {
    const res = await this.fetchImpl(joinUrl(this.baseUrl, path), { headers: this.headers() });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      throw providerHttpError({
        status: res.status,
        provider: this.name,
        endpoint,
        retryAfterMs: retryAfterMsFrom(res.headers.get("retry-after")),
      });
    }
    return body;
  }
}

export { creditsSchema, imagesSchema, movieSchema };