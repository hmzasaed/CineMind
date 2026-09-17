import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useApi,
  type MovieRecord,
  type ReportReason,
  type SortOrder,
  type UserRatingCategory,
} from "./api";
import { useAuth } from "./auth-context";

export const movieKeys = {
  all: ["movies"] as const,
  detail: (id: string) => ["movies", "detail", id] as const,
  credits: (id: string) => ["movies", "credits", id] as const,
  images: (id: string) => ["movies", "images", id] as const,
  ratings: (id: string) => ["movies", "ratings", id] as const,
  companies: (id: string) => ["movies", "companies", id] as const,
  financials: (id: string) => ["movies", "financials", id] as const,
  upcoming: ["movies", "upcoming"] as const,
  search: (title: string, year: string) => ["movies", "search", title, year] as const,
  watchlist: ["watchlist"] as const,
  favorites: ["favorites"] as const,
  watchHistory: ["watch-history"] as const,
  myRating: (movieId: string) => ["ratings", "mine", movieId] as const,
  ratingSummary: (movieId: string) => ["ratings", "summary", movieId] as const,
  myRatings: (page: number) => ["ratings", "mine-list", page] as const,
  reviews: (movieId: string, page: number, sort: SortOrder) => ["reviews", movieId, page, sort] as const,
  myReviews: (page: number) => ["reviews", "mine", page] as const,
  profileStats: ["profile", "stats"] as const,
};

export function useMovie(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: movieKeys.detail(id),
    queryFn: () => api.getMovie(id),
    retry: 1,
  });
}

export function useCredits(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: movieKeys.credits(id),
    queryFn: () => api.getMovieCredits(id),
    retry: 1,
  });
}

export function useImages(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: movieKeys.images(id),
    queryFn: () => api.getMovieImages(id),
    retry: 1,
  });
}

export function useRatings(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: movieKeys.ratings(id),
    queryFn: () => api.getMovieRatings(id),
    retry: 1,
  });
}

export function useCompanies(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: movieKeys.companies(id),
    queryFn: () => api.getMovieCompanies(id),
    retry: 1,
  });
}

export function useFinancials(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: movieKeys.financials(id),
    queryFn: () => api.getMovieFinancials(id),
    retry: 1,
  });
}

export function useUpcoming(limit = 20) {
  const api = useApi();
  return useQuery({
    queryKey: movieKeys.upcoming,
    queryFn: () => api.getUpcoming(limit),
  });
}

export function useSearch(title: string, year: string, enabled: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: movieKeys.search(title, year),
    queryFn: () => api.searchMovies(title, year || undefined),
    enabled: enabled && title.trim().length > 0,
  });
}

// ── Watchlist ────────────────────────────────────────────────────────────────

export function useWatchlist() {
  const api = useApi();
  const { user } = useAuth();
  return useQuery({
    queryKey: movieKeys.watchlist,
    queryFn: () => api.getWatchlist(),
    enabled: !!user,
  });
}

export function useAddToWatchlist() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (movieId: string) => api.addToWatchlist(movieId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: movieKeys.watchlist }),
  });
}

export function useRemoveFromWatchlist() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (movieId: string) => api.removeFromWatchlist(movieId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: movieKeys.watchlist }),
  });
}

/** Records used by the watchlist store come back wrapped in Fact<T>. */
export function entryMovie(entry: { movie: { value: MovieRecord } }): MovieRecord {
  return entry.movie.value;
}

// ── Favorites ────────────────────────────────────────────────────────────────

export function useFavorites() {
  const api = useApi();
  const { user } = useAuth();
  return useQuery({
    queryKey: movieKeys.favorites,
    queryFn: () => api.getFavorites(),
    enabled: !!user,
  });
}

export function useToggleFavorite() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ movieId, isFavorite }: { movieId: string; isFavorite: boolean }) =>
      isFavorite ? api.removeFavorite(movieId) : api.addFavorite(movieId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: movieKeys.favorites }),
  });
}

// ── Watch history ────────────────────────────────────────────────────────────

export function useWatchHistory() {
  const api = useApi();
  const { user } = useAuth();
  return useQuery({
    queryKey: movieKeys.watchHistory,
    queryFn: () => api.getWatchHistory(),
    enabled: !!user,
  });
}

export function useAddWatchHistory() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (movieId: string) => api.addWatchHistory(movieId, "finished"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: movieKeys.watchHistory });
      void queryClient.invalidateQueries({ queryKey: movieKeys.profileStats });
    },
  });
}

export function useRemoveWatchHistory() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.removeWatchHistory(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: movieKeys.watchHistory });
      void queryClient.invalidateQueries({ queryKey: movieKeys.profileStats });
    },
  });
}

// ── User ratings (kept separate from external/AI critic scores) ─────────────

export function useMyRating(movieId: string) {
  const api = useApi();
  const { user } = useAuth();
  return useQuery({
    queryKey: movieKeys.myRating(movieId),
    queryFn: () => api.getMyRating(movieId),
    enabled: !!user && !!movieId,
  });
}

export function useRatingSummary(movieId: string) {
  const api = useApi();
  return useQuery({
    queryKey: movieKeys.ratingSummary(movieId),
    queryFn: () => api.getRatingSummary(movieId),
    enabled: !!movieId,
  });
}

export function usePutRating(movieId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { score: number; categories?: UserRatingCategory[] }) => api.putRating(movieId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: movieKeys.myRating(movieId) });
      void queryClient.invalidateQueries({ queryKey: movieKeys.ratingSummary(movieId) });
      void queryClient.invalidateQueries({ queryKey: movieKeys.profileStats });
    },
  });
}

export function useDeleteRating(movieId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteRating(movieId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: movieKeys.myRating(movieId) });
      void queryClient.invalidateQueries({ queryKey: movieKeys.ratingSummary(movieId) });
      void queryClient.invalidateQueries({ queryKey: movieKeys.profileStats });
    },
  });
}

export function useMyRatings(page = 1, pageSize = 10) {
  const api = useApi();
  const { user } = useAuth();
  return useQuery({
    queryKey: movieKeys.myRatings(page),
    queryFn: () => api.getMyRatings(page, pageSize),
    enabled: !!user,
  });
}

// ── Reviews ──────────────────────────────────────────────────────────────────

export function useReviews(movieId: string, page: number, sort: SortOrder, pageSize = 10) {
  const api = useApi();
  return useQuery({
    queryKey: movieKeys.reviews(movieId, page, sort),
    queryFn: () => api.getReviews(movieId, { page, pageSize, sort }),
    enabled: !!movieId,
  });
}

function invalidateReviews(queryClient: ReturnType<typeof useQueryClient>, movieId?: string) {
  void queryClient.invalidateQueries({ queryKey: ["reviews"] });
  if (movieId) void queryClient.invalidateQueries({ queryKey: movieKeys.ratingSummary(movieId) });
  void queryClient.invalidateQueries({ queryKey: movieKeys.profileStats });
}

export function useCreateReview(movieId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { title?: string; body: string; rating?: number; hasSpoilers?: boolean }) =>
      api.createReview(movieId, input),
    onSuccess: () => invalidateReviews(queryClient, movieId),
  });
}

export function useUpdateReview() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      reviewId,
      input,
    }: {
      reviewId: string;
      input: Partial<{ title: string; body: string; rating: number; hasSpoilers: boolean; status: "published" | "hidden" }>;
    }) => api.updateReview(reviewId, input),
    onSuccess: () => invalidateReviews(queryClient),
  });
}

export function useDeleteReview() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) => api.deleteReview(reviewId),
    onSuccess: () => invalidateReviews(queryClient),
  });
}

export function useLikeReview() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) => api.likeReview(reviewId),
    onSuccess: () => invalidateReviews(queryClient),
  });
}

export function useUnlikeReview() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) => api.unlikeReview(reviewId),
    onSuccess: () => invalidateReviews(queryClient),
  });
}

export function useReportReview() {
  const api = useApi();
  return useMutation({
    mutationFn: ({ reviewId, reason, details }: { reviewId: string; reason: ReportReason; details?: string }) =>
      api.reportReview(reviewId, { reason, details }),
  });
}

export function useMyReviews(page = 1, pageSize = 10) {
  const api = useApi();
  const { user } = useAuth();
  return useQuery({
    queryKey: movieKeys.myReviews(page),
    queryFn: () => api.getMyReviews(page, pageSize),
    enabled: !!user,
  });
}

// ── Profile statistics ───────────────────────────────────────────────────────

export function useProfileStats() {
  const api = useApi();
  const { user } = useAuth();
  return useQuery({
    queryKey: movieKeys.profileStats,
    queryFn: () => api.getProfileStats(),
    enabled: !!user,
  });
}