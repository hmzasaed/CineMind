import { useState } from "react";
import type { Review } from "../lib/api";
import { apiErrorMessage } from "../lib/format";
import { RatingInput } from "./RatingInput";

const MIN_LENGTH = 20;
const MAX_LENGTH = 20000;

interface ReviewFormProps {
  movieTitle: string;
  initial?: Review;
  submitLabel: string;
  pending: boolean;
  error?: unknown;
  onSubmit: (input: { title?: string; body: string; rating?: number; hasSpoilers: boolean }) => void;
  onCancel?: () => void;
}

export function ReviewForm({ movieTitle, initial, submitLabel, pending, error, onSubmit, onCancel }: ReviewFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [rating, setRating] = useState<number | null>(initial?.rating ?? null);
  const [hasSpoilers, setHasSpoilers] = useState(initial?.hasSpoilers ?? false);

  const tooShort = body.trim().length > 0 && body.trim().length < MIN_LENGTH;
  const canSubmit = body.trim().length >= MIN_LENGTH && body.length <= MAX_LENGTH && !pending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      title: title.trim() || undefined,
      body: body.trim(),
      rating: rating ?? undefined,
      hasSpoilers,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 p-4">
      <div>
        <span className="mb-1 block text-xs font-medium text-slate-400">Your rating (optional)</span>
        <RatingInput title={movieTitle} value={rating} onChange={setRating} onClear={() => setRating(null)} />
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-400">Title (optional)</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          className="w-full rounded-lg border border-white/15 bg-ink-800/80 px-3 py-2 text-sm text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-400">Review</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={MAX_LENGTH}
          rows={5}
          required
          className="w-full rounded-lg border border-white/15 bg-ink-800/80 px-3 py-2 text-sm text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
        />
        <span className={`mt-1 block text-xs ${tooShort ? "text-red-400" : "text-slate-500"}`}>
          {body.length}/{MAX_LENGTH} characters {tooShort && `(minimum ${MIN_LENGTH})`}
        </span>
      </label>

      <label className="inline-flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={hasSpoilers}
          onChange={(e) => setHasSpoilers(e.target.checked)}
          className="h-4 w-4 rounded border-white/30 bg-white/5"
        />
        This review contains spoilers
      </label>

      {error != null && (
        <p role="alert" className="text-xs text-red-400">
          {apiErrorMessage(error, "Could not save your review.")}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-gold-400 px-4 py-2 text-sm font-semibold text-ink-950 transition duration-200 hover:bg-gold-300 hover:shadow-glow-copper disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
