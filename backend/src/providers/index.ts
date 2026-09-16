import { mkProvenance, type MovieDataProvider, type MovieRecord, type WatchlistStore } from "./types.js";
import { MockProvider } from "./mock.js";
import { TmdbProvider } from "./tmdb.js";
import type { AppConfig } from "../config.js";

export function createMovieProvider(config: AppConfig): MovieDataProvider {
  switch (config.movieProvider) {
    case "tmdb":
      if (!config.tmdbApiKey) {
        throw new Error("MOVIE_PROVIDER=tmdb requires TMDB_API_KEY");
      }
      return new TmdbProvider(config.tmdbApiKey, config.tmdbApiBaseUrl);
    case "mock":
    default:
      return new MockProvider();
  }
}

/** In-memory watchlist store. Production deployments must swap this for the Supabase-backed store. */
export class InMemoryWatchlistStore implements WatchlistStore {
  private readonly entries = new Map<string, Map<string, { movie: MovieRecord; addedAt: string }>>();

  async list(userId: string) {
    const userEntries = this.entries.get(userId);
    if (!userEntries) return [];
    return [...userEntries.values()].map((e) => ({ movie: { value: e.movie, provenance: mkProvenance("watchlist", "user_data", `watchlist:${userId}:${e.movie.id}`, 1, e.addedAt) }, addedAt: e.addedAt }));
  }

  async add(userId: string, movie: { value: MovieRecord; provenance: import("../types.js").Provenance }) {
    const userEntries = this.entries.get(userId) ?? new Map();
    const addedAt = new Date().toISOString();
    userEntries.set(movie.value.id, { movie: movie.value, addedAt });
    this.entries.set(userId, userEntries);
    return { movie: { value: movie.value, provenance: mkProvenance("watchlist", "user_data", `watchlist:${userId}:${movie.value.id}`, 1, addedAt) }, addedAt };
  }

  async remove(userId: string, movieId: string) {
    return this.entries.get(userId)?.delete(movieId) ?? false;
  }
}