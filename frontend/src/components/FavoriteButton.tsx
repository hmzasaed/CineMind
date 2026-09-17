import { cn } from "../lib/cn";
import { HeartIcon } from "./icons";

interface FavoriteButtonProps {
  isFavorite: boolean;
  disabled?: boolean;
  onToggle: () => void;
  className?: string;
}

/** Idempotent favorite toggle (backend uses PUT/DELETE, never 409s). */
export function FavoriteButton({ isFavorite, disabled, onToggle, className }: FavoriteButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      aria-pressed={isFavorite}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400",
        isFavorite
          ? "border-rose-400/40 bg-rose-400/10 text-rose-300 hover:bg-rose-400/20"
          : "border-white/15 bg-white/5 text-slate-200 hover:bg-white/10",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <HeartIcon className="h-4 w-4" />
      {isFavorite ? "Favorited" : "Add to favorites"}
    </button>
  );
}
