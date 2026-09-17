import { useState } from "react";
import { cn } from "../lib/cn";
import { FilmIcon } from "./icons";

export interface PosterProps {
  src?: string;
  alt: string;
  className?: string;
  shape?: "poster" | "backdrop";
}

/**
 * Movie image with a graceful, branded fallback. Never renders a broken image:
 * if there is no source, or the source fails to load, a gradient placeholder
 * with a film glyph is shown instead. The placeholder carries the alt text via
 * role="img" so screen readers still announce the movie.
 */
export function Poster({ src, alt, className, shape = "poster" }: PosterProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  const fallback = (
    <span
      role="img"
      aria-label={alt}
      className={cn(
        "flex h-full w-full items-center justify-center",
        shape === "poster"
          ? "bg-gradient-to-br from-ink-700 via-ink-850 to-ink-900"
          : "bg-gradient-to-r from-ink-850 via-ink-800 to-ink-850",
        className,
      )}
    >
      <FilmIcon className="h-1/4 w-1/4 text-white/20" />
    </span>
  );

  if (!showImage) return fallback;

  return (
    <span
      className={cn("relative block h-full w-full overflow-hidden bg-ink-850", className)}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/10"
      />
    </span>
  );
}