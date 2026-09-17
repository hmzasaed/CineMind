import { useRef } from "react";
import { cn } from "../lib/cn";
import { StarIcon } from "./icons";

const STARS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

interface RatingInputProps {
  title: string;
  value: number | null;
  onChange: (value: number) => void;
  onClear?: () => void;
  className?: string;
}

/**
 * Keyboard-accessible 1–10 rating input. Rendered as a true radiogroup:
 * ArrowLeft/ArrowRight move focus like radio buttons, each star announces its
 * value via aria-label, and the checked state is exposed via aria-checked.
 */
export function RatingInput({ title, value, onChange, onClear, className }: RatingInputProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function focusAt(index: number) {
    refs.current[index]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      focusAt(index === STARS.length - 1 ? 0 : index + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      focusAt(index === 0 ? STARS.length - 1 : index - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusAt(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusAt(STARS.length - 1);
    }
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <div
        role="radiogroup"
        aria-label={`Your rating for ${title} (1 to 10)`}
        className="flex items-center gap-0.5"
      >
        {STARS.map((star, i) => {
          const selected = value !== null && star <= value;
          return (
            <button
              key={star}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={value === star}
              aria-label={`${star} out of 10`}
              title={`${star} / 10`}
              onClick={() => onChange(star)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "rounded p-0.5 transition duration-150 hover:scale-125 motion-reduce:hover:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400",
                selected ? "text-gold-400" : "text-slate-600 hover:text-slate-300",
              )}
            >
              <StarIcon className="h-5 w-5" />
            </button>
          );
        })}
      </div>
      {value !== null && (
        <span className="ml-2 text-sm font-medium text-gold-300" aria-live="polite">
          {value}/10
        </span>
      )}
      {value !== null && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="ml-2 text-xs text-slate-500 underline underline-offset-2 hover:text-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
        >
          Clear
        </button>
      )}
    </div>
  );
}