import { useState } from "react";
import { cn } from "../lib/cn";

interface AvatarProps {
  src?: string;
  name: string;
  className?: string;
  square?: boolean;
}

function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/** Profile/logo image with an initials fallback; never shows a broken image. */
export function Avatar({ src, name, className, square }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const shape = cn(
    "flex items-center justify-center overflow-hidden bg-gradient-to-br from-ink-700 to-ink-800 text-xs font-semibold text-slate-300",
    square ? "rounded-md" : "rounded-full",
    className ?? "h-10 w-10",
  );

  if (!src || failed) {
    return (
      <span role="img" aria-label={name} className={shape}>
        {initialsOf(name)}
      </span>
    );
  }

  return (
    <span className={cn(shape, "bg-transparent")}>
      <img
        src={src}
        alt={name}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
    </span>
  );
}