import type { MovieDataAdapter, MovieRecord, WatchlistStore } from "./types.js";
import { mkProvenance } from "./types.js";
import { MockProvider } from "./mock.js";
import { TmdbProvider } from "./tmdb.js";
import { decorateAdapter, type DecorateOptions } from "./decorators.js";
import type { AppConfig } from "../config.js";

/**
 * Raw adapter selection. Production uses the licensed TMDB API with backend-only
 * credentials; anything else is a deterministic fixture. There is deliberately
 * no "scrape the web" fallback: when no licensed provider is configured the
 * fixture provider is used (or the app refuses to start), never a scraper.
 */
export function createRawAdapter(config: AppConfig): MovieDataAdapter {
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

/** Resilience defaults derived from env (timeouts, retries, cache, stale). */
export function adapterResilience(config: AppConfig): DecorateOptions {
  return {
    timeoutMs: config.providerTimeoutMs,
    maxAttempts: config.providerRetryLimit,
    baseDelayMs: config.providerBaseBackoffMs,
    cacheTtlMs: config.providerCacheTtlMs,
    serveStaleOnError: config.providerCacheStaleOnError,
  };
}

/** Build the fully decorated, provider-agnostic movie data adapter. */
export function createMovieDataAdapter(config: AppConfig): MovieDataAdapter {
  return decorateAdapter(createRawAdapter(config), adapterResilience(config));
}

/** Backwards-compatible raw provider name for tests that opt out of resilience. */
export function createMovieProvider(config: AppConfig): MovieDataAdapter {
  return createMovieDataAdapter(config);
}

/** In-memory watchlist store. Production deployments must swap this for the Supabase-backed store. */
export class InMemoryWatchlistStore implements WatchlistStore {
  private readonly entries = new Map<string, Map<string, { movie: MovieRecord; addedAt: string }>>();

  async list(userId: string) {
    const userEntries = this.entries.get(userId);
    if (!userEntries) return [];
    return [...userEntries.values()].map((e) => ({
      movie: {
        value: e.movie,
        provenance: mkProvenance("watchlist", "user_data", `watchlist:${userId}:${e.movie.id}`, 1, e.addedAt),
      },
      addedAt: e.addedAt,
    }));
  }

  async add(userId: string, movie: { value: MovieRecord; provenance: import("../types.js").Provenance }) {
    const userEntries = this.entries.get(userId) ?? new Map();
    const addedAt = new Date().toISOString();
    userEntries.set(movie.value.id, { movie: movie.value, addedAt });
    this.entries.set(userId, userEntries);
    return {
      movie: {
        value: movie.value,
        provenance: mkProvenance("watchlist", "user_data", `watchlist:${userId}:${movie.value.id}`, 1, addedAt),
      },
      addedAt,
    };
  }

  async remove(userId: string, movieId: string) {
    return this.entries.get(userId)?.delete(movieId) ?? false;
  }
}