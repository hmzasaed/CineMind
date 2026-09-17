import type { ReactNode } from "react";
import { cn } from "../lib/cn";

interface MovieGridProps {
  children: ReactNode;
  className?: string;
  label?: string;
}

/** Responsive movie grid. Rendered as a list so screen readers announce items. */
export function MovieGrid({ children, className, label }: MovieGridProps) {
  return (
    <ul
      role="list"
      aria-label={label}
      className={cn(
        "perspective-1000 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5",
        className,
      )}
    >
      {children}
    </ul>
  );
}