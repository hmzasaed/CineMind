import type { SupabaseClient } from "@supabase/supabase-js";
import type { MovieDataAdapter } from "../providers/types.js";
import type { IngestionStore } from "../services/ingestion.js";
import { createSupabaseAdminClient } from "../services/supabase.js";
import type { AppConfig } from "../config.js";
import { resolveMovieDbId } from "./movie-resolver.js";
import { postgrestError } from "./db-error.js";
import {
  toPageMeta,
  type PageMeta,
  type PageRequest,
  type ReviewCreateInput,
  type ReviewDto,
  type ReviewListQuery,
  type ReviewReportDto,
  type ReviewReportInput,
  type ReviewStatus,
  type ReviewStore,
  type ReviewUpdateInput,
} from "./types.js";

export const REVIEW_SELECT =
  "id, user_id, title, body, rating, language_code, status, has_spoilers, likes_count, report_count, created_at, updated_at";

export interface ReviewRow {
  id: string;
  user_id: string;
  title: string | null;
  body: string;
  rating: number | null;
  language_code: string;
  status: ReviewStatus;
  has_spoilers: boolean;
  likes_count: number;
  report_count: number;
  created_at: string;
  updated_at: string;
}

export function mapReviewRow(row: ReviewRow, movieId: string, likedByMe: boolean | null): ReviewDto {
  return {
    id: String(row.id),
    movieId,
    userId: row.user_id,
    title: row.title,
    body: row.body,
    rating: row.rating,
    languageCode: row.language_code,
    status: row.status,
    hasSpoilers: row.has_spoilers,
    likesCount: row.likes_count,
    reportCount: row.report_count,
    likedByMe,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Supabase-backed store ────────────────────────────────────────────────────
// Uses the service-role client, which bypasses RLS entirely — visibility
// rules that RLS would otherwise enforce (status='published' OR own row OR
// admin) must be replicated explicitly here.

export class SupabaseReviewStore implements ReviewStore {
  constructor(
    private readonly admin: SupabaseClient,
    private readonly adapter: MovieDataAdapter,
    private readonly ingestionStore: IngestionStore,
  ) {}

  private async likedSet(reviewIds: string[], viewerId?: string): Promise<Set<string>> {
    if (!viewerId || reviewIds.length === 0) return new Set();
    const { data, error } = await this.admin
      .from("review_likes")
      .select("review_id")
      .eq("user_id", viewerId)
      .in("review_id", reviewIds);
    if (error) throw postgrestError("reviews.likedSet", error);
    return new Set((data ?? []).map((r) => String(r.review_id)));
  }

  async list(providerMovieId: string, query: ReviewListQuery): Promise<{ reviews: ReviewDto[]; meta: PageMeta }> {
    const movieDbId = await this.ingestionStore.getMovieId(this.adapter.name, providerMovieId);
    if (!movieDbId) return { reviews: [], meta: toPageMeta(query, 0) };

    let q = this.admin.from("reviews").select(REVIEW_SELECT, { count: "exact" }).eq("movie_id", movieDbId);
    q = query.viewerId ? q.or(`status.eq.published,user_id.eq.${query.viewerId}`) : q.eq("status", "published");

    switch (query.sort) {
      case "oldest":
        q = q.order("created_at", { ascending: true });
        break;
      case "top_rated":
        q = q.order("rating", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
        break;
      case "most_liked":
        q = q.order("likes_count", { ascending: false }).order("created_at", { ascending: false });
        break;
      case "newest":
      default:
        q = q.order("created_at", { ascending: false });
        break;
    }

    const from = (query.page - 1) * query.pageSize;
    const { data, error, count } = await q.range(from, from + query.pageSize - 1);
    if (error) throw postgrestError("reviews.list", error);
    const rows = (data ?? []) as ReviewRow[];
    const liked = await this.likedSet(rows.map((r) => r.id), query.viewerId);
    const reviews = rows.map((r) =>
      mapReviewRow(r, providerMovieId, query.viewerId ? liked.has(r.id) : null),
    );
    return { reviews, meta: toPageMeta(query, count ?? reviews.length) };
  }

  async getById(reviewId: string, viewerId?: string): Promise<ReviewDto | null> {
    const { data, error } = await this.admin
      .from("reviews")
      .select(`${REVIEW_SELECT}, movies(provider_id)`)
      .eq("id", reviewId)
      .maybeSingle();
    if (error) throw postgrestError("reviews.getById", error);
    if (!data) return null;
    const row = data as unknown as ReviewRow & { movies: { provider_id: string } | null };
    if (row.status !== "published" && row.user_id !== viewerId) return null;
    const liked = viewerId ? await this.likedSet([row.id], viewerId) : new Set<string>();
    return mapReviewRow(row, row.movies?.provider_id ?? "", viewerId ? liked.has(row.id) : null);
  }

  async getByUserAndMovie(userId: string, providerMovieId: string): Promise<ReviewDto | null> {
    const movieDbId = await this.ingestionStore.getMovieId(this.adapter.name, providerMovieId);
    if (!movieDbId) return null;
    const { data, error } = await this.admin
      .from("reviews")
      .select(REVIEW_SELECT)
      .eq("user_id", userId)
      .eq("movie_id", movieDbId)
      .maybeSingle();
    if (error) throw postgrestError("reviews.getByUserAndMovie", error);
    return data ? mapReviewRow(data, providerMovieId, false) : null;
  }

  async create(userId: string, providerMovieId: string, input: ReviewCreateInput): Promise<ReviewDto> {
    const { movieDbId } = await resolveMovieDbId(this.adapter, this.ingestionStore, providerMovieId);
    const { data, error } = await this.admin
      .from("reviews")
      .insert({
        user_id: userId,
        movie_id: movieDbId,
        title: input.title ?? null,
        body: input.body,
        rating: input.rating ?? null,
        language_code: input.languageCode,
        has_spoilers: input.hasSpoilers,
        status: "published",
      })
      .select(REVIEW_SELECT)
      .single();
    if (error) throw postgrestError("reviews.create", error);
    return mapReviewRow(data, providerMovieId, false);
  }

  async update(userId: string, reviewId: string, input: ReviewUpdateInput): Promise<ReviewDto | null> {
    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.body !== undefined) patch.body = input.body;
    if (input.rating !== undefined) patch.rating = input.rating;
    if (input.languageCode !== undefined) patch.language_code = input.languageCode;
    if (input.hasSpoilers !== undefined) patch.has_spoilers = input.hasSpoilers;
    if (input.status !== undefined) patch.status = input.status;

    const query = this.admin.from("reviews").update(patch).eq("id", reviewId).eq("user_id", userId);
    const { data, error } = await query.select(`${REVIEW_SELECT}, movies(provider_id)`);
    if (error) throw postgrestError("reviews.update", error);
    const rows = (data ?? []) as unknown as Array<ReviewRow & { movies: { provider_id: string } | null }>;
    const row = rows[0];
    if (!row) return null;
    const liked = await this.likedSet([row.id], userId);
    return mapReviewRow(row, row.movies?.provider_id ?? "", liked.has(row.id));
  }

  async remove(userId: string, reviewId: string): Promise<boolean> {
    const { data, error } = await this.admin
      .from("reviews")
      .delete()
      .eq("id", reviewId)
      .eq("user_id", userId)
      .select("id");
    if (error) throw postgrestError("reviews.remove", error);
    return (data ?? []).length > 0;
  }

  async like(userId: string, reviewId: string): Promise<void> {
    const { error } = await this.admin
      .from("review_likes")
      .upsert({ user_id: userId, review_id: reviewId }, { onConflict: "user_id,review_id", ignoreDuplicates: true });
    if (error) throw postgrestError("reviews.like", error);
  }

  async unlike(userId: string, reviewId: string): Promise<void> {
    const { error } = await this.admin
      .from("review_likes")
      .delete()
      .eq("user_id", userId)
      .eq("review_id", reviewId);
    if (error) throw postgrestError("reviews.unlike", error);
  }

  async hasReported(userId: string, reviewId: string): Promise<boolean> {
    const { data, error } = await this.admin
      .from("review_reports")
      .select("id")
      .eq("reporter_id", userId)
      .eq("review_id", reviewId)
      .maybeSingle();
    if (error) throw postgrestError("reviews.hasReported", error);
    return Boolean(data);
  }

  async report(userId: string, reviewId: string, input: ReviewReportInput): Promise<ReviewReportDto> {
    const { data, error } = await this.admin
      .from("review_reports")
      .insert({
        review_id: reviewId,
        reporter_id: userId,
        reason: input.reason,
        details: input.details ?? null,
        status: "open",
      })
      .select("*")
      .single();
    if (error) throw postgrestError("reviews.report", error);
    return {
      id: String(data.id),
      reviewId: String(data.review_id),
      reporterId: data.reporter_id,
      reason: data.reason,
      details: data.details,
      status: data.status,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async listMine(userId: string, page: PageRequest): Promise<{ reviews: ReviewDto[]; meta: PageMeta }> {
    const from = (page.page - 1) * page.pageSize;
    const { data, error, count } = await this.admin
      .from("reviews")
      .select(`${REVIEW_SELECT}, movies(provider_id)`, { count: "exact" })
      .eq("user_id", userId)
      .neq("status", "deleted")
      .order("updated_at", { ascending: false })
      .range(from, from + page.pageSize - 1);
    if (error) throw postgrestError("reviews.listMine", error);
    const rows = (data ?? []) as unknown as Array<ReviewRow & { movies: { provider_id: string } | null }>;
    const liked = await this.likedSet(rows.map((r) => r.id), userId);
    const reviews = rows.map((r) => mapReviewRow(r, r.movies?.provider_id ?? "", liked.has(r.id)));
    return { reviews, meta: toPageMeta(page, count ?? reviews.length) };
  }
}

// ── In-memory store (dev / tests) ───────────────────────────────────────────

interface InMemoryReviewRow {
  id: string;
  movieId: string;
  userId: string;
  title: string | null;
  body: string;
  rating: number | null;
  languageCode: string;
  status: ReviewStatus;
  hasSpoilers: boolean;
  likesCount: number;
  reportCount: number;
  createdAt: string;
  updatedAt: string;
}

export class InMemoryReviewStore implements ReviewStore {
  private readonly reviews = new Map<string, InMemoryReviewRow>();
  private readonly likes = new Map<string, Set<string>>(); // reviewId -> userIds
  private readonly reports = new Map<string, ReviewReportDto>();
  private nextReviewId = 1;
  private nextReportId = 1;

  private toDto(row: InMemoryReviewRow, viewerId?: string | null): ReviewDto {
    return {
      id: row.id,
      movieId: row.movieId,
      userId: row.userId,
      title: row.title,
      body: row.body,
      rating: row.rating,
      languageCode: row.languageCode,
      status: row.status,
      hasSpoilers: row.hasSpoilers,
      likesCount: row.likesCount,
      reportCount: row.reportCount,
      likedByMe: viewerId === undefined || viewerId === null ? null : (this.likes.get(row.id)?.has(viewerId) ?? false),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async list(providerMovieId: string, query: ReviewListQuery): Promise<{ reviews: ReviewDto[]; meta: PageMeta }> {
    let rows = [...this.reviews.values()].filter((r) => r.movieId === providerMovieId);
    rows = rows.filter((r) => r.status === "published" || r.userId === query.viewerId);

    switch (query.sort) {
      case "oldest":
        rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        break;
      case "top_rated":
        rows.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || b.createdAt.localeCompare(a.createdAt));
        break;
      case "most_liked":
        rows.sort((a, b) => b.likesCount - a.likesCount || b.createdAt.localeCompare(a.createdAt));
        break;
      case "newest":
      default:
        rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
    }

    const total = rows.length;
    const start = (query.page - 1) * query.pageSize;
    const slice = rows.slice(start, start + query.pageSize);
    return { reviews: slice.map((r) => this.toDto(r, query.viewerId)), meta: toPageMeta(query, total) };
  }

  async getById(reviewId: string, viewerId?: string): Promise<ReviewDto | null> {
    const row = this.reviews.get(reviewId);
    if (!row) return null;
    if (row.status !== "published" && row.userId !== viewerId) return null;
    return this.toDto(row, viewerId);
  }

  async getByUserAndMovie(userId: string, providerMovieId: string): Promise<ReviewDto | null> {
    const row = [...this.reviews.values()].find((r) => r.userId === userId && r.movieId === providerMovieId);
    return row ? this.toDto(row, userId) : null;
  }

  async create(userId: string, providerMovieId: string, input: ReviewCreateInput): Promise<ReviewDto> {
    const now = new Date().toISOString();
    const row: InMemoryReviewRow = {
      id: `rev-${this.nextReviewId++}`,
      movieId: providerMovieId,
      userId,
      title: input.title ?? null,
      body: input.body,
      rating: input.rating ?? null,
      languageCode: input.languageCode,
      status: "published",
      hasSpoilers: input.hasSpoilers,
      likesCount: 0,
      reportCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.reviews.set(row.id, row);
    return this.toDto(row, userId);
  }

  async update(userId: string, reviewId: string, input: ReviewUpdateInput): Promise<ReviewDto | null> {
    const row = this.reviews.get(reviewId);
    if (!row || row.userId !== userId) return null;
    if (input.title !== undefined) row.title = input.title;
    if (input.body !== undefined) row.body = input.body;
    if (input.rating !== undefined) row.rating = input.rating;
    if (input.languageCode !== undefined) row.languageCode = input.languageCode;
    if (input.hasSpoilers !== undefined) row.hasSpoilers = input.hasSpoilers;
    if (input.status !== undefined) row.status = input.status;
    row.updatedAt = new Date().toISOString();
    return this.toDto(row, userId);
  }

  async remove(userId: string, reviewId: string): Promise<boolean> {
    const row = this.reviews.get(reviewId);
    if (!row || row.userId !== userId) return false;
    this.reviews.delete(reviewId);
    this.likes.delete(reviewId);
    return true;
  }

  async like(userId: string, reviewId: string): Promise<void> {
    const row = this.reviews.get(reviewId);
    if (!row) return;
    const set = this.likes.get(reviewId) ?? new Set<string>();
    if (!set.has(userId)) {
      set.add(userId);
      this.likes.set(reviewId, set);
      row.likesCount += 1;
    }
  }

  async unlike(userId: string, reviewId: string): Promise<void> {
    const row = this.reviews.get(reviewId);
    const set = this.likes.get(reviewId);
    if (row && set?.delete(userId)) row.likesCount = Math.max(0, row.likesCount - 1);
  }

  async hasReported(userId: string, reviewId: string): Promise<boolean> {
    return [...this.reports.values()].some((r) => r.reviewId === reviewId && r.reporterId === userId);
  }

  async report(userId: string, reviewId: string, input: ReviewReportInput): Promise<ReviewReportDto> {
    const now = new Date().toISOString();
    const report: ReviewReportDto = {
      id: `rpt-${this.nextReportId++}`,
      reviewId,
      reporterId: userId,
      reason: input.reason,
      details: input.details ?? null,
      status: "open",
      createdAt: now,
      updatedAt: now,
    };
    this.reports.set(report.id, report);
    const row = this.reviews.get(reviewId);
    if (row) row.reportCount += 1;
    return report;
  }

  async listMine(userId: string, page: PageRequest): Promise<{ reviews: ReviewDto[]; meta: PageMeta }> {
    const rows = [...this.reviews.values()]
      .filter((r) => r.userId === userId && r.status !== "deleted")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const total = rows.length;
    const start = (page.page - 1) * page.pageSize;
    const slice = rows.slice(start, start + page.pageSize);
    return { reviews: slice.map((r) => this.toDto(r, userId)), meta: toPageMeta(page, total) };
  }

  // Used by InMemoryModerationStore to share state within the same process.
  __allReports(): ReviewReportDto[] {
    return [...this.reports.values()];
  }
  __setReportStatus(id: string, status: "resolved" | "dismissed"): ReviewReportDto | null {
    const r = this.reports.get(id);
    if (!r) return null;
    r.status = status;
    r.updatedAt = new Date().toISOString();
    return r;
  }
  __setReviewStatus(id: string, status: ReviewStatus): ReviewDto | null {
    const row = this.reviews.get(id);
    if (!row) return null;
    row.status = status;
    row.updatedAt = new Date().toISOString();
    return this.toDto(row);
  }
}

export function createReviewStore(
  config: AppConfig,
  adapter: MovieDataAdapter,
  ingestionStore: IngestionStore,
): ReviewStore {
  if (config.supabaseUrl && config.supabaseServiceRoleKey) {
    return new SupabaseReviewStore(
      createSupabaseAdminClient(config.supabaseUrl, config.supabaseServiceRoleKey),
      adapter,
      ingestionStore,
    );
  }
  return new InMemoryReviewStore();
}
