import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useUpcoming } from "../lib/queries";
import type { MovieRecord } from "../lib/api";
import { MovieCard } from "../components/MovieCard";
import { MovieGrid } from "../components/MovieGrid";
import { MovieGridSkeleton } from "../components/Skeletons";
import { ErrorState } from "../components/States";
import { Poster } from "../components/Poster";
import { ScrollReveal } from "../components/ScrollReveal";
import { SearchIcon, ArrowUpRightIcon, FilmIcon } from "../components/icons";

const METRICS = [
  { value: "0", label: "facts invented by AI" },
  { value: "7", label: "structured source kinds" },
  { value: "100%", label: "facts carry provenance" },
];

/** Depth/rotation per card, back-to-front. The fan reads as one physical stack
 * rather than three flat images, which is the whole point of the hero. */
const FAN = [
  { rotateY: 24, rotateZ: -9, x: -150, y: 30, z: -180, scale: 0.84, opacity: 0.5 },
  { rotateY: 17, rotateZ: -4, x: -78, y: 12, z: -90, scale: 0.92, opacity: 0.78 },
  { rotateY: 10, rotateZ: 1, x: -4, y: 0, z: 0, scale: 1, opacity: 1 },
];

/**
 * Decorative 3D poster stack for the hero. Marked aria-hidden because the
 * Featured grid directly below exposes the same titles as real, focusable
 * links — duplicating them here would just add screen-reader noise. Motion is
 * CSS-only and collapses under prefers-reduced-motion via animate-drift's
 * motion-reduce guard.
 */
function HeroPosterFan({ movies }: { movies: MovieRecord[] }) {
  const picks = movies.filter((m) => m.posterPath).slice(0, FAN.length);
  if (picks.length === 0) return null;

  return (
    <div
      aria-hidden
      className="perspective-1000 pointer-events-none relative hidden h-[30rem] w-[26rem] shrink-0 lg:block"
    >
      {picks.map((movie, i) => {
        const f = FAN[i] ?? FAN[FAN.length - 1];
        return (
          <div
            key={movie.id}
            // fade-in (opacity-only), never fade-up: fade-up animates
            // transform, and an animation with fill-mode:both beats the inline
            // transform below — which would flatten the whole fan into one pile.
            className="animate-fade-in absolute left-1/2 top-1/2 w-56 motion-reduce:animate-none"
            style={{
              transform: `translate(-50%, -50%) translate3d(${f.x}px, ${f.y}px, ${f.z}px) rotateY(${f.rotateY}deg) rotateZ(${f.rotateZ}deg) scale(${f.scale})`,
              opacity: f.opacity,
              animationDelay: `${180 + i * 120}ms`,
              zIndex: i,
            }}
          >
            <div className="overflow-hidden rounded-2xl border border-white/10 shadow-glow-soft">
              <Poster src={movie.posterPath} alt="" shape="poster" className="aspect-[2/3]" />
              {/* Sheen: sells the posters as glossy physical objects under a light. */}
              <span
                className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-tr from-transparent via-white/[0.07] to-transparent"
              />
            </div>
          </div>
        );
      })}
      {/* Warm key light pooling behind the stack. */}
      <div className="absolute inset-0 -z-10 animate-drift rounded-full bg-[radial-gradient(circle_at_60%_45%,rgba(207,154,82,0.18),transparent_65%)] motion-reduce:animate-none" />
    </div>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useUpcoming(12);
  const [q, setQ] = useState("");

  const movies = data?.movies ?? [];
  const hero = movies[0];
  const featured = movies.slice(1, 11);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? { pathname: "/search", search: `?q=${encodeURIComponent(term)}` } : "/search");
  }

  return (
    <div>
      {/* ── Hero: cinematic title sequence ──────────────────────────────── */}
      <section className="relative isolate overflow-hidden border-b border-white/10">
        {hero?.backdropPath && (
          <span className="absolute inset-0 -z-30" aria-hidden>
            <Poster src={hero.backdropPath} alt="" shape="backdrop" className="h-full opacity-30" />
          </span>
        )}

        {/* Depth layers: vignette, lens light sweep, aperture ring, sprocket edge */}
        <div
          aria-hidden
          className="absolute inset-0 -z-20 bg-gradient-to-b from-ink-950/60 via-ink-950/75 to-ink-950"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-20 bg-[radial-gradient(ellipse_70%_60%_at_50%_100%,transparent,rgba(7,7,12,0.9))]"
        />
        <div
          aria-hidden
          className="absolute -right-1/4 -top-1/3 -z-10 h-[60rem] w-[60rem] animate-drift rounded-full bg-[radial-gradient(circle,rgba(207,154,82,0.16),transparent_60%)] motion-reduce:animate-none"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute right-[-8%] top-[-15%] -z-10 hidden h-[42rem] w-[42rem] rounded-full border border-white/[0.06] sm:block"
        >
          <div className="absolute inset-[10%] rounded-full border border-white/[0.05]" />
          <div className="absolute inset-[22%] rounded-full border border-gold-400/10" />
        </div>

        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-20 sm:py-28 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-14 lg:py-32">
          <div className="flex flex-col gap-8">
          <p className="animate-fade-up chip-mono w-fit">
            <FilmIcon className="h-3.5 w-3.5" />
            Facts with provenance — never invented by AI
          </p>

          <div className="max-w-2xl space-y-5">
            <h1 className="animate-fade-up animate-delay-100 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
              Every fact on screen, traced to its source.
            </h1>
            <p className="animate-fade-up animate-delay-200 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
              CineMind is an evidence-first, tool-driven movie intelligence platform. Search the
              catalog, explore upcoming releases, and open any title for its structured facts —
              cast, crew, financials — each one carrying the source it came from.
            </p>
          </div>

          <form
            onSubmit={onSubmit}
            role="search"
            className="animate-fade-up animate-delay-300 flex max-w-xl flex-col gap-2 sm:flex-row"
          >
            <label className="sr-only" htmlFor="home-title-query">
              Movie title
            </label>
            <input
              id="home-title-query"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search a movie title… (try “dark”)"
              className="glass min-w-0 flex-1 rounded-lg px-4 py-3 text-white placeholder:text-slate-500 focus-visible:border-gold-400/60 focus-visible:outline-none"
            />
            <button
              type="submit"
              className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-gold-400 px-6 py-3 text-sm font-semibold text-ink-950 transition duration-200 hover:bg-gold-300 hover:shadow-glow-copper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300"
            >
              <SearchIcon className="h-4 w-4" />
              Search
            </button>
          </form>

          <div className="animate-fade-up animate-delay-300 flex flex-wrap items-center gap-3">
            <Link
              to="/discover"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-200 transition duration-200 hover:border-gold-400/30 hover:bg-white/10 hover:text-white"
            >
              Open Discover
              <ArrowUpRightIcon className="h-3.5 w-3.5" />
            </Link>
            <Link
              to="/upcoming"
              className="inline-flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-medium text-slate-400 transition hover:text-white"
            >
              See upcoming releases
              <ArrowUpRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>

          <dl className="animate-fade-up animate-delay-500 mt-4 flex flex-wrap gap-x-10 gap-y-4 border-t border-white/10 pt-6">
            {METRICS.map((m) => (
              <div key={m.label}>
                <dt className="sr-only">{m.label}</dt>
                <dd className="font-mono text-2xl font-medium text-gold-300 sm:text-3xl">{m.value}</dd>
                <dd className="mt-0.5 text-xs uppercase tracking-wider text-slate-500">{m.label}</dd>
              </div>
            ))}
          </dl>
          </div>

          <HeroPosterFan movies={movies} />
        </div>
      </section>

      {/* ── Featured ─────────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-7xl px-4 py-14" aria-labelledby="featured-heading">
        <ScrollReveal className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 id="featured-heading" className="font-display text-2xl font-semibold text-white sm:text-3xl">
              Featured
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {data && data.provenance ? (
                <>
                  Sourced from <span className="text-slate-400">{data.provenance.sourceName}</span> (
                  {data.provenance.sourceKind}, {Math.round(data.provenance.confidence * 100)}%)
                </>
              ) : (
                "Loading the catalog"
              )}
            </p>
          </div>
          <Link
            to="/upcoming"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-gold-300 hover:text-gold-200"
          >
            All upcoming <ArrowUpRightIcon className="h-4 w-4" />
          </Link>
        </ScrollReveal>

        {isLoading ? (
          <MovieGridSkeleton count={10} />
        ) : isError ? (
          <ErrorState
            message="The catalog provider could not be reached."
            onRetry={() => void refetch()}
          />
        ) : featured.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing to show right now.</p>
        ) : (
          <MovieGrid label="Featured movies">
            {featured.map((m) => (
              <MovieCard key={m.id} movie={m} />
            ))}
          </MovieGrid>
        )}
      </section>

      {/* ── Quick navigation ─────────────────────────────────────────────── */}
      <ScrollReveal as="section" className="mx-auto w-full max-w-7xl px-4 pb-16" aria-label="Explore">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              to: "/discover",
              title: "Discover",
              copy: "Browse the catalog and pick a movie to open its full facts.",
            },
            {
              to: "/search",
              title: "Search",
              copy: "Search by title and year; results show provenance for every fact.",
            },
            {
              to: "/upcoming",
              title: "Upcoming",
              copy: "Recent and upcoming releases from the configured provider.",
            },
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="card-interactive group p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.06] to-transparent transition-transform duration-700 ease-cinematic group-hover:translate-x-full"
              />
              <h3 className="font-display text-lg font-semibold text-white group-hover:text-gold-300">
                {item.title}
              </h3>
              <p className="mt-1 text-sm text-slate-400">{item.copy}</p>
            </Link>
          ))}
        </div>
      </ScrollReveal>
    </div>
  );
}
