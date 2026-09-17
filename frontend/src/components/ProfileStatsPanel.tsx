import type { ProfileStats } from "../lib/api";

interface ProfileStatsPanelProps {
  stats: ProfileStats;
}

export function ProfileStatsPanel({ stats }: ProfileStatsPanelProps) {
  const cells: Array<[string, string | number]> = [
    ["Reviews", stats.reviewsCount],
    ["Avg. rating given", stats.avgRatingGiven !== null ? `${stats.avgRatingGiven.toFixed(1)}/10` : "—"],
    ["Watchlist", stats.watchlistCount],
    ["Favorites", stats.favoritesCount],
    ["Watched", stats.watchedCount],
    ["Likes received", stats.likesReceived],
  ];

  return (
    <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
      {cells.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
          <dd className="mt-1 font-mono text-2xl font-medium text-gold-300">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
