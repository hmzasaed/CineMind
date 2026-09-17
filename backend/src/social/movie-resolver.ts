import type { MovieDataAdapter } from "../providers/types.js";
import { ingestMovie, type IngestionStore } from "../services/ingestion.js";

export interface ResolvedMovie {
  movieDbId: string;
  providerId: string;
}

/**
 * Maps a provider-native movie id to its internal Postgres row (public.movies),
 * ingesting a lightweight, core-fields-only record on first write if one
 * doesn't exist yet — a narrow, deliberate exception to "no inline ingestion":
 * one adapter.getMovie() call + one `movies` upsert, not the full relation
 * fan-out `worker.ts` performs. Throws (via ingestMovie) when the adapter
 * doesn't know the id; callers let that propagate as a 404.
 *
 * WRITE paths only. Read paths must call `ingestionStore.getMovieId` directly
 * and treat a miss as "no user content yet", never trigger ingestion from a GET.
 */
export async function resolveMovieDbId(
  adapter: MovieDataAdapter,
  ingestionStore: IngestionStore,
  providerMovieId: string,
): Promise<ResolvedMovie> {
  const existing = await ingestionStore.getMovieId(adapter.name, providerMovieId);
  if (existing) return { movieDbId: existing, providerId: providerMovieId };

  try {
    const ref = await ingestMovie(adapter, ingestionStore, providerMovieId, {
      includeRelations: false,
    });
    return { movieDbId: ref.movieId, providerId: providerMovieId };
  } catch (err) {
    // Concurrent first-time writes for the same movie can race the unique
    // (provider, provider_id) constraint; the loser just re-reads.
    const retry = await ingestionStore.getMovieId(adapter.name, providerMovieId);
    if (retry) return { movieDbId: retry, providerId: providerMovieId };
    throw err;
  }
}
