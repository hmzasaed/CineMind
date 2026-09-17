import type { Fact } from "../types.js";
import type { MovieRecord } from "../providers/types.js";

export type SortOrder = "newest" | "oldest" | "top_rated" | "most_liked";
export type ReviewStatus = "published" | "hidden" | "deleted";
export type ReportReason = "spam" | "harassment" | "incorrect" | "spoilers" | "other";
export type ReportStatus = "open" | "resolved" | "dismissed";
export type RatingCategory = "acting" | "story" | "visuals" | "sound" | "pacing";
export type WatchStatus = "planned" | "watching" | "paused" | "finished" | "abandoned";

export const RATING_CATEGORIES: readonly RatingCategory[] = [
  "acting",
  "story",
  "visuals",
  "sound",
  "pacing",
];

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

export interface PageRequest {
  page: number;
  pageSize: number;
}

export function toPageMeta(req: PageRequest, total: number): PageMeta {
  return {
    page: req.page,
    pageSize: req.pageSize,
    total,
    pageCount: Math.max(1, Math.ceil(total / req.pageSize)),
  };
}

// ── ratings ───────────────────────────────────────────────────────────────────

export interface MovieRatingCategoryDto {
  category: RatingCategory;
  score: number;
}

export interface MovieRatingDto {
  id: string;
  movieId: string; // provider-native id
  score: number;
  categories: MovieRatingCategoryDto[];
  createdAt: string;
  updatedAt: string;
}

export interface RatingSummary {
  average: number | null;
  count: number;
  categories: Partial<Record<RatingCategory, { average: number; count: number }>>;
}

export interface RatingUpsertInput {
  score: number;
  categories?: MovieRatingCategoryDto[];
}

export interface RatingStore {
  getMine(userId: string, providerMovieId: string): Promise<MovieRatingDto | null>;
  upsert(userId: string, providerMovieId: string, input: RatingUpsertInput): Promise<MovieRatingDto>;
  remove(userId: string, providerMovieId: string): Promise<boolean>;
  summary(providerMovieId: string): Promise<RatingSummary>;
  listMine(userId: string, page: PageRequest): Promise<{ ratings: MovieRatingDto[]; meta: PageMeta }>;
}

// ── reviews ───────────────────────────────────────────────────────────────────

export interface ReviewDto {
  id: string;
  movieId: string; // provider-native id
  userId: string;
  title: string | null;
  body: string;
  rating: number | null;
  languageCode: string;
  status: ReviewStatus;
  hasSpoilers: boolean;
  likesCount: number;
  reportCount: number;
  /** null when the caller is anonymous. */
  likedByMe: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewCreateInput {
  title?: string;
  body: string;
  rating?: number;
  languageCode: string;
  hasSpoilers: boolean;
}

export type ReviewUpdateInput = Partial<ReviewCreateInput> & {
  status?: "published" | "hidden";
};

export interface ReviewReportDto {
  id: string;
  reviewId: string;
  reporterId: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewReportInput {
  reason: ReportReason;
  details?: string;
}

export interface ReviewListQuery extends PageRequest {
  sort: SortOrder;
  /** When set, includes the viewer's own non-published review and likedByMe. */
  viewerId?: string;
}

export interface ReviewStore {
  list(providerMovieId: string, query: ReviewListQuery): Promise<{ reviews: ReviewDto[]; meta: PageMeta }>;
  /** Minimal existence/visibility read used by like/report routes; not owner-scoped. */
  getById(reviewId: string, viewerId?: string): Promise<ReviewDto | null>;
  getByUserAndMovie(userId: string, providerMovieId: string): Promise<ReviewDto | null>;
  create(userId: string, providerMovieId: string, input: ReviewCreateInput): Promise<ReviewDto>;
  update(userId: string, reviewId: string, input: ReviewUpdateInput): Promise<ReviewDto | null>;
  remove(userId: string, reviewId: string): Promise<boolean>;
  like(userId: string, reviewId: string): Promise<void>;
  unlike(userId: string, reviewId: string): Promise<void>;
  hasReported(userId: string, reviewId: string): Promise<boolean>;
  report(userId: string, reviewId: string, input: ReviewReportInput): Promise<ReviewReportDto>;
  listMine(userId: string, page: PageRequest): Promise<{ reviews: ReviewDto[]; meta: PageMeta }>;
}

// ── moderation ───────────────────────────────────────────────────────────────

export interface ModerationStore {
  listReports(query: PageRequest & { status?: ReportStatus }): Promise<{ reports: ReviewReportDto[]; meta: PageMeta }>;
  resolveReport(id: string, status: "resolved" | "dismissed"): Promise<ReviewReportDto | null>;
  setReviewStatus(reviewId: string, status: ReviewStatus): Promise<ReviewDto | null>;
}

// ── profile statistics ───────────────────────────────────────────────────────

export interface ProfileStatsDto {
  reviewsCount: number;
  avgRatingGiven: number | null;
  watchlistCount: number;
  favoritesCount: number;
  watchedCount: number;
  likesReceived: number;
}

export interface ProfileStatsStore {
  get(userId: string): Promise<ProfileStatsDto>;
}

// ── favorites / watch history (watchlist reuses providers/types.ts's shape) ──

export interface FavoriteEntry {
  movie: Fact<MovieRecord>;
  addedAt: string;
}

export interface FavoritesStore {
  list(userId: string): Promise<FavoriteEntry[]>;
  add(userId: string, movie: Fact<MovieRecord>): Promise<FavoriteEntry>;
  remove(userId: string, movieId: string): Promise<boolean>;
}

export interface WatchHistoryEntry {
  id: string;
  movie: Fact<MovieRecord>;
  status: WatchStatus;
  progressSeconds: number;
  watchedAt: string;
}

export interface WatchHistoryStore {
  list(userId: string): Promise<WatchHistoryEntry[]>;
  add(
    userId: string,
    movie: Fact<MovieRecord>,
    input: { status: WatchStatus; progressSeconds?: number },
  ): Promise<WatchHistoryEntry>;
  remove(userId: string, id: string): Promise<boolean>;
}
