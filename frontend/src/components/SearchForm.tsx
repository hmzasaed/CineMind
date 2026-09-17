import { useState } from "react";
import { cn } from "../lib/cn";
import { SearchIcon } from "./icons";

interface SearchFormProps {
  onSubmit: (title: string, year: string) => void;
  initialTitle?: string;
  initialYear?: string;
  busy?: boolean;
  className?: string;
  compact?: boolean;
}

/** Shared title + optional year search form. */
export function SearchForm({
  onSubmit,
  initialTitle = "",
  initialYear = "",
  busy,
  className,
  compact,
}: SearchFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [year, setYear] = useState(initialYear);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    onSubmit(title.trim(), year.trim());
  }

  return (
    <form
      onSubmit={submit}
      className={cn("flex w-full flex-col gap-2 sm:flex-row", className)}
      role="search"
    >
      <label className="sr-only" htmlFor="movie-title-query">
        Movie title
      </label>
      <input
        id="movie-title-query"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Search a movie title…"
        autoComplete="off"
        className={cn(
          "w-full rounded-lg border border-white/10 bg-ink-800/80 px-4 text-white placeholder:text-slate-500 transition focus-visible:border-gold-400/60 focus-visible:outline-none",
          compact ? "py-2 text-sm" : "py-2.5 text-base",
        )}
      />
      <label className="sr-only" htmlFor="movie-year-query">
        Year (optional)
      </label>
      <input
        id="movie-year-query"
        value={year}
        onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
        placeholder="Year"
        size={4}
        inputMode="numeric"
        pattern="[0-9]{4}"
        className={cn(
          "rounded-lg border border-white/10 bg-ink-800/80 px-4 text-white placeholder:text-slate-500 transition focus-visible:border-gold-400/60 focus-visible:outline-none",
          compact ? "py-2 text-sm sm:w-28" : "py-2.5 text-base sm:w-28",
        )}
      />
      <button
        type="submit"
        disabled={busy || !title.trim()}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-gold-400 px-5 py-2.5 text-sm font-semibold text-ink-950 transition duration-200 hover:bg-gold-300 hover:shadow-glow-copper disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300"
      >
        <SearchIcon className="h-4 w-4" />
        {busy ? "Searching…" : "Search"}
      </button>
    </form>
  );
}