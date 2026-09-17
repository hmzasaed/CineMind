import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { FilmIcon, RefreshIcon } from "./icons";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/** Route/section-level error state with a useful message and optional retry. */
export function ErrorState({
  title = "Couldn’t load that",
  message,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "card flex animate-fade-up flex-col items-center gap-3 p-8 text-center",
        className,
      )}
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full border border-red-400/20 bg-red-400/10">
        <RefreshIcon className="h-6 w-6 text-red-400/90" />
      </span>
      <h2 className="font-display text-xl font-semibold text-white">{title}</h2>
      {message && <p className="max-w-md text-sm text-slate-400">{message}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white transition duration-200 hover:bg-white/20 hover:shadow-glow-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
        >
          <RefreshIcon className="h-4 w-4" />
          Try again
        </button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  message?: string;
  action?: ReactNode;
  className?: string;
}

/** Route/section-level empty state. */
export function EmptyState({ title, message, action, className }: EmptyStateProps) {
  return (
    <div className={cn("card flex animate-fade-up flex-col items-center gap-3 p-8 text-center", className)}>
      <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/5">
        <FilmIcon className="h-6 w-6 text-white/30" />
      </span>
      <h2 className="font-display text-xl font-semibold text-white">{title}</h2>
      {message && <p className="max-w-md text-sm text-slate-400">{message}</p>}
      {action}
    </div>
  );
}