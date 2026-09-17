import type { MovieRecord } from "../providers/types.js";

/** Shape of a `public.movies` row joined with `movie_genres(genres(name))`. */
export interface MovieRow {
  provider_id: string;
  title: string;
  original_title: string | null;
  release_year: number | null;
  runtime_minutes: number | null;
  overview: string | null;
  content_rating: string | null;
  poster_url: string | null;
  backdrop_url: string | null;
  movie_genres?: Array<{ genres: { name: string } | null }> | null;
}

export const MOVIE_ROW_SELECT =
  "provider_id, title, original_title, release_year, runtime_minutes, overview, content_rating, poster_url, backdrop_url, movie_genres(genres(name))";

/**
 * Reconstructs a MovieRecord for display from the persisted `movies` row.
 * Aggregate rating is intentionally omitted here (it lives in
 * external_ratings and requires a separate join) — these reconstructions
 * back list views (watchlist/favorites/watch-history cards), not the movie
 * detail page, which always reads live/authoritative provider data.
 */
export function movieRowToRecord(row: MovieRow): MovieRecord {
  return {
    id: row.provider_id,
    title: row.title,
    originalTitle: row.original_title ?? undefined,
    releaseYear: row.release_year ?? undefined,
    runtimeMinutes: row.runtime_minutes ?? undefined,
    overview: row.overview ?? undefined,
    genre: (row.movie_genres ?? [])
      .map((g) => g.genres?.name)
      .filter((n): n is string => Boolean(n)),
    certification: row.content_rating ?? undefined,
    posterPath: row.poster_url ?? undefined,
    backdropPath: row.backdrop_url ?? undefined,
  };
}
