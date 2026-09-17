import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "../services/supabase.js";
import type { AppConfig } from "../config.js";
import { postgrestError } from "./db-error.js";
import type { FavoritesStore, ProfileStatsDto, ProfileStatsStore, RatingStore, ReviewStore, WatchHistoryStore } from "./types.js";
import type { WatchlistStore } from "../providers/types.js";

/**
 * Calls the service-role-only `get_profile_stats(uuid)` function (see
 * 00004_social_features.sql) — always with req.auth.userId, never
 * client-supplied input, since the function itself performs no auth check.
 */
export class SupabaseProfileStatsStore implements ProfileStatsStore {
  constructor(private readonly admin: SupabaseClient) {}

  async get(userId: string): Promise<ProfileStatsDto> {
    const { data, error } = await this.admin.rpc("get_profile_stats", { p_user_id: userId }).single();
    if (error) throw postgrestError("profileStats.get", error);
    const row = data as {
      reviews_count: number | null;
      avg_rating_given: number | null;
      watchlist_count: number | null;
      favorites_count: number | null;
      watched_count: number | null;
      likes_received: number | null;
    };
    return {
      reviewsCount: row.reviews_count ?? 0,
      avgRatingGiven: row.avg_rating_given ?? null,
      watchlistCount: row.watchlist_count ?? 0,
      favoritesCount: row.favorites_count ?? 0,
      watchedCount: row.watched_count ?? 0,
      likesReceived: row.likes_received ?? 0,
    };
  }
}

/** Computes the same six fields from the other in-memory stores, for dev/tests without Supabase. */
export class InMemoryProfileStatsStore implements ProfileStatsStore {
  constructor(
    private readonly deps: {
      watchlistStore: WatchlistStore;
      favoritesStore: FavoritesStore;
      watchHistoryStore: WatchHistoryStore;
      ratingStore: RatingStore;
      reviewStore: ReviewStore;
    },
  ) {}

  async get(userId: string): Promise<ProfileStatsDto> {
    const [watchlist, favorites, history, ratings, reviews] = await Promise.all([
      this.deps.watchlistStore.list(userId),
      this.deps.favoritesStore.list(userId),
      this.deps.watchHistoryStore.list(userId),
      this.deps.ratingStore.listMine(userId, { page: 1, pageSize: 1000 }),
      this.deps.reviewStore.listMine(userId, { page: 1, pageSize: 1000 }),
    ]);
    const avgRatingGiven =
      ratings.ratings.length > 0
        ? Math.round((ratings.ratings.reduce((s, r) => s + r.score, 0) / ratings.ratings.length) * 100) / 100
        : null;
    const likesReceived = reviews.reviews.reduce((s, r) => s + r.likesCount, 0);
    return {
      reviewsCount: reviews.meta.total,
      avgRatingGiven,
      watchlistCount: watchlist.length,
      favoritesCount: favorites.length,
      watchedCount: history.filter((h) => h.status === "finished").length,
      likesReceived,
    };
  }
}

export function createProfileStatsStore(
  config: AppConfig,
  fallbackDeps: {
    watchlistStore: WatchlistStore;
    favoritesStore: FavoritesStore;
    watchHistoryStore: WatchHistoryStore;
    ratingStore: RatingStore;
    reviewStore: ReviewStore;
  },
): ProfileStatsStore {
  if (config.supabaseUrl && config.supabaseServiceRoleKey) {
    return new SupabaseProfileStatsStore(
      createSupabaseAdminClient(config.supabaseUrl, config.supabaseServiceRoleKey),
    );
  }
  return new InMemoryProfileStatsStore(fallbackDeps);
}
