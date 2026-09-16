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
  posterPath?: string;
}

/**
 * Any structured movie data source. Implementations MUST return records
 * only; they never synthesize or embellish facts.
 */
export interface MovieDataProvider {
  readonly name: string;
  /** Fetch one movie by provider id. Returns null if unknown. */
  getMovie(id: string): Promise<Fact<MovieRecord | null>>;
  search(query: { title: string; year?: number; limit?: number }): Promise<Fact<MovieRecord[]>>;
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