import { useEffect, useState } from "react";

/** Client-side pagination over an already-fetched array (the backend returns
 * up to 50 records with no offset, so the UI slices locally). Resets the page
 * clamp when the result set size changes. */
export function useClientPagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const start = (page - 1) * pageSize;
  return {
    page,
    setPage,
    pageCount,
    total,
    pageSize,
    pageItems: items.slice(start, start + pageSize),
  };
}