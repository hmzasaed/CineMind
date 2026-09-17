import { useUpcoming } from "../lib/queries";
import { useClientPagination } from "../lib/paged";
import { MovieCard } from "../components/MovieCard";
import { MovieGrid } from "../components/MovieGrid";
import { MovieGridSkeleton } from "../components/Skeletons";
import { EmptyState, ErrorState } from "../components/States";
import { Pagination } from "../components/Pagination";
import { SourceNote } from "../components/SourceNote";

const PAGE_SIZE = 15;

export function UpcomingPage() {
  const { data, isLoading, isError, refetch } = useUpcoming(50);
  const movies = data?.movies ?? [];
  const { page, setPage, pageCount, pageItems, total } = useClientPagination(movies, PAGE_SIZE);

  return (
    <div className="relative isolate mx-auto w-full max-w-7xl px-4 py-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-1/4 -top-1/3 -z-10 h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(circle,rgba(207,154,82,0.08),transparent_60%)]"
      />
      <div className="max-w-2xl animate-fade-up">
        <p className="chip-mono w-fit">Releases</p>
        <h1 className="mt-3 font-display text-3xl font-bold text-white sm:text-4xl">Upcoming</h1>
        <p className="mt-2 text-sm text-slate-400">
          Releases surfaced by the configured provider. Order and contents are
          exactly what the source returned.
        </p>
        <SourceNote provenance={data?.provenance} className="mt-4" />
      </div>

      <section className="mt-8" aria-labelledby="upcoming-heading">
        {isLoading ? (
          <MovieGridSkeleton count={PAGE_SIZE} label="Loading upcoming movies" />
        ) : isError ? (
          <ErrorState
            message="Upcoming releases could not be loaded."
            onRetry={() => void refetch()}
          />
        ) : movies.length === 0 ? (
          <EmptyState
            title="Nothing to show"
            message="The provider hasn’t shared any upcoming releases yet."
          />
        ) : (
          <>
            <p className="mb-3 sr-only" id="upcoming-heading">
              Upcoming movies
            </p>
            <MovieGrid label="Upcoming movies">
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
              label="Upcoming movies"
            />
          </>
        )}
      </section>
    </div>
  );
}