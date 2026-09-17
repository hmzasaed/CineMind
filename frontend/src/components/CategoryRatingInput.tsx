import { useState } from "react";
import { RATING_CATEGORIES, type RatingCategory, type UserRatingCategory } from "../lib/api";
import { cn } from "../lib/cn";
import { RatingInput } from "./RatingInput";

const LABELS: Record<RatingCategory, string> = {
  acting: "Acting",
  story: "Story",
  visuals: "Visuals",
  sound: "Sound",
  pacing: "Pacing",
};

interface CategoryRatingInputProps {
  title: string;
  categories: UserRatingCategory[];
  onChange: (categories: UserRatingCategory[]) => void;
}

/** Optional per-category sub-scores, collapsed behind a disclosure so the
 * primary flow stays a single star row. */
export function CategoryRatingInput({ title, categories, onChange }: CategoryRatingInputProps) {
  const [open, setOpen] = useState(categories.length > 0);
  const byCategory = new Map(categories.map((c) => [c.category, c.score]));

  function setCategory(category: RatingCategory, score: number) {
    const next = categories.filter((c) => c.category !== category);
    next.push({ category, score });
    onChange(next);
  }

  function clearCategory(category: RatingCategory) {
    onChange(categories.filter((c) => c.category !== category));
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 underline underline-offset-2 transition hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
      >
        <span
          aria-hidden
          className={cn("inline-block transition-transform duration-200 ease-cinematic", open && "rotate-90")}
        >
          ›
        </span>
        {open ? "Hide detailed ratings" : "Add detailed ratings"}
      </button>
      {open && (
        <div className="mt-3 animate-fade-up space-y-2">
          {RATING_CATEGORIES.map((category) => (
            <div key={category} className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-xs font-medium text-slate-400">{LABELS[category]}</span>
              <RatingInput
                title={`${LABELS[category]} for ${title}`}
                value={byCategory.get(category) ?? null}
                onChange={(v) => setCategory(category, v)}
                onClear={byCategory.has(category) ? () => clearCategory(category) : undefined}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
