import { useSearchParams } from "react-router-dom";
import { useSearch, useUpcoming } from "../lib/queries";
import { useClientPagination } from "../lib/paged";
import { SearchForm } from "../components/SearchForm";
import { MovieCard } from "../components/MovieCard";
import { MovieGrid } from "../components/MovieGrid";
import { MovieGridSkeleton } from "../components/Skeletons";
import { EmptyState, ErrorState } from "../components/States";
import { Pagination } from "../components/Pagination";
import { SourceNote } from "../components/SourceNote";
import { ScrollReveal } from "../components/ScrollReveal";

const PAGE_SIZE = 12;

export function DiscoverPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const year = searchParams.get("year") ?? "";
  const hasQuery = q.trim().length > 0;

  const search = useSearch(q, year, hasQuery);
  const upcoming = useUpcoming(12);

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
        className="pointer-events-none absolute -left-1/4 -top-1/3 -z-10 h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(circle,rgba(207,154,82,0.08),transparent_60%)]"
      />
      <div className="max-w-2xl animate-fade-up">
        <p className="chip-mono w-fit">Catalog</p>
        <h1 className="mt-3 font-display text-3xl font-bold text-white sm:text-4xl">Discover</h1>
        <p className="mt-2 text-sm text-slate-400">
          Search the catalog — or just browse what the provider has. Every fact
          carries provenance and is only ever shown when the source provides it.
        </p>
        <SearchForm onSubmit={onSubmit} initialTitle={q} initialYear={year} className="mt-5" />
      </div>

      {hasQuery && (
        <section className="mt-10" aria-labelledby="results-heading">
          <div className="mb-4">
            <h2 id="results-heading" className="font-display text-xl font-semibold text-white">
              {search.isLoading
                ? `Searching for “${q}”…`
                : `Results for “${q}”${year ? ` (${year})` : ""}`}
            </h2>
            {search.data && !search.data.movies.length && (
              <p className="mt-1 text-sm text-slate-500">0 matches</p>
            )}
            <SourceNote provenance={search.data?.provenance} className="mt-1" />
          </div>

          {search.isLoading ? (
            <MovieGridSkeleton count={PAGE_SIZE} />
          ) : search.isError ? (
            <ErrorState
              message="The search could not be completed."
              onRetry={() => void search.refetch()}
            />
          ) : results.length === 0 ? (
            <EmptyState
              title="No matches"
              message={`Nothing matched “${q}”. Try a different title, or clear the year filter.`}
            />
          ) : (
            <>
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
        </section>
      )}

      <ScrollReveal as="section" className="mt-12" aria-labelledby="browse-heading">
        <div className="mb-4">
          <h2 id="browse-heading" className="font-display text-xl font-semibold text-white">
            In the catalog now
          </h2>
          <SourceNote provenance={upcoming.data?.provenance} className="mt-1" />
        </div>

        {upcoming.isLoading ? (
          <MovieGridSkeleton count={12} />
        ) : upcoming.isError ? (
          <ErrorState
            message="The catalog could not be loaded."
            onRetry={() => void upcoming.refetch()}
          />
        ) : (upcoming.data?.movies ?? []).length === 0 ? (
          <EmptyState title="Nothing here yet" message="The provider has no releases to show." />
        ) : (
          <MovieGrid label="Catalog titles">
            {(upcoming.data?.movies ?? []).map((m) => (
              <MovieCard key={m.id} movie={m} />
            ))}
          </MovieGrid>
        )}
      </ScrollReveal>
    </div>
  );
}