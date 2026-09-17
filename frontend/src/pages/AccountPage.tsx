import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import {
  entryMovie,
  useDeleteReview,
  useFavorites,
  useMyRatings,
  useMyReviews,
  useProfileStats,
  useRemoveFromWatchlist,
  useRemoveWatchHistory,
  useToggleFavorite,
  useWatchHistory,
  useWatchlist,
} from "../lib/queries";
import { apiErrorMessage } from "../lib/format";
import { cn } from "../lib/cn";
import { MovieCard } from "../components/MovieCard";
import { MovieGrid } from "../components/MovieGrid";
import { MovieGridSkeleton } from "../components/Skeletons";
import { EmptyState, ErrorState } from "../components/States";
import { Avatar } from "../components/Avatar";
import { Pagination } from "../components/Pagination";
import { ProfileStatsPanel } from "../components/ProfileStatsPanel";
import { StarIcon } from "../components/icons";

type Tab = "overview" | "watchlist" | "favorites" | "watched" | "ratings" | "reviews";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "watchlist", label: "Watchlist" },
  { key: "favorites", label: "Favorites" },
  { key: "watched", label: "Watched" },
  { key: "ratings", label: "Ratings" },
  { key: "reviews", label: "Reviews" },
];

export function AccountPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");

  if (!user) return null;

  async function onSignOut() {
    try {
      await signOut();
      navigate("/", { replace: true });
    } catch {
      // Sign-out errors surface nothing useful; stay on the page.
    }
  }

  return (
    <div className="relative isolate mx-auto w-full max-w-7xl px-4 py-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-1/4 -top-1/3 -z-10 h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(circle,rgba(207,154,82,0.07),transparent_60%)]"
      />
      <header className="animate-fade-up flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar name={user.email ?? "User"} className="h-14 w-14 text-lg ring-2 ring-gold-400/20" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">Your profile</h1>
          <p className="mt-1 truncate text-sm text-slate-400">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={() => void onSignOut()}
          className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
        >
          Sign out
        </button>
      </header>

      <div
        role="tablist"
        aria-label="Profile sections"
        className="glass mt-8 flex flex-wrap gap-1 rounded-xl p-1.5"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400",
              tab === t.key
                ? "bg-gold-400 text-ink-950 shadow-glow-copper"
                : "text-slate-300 hover:bg-white/10 hover:text-white",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "overview" && <OverviewTab />}
        {tab === "watchlist" && <WatchlistTab />}
        {tab === "favorites" && <FavoritesTab />}
        {tab === "watched" && <WatchedTab />}
        {tab === "ratings" && <RatingsTab />}
        {tab === "reviews" && <ReviewsTab />}
      </div>
    </div>
  );
}

function OverviewTab() {
  const stats = useProfileStats();

  return (
    <section
      role="tabpanel"
      id="panel-overview"
      aria-labelledby="tab-overview"
      className="card max-w-2xl p-6"
    >
      <h2 className="font-display text-xl font-semibold text-white">At a glance</h2>
      {stats.isLoading ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : stats.isError ? (
        <ErrorState message={apiErrorMessage(stats.error)} onRetry={() => void stats.refetch()} className="mt-4" />
      ) : (
        stats.data && <ProfileStatsPanel stats={stats.data.stats} />
      )}
    </section>
  );
}

function WatchlistTab() {
  const watchlist = useWatchlist();
  const remove = useRemoveFromWatchlist();
  const [error, setError] = useState<string | null>(null);

  const entries = watchlist.data?.watchlist ?? [];

  async function onRemove(movieId: string) {
    setError(null);
    try {
      await remove.mutateAsync(movieId);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not remove from watchlist."));
    }
  }

  return (
    <section role="tabpanel" id="panel-watchlist" aria-labelledby="tab-watchlist" aria-busy={watchlist.isLoading}>
      {watchlist.isLoading ? (
        <MovieGridSkeleton count={8} />
      ) : watchlist.isError ? (
        <ErrorState message="Your watchlist could not be loaded." onRetry={() => void watchlist.refetch()} />
      ) : entries.length === 0 ? (
        <EmptyState
          title="Your watchlist is empty"
          message="Open any movie and press “Add to watchlist” to keep it here."
        />
      ) : (
        <>
          {error && (
            <p role="alert" className="mb-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
          <MovieGrid label="Your watchlist">
            {entries.map((entry) => {
              const movie = entryMovie(entry);
              return <MovieCard key={movie.id} movie={movie} onRemove={() => void onRemove(movie.id)} removeLabel="Remove" />;
            })}
          </MovieGrid>
        </>
      )}
    </section>
  );
}

function FavoritesTab() {
  const favorites = useFavorites();
  const toggle = useToggleFavorite();
  const [error, setError] = useState<string | null>(null);

  const entries = favorites.data?.favorites ?? [];

  async function onRemove(movieId: string) {
    setError(null);
    try {
      await toggle.mutateAsync({ movieId, isFavorite: true });
    } catch (err) {
      setError(apiErrorMessage(err, "Could not remove from favorites."));
    }
  }

  return (
    <section role="tabpanel" id="panel-favorites" aria-labelledby="tab-favorites" aria-busy={favorites.isLoading}>
      {favorites.isLoading ? (
        <MovieGridSkeleton count={8} />
      ) : favorites.isError ? (
        <ErrorState message="Your favorites could not be loaded." onRetry={() => void favorites.refetch()} />
      ) : entries.length === 0 ? (
        <EmptyState title="No favorites yet" message="Open any movie and press “Add to favorites” to keep it here." />
      ) : (
        <>
          {error && (
            <p role="alert" className="mb-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
          <MovieGrid label="Your favorites">
            {entries.map((entry) => {
              const movie = entryMovie(entry);
              return <MovieCard key={movie.id} movie={movie} onRemove={() => void onRemove(movie.id)} removeLabel="Remove" />;
            })}
          </MovieGrid>
        </>
      )}
    </section>
  );
}

function WatchedTab() {
  const history = useWatchHistory();
  const remove = useRemoveWatchHistory();
  const [error, setError] = useState<string | null>(null);

  const finished = (history.data?.history ?? []).filter((h) => h.status === "finished");

  async function onRemove(id: string) {
    setError(null);
    try {
      await remove.mutateAsync(id);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not update your watched list."));
    }
  }

  return (
    <section role="tabpanel" id="panel-watched" aria-labelledby="tab-watched" aria-busy={history.isLoading}>
      {history.isLoading ? (
        <MovieGridSkeleton count={8} />
      ) : history.isError ? (
        <ErrorState message="Your watched list could not be loaded." onRetry={() => void history.refetch()} />
      ) : finished.length === 0 ? (
        <EmptyState title="Nothing watched yet" message="Open a movie and press “Mark as watched” to build your log." />
      ) : (
        <>
          {error && (
            <p role="alert" className="mb-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
          <MovieGrid label="Movies you’ve watched">
            {finished.map((entry) => (
              <MovieCard
                key={entry.id}
                movie={entryMovie(entry)}
                onRemove={() => void onRemove(entry.id)}
                removeLabel="Remove"
              />
            ))}
          </MovieGrid>
        </>
      )}
    </section>
  );
}

function RatingsTab() {
  const [page, setPage] = useState(1);
  const ratings = useMyRatings(page, 10);

  return (
    <section role="tabpanel" id="panel-ratings" aria-labelledby="tab-ratings">
      {ratings.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : ratings.isError ? (
        <ErrorState message={apiErrorMessage(ratings.error)} onRetry={() => void ratings.refetch()} />
      ) : !ratings.data || ratings.data.ratings.length === 0 ? (
        <EmptyState title="No ratings yet" message="Rated movies appear here with your score out of 10." />
      ) : (
        <>
          <ul role="list" aria-label="Your ratings" className="space-y-3">
            {ratings.data.ratings.map((rating) => (
              <li key={rating.id} className="card flex items-center gap-4 p-4">
                <span className="inline-flex shrink-0 items-center gap-1 text-lg font-bold text-gold-300">
                  <StarIcon className="h-5 w-5" />
                  {rating.score}/10
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-500">Movie: {rating.movieId}</p>
                  <p className="text-xs text-slate-500">Rated {new Date(rating.updatedAt).toLocaleDateString()}</p>
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            page={page}
            pageCount={ratings.data.meta.pageCount}
            pageSize={ratings.data.meta.pageSize}
            total={ratings.data.meta.total}
            onPage={setPage}
            label="Ratings"
          />
        </>
      )}
    </section>
  );
}

function ReviewsTab() {
  const [page, setPage] = useState(1);
  const reviews = useMyReviews(page, 10);
  const remove = useDeleteReview();
  const [error, setError] = useState<string | null>(null);

  async function onDelete(reviewId: string) {
    setError(null);
    if (!window.confirm("Delete this review? This cannot be undone.")) return;
    try {
      await remove.mutateAsync(reviewId);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not delete this review."));
    }
  }

  return (
    <section role="tabpanel" id="panel-reviews" aria-labelledby="tab-reviews">
      {reviews.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : reviews.isError ? (
        <ErrorState message={apiErrorMessage(reviews.error)} onRetry={() => void reviews.refetch()} />
      ) : !reviews.data || reviews.data.reviews.length === 0 ? (
        <EmptyState title="No reviews yet" message="Reviews you write appear here." />
      ) : (
        <>
          {error && (
            <p role="alert" className="mb-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
          <ul role="list" aria-label="Your reviews" className="space-y-3">
            {reviews.data.reviews.map((review) => (
              <li key={review.id} className="card space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-500">Movie: {review.movieId}</p>
                  <button
                    type="button"
                    onClick={() => void onDelete(review.id)}
                    className="rounded-lg border border-red-400/30 bg-red-400/10 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-400/20"
                  >
                    Delete
                  </button>
                </div>
                <p className="line-clamp-3 text-sm text-slate-300">{review.body}</p>
                <p className="text-xs text-slate-500">
                  {review.likesCount} like{review.likesCount === 1 ? "" : "s"} · {review.status}
                </p>
              </li>
            ))}
          </ul>
          <Pagination
            page={page}
            pageCount={reviews.data.meta.pageCount}
            pageSize={reviews.data.meta.pageSize}
            total={reviews.data.meta.total}
            onPage={setPage}
            label="Reviews"
          />
        </>
      )}
    </section>
  );
}
