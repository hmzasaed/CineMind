import { describe, expect, it } from "vitest";
import { runPendingJobs } from "../jobs/worker.js";
import { InMemoryIngestionJobStore } from "../jobs/store.js";
import { InMemoryIngestionStore, ingestMovie } from "../services/ingestion.js";
import { ProviderError } from "../providers/errors.js";
import type { Fact } from "../types.js";
import type { MovieDataAdapter, MovieDetail, MovieRecord } from "../providers/types.js";
import { mkProvenance } from "../providers/types.js";

const a550: MovieDetail = {
  id: "550",
  title: "Fight Club",
  releaseYear: 1999,
  genre: ["Drama"],
  rating: { average: 8.8, votes: 2200000 },
};
const a999: MovieDetail = {
  id: "999",
  title: "Frank",
  releaseYear: 2026,
  genre: ["Comedy"],
};

function fact<T>(value: T): Fact<T> {
  return { value, provenance: mkProvenance("tmdb", "api", "tmdb", 0.99) };
}

/** Fake adapter keyed by movie id. */
function makeFakeAdapter(overrides: {
  movies?: Record<string, MovieDetail | null>;
  getMovieError?: boolean;
  upcoming?: MovieRecord[];
} = {}): MovieDataAdapter {
  const movies = overrides.movies ?? { 550: a550, 999: a999 };
  return {
    name: "tmdb",
    attribution: { provider: "tmdb", licensed: true },
    lastCacheStatus: () => "miss",
    getMovie: async (id) => {
      if (overrides.getMovieError) throw new ProviderError("UPSTREAM", "down", "tmdb");
      return fact<MovieDetail | null>(movies[id] ?? null);
    },
    search: async () => fact<MovieRecord[]>(Object.values(movies).filter((m) => m !== null) as MovieRecord[]),
    getUpcoming: async () => fact<MovieRecord[]>((overrides.upcoming ?? Object.values(movies).filter((m) => m !== null) as MovieDetail[])),
    getCredits: async () => fact(null),
    getImages: async () => fact(null),
    getRatings: async () => fact(null),
    getProductionCompanies: async () => fact(null),
    getFinancials: async () => fact(null),
  };
}

describe("worker: refresh_movie", () => {
  it("claims, ingests, and completes a movie job", async () => {
    const adapter = makeFakeAdapter();
    const store = new InMemoryIngestionStore();
    const jobStore = new InMemoryIngestionJobStore();

    await jobStore.enqueue({ kind: "refresh_movie", provider: "tmdb", externalId: "550" });
    const processed = await runPendingJobs({ adapter, store, jobStore });

    expect(processed).toBe(1);
    expect(await store.getMovieId("tmdb", "550")).toBeTruthy();
    expect(store.stats().movies).toBe(1);
    const job = await jobStore.get("job-1");
    expect(job?.status).toBe("succeeded");
  });

  it("is idempotent when the same movie is enqueued twice", async () => {
    const adapter = makeFakeAdapter();
    const store = new InMemoryIngestionStore();
    const jobStore = new InMemoryIngestionJobStore();

    await jobStore.enqueue({ kind: "refresh_movie", provider: "tmdb", externalId: "550" });
    await jobStore.enqueue({ kind: "refresh_movie", provider: "tmdb", externalId: "550" });
    const processed = await runPendingJobs({ adapter, store, jobStore });

    expect(processed).toBe(2);
    expect(store.stats().movies).toBe(1);
    const jobs = await jobStore.list();
    expect(jobs.every((j) => j.status === "succeeded")).toBe(true);
  });

  it("reschedules transient failures and exhausts to failed", async () => {
    const adapter = makeFakeAdapter({ getMovieError: true });
    const store = new InMemoryIngestionStore();
    const jobStore = new InMemoryIngestionJobStore();

    await jobStore.enqueue({ kind: "refresh_movie", provider: "tmdb", externalId: "550", maxAttempts: 3 });

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const deps = { adapter, store, jobStore, retryDelayMs: 1 };

    await runPendingJobs(deps);
    const afterFirst = await jobStore.get("job-1");
    expect(afterFirst?.status).toBe("pending");
    expect(afterFirst?.attempts).toBe(1);
    expect(afterFirst?.lastError).toBeTruthy();

    await sleep(10);
    await runPendingJobs(deps);
    const afterSecond = await jobStore.get("job-1");
    expect(afterSecond?.status).toBe("pending");
    expect(afterSecond?.attempts).toBe(2);

    await sleep(10);
    await runPendingJobs(deps);
    const afterThird = await jobStore.get("job-1");
    expect(afterThird?.status).toBe("failed");
    expect(afterThird?.attempts).toBe(3);
    expect(store.stats().movies).toBe(0);
  });
});

describe("worker: refresh_upcoming", () => {
  it("enqueues detail refreshes only for movies not yet ingested", async () => {
    const adapter = makeFakeAdapter({ upcoming: [a550, a999] });
    const store = new InMemoryIngestionStore();
    const jobStore = new InMemoryIngestionJobStore();

    // 550 already ingested; 999 is new.
    await ingestMovie(adapter, store, "550");

    await jobStore.enqueue({ kind: "refresh_upcoming", provider: "tmdb", externalId: "upcoming" });
    await runPendingJobs({ adapter, store, jobStore });

    const jobs = await jobStore.list();
    const upcoming = jobs.find((j) => j.kind === "refresh_upcoming");
    expect(upcoming?.status).toBe("succeeded");
    const detailJobs = jobs.filter((j) => j.kind === "refresh_movie");
    expect(detailJobs).toHaveLength(1);
    expect(detailJobs[0].externalId).toBe("999");

    // Second sweep drains the fan-out.
    await runPendingJobs({ adapter, store, jobStore });
    expect(await store.getMovieId("tmdb", "999")).toBeTruthy();
    expect(store.stats().movies).toBe(2);
  });
});