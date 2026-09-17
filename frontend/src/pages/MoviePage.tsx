import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import {
  entryMovie,
  useAddToWatchlist,
  useAddWatchHistory,
  useCompanies,
  useCredits,
  useDeleteRating,
  useFavorites,
  useFinancials,
  useImages,
  useMyRating,
  useMovie,
  useRatings,
  useRatingSummary,
  useRemoveFromWatchlist,
  useRemoveWatchHistory,
  usePutRating,
  useToggleFavorite,
  useWatchHistory,
  useWatchlist,
} from "../lib/queries";
import { apiErrorMessage, formatMoney, formatRuntime } from "../lib/format";
import type { Attribution, Provenance, CastCredit, CrewCredit, ProductionCompany, UserRatingCategory } from "../lib/api";
import { cn } from "../lib/cn";
import { Poster } from "../components/Poster";
import { Avatar } from "../components/Avatar";
import { RatingInput } from "../components/RatingInput";
import { CategoryRatingInput } from "../components/CategoryRatingInput";
import { FavoriteButton } from "../components/FavoriteButton";
import { ReviewsSection } from "../components/ReviewsSection";
import { Pagination } from "../components/Pagination";
import { ErrorState, EmptyState } from "../components/States";
import { DetailBackdropSkeleton, LineSkeleton } from "../components/Skeletons";
import { SourceNote } from "../components/SourceNote";
import { ScrollReveal } from "../components/ScrollReveal";
import { useClientPagination } from "../lib/paged";
import { BookmarkIcon, CalendarIcon, ClockIcon, EyeIcon, StarIcon } from "../components/icons";

const CAST_PAGE_SIZE = 6;

export function MoviePage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const uid = user?.id ?? null;

  const detail = useMovie(id);
  const credits = useCredits(id);
  const images = useImages(id);
  const ratings = useRatings(id);
  const companies = useCompanies(id);
  const financials = useFinancials(id);
  const watchlist = useWatchlist();
  const addWatchlist = useAddToWatchlist();
  const removeWatchlist = useRemoveFromWatchlist();

  const myRating = useMyRating(id);
  const ratingSummary = useRatingSummary(id);
  const putRating = usePutRating(id);
  const deleteRating = useDeleteRating(id);
  const watchHistory = useWatchHistory();
  const addWatchHistory = useAddWatchHistory();
  const removeWatchHistory = useRemoveWatchHistory();
  const favorites = useFavorites();
  const toggleFavorite = useToggleFavorite();
  const [actionError, setActionError] = useState<string | null>(null);

  if (detail.isLoading) return <MovieDetailSkeleton />;

  if (detail.isError) {
    return (
      <section className="mx-auto w-full max-w-7xl px-4 py-10">
        <ErrorState
          title="Couldn’t load this movie"
          message={apiErrorMessage(detail.error)}
          onRetry={() => void detail.refetch()}
        />
      </section>
    );
  }

  const movie = detail.data?.movie;
  if (!movie) {
    return (
      <section className="mx-auto w-full max-w-7xl px-4 py-10">
        <EmptyState
          title="Movie not found"
          message={`The provider doesn’t know id "${id}".`}
          action={
            <Link
              to="/search"
              className="mt-1 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              Search instead
            </Link>
          }
        />
      </section>
    );
  }

  const posterSrc = movie.posterPath ?? images.data?.images.posters[0]?.path ?? undefined;
  const backdropSrc =
    movie.backdropPath ?? images.data?.images.backdrops[0]?.path ?? undefined;
  const cast = credits.data?.credits.cast ?? [];
  const crew = credits.data?.credits.crew ?? [];
  const directors = crew.filter((c) => c.job === "Director");
  const companyList = companies.data?.companies ?? [];
  const externalRatings = ratings.data?.ratings;

  const provenances: Provenance[] = [
    detail.data?.provenance,
    credits.data?.provenance,
    images.data?.provenance,
    ratings.data?.provenance,
    companies.data?.provenance,
    financials.data?.provenance,
  ].filter((p): p is Provenance => Boolean(p));
  const attributionAny: Attribution | undefined =
    detail.data?.attribution ?? credits.data?.attribution;

  const isOnList = watchlist.data?.watchlist.some((e) => entryMovie(e).id === id) ?? false;
  const watchlistBusy = addWatchlist.isPending || removeWatchlist.isPending;
  const isFavorite = favorites.data?.favorites.some((e) => entryMovie(e).id === id) ?? false;
  const myWatchEntry = watchHistory.data?.history.find((h) => entryMovie(h).id === id) ?? null;
  const watchBusy = addWatchHistory.isPending || removeWatchHistory.isPending;
  const rating = myRating.data?.rating ?? null;

  async function onToggleWatchlist() {
    setActionError(null);
    try {
      if (isOnList) {
        await removeWatchlist.mutateAsync(id);
      } else {
        await addWatchlist.mutateAsync(id);
      }
    } catch (err) {
      setActionError(apiErrorMessage(err, "Watchlist update failed."));
    }
  }

  async function onToggleFavorite() {
    setActionError(null);
    try {
      await toggleFavorite.mutateAsync({ movieId: id, isFavorite });
    } catch (err) {
      setActionError(apiErrorMessage(err, "Favorites update failed."));
    }
  }

  async function onToggleWatched() {
    setActionError(null);
    if (!uid) return;
    try {
      if (myWatchEntry) {
        await removeWatchHistory.mutateAsync(myWatchEntry.id);
      } else {
        await addWatchHistory.mutateAsync(id);
      }
    } catch (err) {
      setActionError(apiErrorMessage(err, "Watched state update failed."));
    }
  }

  async function onRate(value: number) {
    setActionError(null);
    if (!uid) return;
    try {
      await putRating.mutateAsync({ score: value, categories: rating?.categories });
    } catch (err) {
      setActionError(apiErrorMessage(err, "Rating update failed."));
    }
  }

  async function onCategoryRatingChange(categories: UserRatingCategory[]) {
    setActionError(null);
    if (!uid || rating === null) return;
    try {
      await putRating.mutateAsync({ score: rating.score, categories });
    } catch (err) {
      setActionError(apiErrorMessage(err, "Rating update failed."));
    }
  }

  async function onClearRating() {
    setActionError(null);
    if (!uid) return;
    try {
      await deleteRating.mutateAsync();
    } catch (err) {
      setActionError(apiErrorMessage(err, "Rating update failed."));
    }
  }

  return (
    <article className="mx-auto w-full max-w-7xl animate-fade-up">
      {/* ── Hero: backdrop + poster + headline facts ─────────────────────── */}
      <section className="relative isolate overflow-hidden border-b border-white/10">
        {backdropSrc && (
          <span className="absolute inset-0 -z-30" aria-hidden>
            <Poster src={backdropSrc} alt="" shape="backdrop" className="h-full opacity-30" />
          </span>
        )}
        <div
          aria-hidden
          className="absolute inset-0 -z-20 bg-gradient-to-b from-ink-900/85 via-ink-950/80 to-ink-950"
        />
        <div
          aria-hidden
          className="absolute -left-1/4 -top-1/2 -z-10 h-[46rem] w-[46rem] rounded-full bg-[radial-gradient(circle,rgba(207,154,82,0.1),transparent_60%)]"
        />
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 sm:py-14 lg:grid-cols-[minmax(0,240px)_1fr]">
          {/* self-start stops the grid row from stretching this column to the
              height of the (much taller) details column — without it the
              poster's 2:3 box is overridden and object-cover crops the art. */}
          <div className="mx-auto w-48 shrink-0 animate-fade-up self-start lg:mx-0 lg:w-full">
            <Poster
              src={posterSrc}
              alt={`${movie.title} poster`}
              shape="poster"
              className="aspect-[2/3] rounded-2xl shadow-glow-soft"
            />
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <h1 className="font-display text-3xl font-bold leading-tight text-white sm:text-5xl">
                {movie.title}
              </h1>
              {movie.originalTitle && movie.originalTitle !== movie.title && (
                <p className="mt-1 text-sm text-slate-500">Original: {movie.originalTitle}</p>
              )}
            </div>

            <MetaRow movie={movie} />

            {movie.genre.length > 0 && (
              <p className="flex flex-wrap gap-2">
                {movie.genre.map((g) => (
                  <span
                    key={g}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300"
                  >
                    {g}
                  </span>
                ))}
              </p>
            )}

            {movie.tagline && <p className="font-display text-lg italic text-gold-300/90">“{movie.tagline}”</p>}

            {movie.overview && (
              <div>
                <h2 className="sr-only">Overview</h2>
                <p className="max-w-2xl leading-relaxed text-slate-300">{movie.overview}</p>
              </div>
            )}

            <RatingSummary movie={movie} externalRatings={externalRatings} userSummary={ratingSummary.data?.summary} />

            <ActionsPanel
              signedIn={Boolean(user)}
              isOnList={isOnList}
              watchlistBusy={watchlistBusy}
              onToggleWatchlist={onToggleWatchlist}
              isFavorite={isFavorite}
              favoriteBusy={toggleFavorite.isPending}
              onToggleFavorite={onToggleFavorite}
              watched={Boolean(myWatchEntry)}
              watchBusy={watchBusy}
              onToggleWatched={onToggleWatched}
              rating={rating?.score ?? null}
              categories={rating?.categories ?? []}
              onRate={onRate}
              onCategoryRatingChange={onCategoryRatingChange}
              onClearRating={onClearRating}
              title={movie.title}
              error={actionError}
            />

            {directors.length > 0 && (
              <p className="text-sm text-slate-400">
                Directed by{" "}
                <span className="font-medium text-slate-200">
                  {directors.map((d) => d.name).join(", ")}
                </span>
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl space-y-12 px-4 py-10">
        {/* ── Cast (with pagination) ─────────────────────────────────────── */}
        {credits.isError ? (
          <ErrorState title="Cast unavailable" message={apiErrorMessage(credits.error)} onRetry={() => void credits.refetch()} />
        ) : cast.length > 0 ? (
          <ScrollReveal as="section">
            <CastSection cast={cast} />
          </ScrollReveal>
        ) : null}

        {crew.length > 0 && (
          <ScrollReveal as="section">
            <CrewSection crew={crew} />
          </ScrollReveal>
        )}

        {companyList.length > 0 && (
          <ScrollReveal as="section">
            <CompaniesSection companies={companyList} />
          </ScrollReveal>
        )}

        <ScrollReveal as="section">
          <FinancialsSection movie={movie} financials={financials.data?.financials} />
        </ScrollReveal>

        <ScrollReveal as="section">
          <ReviewsSection movieId={id} movieTitle={movie.title} />
        </ScrollReveal>

        {provenances.length > 0 && (
          <ScrollReveal as="section">
            <SourcesSection provenances={provenances} attribution={attributionAny} />
          </ScrollReveal>
        )}
      </div>
    </article>
  );
}

/* ── Sub-sections ──────────────────────────────────────────────────────────── */

function MetaRow({ movie }: { movie: import("../lib/api").MovieDetail }) {
  if (!movie.releaseYear && !movie.certification && !movie.runtimeMinutes) return null;
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
      {movie.releaseYear && (
        <span className="chip-mono normal-case tracking-normal">
          <CalendarIcon className="h-3.5 w-3.5" /> {movie.releaseYear}
        </span>
      )}
      {movie.certification && (
        <span className="chip-mono normal-case tracking-normal text-gold-300">{movie.certification}</span>
      )}
      {formatRuntime(movie.runtimeMinutes) && (
        <span className="chip-mono normal-case tracking-normal">
          <ClockIcon className="h-3.5 w-3.5" /> {formatRuntime(movie.runtimeMinutes)}
        </span>
      )}
    </p>
  );
}

function RatingSummary({
  movie,
  externalRatings,
  userSummary,
}: {
  movie: import("../lib/api").MovieDetail;
  externalRatings?: import("../lib/api").MovieRating;
  userSummary?: import("../lib/api").UserRatingSummary;
}) {
  const primary = movie.rating;
  const secondary = externalRatings?.average;
  const shown = primary ?? (secondary !== undefined ? { average: secondary, votes: externalRatings?.votes ?? 0 } : null);

  if (!shown && !userSummary?.count) return null;

  return (
    <div className="flex flex-col gap-1">
      {shown && (
        <p className="inline-flex items-center gap-2 text-sm text-slate-300">
          <StarIcon className="h-5 w-5 text-gold-400" />
          <span className="font-semibold text-white">{shown.average.toFixed(1)}</span>
          <span className="text-slate-500">/ 10 (critic/provider score)</span>
          {shown.votes > 0 && <span className="text-slate-500">· {shown.votes.toLocaleString()} votes</span>}
        </p>
      )}
      {/* Kept visually and semantically separate from the critic/provider score above. */}
      {userSummary && userSummary.count > 0 && (
        <p className="inline-flex items-center gap-2 text-sm text-slate-400">
          <StarIcon className="h-4 w-4 text-slate-500" />
          <span className="font-semibold text-slate-200">{userSummary.average?.toFixed(1)}</span>
          <span>/ 10 from CineMind users</span>
          <span>
            · {userSummary.count} rating{userSummary.count === 1 ? "" : "s"}
          </span>
        </p>
      )}
    </div>
  );
}

function ActionsPanel(props: {
  signedIn: boolean;
  isOnList: boolean;
  watchlistBusy: boolean;
  onToggleWatchlist: () => void;
  isFavorite: boolean;
  favoriteBusy: boolean;
  onToggleFavorite: () => void;
  watched: boolean;
  watchBusy: boolean;
  onToggleWatched: () => void;
  rating: number | null;
  categories: UserRatingCategory[];
  onRate: (v: number) => void;
  onCategoryRatingChange: (categories: UserRatingCategory[]) => void;
  onClearRating: () => void;
  title: string;
  error: string | null;
}) {
  const baseBtn = cn(
    "inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400",
  );

  return (
    <div className="glass flex flex-col gap-4 rounded-2xl p-4 shadow-glow-soft sm:p-5">
      {!props.signedIn && (
        <p className="text-xs text-slate-500">
          <Link to="/login" className="text-gold-300 underline underline-offset-2 hover:text-gold-200">
            Sign in
          </Link>{" "}
          to rate this film, review it, and build your watchlist — everything saves to your account.
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          disabled={props.watchlistBusy}
          onClick={props.onToggleWatchlist}
          className={cn(
            baseBtn,
            props.isOnList
              ? "border-gold-400/40 bg-gold-400/10 text-gold-300 hover:bg-gold-400/20"
              : "border-white/15 bg-white/5 text-slate-200 hover:bg-white/10",
            "disabled:opacity-60",
          )}
        >
          <BookmarkIcon className="h-4 w-4" />
          {props.isOnList ? "In watchlist — remove" : "Add to watchlist"}
        </button>

        <button
          type="button"
          disabled={!props.signedIn || props.watchBusy}
          onClick={props.onToggleWatched}
          aria-pressed={props.watched}
          className={cn(
            baseBtn,
            props.watched
              ? "border-gold-400/40 bg-gold-400/10 text-gold-300 hover:bg-gold-400/20"
              : "border-white/15 bg-white/5 text-slate-200 hover:bg-white/10",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <EyeIcon className="h-4 w-4" />
          {props.watched ? "Watched ✓" : "Mark as watched"}
        </button>

        <FavoriteButton
          isFavorite={props.isFavorite}
          disabled={props.favoriteBusy}
          onToggle={props.onToggleFavorite}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span className="sr-only">Your rating for {props.title}</span>
          <RatingInput
            title={props.title}
            value={props.rating}
            onChange={(v) => props.onRate(v)}
            onClear={props.signedIn ? props.onClearRating : undefined}
          />
        </div>
        {props.signedIn && props.rating !== null && (
          <CategoryRatingInput
            title={props.title}
            categories={props.categories}
            onChange={props.onCategoryRatingChange}
          />
        )}
      </div>

      {props.error && (
        <p role="alert" className="text-xs text-red-400">
          {props.error}
        </p>
      )}
    </div>
  );
}

function CastSection({ cast }: { cast: CastCredit[] }) {
  const { page, setPage, pageCount, pageItems, total } = useClientPagination(cast, CAST_PAGE_SIZE);
  return (
    <section aria-labelledby="cast-heading">
      <h2 id="cast-heading" className="mb-1 font-display text-xl font-semibold text-white sm:text-2xl">
        Cast
      </h2>
      <SourceNote className="mb-4" />
      <ul role="list" aria-label="Cast" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pageItems.map((person) => (
          <li key={person.creditId ?? `${person.personId}-${person.character}`} className="card flex items-center gap-3 p-3">
            <Avatar src={person.profilePath} name={person.name} className="h-11 w-11 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{person.name}</p>
              <p className="truncate text-xs text-slate-500">as {person.character}</p>
            </div>
          </li>
        ))}
      </ul>
      <Pagination page={page} pageCount={pageCount} pageSize={CAST_PAGE_SIZE} total={total} onPage={setPage} label="Cast" />
    </section>
  );
}

function CrewSection({ crew }: { crew: CrewCredit[] }) {
  const visible = crew.slice(0, 12);
  return (
    <section aria-labelledby="crew-heading">
      <h2 id="crew-heading" className="mb-4 font-display text-xl font-semibold text-white sm:text-2xl">
        Crew
      </h2>
      <ul role="list" aria-label="Crew" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((person) => (
          <li key={person.creditId ?? `${person.personId}-${person.job}`} className="card flex items-center gap-3 p-3">
            <Avatar src={person.profilePath} name={person.name} className="h-11 w-11 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{person.name}</p>
              <p className="truncate text-xs text-slate-500">
                {person.job}
                {person.department ? ` · ${person.department}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CompaniesSection({ companies }: { companies: ProductionCompany[] }) {
  return (
    <section aria-labelledby="companies-heading">
      <h2 id="companies-heading" className="mb-4 font-display text-xl font-semibold text-white sm:text-2xl">
        Production companies
      </h2>
      <ul role="list" aria-label="Production companies" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {companies.map((company) => (
          <li key={company.id} className="card flex items-center gap-3 p-3">
            <Avatar src={company.logoPath} name={company.name} className="h-10 w-10 shrink-0" square />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{company.name}</p>
              {company.originCountry && <p className="text-xs text-slate-500">{company.originCountry}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FinancialsSection({
  movie,
  financials,
}: {
  movie: import("../lib/api").MovieDetail;
  financials?: import("../lib/api").MovieFinancials;
}) {
  const budget = financials?.budget ?? movie.budget;
  const revenue = financials?.revenue ?? movie.revenue;
  const currency = financials?.currency ?? "USD";
  const rows: Array<[string, string]> = [];
  if (budget !== undefined) rows.push(["Budget", formatMoney(budget, currency) ?? "—"]);
  if (revenue !== undefined) rows.push(["Revenue", formatMoney(revenue, currency) ?? "—"]);
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="financials-heading">
      <h2 id="financials-heading" className="mb-4 font-display text-xl font-semibold text-white sm:text-2xl">
        Financials
      </h2>
      <dl className="card grid gap-4 p-5 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="mt-1 text-lg font-semibold text-white">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SourcesSection({
  provenances,
  attribution,
}: {
  provenances: Provenance[];
  attribution?: Attribution;
}) {
  return (
    <section aria-labelledby="sources-heading">
      <h2 id="sources-heading" className="mb-4 font-display text-xl font-semibold text-white sm:text-2xl">
        Sources
      </h2>
      <div className="card p-5">
        <ul role="list" className="space-y-3">
          {provenances.map((p) => (
            <li key={`${p.sourceId}-${p.retrievedAt}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="font-medium text-slate-200">{p.sourceName}</span>
              <span className="chip-mono">{p.sourceKind}</span>
              <span className="font-mono text-xs text-gold-300/80">{Math.round(p.confidence * 100)}%</span>
              <span className="ml-auto font-mono text-xs text-slate-600">
                {new Date(p.retrievedAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
        {attribution?.notice && (
          <p className="mt-4 border-t border-white/10 pt-3 text-xs text-slate-500">
            {attribution.notice}
            {attribution.termsUrl && (
              <>
                {" "}
                <a
                  href={attribution.termsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-400 underline decoration-slate-600 underline-offset-2 hover:text-slate-200"
                >
                  Terms
                </a>
              </>
            )}
          </p>
        )}
      </div>
    </section>
  );
}

function MovieDetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10" role="status" aria-label="Loading movie">
      <DetailBackdropSkeleton />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,240px)_1fr]">
        <div className="skeleton mx-auto aspect-[2/3] w-48 rounded-xl lg:mx-0 lg:w-full" />
        <div className="flex flex-col gap-3">
          <LineSkeleton width="w-3/4" className="h-6" />
          <LineSkeleton width="w-1/3" />
          <LineSkeleton width="w-2/5" />
          <LineSkeleton width="w-full" />
          <LineSkeleton width="w-full" />
          <div className="mt-2 h-24" />
        </div>
      </div>
    </div>
  );
}