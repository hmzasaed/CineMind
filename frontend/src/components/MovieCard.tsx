import { useRef, useState, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import type { MovieRecord } from "../lib/api";
import { cn } from "../lib/cn";
import { usePrefersReducedMotion } from "../lib/motion";
import { Poster } from "./Poster";
import { StarIcon } from "./icons";

interface MovieCardProps {
  movie: MovieRecord;
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
}

const MAX_TILT_DEG = 5;

/** Poster card for lists and grids. The whole card is one accessible link;
 * an optional remove action renders as a separate small button. A gentle
 * pointer-driven tilt adds depth without distorting the poster image. */
export function MovieCard({ movie, onRemove, removeLabel, className }: MovieCardProps) {
  const rating = movie.rating;
  const ref = useRef<HTMLLIElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const reducedMotion = usePrefersReducedMotion();

  function onPointerMove(e: PointerEvent<HTMLLIElement>) {
    if (reducedMotion || e.pointerType !== "mouse") return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: py * -MAX_TILT_DEG, y: px * MAX_TILT_DEG });
  }

  function onPointerLeave() {
    setTilt({ x: 0, y: 0 });
  }

  return (
    <li
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className={cn("card-interactive group flex flex-col will-change-transform", className)}
      style={
        tilt.x || tilt.y
          ? { transform: `translateY(-4px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }
          : undefined
      }
    >
      <div className="relative">
        <Link
          to={`/movies/${movie.id}`}
          className="block overflow-hidden rounded-t-2xl focus-visible:relative focus-visible:z-10"
          aria-label={`${movie.title}${movie.releaseYear ? ` (${movie.releaseYear})` : ""}`}
        >
          <Poster
            src={movie.posterPath}
            alt={movie.title}
            shape="poster"
            className="aspect-[2/3] transition-transform duration-500 ease-cinematic group-hover:scale-[1.04]"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.08] to-transparent transition-transform duration-700 ease-cinematic group-hover:translate-x-full"
          />
        </Link>
        {rating && (
          <span
            className="chip-mono absolute right-2 top-2 border-white/10 bg-ink-950/80 normal-case tracking-normal text-gold-300"
            aria-label={`Rated ${rating.average.toFixed(1)} out of 10`}
          >
            <StarIcon className="h-3 w-3" />
            {rating.average.toFixed(1)}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <h3 className="font-display text-base font-semibold leading-snug text-white">
          <Link to={`/movies/${movie.id}`} className="line-clamp-1 hover:text-gold-300">
            {movie.title}
          </Link>
        </h3>
        <p className="mt-1 text-sm text-slate-400">
          {[movie.releaseYear ? String(movie.releaseYear) : null, movie.certification]
            .filter(Boolean)
            .join(" · ") || "·"}
        </p>
        {movie.genre.length > 0 && (
          <p className="mt-1 text-xs text-slate-500">{movie.genre.slice(0, 3).join(", ")}</p>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-red-400/40 hover:text-red-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
          >
            {removeLabel ?? "Remove"}
          </button>
        )}
      </div>
    </li>
  );
}
