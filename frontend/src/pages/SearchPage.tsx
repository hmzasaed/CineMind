import { useSearchParams } from "react-router-dom";
import { useSearch } from "../lib/queries";
import { useClientPagination } from "../lib/paged";
import { SearchForm } from "../components/SearchForm";
import { MovieCard } from "../components/MovieCard";
import { MovieGrid } from "../components/MovieGrid";
import { MovieGridSkeleton } from "../components/Skeletons";
import { EmptyState, ErrorState } from "../components/States";
import { Pagination } from "../components/Pagination";
import { SourceNote } from "../components/SourceNote";

const PAGE_SIZE = 12;

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const year = searchParams.get("year") ?? "";
  const hasQuery = q.trim().length > 0;

  const search = useSearch(q, year, hasQuery);
  const results = search.data?.movies ?? [];
  const { page, setPage, pageCount, pageItems, total } = useClientPagination(results, PAGE_SIZE);

  function onSubmit(title: string, yr: string) {
    const params = new URLSearchParams();
    params.set("q", title);
    if (yr) params.set("year", yr);
    setSearchParams(params, { replace: true });
  }

  return (
    <div className="relative isolate mx-auto w-full max-w-7xl px-4 py-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-1/4 -top-1/3 -z-10 h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(circle,rgba(94,179,217,0.06),transparent_60%)]"
      />
      <div className="max-w-2xl animate-fade-up">
        <p className="chip-mono w-fit">Lookup</p>
        <h1 className="mt-3 font-display text-3xl font-bold text-white sm:text-4xl">Search</h1>
        <p className="mt-2 text-sm text-slate-400">
          Search by title and optional year. Matches show only facts the source
          actually returned, each with its provenance.
        </p>
        <SearchForm onSubmit={onSubmit} initialTitle={q} initialYear={year} className="mt-5" />
      </div>

      <section className="mt-10" aria-labelledby="search-results-heading">
        {!hasQuery ? (
          <EmptyState
            title="Search the catalog"
            message="Type a title above — for example “dark knight” — to see what the provider finds."
          />
        ) : (
          <>
            <div className="mb-4">
              <h2 id="search-results-heading" className="font-display text-xl font-semibold text-white">
                {search.isLoading && !search.data
                  ? `Searching “${q}”…`
                  : `Results for “${q}”${year ? ` (${year})` : ""}`}
              </h2>
              <SourceNote provenance={search.data?.provenance} className="mt-1" />
            </div>

            {search.isLoading && !search.data ? (
              <MovieGridSkeleton count={PAGE_SIZE} />
            ) : search.isError ? (
              <ErrorState
                message="The search could not be completed."
                onRetry={() => void search.refetch()}
              />
            ) : results.length === 0 ? (
              <EmptyState
                title="No matches"
                message={`Nothing matched “${q}”. Check the spelling or drop the year filter.`}
              />
            ) : (
              <>
                <p className="mb-3 text-sm text-slate-500">{total} result{total === 1 ? "" : "s"}</p>
                <MovieGrid label={`Search results for ${q}`}>
                  {pageItems.map((m) => (
                    <MovieCard key={m.id} movie={m} />
                  ))}
                </MovieGrid>
                <Pagination
                  page={page}
                  pageCount={pageCount}
                  pageSize={PAGE_SIZE}
                  total={total}
                  onPage={setPage}
                  label="Search results"
                />
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}