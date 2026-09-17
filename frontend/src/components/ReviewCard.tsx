import { useState } from "react";
import type { Review } from "../lib/api";
import { apiErrorMessage } from "../lib/format";
import { useLikeReview, useUnlikeReview } from "../lib/queries";
import { cn } from "../lib/cn";
import { FlagIcon, StarIcon } from "./icons";
import { ReportReviewModal } from "./ReportReviewModal";

interface ReviewCardProps {
  review: Review;
  currentUserId?: string | null;
  onEdit?: () => void;
  onDelete?: () => void;
}

/**
 * Spoiler gate: when hasSpoilers is set and not yet revealed, the review body
 * is not rendered into the DOM at all (not just visually hidden) — so it
 * can't leak via Ctrl+F, a screen reader, or "view source" before the reader
 * explicitly opts in.
 */
export function ReviewCard({ review, currentUserId, onEdit, onDelete }: ReviewCardProps) {
  const [revealed, setRevealed] = useState(!review.hasSpoilers);
  const [reportOpen, setReportOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const like = useLikeReview();
  const unlike = useUnlikeReview();

  const isOwner = currentUserId != null && currentUserId === review.userId;
  const busy = like.isPending || unlike.isPending;

  async function onToggleLike() {
    setActionError(null);
    try {
      if (review.likedByMe) {
        await unlike.mutateAsync(review.id);
      } else {
        await like.mutateAsync(review.id);
      }
    } catch (err) {
      setActionError(apiErrorMessage(err, "Could not update your like."));
    }
  }

  return (
    <li className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {review.rating !== null && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-gold-300">
              <StarIcon className="h-4 w-4" />
              {review.rating}/10
            </span>
          )}
          {review.title && <span className="font-semibold text-white">{review.title}</span>}
          {review.status === "hidden" && (
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-slate-400">Hidden</span>
          )}
        </div>
        <time className="text-xs text-slate-500" dateTime={review.createdAt}>
          {new Date(review.createdAt).toLocaleDateString()}
        </time>
      </div>

      {review.hasSpoilers && !revealed ? (
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-3 text-sm text-amber-200">
          <p className="mb-2 font-medium">This review contains spoilers.</p>
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="rounded-lg border border-amber-400/40 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-400/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
          >
            Show anyway
          </button>
        </div>
      ) : (
        <p className="animate-fade-up whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{review.body}</p>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <button
          type="button"
          aria-pressed={review.likedByMe ?? false}
          disabled={busy || currentUserId == null}
          onClick={() => void onToggleLike()}
          className={cn(
            "group inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 font-medium transition duration-200",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400",
            review.likedByMe
              ? "border-gold-400/40 bg-gold-400/10 text-gold-300 shadow-glow-copper"
              : "border-white/10 bg-white/5 text-slate-300 hover:border-gold-400/20 hover:bg-white/10",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <StarIcon className="h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-125 motion-reduce:group-hover:scale-100" />
          {review.likesCount}
        </button>

        {!isOwner && currentUserId != null && (
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-medium text-slate-300 transition duration-200 hover:border-red-400/20 hover:bg-white/10 hover:text-red-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
          >
            <FlagIcon className="h-3.5 w-3.5" />
            Report
          </button>
        )}

        {isOwner && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-medium text-slate-300 transition duration-200 hover:border-gold-400/20 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
          >
            Edit
          </button>
        )}
        {isOwner && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-red-400/30 bg-red-400/10 px-2.5 py-1 font-medium text-red-300 transition duration-200 hover:bg-red-400/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
          >
            Delete
          </button>
        )}
      </div>

      {actionError && (
        <p role="alert" className="text-xs text-red-400">
          {actionError}
        </p>
      )}

      <ReportReviewModal reviewId={review.id} open={reportOpen} onClose={() => setReportOpen(false)} />
    </li>
  );
}
