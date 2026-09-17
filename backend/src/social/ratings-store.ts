import type { SupabaseClient } from "@supabase/supabase-js";
import type { MovieDataAdapter } from "../providers/types.js";
import type { IngestionStore } from "../services/ingestion.js";
import { createSupabaseAdminClient } from "../services/supabase.js";
import type { AppConfig } from "../config.js";
import { resolveMovieDbId } from "./movie-resolver.js";
import { postgrestError } from "./db-error.js";
import {
  toPageMeta,
  type MovieRatingCategoryDto,
  type MovieRatingDto,
  type PageRequest,
  type RatingCategory,
  type RatingStore,
  type RatingSummary,
  type RatingUpsertInput,
} from "./types.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface RatingRow {
  id: string;
  score: number;
  created_at: string;
  updated_at: string;
  movie_rating_categories?: Array<{ category: RatingCategory; score: number }> | null;
}

function toDto(row: RatingRow, movieId: string): MovieRatingDto {
  return {
    id: String(row.id),
    movieId,
    score: row.score,
    categories: (row.movie_rating_categories ?? []).map((c) => ({ category: c.category, score: c.score })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const RATING_SELECT = "id, score, created_at, updated_at, movie_rating_categories(category, score)";

export class SupabaseRatingStore implements RatingStore {
  constructor(
    private readonly admin: SupabaseClient,
    private readonly adapter: MovieDataAdapter,
    private readonly ingestionStore: IngestionStore,
  ) {}

  async getMine(userId: string, providerMovieId: string): Promise<MovieRatingDto | null> {
    const movieDbId = await this.ingestionStore.getMovieId(this.adapter.name, providerMovieId);
    if (!movieDbId) return null;
    const { data, error } = await this.admin
      .from("movie_ratings")
      .select(RATING_SELECT)
      .eq("user_id", userId)
      .eq("movie_id", movieDbId)
      .maybeSingle();
    if (error) throw postgrestError("ratings.getMine", error);
    return data ? toDto(data, providerMovieId) : null;
  }

  async upsert(userId: string, providerMovieId: string, input: RatingUpsertInput): Promise<MovieRatingDto> {
    const { movieDbId } = await resolveMovieDbId(this.adapter, this.ingestionStore, providerMovieId);
    const { data, error } = await this.admin
      .from("movie_ratings")
      .upsert({ user_id: userId, movie_id: movieDbId, score: input.score }, { onConflict: "user_id,movie_id" })
      .select("id, created_at, updated_at")
      .single();
    if (error) throw postgrestError("ratings.upsert", error);
    const ratingId = String(data.id);

    const { error: delErr } = await this.admin
      .from("movie_rating_categories")
      .delete()
      .eq("movie_rating_id", ratingId);
    if (delErr) throw postgrestError("ratings.upsert.clearCategories", delErr);

    const categories = input.categories ?? [];
    if (categories.length > 0) {
      const { error: insErr } = await this.admin.from("movie_rating_categories").insert(
        categories.map((c) => ({ movie_rating_id: ratingId, category: c.category, score: c.score })),
      );
      if (insErr) throw postgrestError("ratings.upsert.insertCategories", insErr);
    }

    return {
      id: ratingId,
      movieId: providerMovieId,
      score: input.score,
      categories,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async remove(userId: string, providerMovieId: string): Promise<boolean> {
    const movieDbId = await this.ingestionStore.getMovieId(this.adapter.name, providerMovieId);
    if (!movieDbId) return false;
    const { data, error } = await this.admin
      .from("movie_ratings")
      .delete()
      .eq("user_id", userId)
      .eq("movie_id", movieDbId)
      .select("id");
    if (error) throw postgrestError("ratings.remove", error);
    return (data ?? []).length > 0;
  }

  async summary(providerMovieId: string): Promise<RatingSummary> {
    const movieDbId = await this.ingestionStore.getMovieId(this.adapter.name, providerMovieId);
    if (!movieDbId) return { average: null, count: 0, categories: {} };

    const { data: ratingRows, error } = await this.admin
      .from("movie_ratings")
      .select("id, score")
      .eq("movie_id", movieDbId);
    if (error) throw postgrestError("ratings.summary", error);
    const rows = ratingRows ?? [];
    const count = rows.length;
    const average = count > 0 ? round2(rows.reduce((s, r) => s + r.score, 0) / count) : null;

    const categories: RatingSummary["categories"] = {};
    if (rows.length > 0) {
      const { data: catRows, error: catErr } = await this.admin
        .from("movie_rating_categories")
        .select("category, score")
        .in("movie_rating_id", rows.map((r) => r.id));
      if (catErr) throw postgrestError("ratings.summary.categories", catErr);
      const grouped = new Map<RatingCategory, number[]>();
      for (const c of catRows ?? []) {
        const arr = grouped.get(c.category as RatingCategory) ?? [];
        arr.push(c.score);
        grouped.set(c.category as RatingCategory, arr);
      }
      for (const [cat, scores] of grouped) {
        categories[cat] = { average: round2(scores.reduce((a, b) => a + b, 0) / scores.length), count: scores.length };
      }
    }
    return { average, count, categories };
  }

  async listMine(userId: string, page: PageRequest): Promise<{ ratings: MovieRatingDto[]; meta: import("./types.js").PageMeta }> {
    const from = (page.page - 1) * page.pageSize;
    const to = from + page.pageSize - 1;
    const { data, error, count } = await this.admin
      .from("movie_ratings")
      .select(`${RATING_SELECT}, movies(provider_id)`, { count: "exact" })
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .range(from, to);
    if (error) throw postgrestError("ratings.listMine", error);
    const rows = (data ?? []) as unknown as Array<RatingRow & { movies: { provider_id: string } | null }>;
    const ratings = rows.map((row) => toDto(row, row.movies?.provider_id ?? ""));
    return { ratings, meta: toPageMeta(page, count ?? ratings.length) };
  }
}

interface InMemoryRatingRow {
  id: string;
  score: number;
  categories: MovieRatingCategoryDto[];
  createdAt: string;
  updatedAt: string;
}

export class InMemoryRatingStore implements RatingStore {
  private readonly ratings = new Map<string, Map<string, InMemoryRatingRow>>();
  private nextId = 1;

  async getMine(userId: string, movieId: string): Promise<MovieRatingDto | null> {
    const row = this.ratings.get(userId)?.get(movieId);
    return row ? { movieId, ...row } : null;
  }

  async upsert(userId: string, movieId: string, input: RatingUpsertInput): Promise<MovieRatingDto> {
    const userRatings = this.ratings.get(userId) ?? new Map<string, InMemoryRatingRow>();
    const now = new Date().toISOString();
    const existing = userRatings.get(movieId);
    const row: InMemoryRatingRow = {
      id: existing?.id ?? `mr-${this.nextId++}`,
      score: input.score,
      categories: input.categories ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    userRatings.set(movieId, row);
    this.ratings.set(userId, userRatings);
    return { id: row.id, movieId, score: row.score, categories: row.categories, createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  async remove(userId: string, movieId: string): Promise<boolean> {
    return this.ratings.get(userId)?.delete(movieId) ?? false;
  }

  async summary(movieId: string): Promise<RatingSummary> {
    const scores: number[] = [];
    const categories = new Map<RatingCategory, number[]>();
    for (const userRatings of this.ratings.values()) {
      const r = userRatings.get(movieId);
      if (!r) continue;
      scores.push(r.score);
      for (const c of r.categories) {
        const arr = categories.get(c.category) ?? [];
        arr.push(c.score);
        categories.set(c.category, arr);
      }
    }
    const count = scores.length;
    const average = count > 0 ? round2(scores.reduce((a, b) => a + b, 0) / count) : null;
    const catSummary: RatingSummary["categories"] = {};
    for (const [cat, arr] of categories) {
      catSummary[cat] = { average: round2(arr.reduce((a, b) => a + b, 0) / arr.length), count: arr.length };
    }
    return { average, count, categories: catSummary };
  }

  async listMine(userId: string, page: PageRequest) {
    const entries = [...(this.ratings.get(userId)?.entries() ?? [])].sort((a, b) =>
      b[1].updatedAt.localeCompare(a[1].updatedAt),
    );
    const total = entries.length;
    const start = (page.page - 1) * page.pageSize;
    const slice = entries.slice(start, start + page.pageSize);
    const ratings = slice.map(([movieId, r]) => ({
      id: r.id,
      movieId,
      score: r.score,
      categories: r.categories,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
    return { ratings, meta: toPageMeta(page, total) };
  }
}

export function createRatingStore(
  config: AppConfig,
  adapter: MovieDataAdapter,
  ingestionStore: IngestionStore,
): RatingStore {
  if (config.supabaseUrl && config.supabaseServiceRoleKey) {
    return new SupabaseRatingStore(
      createSupabaseAdminClient(config.supabaseUrl, config.supabaseServiceRoleKey),
      adapter,
      ingestionStore,
    );
  }
  return new InMemoryRatingStore();
}
