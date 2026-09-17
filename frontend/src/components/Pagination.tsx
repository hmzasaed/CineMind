import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

interface PaginationProps {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  label?: string;
}

/**
 * Accessible client-side pagination: Previous/Next plus "Page X of Y".
 * Page changes are announced via aria-live so keyboard and screen-reader
 * users get the same feedback as everyone else.
 */
export function Pagination({ page, pageCount, pageSize, total, onPage, label = "Results" }: PaginationProps) {
  if (pageCount <= 1) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <nav aria-label={`${label} pagination`} className="mt-6 flex items-center justify-center gap-3">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        aria-label="Previous page"
        className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-slate-200 transition duration-150 hover:-translate-x-0.5 hover:border-gold-400/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-x-0 motion-reduce:hover:translate-x-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Previous
      </button>
      <p aria-live="polite" className="text-sm text-slate-400">
        {start}–{end} of {total}
      </p>
      <button
        type="button"
        disabled={page >= pageCount}
        onClick={() => onPage(page + 1)}
        aria-label="Next page"
        className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-slate-200 transition duration-150 hover:translate-x-0.5 hover:border-gold-400/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-x-0 motion-reduce:hover:translate-x-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
      >
        Next
        <ChevronRightIcon className="h-4 w-4" />
      </button>
    </nav>
  );
}