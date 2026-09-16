import type { Fact, Provenance } from "../types.js";

export interface MovieRecord {
  id: string;
  title: string;
  originalTitle?: string;
  releaseYear?: number;
  runtimeMinutes?: number;
  overview?: string;
  genre: string[];
  rating?: {
    average: number;
    votes: number;
  };
  certification?: string;
  posterPath?: string;
  backdropPath?: string;
}

export interface ProductionCompany {
  id: string;
  name: string;
  logoPath?: string;
  originCountry?: string;
}

/**
 * Full detail record for one movie. Extends the summary record with the rich
 * field set the ingestion pipeline persists. All optional fields come from the
 * source as-is and are never synthesized.
 */
export interface MovieDetail extends MovieRecord {
  tagline?: string;
  imdbId?: string;
  /** Provider-specific ids (e.g. { id, imdb_id, tvdb_id, ... }). */
  externalIds?: Record<string, unknown>;
  budget?: number;
  revenue?: number;
  productionCompanies?: ProductionCompany[];
  images?: MovieImages;
}

export type PersonGender = "female" | "male" | "non_binary" | "unknown";

export interface CastCredit {
  personId: string;
  name: string;
  character: string;
  order: number;
  gender?: PersonGender;
  profilePath?: string;
  creditId?: string;
}

export interface CrewCredit {
  personId: string;
  name: string;
  department: string;
  job: string;
  gender?: PersonGender;
  profilePath?: string;
  creditId?: string;
}

export interface MovieCredits {
  id: string;
  cast: CastCredit[];
  crew: CrewCredit[];
}

export interface ImageRef {
  /** Absolute URL to the image. */
  path: string;
  width?: number;
  height?: number;
  /** ISO 639-1 language code when known (e.g. "en") or undefined. */
  language?: string;
}

export interface MovieImages {
  id: string;
  posters: ImageRef[];
  backdrops: ImageRef[];
}

export interface MovieRating {
  id: string;
  average?: number;
  votes?: number;
  certification?: string;
}

export interface MovieFinancials {
  id: string;
  budget?: number;
  revenue?: number;
  /** ISO 4217 currency code (defaults to USD). */
  currency: string;
}

export interface UpcomingOptions {
  limit?: number;
}

/** Provider licensing/attribution metadata surfaced to clients. */
export interface Attribution {
  provider: string;
  /** True when the source is a licensed structured API, never a scrape. */
  licensed: boolean;
  notice?: string;
  termsUrl?: string;
}

export type CacheStatus = "hit" | "miss" | "stale";

/**
 * Any structured movie data source. Implementations MUST return records
 * only; they never synthesize, embellish, or scrape facts.
 */
export interface MovieDataProvider {
  readonly name: string;
  /** Fetch one movie by provider id. Returns null if unknown. */
  getMovie(id: string): Promise<Fact<MovieDetail | null>>;
  search(query: { title: string; year?: number; limit?: number }): Promise<Fact<MovieRecord[]>>;
}

/**
 * Provider-agnostic adapter for the full movie data capability set. Routes and
 * ingestion depend only on this interface; every provider (TMDB, mock) is
 * normalized behind it.
 */
export interface MovieDataAdapter extends MovieDataProvider {
  readonly attribution: Attribution;
  getUpcoming(options?: UpcomingOptions): Promise<Fact<MovieRecord[]>>;
  getCredits(id: string): Promise<Fact<MovieCredits | null>>;
  getImages(id: string): Promise<Fact<MovieImages | null>>;
  getRatings(id: string): Promise<Fact<MovieRating | null>>;
  getProductionCompanies(id: string): Promise<Fact<ProductionCompany[] | null>>;
  getFinancials(id: string): Promise<Fact<MovieFinancials | null>>;
  /** Cache state of the most recent adapter call ("hit" | "miss" | "stale"). */
  lastCacheStatus(): CacheStatus;
}

export interface WatchlistEntry {
  movie: Fact<MovieRecord>;
  addedAt: string;
}

export interface WatchlistStore {
  list(userId: string): Promise<WatchlistEntry[]>;
  add(userId: string, movie: Fact<MovieRecord>): Promise<WatchlistEntry>;
  remove(userId: string, movieId: string): Promise<boolean>;
}

export function mkProvenance(
  sourceName: string,
  sourceKind: Provenance["sourceKind"],
  sourceId: string,
  confidence: number,
  retrievedAt: string = new Date().toISOString(),
): Provenance {
  return { sourceId, sourceKind, sourceName, retrievedAt, confidence };
}