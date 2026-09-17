import { cn } from "../lib/cn";
import { MovieGrid } from "./MovieGrid";

export function MovieCardSkeleton() {
  return (
    <li role="status" aria-label="Loading movie card" className="card overflow-hidden">
      <div className="skeleton aspect-[2/3] rounded-t-xl" />
      <div className="space-y-2 p-3">
        <div className="skeleton h-4 w-4/5" />
        <div className="skeleton h-3 w-2/5" />
        <div className="skeleton h-3 w-3/5" />
      </div>
    </li>
  );
}

export function MovieGridSkeleton({ count = 10, label = "Loading movies" }: { count?: number; label?: string }) {
  return (
    <MovieGrid label={label}>
      {Array.from({ length: count }, (_, i) => (
        <MovieCardSkeleton key={i} />
      ))}
    </MovieGrid>
  );
}

export function DetailBackdropSkeleton() {
  return <div className="skeleton aspect-[21/9] w-full rounded-xl" />;
}

export function LineSkeleton({ width = "w-full", className }: { width?: string; className?: string }) {
  return <div className={cn("skeleton h-4", width, className)} />;
}