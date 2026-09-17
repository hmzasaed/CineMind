import { useMemo } from "react";
import { useAuth } from "./auth-context";

export type SourceKind =
  | "database"
  | "api"
  | "user_data"
  | "ml_model"
  | "web_research"
  | "static"
  | "deterministic";

export interface Provenance {
  sourceId: string;
  sourceKind: SourceKind;
  sourceName: string;
  retrievedAt: string;
  confidence: number;
  ref?: string;
}

export interface MovieRecord {
  id: string;
  title: string;
  originalTitle?: string;
  releaseYear?: number;
  runtimeMinutes?: number;
  overview?: string;
  genre: string[];
  rating?: { average: number; votes: number };
  certification?: string;
  posterPath?: string;
  backdropPath?: string;
}

/** Backward-compatible alias used by earlier UI code. */
export type Movie = MovieRecord;

export interface MovieDetail extends MovieRecord {
  tagline?: string;
  imdbId?: string;
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
  path: string;
  width?: number;
  height?: number;
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
  currency: string;
}

export interface ProductionCompany {
  id: string;
  name: string;
  logoPath?: string;
  originCountry?: string;
}

export interface Attribution {
  provider: string;
  licensed: boolean;
  notice?: string;
  termsUrl?: string;
}

export interface WatchlistEntry {
  movie: { value: MovieRecord; provenance: Provenance };
  addedAt: string;
}

export interface FavoriteEntry {
  movie: { value: MovieRecord; provenance: Provenance };
  addedAt: string;
}

export type WatchStatus = "planned" | "watching" | "paused" | "finished" | "abandoned";

export interface WatchHistoryEntry {
  id: string;
  movie: { value: MovieRecord; provenance: Provenance };
  status: WatchStatus;
  progressSeconds: number;
  watchedAt: string;
}

export type RatingCategory = "acting" | "story" | "visuals" | "sound" | "pacing";
export const RATING_CATEGORIES: readonly RatingCategory[] = [
  "acting",
  "story",
  "visuals",
  "sound",
  "pacing",
];

export interface UserRatingCategory {
  category: RatingCategory;
  score: number;
}

/** The signed-in user's own 1-10 rating (+ optional category scores) for a
 * movie — always kept separate from external/AI critic scores. */
export interface UserRating {
  id: string;
  movieId: string;
  score: number;
  categories: UserRatingCategory[];
  createdAt: string;
  updatedAt: string;
}

export interface UserRatingSummary {
  average: number | null;
  count: number;
  categories: Partial<Record<RatingCategory, { average: number; count: number }>>;
}

export type SortOrder = "newest" | "oldest" | "top_rated" | "most_liked";
export type ReviewStatus = "published" | "hidden" | "deleted";
export type ReportReason = "spam" | "harassment" | "incorrect" | "spoilers" | "other";
export const REPORT_REASONS: readonly ReportReason[] = ["spam", "harassment", "incorrect", "spoilers", "other"];

export interface Review {
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
  likedByMe: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewReport {
  id: string;
  reviewId: string;
  reporterId: string;
  reason: ReportReason;
  details: string | null;
  status: "open" | "resolved" | "dismissed";
  createdAt: string;
  updatedAt: string;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

export interface ProfileStats {
  reviewsCount: number;
  avgRatingGiven: number | null;
  watchlistCount: number;
  favoritesCount: number;
  watchedCount: number;
  likesReceived: number;
}

export interface SearchResponse {
  movies: MovieRecord[];
  provenance: Provenance;
  attribution?: Attribution;
}

export interface MovieDetailResponse {
  movie: MovieDetail;
  provenance: Provenance;
  attribution?: Attribution;
}

export interface CurrentUser {
  id: string;
  email: string | null;
  role: "user" | "admin" | null;
  authRole: string;
}

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    retryAfter?: string;
  };
}

export interface TextBlock {
  type: "text";
  content: string;
  format?: "markdown" | "plain";
}

export interface MovieCardBlock {
  type: "movie_card";
  movie: MovieRecord;
  provenance: Provenance;
}

export interface ComparisonTableBlock {
  type: "comparison_table";
  headers: string[];
  rows: Array<Record<string, unknown>>;
  movies: MovieRecord[];
  summary?: string;
}

export interface SourceReferenceBlock {
  type: "source_reference";
  sourceId: string;
  sourceName: string;
  sourceKind: string;
  confidence: number;
  ref?: string;
  retrievedAt: string;
}

export interface RecommendationCardBlock {
  type: "recommendation_card";
  movie: MovieRecord;
  reason: string;
  score?: number;
  provenance: Provenance;
}

export interface PredictionCardBlock {
  type: "prediction_card";
  movieTitle: string;
  metric: string;
  value: string | number;
  confidence: number;
  rationale: string;
  provenance?: Provenance;
}

export type ResponseBlock =
  | TextBlock
  | MovieCardBlock
  | ComparisonTableBlock
  | SourceReferenceBlock
  | RecommendationCardBlock
  | PredictionCardBlock;

export interface ToolCallTrace {
  name: string;
  durationMs: number;
  success: boolean;
  error: string | null;
}

export interface OperationalTrace {
  requestId: string;
  durationMs: number;
  intent: string;
  intentConfidence: number;
  toolsCalled: ToolCallTrace[];
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  costUsd?: number;
  provider: string;
  model: string;
  status: "success" | "error" | "fallback" | "unsupported";
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  blocks?: ResponseBlock[];
  trace?: OperationalTrace;
  createdAt: string;
}

export interface ChatConversation {
  id: string;
  userId?: string | null;
  title: string;
  provider: string;
  model: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
  lastMessage?: string;
}

export interface ChatResponse {
  conversationId: string;
  messageId: string;
  blocks: ResponseBlock[];
  trace: OperationalTrace;
}

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

function messageFor(res: Response, body: ApiErrorBody | null): string {
  if (body?.error?.message) return body.error.message;
  return `Request failed with ${res.status}`;
}

/** API error that also carries the backend code + Retry-After so the UI can
 * provide targeted guidance (e.g. a 429 cooldown message). */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryAfterMs?: number;

  constructor(message: string, status: number, code?: string, retryAfter?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    if (retryAfter && /^\d+$/.test(retryAfter)) this.retryAfterMs = Number(retryAfter) * 1000;
  }
}

export class ApiClient {
  constructor(
    private readonly baseUrl: string = BASE_URL,
    private readonly tokenProvider: (() => string | null) | null = null,
  ) {}

  private headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { Accept: "application/json", ...extra };
    const token = this.tokenProvider?.();
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }

  /** Perform a JSON GET. */
  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { headers: this.headers() });
    return this.handle<T>(res);
  }

  private async send<T>(path: string, init: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: this.headers(init.headers as Record<string, string> | undefined),
    });
    return this.handle<T>(res);
  }

  private async handle<T>(res: Response): Promise<T> {
    if (res.status === 204) return undefined as T;
    const body = (await res.json().catch(() => null)) as (T & ApiErrorBody) | null;
    if (!res.ok) {
      const message = messageFor(res, body);
      throw new ApiError(message, res.status, body?.error?.code, body?.error?.retryAfter);
    }
    return body as T;
  }

  // ── Movie data capabilities ──────────────────────────────────────────────

  async searchMovies(title: string, year?: string): Promise<SearchResponse> {
    if (!title.trim()) throw new Error("title is required");
    const params = new URLSearchParams({ title });
    if (year) params.set("year", year);
    return this.get<SearchResponse>(`/movies?${params}`);
  }

  async getUpcoming(limit = 20): Promise<SearchResponse> {
    const params = new URLSearchParams({ limit: String(limit) });
    return this.get<SearchResponse>(`/movies/upcoming?${params}`);
  }

  async getMovie(id: string): Promise<MovieDetailResponse> {
    return this.get<MovieDetailResponse>(`/movies/${encodeURIComponent(id)}`);
  }

  async getMovieCredits(id: string): Promise<{ credits: MovieCredits; provenance: Provenance; attribution?: Attribution }> {
    return this.get<{ credits: MovieCredits; provenance: Provenance; attribution?: Attribution }>(
      `/movies/${encodeURIComponent(id)}/credits`,
    );
  }

  async getMovieImages(id: string): Promise<{ images: MovieImages; provenance: Provenance; attribution?: Attribution }> {
    return this.get<{ images: MovieImages; provenance: Provenance; attribution?: Attribution }>(
      `/movies/${encodeURIComponent(id)}/images`,
    );
  }

  async getMovieRatings(id: string): Promise<{ ratings: MovieRating; provenance: Provenance; attribution?: Attribution }> {
    return this.get<{ ratings: MovieRating; provenance: Provenance; attribution?: Attribution }>(
      `/movies/${encodeURIComponent(id)}/ratings`,
    );
  }

  async getMovieCompanies(id: string): Promise<{ companies: ProductionCompany[]; provenance: Provenance; attribution?: Attribution }> {
    return this.get<{ companies: ProductionCompany[]; provenance: Provenance; attribution?: Attribution }>(
      `/movies/${encodeURIComponent(id)}/companies`,
    );
  }

  async getMovieFinancials(id: string): Promise<{ financials: MovieFinancials; provenance: Provenance; attribution?: Attribution }> {
    return this.get<{ financials: MovieFinancials; provenance: Provenance; attribution?: Attribution }>(
      `/movies/${encodeURIComponent(id)}/financials`,
    );
  }

  // ── Watchlist ─────────────────────────────────────────────────────────────

  async getWatchlist(): Promise<{ watchlist: WatchlistEntry[] }> {
    return this.get<{ watchlist: WatchlistEntry[] }>("/watchlist");
  }

  async addToWatchlist(movieId: string): Promise<void> {
    await this.send("/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movieId }),
    });
  }

  async removeFromWatchlist(movieId: string): Promise<void> {
    await this.send(`/watchlist/${encodeURIComponent(movieId)}`, { method: "DELETE" });
  }

  async getMe(): Promise<{ user: CurrentUser }> {
    return this.get<{ user: CurrentUser }>("/auth/me");
  }

  // ── User ratings (separate from external/AI critic scores) ──────────────

  async getMyRating(movieId: string): Promise<{ rating: UserRating | null }> {
    return this.get<{ rating: UserRating | null }>(`/movies/${encodeURIComponent(movieId)}/rating`);
  }

  async putRating(
    movieId: string,
    input: { score: number; categories?: UserRatingCategory[] },
  ): Promise<{ rating: UserRating }> {
    return this.send<{ rating: UserRating }>(`/movies/${encodeURIComponent(movieId)}/rating`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async deleteRating(movieId: string): Promise<void> {
    await this.send(`/movies/${encodeURIComponent(movieId)}/rating`, { method: "DELETE" });
  }

  async getRatingSummary(movieId: string): Promise<{ summary: UserRatingSummary; provenance: Provenance }> {
    return this.get<{ summary: UserRatingSummary; provenance: Provenance }>(
      `/movies/${encodeURIComponent(movieId)}/ratings/summary`,
    );
  }

  async getMyRatings(page = 1, pageSize = 10): Promise<{ ratings: UserRating[]; meta: PageMeta }> {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    return this.get<{ ratings: UserRating[]; meta: PageMeta }>(`/ratings/mine?${params}`);
  }

  // ── Reviews ───────────────────────────────────────────────────────────────

  async getReviews(
    movieId: string,
    opts: { page?: number; pageSize?: number; sort?: SortOrder } = {},
  ): Promise<{ reviews: Review[]; meta: PageMeta }> {
    const params = new URLSearchParams({
      page: String(opts.page ?? 1),
      pageSize: String(opts.pageSize ?? 10),
      sort: opts.sort ?? "newest",
    });
    return this.get<{ reviews: Review[]; meta: PageMeta }>(
      `/movies/${encodeURIComponent(movieId)}/reviews?${params}`,
    );
  }

  async createReview(
    movieId: string,
    input: { title?: string; body: string; rating?: number; hasSpoilers?: boolean; languageCode?: string },
  ): Promise<{ review: Review }> {
    return this.send<{ review: Review }>(`/movies/${encodeURIComponent(movieId)}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async updateReview(
    reviewId: string,
    input: Partial<{ title: string; body: string; rating: number; hasSpoilers: boolean; status: "published" | "hidden" }>,
  ): Promise<{ review: Review }> {
    return this.send<{ review: Review }>(`/reviews/${encodeURIComponent(reviewId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async deleteReview(reviewId: string): Promise<void> {
    await this.send(`/reviews/${encodeURIComponent(reviewId)}`, { method: "DELETE" });
  }

  async likeReview(reviewId: string): Promise<void> {
    await this.send(`/reviews/${encodeURIComponent(reviewId)}/like`, { method: "PUT" });
  }

  async unlikeReview(reviewId: string): Promise<void> {
    await this.send(`/reviews/${encodeURIComponent(reviewId)}/like`, { method: "DELETE" });
  }

  async reportReview(reviewId: string, input: { reason: ReportReason; details?: string }): Promise<{ report: ReviewReport }> {
    return this.send<{ report: ReviewReport }>(`/reviews/${encodeURIComponent(reviewId)}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async getMyReviews(page = 1, pageSize = 10): Promise<{ reviews: Review[]; meta: PageMeta }> {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    return this.get<{ reviews: Review[]; meta: PageMeta }>(`/reviews/mine?${params}`);
  }

  // ── Favorites ─────────────────────────────────────────────────────────────

  async getFavorites(): Promise<{ favorites: FavoriteEntry[] }> {
    return this.get<{ favorites: FavoriteEntry[] }>("/favorites");
  }

  async addFavorite(movieId: string): Promise<void> {
    await this.send(`/favorites/${encodeURIComponent(movieId)}`, { method: "PUT" });
  }

  async removeFavorite(movieId: string): Promise<void> {
    await this.send(`/favorites/${encodeURIComponent(movieId)}`, { method: "DELETE" });
  }

  // ── Watch history ─────────────────────────────────────────────────────────

  async getWatchHistory(): Promise<{ history: WatchHistoryEntry[] }> {
    return this.get<{ history: WatchHistoryEntry[] }>("/watch-history");
  }

  async addWatchHistory(
    movieId: string,
    status: WatchStatus = "finished",
    progressSeconds?: number,
  ): Promise<{ entry: WatchHistoryEntry }> {
    return this.send<{ entry: WatchHistoryEntry }>("/watch-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movieId, status, progressSeconds }),
    });
  }

  async removeWatchHistory(id: string): Promise<void> {
    await this.send(`/watch-history/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  // ── Profile statistics ───────────────────────────────────────────────────

  async getProfileStats(): Promise<{ stats: ProfileStats }> {
    return this.get<{ stats: ProfileStats }>("/profile/stats");
  }
}

/** ApiClient wired to the current Supabase session access token. */
export function useApi(): ApiClient {
  const { accessToken } = useAuth();
  return useMemo(
    () => new ApiClient(undefined, () => accessToken),
    // The client is cheap to rebuild and must capture the freshest token,
    // e.g. right after an automatic session refresh.
    [accessToken],
  );
}