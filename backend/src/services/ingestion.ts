import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CastCredit,
  CrewCredit,
  MovieDataAdapter,
  MovieDetail,
  MovieFinancials,
  MovieImages,
  MovieRating,
  ProductionCompany,
} from "../providers/types.js";
import { ProviderError } from "../providers/errors.js";
import type { AppConfig } from "../config.js";
import { createSupabaseAdminClient } from "./supabase.js";
import { getErrorMessage } from "../util.js";

/**
 * Ingestion pipeline. A single `MovieIngest` is the idempotent unit of work:
 * the same provider+provider_id always converges to the same rows, and the
 * provider identity + retrieved_at + confidence are preserved on every
 * material row. Relations are replaced (delete-then-insert) so re-runs can
 * never accumulate duplicates. All writes happen server-side with the
 * service-role client; HTTP request handlers never run heavy ingestion inline
 * (see jobs/).
 */

// ── bounds / normalization (mirrors the SQL check constraints) ────────────────
const ALLOWED_CONTENT_RATINGS = new Set(["G", "PG", "PG-13", "R", "NC-17", "NR"]);
const ALLOWED_RATING_NAMES = new Set(["imdb", "rotten_tomatoes", "metacritic", "tmdb", "letterboxd"]);

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length >= 3 ? base.slice(0, 80) : "movie";
}

function normYear(year?: number): number | null {
  return year !== undefined && year >= 1888 && year <= 2100 ? year : null;
}

function normInt(value?: number): number | null {
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : null;
}

function normCert(value?: string): string | null {
  if (!value) return null;
  return ALLOWED_CONTENT_RATINGS.has(value) ? value : null;
}

function normMoney(value?: number): number | null {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

function sourceKindFor(provider: string): "api" | "static" {
  return provider === "tmdb" ? "api" : "static";
}

function ratingNameFor(provider: string): string | undefined {
  return ALLOWED_RATING_NAMES.has(provider) ? provider : undefined;
}

export interface MovieIngest {
  provider: string;
  providerId: string;
  retrievedAt: string;
  confidence: number;
  movie: MovieDetail;
  credits?: { cast?: CastCredit[]; crew?: CrewCredit[] };
  ratings?: MovieRating;
  companies?: ProductionCompany[];
  financials?: MovieFinancials;
  images?: MovieImages;
}

export interface MovieRef {
  movieId: string;
  created: boolean;
}

export interface IngestionStore {
  readonly kind: "in-memory" | "supabase";
  /** Persist one movie (core + relations) idempotently. */
  upsertMovie(input: MovieIngest): Promise<MovieRef>;
  /** Resolve a provider movie to its DB id, or null when not ingested yet. */
  getMovieId(provider: string, providerId: string): Promise<string | null>;
}

// ── shared runner ─────────────────────────────────────────────────────────────

export interface IngestMovieOptions {
  retrievedAt?: string;
  includeRelations?: boolean;
}

/**
 * Pull every capability from the adapter and persist it atomically-friendly
 * (one idempotent unit). Throws ProviderError NOT_FOUND when the provider does
 * not know the id; caller (job processor) decides retry policy.
 */
export async function ingestMovie(
  adapter: MovieDataAdapter,
  store: IngestionStore,
  externalId: string,
  options: IngestMovieOptions = {},
): Promise<MovieRef> {
  const retrievedAt = options.retrievedAt ?? new Date().toISOString();
  const movie = await adapter.getMovie(externalId);
  if (!movie.value) {
    throw new ProviderError(
      "NOT_FOUND",
      `${adapter.name}: unknown movie ${externalId}`,
      adapter.name,
    );
  }
  let credits: MovieIngest["credits"];
  let ratings: MovieRating | undefined;
  let companies: ProductionCompany[] = [];
  let financials: MovieFinancials | undefined;
  let images: MovieImages | undefined;
  if (options.includeRelations !== false) {
    const [c, r, co, f, im] = await Promise.all([
      adapter.getCredits(externalId),
      adapter.getRatings(externalId),
      adapter.getProductionCompanies(externalId),
      adapter.getFinancials(externalId),
      adapter.getImages(externalId),
    ]);
    credits = c.value ?? undefined;
    ratings = r.value ?? undefined;
    companies = co.value ?? [];
    financials = f.value ?? undefined;
    images = im.value ?? undefined;
  }
  return store.upsertMovie({
    provider: adapter.name,
    providerId: externalId,
    retrievedAt,
    confidence: movie.provenance.confidence,
    movie: movie.value,
    credits,
    ratings,
    companies,
    financials,
    images,
  });
}

// ── Supabase-backed store (production) ────────────────────────────────────────

function postgrestError(context: string, error: { message: string }): Error {
  return new Error(`${context}: ${getErrorMessage(error.message)}`);
}

export class SupabaseIngestionStore implements IngestionStore {
  readonly kind = "supabase" as const;

  private genresCache: Map<string, number> | null = null;

  constructor(private readonly admin: SupabaseClient) {}

  async getMovieId(provider: string, providerId: string): Promise<string | null> {
    const { data, error } = await this.admin
      .from("movies")
      .select("id")
      .eq("provider", provider)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (error) throw postgrestError("ingestion.getMovieId", error);
    return data ? String(data.id) : null;
  }

  async upsertMovie(input: MovieIngest): Promise<MovieRef> {
    const existing = await this.getMovieId(input.provider, input.providerId);
    const slug = await this.uniqueSlug(input, existing ?? undefined);
    const row = {
      slug,
      title: input.movie.title.slice(0, 500),
      original_title: input.movie.originalTitle ?? null,
      tagline: input.movie.tagline ?? null,
      overview: input.movie.overview ? input.movie.overview.slice(0, 20000) : null,
      release_year: normYear(input.movie.releaseYear),
      runtime_minutes: normInt(input.movie.runtimeMinutes),
      content_rating: normCert(input.movie.certification),
      poster_url: input.movie.posterPath ?? null,
      backdrop_url: input.movie.backdropPath ?? null,
      provider: input.provider,
      provider_id: input.providerId,
      retrieved_at: input.retrievedAt,
      confidence: input.confidence,
      imdb_id: input.movie.imdbId ?? null,
      external_ids: input.movie.externalIds ?? {},
    };

    let movieId: string;
    if (existing) {
      const { data: existingRow, error: readError } = await this.admin
        .from("movies")
        .select("data_version")
        .eq("id", existing)
        .maybeSingle();
      if (readError) throw postgrestError("ingestion.readMovie", readError);
      const dataVersion = (existingRow?.data_version ?? 1) + 1;
      const { error } = await this.admin.from("movies").update({ ...row, data_version: dataVersion }).eq("id", existing);
      if (error) throw postgrestError("ingestion.updateMovie", error);
      movieId = existing;
    } else {
      const { data, error } = await this.admin
        .from("movies")
        .insert(row)
        .select("id")
        .single();
      if (error) throw postgrestError("ingestion.insertMovie", error);
      movieId = String(data.id);
    }

    await this.replaceRelations(movieId, input);
    await this.recordSourceLedger(movieId, input);
    return { movieId, created: !existing };
  }

  private async uniqueSlug(input: MovieIngest, existingId?: string): Promise<string> {
    const base = slugify(input.movie.title);
    const candidates = [
      input.movie.releaseYear ? `${base}-${input.movie.releaseYear}` : base,
      base,
      `${base}-${input.movie.releaseYear ?? "movie"}-${input.provider}`,
    ];
    for (const candidate of [...new Set(candidates)]) {
      const { data, error } = await this.admin
        .from("movies")
        .select("id")
        .eq("slug", candidate)
        .maybeSingle();
      if (error) throw postgrestError("ingestion.slugCheck", error);
      if (!data || data.id === existingId) return candidate;
    }
    return `${base}-${input.movie.releaseYear ?? "movie"}-${input.provider}`;
  }

  private async replaceRelations(movieId: string, input: MovieIngest): Promise<void> {
    // genres
    const genreIds: number[] = [];
    for (const name of input.movie.genre) {
      const id = await this.ensureGenre(name);
      if (id !== null) genreIds.push(id);
    }
    const { error: delGenres } = await this.admin.from("movie_genres").delete().eq("movie_id", movieId);
    if (delGenres) throw postgrestError("ingestion.clearGenres", delGenres);
    if (genreIds.length > 0) {
      const { error: insGenres } = await this.admin
        .from("movie_genres")
        .insert(genreIds.map((genre_id) => ({ movie_id: movieId, genre_id })));
      if (insGenres) throw postgrestError("ingestion.insertGenres", insGenres);
    }

    // people + credits
    const cast = input.credits?.cast ?? [];
    const crew = input.credits?.crew ?? [];
    const people = await this.replacePeople(input, [...cast, ...crew]);
    const { error: delCast } = await this.admin.from("movie_cast").delete().eq("movie_id", movieId);
    const { error: delCrew } = await this.admin.from("movie_crew").delete().eq("movie_id", movieId);
    if (delCast) throw postgrestError("ingestion.clearCast", delCast);
    if (delCrew) throw postgrestError("ingestion.clearCrew", delCrew);
    if (cast.length > 0) {
      const { error } = await this.admin.from("movie_cast").insert(
        cast.map((c) => ({
          movie_id: movieId,
          person_id: people.get(c.personId),
          character: c.character.slice(0, 500),
          cast_order: c.order,
          credit_id: c.creditId ?? null,
          provider: input.provider,
          provider_id: c.creditId ?? `${input.providerId}:cast:${c.order}`,
          retrieved_at: input.retrievedAt,
          confidence: input.confidence,
        })),
      );
      if (error) throw postgrestError("ingestion.insertCast", error);
    }
    if (crew.length > 0) {
      const { error } = await this.admin.from("movie_crew").insert(
        crew.map((c) => ({
          movie_id: movieId,
          person_id: people.get(c.personId),
          department: c.department.slice(0, 100),
          job: c.job.slice(0, 100),
          credit_id: c.creditId ?? null,
          provider: input.provider,
          provider_id: c.creditId ?? `${input.providerId}:crew:${c.job}`,
          retrieved_at: input.retrievedAt,
          confidence: input.confidence,
        })),
      );
      if (error) throw postgrestError("ingestion.insertCrew", error);
    }

    // companies
    const companies = input.companies ?? [];
    const companyIds: string[] = [];
    for (const company of companies) {
      const id = await this.ensureCompany(input, company);
      if (id) companyIds.push(id);
    }
    const { error: delCompanies } = await this.admin
      .from("movie_production_companies")
      .delete()
      .eq("movie_id", movieId);
    if (delCompanies) throw postgrestError("ingestion.clearCompanies", delCompanies);
    if (companyIds.length > 0) {
      const { error: insCompanies } = await this.admin
        .from("movie_production_companies")
        .insert(companyIds.map((company_id) => ({ movie_id: movieId, company_id })));
      if (insCompanies) throw postgrestError("ingestion.insertCompanies", insCompanies);
    }

    // financials (replace → never dupes)
    const { error: delFinancials } = await this.admin
      .from("movie_financials")
      .delete()
      .eq("movie_id", movieId)
      .eq("provider", input.provider);
    if (delFinancials) throw postgrestError("ingestion.clearFinancials", delFinancials);
    if (input.financials) {
      const { error: insFinancials } = await this.admin.from("movie_financials").insert({
        movie_id: movieId,
        budget: normMoney(input.financials.budget),
        revenue: normMoney(input.financials.revenue),
        currency: input.financials.currency || "USD",
        provider: input.provider,
        provider_id: input.providerId,
        retrieved_at: input.retrievedAt,
        confidence: input.confidence,
      });
      if (insFinancials) throw postgrestError("ingestion.insertFinancials", insFinancials);
    }

    // external ratings (aggregate scores only, with allowed rating names)
    const ratingName = ratingNameFor(input.provider);
    if (ratingName && input.ratings?.average !== undefined) {
      const { error: delRatings } = await this.admin
        .from("external_ratings")
        .delete()
        .eq("movie_id", movieId)
        .eq("provider", input.provider);
      if (delRatings) throw postgrestError("ingestion.clearRatings", delRatings);
      const { error: insRatings } = await this.admin.from("external_ratings").insert({
        movie_id: movieId,
        rating_name: ratingName,
        score: input.ratings.average,
        score_type: "out_of_10",
        votes: input.ratings.votes ?? 0,
        provider: input.provider,
        provider_id: input.providerId,
        retrieved_at: input.retrievedAt,
        confidence: input.confidence,
      });
      if (insRatings) throw postgrestError("ingestion.insertRatings", insRatings);
    }
  }

  private async ensureGenre(name: string): Promise<number | null> {
    const cleaned = name.trim();
    if (!cleaned) return null;
    const cache = this.genresCache ?? (this.genresCache = await this.loadGenres());
    if (cache.has(cleaned.toLowerCase())) {
      return cache.get(cleaned.toLowerCase()) as number;
    }
    const { data, error } = await this.admin
      .from("genres")
      .select("id")
      .eq("name", cleaned)
      .maybeSingle();
    if (error) throw postgrestError("ingestion.findGenre", error);
    if (data) {
      const id = Number(data.id);
      cache.set(cleaned.toLowerCase(), id);
      return id;
    }
    const { data: maxRow } = await this.admin
      .from("genres")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextId = maxRow ? Number(maxRow.id) + 1 : 1;
    const { error: ins } = await this.admin.from("genres").insert({
      id: nextId,
      name: cleaned.slice(0, 100),
      slug: `${slugify(cleaned)}-${nextId}`,
    });
    if (ins) throw postgrestError("ingestion.insertGenre", ins);
    cache.set(cleaned.toLowerCase(), nextId);
    return nextId;
  }

  private async loadGenres(): Promise<Map<string, number>> {
    const { data, error } = await this.admin.from("genres").select("id, name");
    if (error) throw postgrestError("ingestion.listGenres", error);
    return new Map((data ?? []).map((g) => [String(g.name).toLowerCase(), Number(g.id)]));
  }

  private async ensureCompany(
    input: MovieIngest,
    company: ProductionCompany,
  ): Promise<string | null> {
    const { data, error } = await this.admin
      .from("production_companies")
      .select("id")
      .eq("provider", input.provider)
      .eq("provider_id", company.id)
      .maybeSingle();
    if (error) throw postgrestError("ingestion.findCompany", error);
    if (data) return String(data.id);
    const { data: inserted, error: ins } = await this.admin
      .from("production_companies")
      .insert({
        name: company.name.slice(0, 200),
        logo_url: company.logoPath ?? null,
        origin_country: company.originCountry ?? null,
        provider: input.provider,
        provider_id: company.id,
        retrieved_at: input.retrievedAt,
      })
      .select("id")
      .single();
    if (ins) throw postgrestError("ingestion.insertCompany", ins);
    return String(inserted.id);
  }

  private async replacePeople(
    input: MovieIngest,
    entries: Array<CastCredit | CrewCredit>,
  ): Promise<Map<string, string>> {
    const byPerson = new Map<string, { name: string; gender?: string; profileUrl?: string }>();
    for (const person of entries) {
      if (byPerson.has(person.personId)) continue;
      byPerson.set(person.personId, {
        name: person.name,
        gender: person.gender,
        profileUrl: person.profilePath,
      });
    }
    const ids = new Map<string, string>();
    for (const [personId, person] of byPerson) {
      const { data, error } = await this.admin
        .from("people")
        .select("id")
        .eq("provider", input.provider)
        .eq("provider_id", personId)
        .maybeSingle();
      if (error) throw postgrestError("ingestion.findPerson", error);
      if (data) {
        ids.set(personId, String(data.id));
        continue;
      }
      const { data: inserted, error: ins } = await this.admin
        .from("people")
        .insert({
          name: person.name.slice(0, 200),
          gender: person.gender ?? "unknown",
          profile_url: person.profileUrl ?? null,
          provider: input.provider,
          provider_id: personId,
          retrieved_at: input.retrievedAt,
          confidence: input.confidence,
        })
        .select("id")
        .single();
      if (ins) throw postgrestError("ingestion.insertPerson", ins);
      ids.set(personId, String(inserted.id));
    }
    return ids;
  }

  private async recordSourceLedger(movieId: string, input: MovieIngest): Promise<void> {
    const { data, error } = await this.admin
      .from("movie_sources")
      .select("id, revision")
      .eq("movie_id", movieId)
      .eq("source_name", input.provider)
      .eq("source_id", input.providerId)
      .maybeSingle();
    if (error) throw postgrestError("ingestion.findSource", error);
    const payload = {
      capabilities: {
        credits: input.credits?.cast?.length ?? 0,
        crew: input.credits?.crew?.length ?? 0,
        companies: input.companies?.length ?? 0,
        financials: input.financials ? true : false,
        ratings: input.ratings ? true : false,
      },
      images: input.images
        ? {
            posters: input.images.posters.slice(0, 10).map((p) => p.path),
            backdrops: input.images.backdrops.slice(0, 10).map((b) => b.path),
          }
        : undefined,
    } as Record<string, unknown>;
    const base = {
      source_kind: sourceKindFor(input.provider),
      source_name: input.provider,
      source_id: input.providerId,
      fetched_at: input.retrievedAt,
      confidence: input.confidence,
      conflict_status: "ok" as const,
      payload,
    };
    if (data) {
      const { error: upd } = await this.admin
        .from("movie_sources")
        .update({ ...base, revision: (data.revision ?? 1) + 1 })
        .eq("id", data.id);
      if (upd) throw postgrestError("ingestion.updateSource", upd);
    } else {
      const { error: ins } = await this.admin.from("movie_sources").insert({ ...base, revision: 1 });
      if (ins) throw postgrestError("ingestion.insertSource", ins);
    }
  }
}

// ── In-memory store (dev + tests) ─────────────────────────────────────────────

export interface InMemoryStats {
  movies: number;
  people: number;
  cast: number;
  crew: number;
  genres: number;
  companies: number;
  companyLinks: number;
  financials: number;
  ratings: number;
  sources: Map<string, number>;
}

export class InMemoryIngestionStore implements IngestionStore {
  readonly kind = "in-memory" as const;
  private readonly moviesByProvider = new Map<string, string>();
  private readonly movieRows = new Map<string, { slug: string; retrievedAt: string; dataVersion: number }>();
  private nextMovie = 0;
  private readonly genreIds = new Map<string, number>();
  private nextGenreId = 1;
  private readonly movieGenres = new Map<string, string[]>();
  private readonly peopleByProvider = new Map<string, string>();
  private readonly castRows = new Map<string, Array<{ personId: string; character: string }>>();
  private readonly crewRows = new Map<string, Array<{ personId: string; job: string }>>();
  private readonly companiesByName = new Map<string, string>();
  private readonly movieCompanies = new Map<string, string[]>();
  private readonly financials = new Map<string, number>();
  private readonly ratings = new Map<string, { score: number; votes: number }>();
  private readonly sources = new Map<string, number>();

  async getMovieId(provider: string, providerId: string): Promise<string | null> {
    return this.moviesByProvider.get(`${provider}:${providerId}`) ?? null;
  }

  async upsertMovie(input: MovieIngest): Promise<MovieRef> {
    const key = `${input.provider}:${input.providerId}`;
    const existing = this.moviesByProvider.get(key);
    let movieId: string;
    if (existing) {
      movieId = existing;
      const prev = this.movieRows.get(movieId)!;
      this.movieRows.set(movieId, { ...prev, retrievedAt: input.retrievedAt, dataVersion: prev.dataVersion + 1 });
    } else {
      movieId = `m-${++this.nextMovie}`;
      this.moviesByProvider.set(key, movieId);
      this.movieRows.set(movieId, { slug: slugify(input.movie.title), retrievedAt: input.retrievedAt, dataVersion: 1 });
      this.movieGenres.set(movieId, []);
      this.castRows.set(movieId, []);
      this.crewRows.set(movieId, []);
      this.movieCompanies.set(movieId, []);
    }

    for (const genre of input.movie.genre) {
      if (!this.genreIds.has(genre.toLowerCase())) {
        this.genreIds.set(genre.toLowerCase(), this.nextGenreId++);
      }
    }
    this.movieGenres.set(movieId, [...input.movie.genre]);

    const cast = input.credits?.cast ?? [];
    const crew = input.credits?.crew ?? [];
    for (const c of cast) {
      const personKey = `${input.provider}:${c.personId}`;
      if (!this.peopleByProvider.has(personKey)) this.peopleByProvider.set(personKey, `p-${this.peopleByProvider.size + 1}`);
    }
    for (const c of crew) {
      const personKey = `${input.provider}:${c.personId}`;
      if (!this.peopleByProvider.has(personKey)) this.peopleByProvider.set(personKey, `p-${this.peopleByProvider.size + 1}`);
    }
    // Replace semantics mirror the SQL store: each run rebuilds the child rows.
    this.castRows.set(`${movieId}:cast`, cast.map((c) => ({ personId: c.personId, character: c.character })));
    this.crewRows.set(`${movieId}:crew`, crew.map((c) => ({ personId: c.personId, job: c.job })));

    for (const company of input.companies ?? []) {
      if (!this.companiesByName.has(company.name)) this.companiesByName.set(company.name, `c-${this.companiesByName.size + 1}`);
    }
    this.movieCompanies.set(movieId, (input.companies ?? []).map((c) => c.name));

    if (input.financials) this.financials.set(movieId, (input.financials.budget ?? 0) + (input.financials.revenue ?? 0));
    if (input.ratings?.average !== undefined) {
      this.ratings.set(movieId, { score: input.ratings.average, votes: input.ratings.votes ?? 0 });
    }

    const ledgerKey = `${movieId}|${input.provider}`;
    this.sources.set(ledgerKey, (this.sources.get(ledgerKey) ?? 0) + 1);

    return { movieId, created: !existing };
  }

  stats(): InMemoryStats {
    return {
      movies: this.moviesByProvider.size,
      people: this.peopleByProvider.size,
      cast: [...this.castRows.values()].reduce((n, r) => n + r.length, 0),
      crew: [...this.crewRows.values()].reduce((n, r) => n + r.length, 0),
      genres: this.genreIds.size,
      companies: this.companiesByName.size,
      companyLinks: [...this.movieCompanies.values()].reduce((n, r) => n + r.length, 0),
      financials: this.financials.size,
      ratings: this.ratings.size,
      sources: new Map(this.sources),
    };
  }
}

/**
 * Select the ingestion store. Production requires Supabase service-role
 * credentials; the in-memory store exists only for deterministic dev/tests.
 */
export function createIngestionStore(config: AppConfig): IngestionStore {
  if (config.supabaseUrl && config.supabaseServiceRoleKey) {
    return new SupabaseIngestionStore(
      createSupabaseAdminClient(config.supabaseUrl, config.supabaseServiceRoleKey),
    );
  }
  if (config.movieProvider === "tmdb") {
    throw new Error(
      "MOVIE_PROVIDER=tmdb requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for ingestion",
    );
  }
  return new InMemoryIngestionStore();
}