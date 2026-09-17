import type { SupabaseClient } from "@supabase/supabase-js";
import type { Fact, Provenance } from "../types.js";
import type { MovieDataAdapter, MovieRecord, WatchlistStore } from "../providers/types.js";
import { mkProvenance } from "../providers/types.js";
import { InMemoryWatchlistStore } from "../providers/index.js";
import type { IngestionStore } from "../services/ingestion.js";
import { createSupabaseAdminClient } from "../services/supabase.js";
import type { AppConfig } from "../config.js";
import { resolveMovieDbId } from "./movie-resolver.js";
import { MOVIE_ROW_SELECT, movieRowToRecord, type MovieRow } from "./movie-mapper.js";
import { postgrestError } from "./db-error.js";
import type { FavoriteEntry, FavoritesStore, WatchHistoryEntry, WatchHistoryStore, WatchStatus } from "./types.js";

function membershipProvenance(sourceName: string, userId: string, movieId: string, at: string): Provenance {
  return mkProvenance(sourceName, "user_data", `${sourceName}:${userId}:${movieId}`, 1, at);
}

// ── watchlist (Supabase-backed; InMemoryWatchlistStore stays in providers/index.ts) ──

export class SupabaseWatchlistStore implements WatchlistStore {
  constructor(
    private readonly admin: SupabaseClient,
    private readonly adapter: MovieDataAdapter,
    private readonly ingestionStore: IngestionStore,
  ) {}

  async list(userId: string) {
    const { data, error } = await this.admin
      .from("watchlists")
      .select(`added_at, movies(${MOVIE_ROW_SELECT})`)
      .eq("user_id", userId)
      .order("added_at", { ascending: false });
    if (error) throw postgrestError("watchlist.list", error);
    const rows = (data ?? []) as unknown as Array<{ added_at: string; movies: MovieRow | null }>;
    return rows
      .filter((row): row is { added_at: string; movies: MovieRow } => Boolean(row.movies))
      .map((row) => ({
        movie: {
          value: movieRowToRecord(row.movies),
          provenance: membershipProvenance("watchlist", userId, row.movies.provider_id, row.added_at),
        },
        addedAt: row.added_at,
      }));
  }

  async add(userId: string, movie: Fact<MovieRecord>) {
    const { movieDbId } = await resolveMovieDbId(this.adapter, this.ingestionStore, movie.value.id);
    const addedAt = new Date().toISOString();
    const { error } = await this.admin
      .from("watchlists")
      .insert({ user_id: userId, movie_id: movieDbId, added_at: addedAt });
    if (error) throw postgrestError("watchlist.add", error);
    return {
      movie: {
        value: movie.value,
        provenance: membershipProvenance("watchlist", userId, movie.value.id, addedAt),
      },
      addedAt,
    };
  }

  async remove(userId: string, movieId: string): Promise<boolean> {
    const movieDbId = await this.ingestionStore.getMovieId(this.adapter.name, movieId);
    if (!movieDbId) return false;
    const { data, error } = await this.admin
      .from("watchlists")
      .delete()
      .eq("user_id", userId)
      .eq("movie_id", movieDbId)
      .select("user_id");
    if (error) throw postgrestError("watchlist.remove", error);
    return (data ?? []).length > 0;
  }
}

export function createWatchlistStore(
  config: AppConfig,
  adapter: MovieDataAdapter,
  ingestionStore: IngestionStore,
): WatchlistStore {
  if (config.supabaseUrl && config.supabaseServiceRoleKey) {
    return new SupabaseWatchlistStore(
      createSupabaseAdminClient(config.supabaseUrl, config.supabaseServiceRoleKey),
      adapter,
      ingestionStore,
    );
  }
  return new InMemoryWatchlistStore();
}

// ── favorites (same shape as watchlist) ─────────────────────────────────────

export class SupabaseFavoritesStore implements FavoritesStore {
  constructor(
    private readonly admin: SupabaseClient,
    private readonly adapter: MovieDataAdapter,
    private readonly ingestionStore: IngestionStore,
  ) {}

  async list(userId: string): Promise<FavoriteEntry[]> {
    const { data, error } = await this.admin
      .from("favorites")
      .select(`created_at, movies(${MOVIE_ROW_SELECT})`)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw postgrestError("favorites.list", error);
    const rows = (data ?? []) as unknown as Array<{ created_at: string; movies: MovieRow | null }>;
    return rows
      .filter((row): row is { created_at: string; movies: MovieRow } => Boolean(row.movies))
      .map((row) => ({
        movie: {
          value: movieRowToRecord(row.movies),
          provenance: membershipProvenance("favorites", userId, row.movies.provider_id, row.created_at),
        },
        addedAt: row.created_at,
      }));
  }

  async add(userId: string, movie: Fact<MovieRecord>): Promise<FavoriteEntry> {
    const { movieDbId } = await resolveMovieDbId(this.adapter, this.ingestionStore, movie.value.id);
    const addedAt = new Date().toISOString();
    const { error } = await this.admin
      .from("favorites")
      .insert({ user_id: userId, movie_id: movieDbId, created_at: addedAt });
    if (error) throw postgrestError("favorites.add", error);
    return {
      movie: {
        value: movie.value,
        provenance: membershipProvenance("favorites", userId, movie.value.id, addedAt),
      },
      addedAt,
    };
  }

  async remove(userId: string, movieId: string): Promise<boolean> {
    const movieDbId = await this.ingestionStore.getMovieId(this.adapter.name, movieId);
    if (!movieDbId) return false;
    const { data, error } = await this.admin
      .from("favorites")
      .delete()
      .eq("user_id", userId)
      .eq("movie_id", movieDbId)
      .select("user_id");
    if (error) throw postgrestError("favorites.remove", error);
    return (data ?? []).length > 0;
  }
}

export class InMemoryFavoritesStore implements FavoritesStore {
  private readonly entries = new Map<string, Map<string, { movie: MovieRecord; addedAt: string }>>();

  async list(userId: string): Promise<FavoriteEntry[]> {
    const userEntries = this.entries.get(userId);
    if (!userEntries) return [];
    return [...userEntries.values()]
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
      .map((e) => ({
        movie: {
          value: e.movie,
          provenance: membershipProvenance("favorites", userId, e.movie.id, e.addedAt),
        },
        addedAt: e.addedAt,
      }));
  }

  async add(userId: string, movie: Fact<MovieRecord>): Promise<FavoriteEntry> {
    const userEntries = this.entries.get(userId) ?? new Map();
    const addedAt = new Date().toISOString();
    userEntries.set(movie.value.id, { movie: movie.value, addedAt });
    this.entries.set(userId, userEntries);
    return {
      movie: { value: movie.value, provenance: membershipProvenance("favorites", userId, movie.value.id, addedAt) },
      addedAt,
    };
  }

  async remove(userId: string, movieId: string): Promise<boolean> {
    return this.entries.get(userId)?.delete(movieId) ?? false;
  }
}

export function createFavoritesStore(
  config: AppConfig,
  adapter: MovieDataAdapter,
  ingestionStore: IngestionStore,
): FavoritesStore {
  if (config.supabaseUrl && config.supabaseServiceRoleKey) {
    return new SupabaseFavoritesStore(
      createSupabaseAdminClient(config.supabaseUrl, config.supabaseServiceRoleKey),
      adapter,
      ingestionStore,
    );
  }
  return new InMemoryFavoritesStore();
}

// ── watch history (multiple entries per movie allowed — a rewatch log) ─────

interface WatchHistoryRow {
  id: string;
  status: WatchStatus;
  progress_seconds: number;
  watched_at: string;
  movies: MovieRow | null;
}

export class SupabaseWatchHistoryStore implements WatchHistoryStore {
  constructor(
    private readonly admin: SupabaseClient,
    private readonly adapter: MovieDataAdapter,
    private readonly ingestionStore: IngestionStore,
  ) {}

  async list(userId: string): Promise<WatchHistoryEntry[]> {
    const { data, error } = await this.admin
      .from("watch_history")
      .select(`id, status, progress_seconds, watched_at, movies(${MOVIE_ROW_SELECT})`)
      .eq("user_id", userId)
      .order("watched_at", { ascending: false });
    if (error) throw postgrestError("watchHistory.list", error);
    return ((data ?? []) as unknown as WatchHistoryRow[])
      .filter((row): row is WatchHistoryRow & { movies: MovieRow } => Boolean(row.movies))
      .map((row) => ({
        id: row.id,
        movie: {
          value: movieRowToRecord(row.movies),
          provenance: membershipProvenance("watch_history", userId, row.movies.provider_id, row.watched_at),
        },
        status: row.status,
        progressSeconds: row.progress_seconds,
        watchedAt: row.watched_at,
      }));
  }

  async add(
    userId: string,
    movie: Fact<MovieRecord>,
    input: { status: WatchStatus; progressSeconds?: number },
  ): Promise<WatchHistoryEntry> {
    const { movieDbId } = await resolveMovieDbId(this.adapter, this.ingestionStore, movie.value.id);
    const watchedAt = new Date().toISOString();
    const { data, error } = await this.admin
      .from("watch_history")
      .insert({
        user_id: userId,
        movie_id: movieDbId,
        status: input.status,
        progress_seconds: input.progressSeconds ?? 0,
        watched_at: watchedAt,
      })
      .select("id")
      .single();
    if (error) throw postgrestError("watchHistory.add", error);
    return {
      id: String(data.id),
      movie: {
        value: movie.value,
        provenance: membershipProvenance("watch_history", userId, movie.value.id, watchedAt),
      },
      status: input.status,
      progressSeconds: input.progressSeconds ?? 0,
      watchedAt,
    };
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const { data, error } = await this.admin
      .from("watch_history")
      .delete()
      .eq("user_id", userId)
      .eq("id", id)
      .select("id");
    if (error) throw postgrestError("watchHistory.remove", error);
    return (data ?? []).length > 0;
  }
}

export class InMemoryWatchHistoryStore implements WatchHistoryStore {
  private readonly entries = new Map<
    string,
    Array<{ id: string; movie: MovieRecord; status: WatchStatus; progressSeconds: number; watchedAt: string }>
  >();
  private nextId = 1;

  async list(userId: string): Promise<WatchHistoryEntry[]> {
    const rows = this.entries.get(userId) ?? [];
    return [...rows]
      .sort((a, b) => b.watchedAt.localeCompare(a.watchedAt))
      .map((r) => ({
        id: r.id,
        movie: { value: r.movie, provenance: membershipProvenance("watch_history", userId, r.movie.id, r.watchedAt) },
        status: r.status,
        progressSeconds: r.progressSeconds,
        watchedAt: r.watchedAt,
      }));
  }

  async add(
    userId: string,
    movie: Fact<MovieRecord>,
    input: { status: WatchStatus; progressSeconds?: number },
  ): Promise<WatchHistoryEntry> {
    const watchedAt = new Date().toISOString();
    const id = `wh-${this.nextId++}`;
    const rows = this.entries.get(userId) ?? [];
    rows.push({ id, movie: movie.value, status: input.status, progressSeconds: input.progressSeconds ?? 0, watchedAt });
    this.entries.set(userId, rows);
    return {
      id,
      movie: { value: movie.value, provenance: membershipProvenance("watch_history", userId, movie.value.id, watchedAt) },
      status: input.status,
      progressSeconds: input.progressSeconds ?? 0,
      watchedAt,
    };
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const rows = this.entries.get(userId);
    if (!rows) return false;
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    rows.splice(idx, 1);
    return true;
  }
}

export function createWatchHistoryStore(
  config: AppConfig,
  adapter: MovieDataAdapter,
  ingestionStore: IngestionStore,
): WatchHistoryStore {
  if (config.supabaseUrl && config.supabaseServiceRoleKey) {
    return new SupabaseWatchHistoryStore(
      createSupabaseAdminClient(config.supabaseUrl, config.supabaseServiceRoleKey),
      adapter,
      ingestionStore,
    );
  }
  return new InMemoryWatchHistoryStore();
}
