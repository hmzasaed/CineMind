import { useState } from "react";
import type { Review, SortOrder } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { apiErrorMessage } from "../lib/format";
import { useCreateReview, useDeleteReview, useReviews, useUpdateReview } from "../lib/queries";
import { ErrorState } from "./States";
import { Pagination } from "./Pagination";
import { ReviewCard } from "./ReviewCard";
import { ReviewForm } from "./ReviewForm";

const SORT_OPTIONS: Array<{ value: SortOrder; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "top_rated", label: "Top rated" },
  { value: "most_liked", label: "Most liked" },
];

interface ReviewsSectionProps {
  movieId: string;
  movieTitle: string;
}

export function ReviewsSection({ movieId, movieTitle }: ReviewsSectionProps) {
  const { user } = useAuth();
  const [sort, setSort] = useState<SortOrder>("newest");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Review | null>(null);

  const reviews = useReviews(movieId, page, sort);
  const create = useCreateReview(movieId);
  const update = useUpdateReview();
  const remove = useDeleteReview();

  const myReviewOnPage = reviews.data?.reviews.find((r) => r.userId === user?.id) ?? null;

  function closeForm() {
    setShowForm(false);
    setEditing(null);
  }

  async function onCreate(input: { title?: string; body: string; rating?: number; hasSpoilers: boolean }) {
    try {
      await create.mutateAsync(input);
      closeForm();
    } catch {
      // surfaced inline via create.error in ReviewForm
    }
  }

  async function onUpdate(input: { title?: string; body: string; rating?: number; hasSpoilers: boolean }) {
    if (!editing) return;
    try {
      await update.mutateAsync({ reviewId: editing.id, input });
      closeForm();
    } catch {
      // surfaced inline via update.error in ReviewForm
    }
  }

  async function onDelete(review: Review) {
    if (!window.confirm("Delete this review? This cannot be undone.")) return;
    await remove.mutateAsync(review.id).catch(() => {});
  }

  return (
    <section aria-labelledby="reviews-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="reviews-heading" className="font-display text-xl font-semibold text-white sm:text-2xl">
          Reviews {reviews.data ? `(${reviews.data.meta.total})` : ""}
        </h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-400">
            Sort by
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as SortOrder);
                setPage(1);
              }}
              className="rounded-lg border border-white/15 bg-ink-800/80 px-2 py-1 text-xs text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {user && !showForm && !editing && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="rounded-lg bg-gold-400 px-3 py-1.5 text-xs font-semibold text-ink-950 transition duration-200 hover:bg-gold-300 hover:shadow-glow-copper"
            >
              {myReviewOnPage ? "Write another review" : "Write a review"}
            </button>
          )}
        </div>
      </div>

      {!user && (
        <p className="text-xs text-slate-500">Sign in to write, like, or report reviews.</p>
      )}

      {showForm && (
        <ReviewForm
          movieTitle={movieTitle}
          submitLabel="Post review"
          pending={create.isPending}
          error={create.error}
          onSubmit={(input) => void onCreate(input)}
          onCancel={closeForm}
        />
      )}

      {editing && (
        <ReviewForm
          movieTitle={movieTitle}
          initial={editing}
          submitLabel="Save changes"
          pending={update.isPending}
          error={update.error}
          onSubmit={(input) => void onUpdate(input)}
          onCancel={closeForm}
        />
      )}

      {reviews.isError ? (
        <ErrorState message={apiErrorMessage(reviews.error)} onRetry={() => void reviews.refetch()} />
      ) : reviews.data && reviews.data.reviews.length === 0 ? (
        <p className="text-sm text-slate-500">No reviews yet — be the first to write one.</p>
      ) : (
        <ul role="list" aria-label="Reviews" className="space-y-3">
          {reviews.data?.reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              currentUserId={user?.id ?? null}
              onEdit={() => {
                setShowForm(false);
                setEditing(review);
              }}
              onDelete={() => void onDelete(review)}
            />
          ))}
        </ul>
      )}

      {reviews.data && (
        <Pagination
          page={page}
          pageCount={reviews.data.meta.pageCount}
          pageSize={reviews.data.meta.pageSize}
          total={reviews.data.meta.total}
          onPage={setPage}
          label="Reviews"
        />
      )}
    </section>
  );
}
