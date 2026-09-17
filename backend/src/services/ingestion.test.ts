import { describe, expect, it } from "vitest";
import {
  ingestMovie,
  InMemoryIngestionStore,
} from "../services/ingestion.js";
import { ProviderError } from "../providers/errors.js";
import type { Fact } from "../types.js";
import type {
  MovieDataAdapter,
  MovieDetail,
  MovieCredits,
  MovieImages,
  MovieRating,
  ProductionCompany,
  MovieFinancials,
  MovieRecord,
} from "../providers/types.js";
import { mkProvenance } from "../providers/types.js";

const detail: MovieDetail = {
  id: "550",
  title: "Fight Club",
  releaseYear: 1999,
  genre: ["Drama", "Thriller"],
  rating: { average: 8.8, votes: 2200000 },
  certification: "R",
  posterPath: "https://fake.invalid/p.jpg",
  backdropPath: "https://fake.invalid/b.jpg",
  imdbId: "tt0137523",
  budget: 63000000,
  revenue: 100800000,
  productionCompanies: [{ id: "508", name: "Regency Enterprises" }],
};

const credits: MovieCredits = {
  id: "550",
  cast: [
    { personId: "819", name: "Edward Norton", character: "Narrator", order: 0, gender: "male" },
    { personId: "819", name: "Edward Norton", character: "Jack", order: 1, gender: "male" },
  ],
  crew: [
    { personId: "376", name: "David Fincher", department: "Directing", job: "Director", gender: "male" },
  ],
};

const images: MovieImages = {
  id: "550",
  posters: [{ path: "https://fake.invalid/poster.jpg", width: 500, height: 750 }],
  backdrops: [],
};

const ratings: MovieRating = { id: "550", average: 8.8, votes: 2200000, certification: "R" };
const financials: MovieFinancials = { id: "550", budget: 63000000, revenue: 100800000, currency: "USD" };
const companies: ProductionCompany[] = [{ id: "508", name: "Regency Enterprises" }];

function fact<T>(value: T): Fact<T> {
  return { value, provenance: mkProvenance("tmdb", "api", "tmdb:movie:550", 0.99) };
}

function makeFakeAdapter(handlers: {
  getMovie?: () => Promise<Fact<MovieDetail | null>>;
  getCredits?: () => Promise<Fact<MovieCredits | null>>;
  getImages?: () => Promise<Fact<MovieImages | null>>;
  getRatings?: () => Promise<Fact<MovieRating | null>>;
  getProductionCompanies?: () => Promise<Fact<ProductionCompany[] | null>>;
  getFinancials?: () => Promise<Fact<MovieFinancials | null>>;
  getUpcoming?: () => Promise<Fact<MovieRecord[]>>;
  search?: () => Promise<Fact<MovieRecord[]>>;
}): MovieDataAdapter {
  const adapter: MovieDataAdapter = {
    name: "tmdb",
    attribution: { provider: "tmdb", licensed: true },
    lastCacheStatus: () => "miss",
    getMovie: handlers.getMovie ?? (async () => fact<MovieDetail | null>(detail)),
    getCredits: handlers.getCredits ?? (async () => fact<MovieCredits | null>(credits)),
    getImages: handlers.getImages ?? (async () => fact<MovieImages | null>(images)),
    getRatings: handlers.getRatings ?? (async () => fact<MovieRating | null>(ratings)),
    getProductionCompanies: handlers.getProductionCompanies ?? (async () => fact<ProductionCompany[] | null>(companies)),
    getFinancials: handlers.getFinancials ?? (async () => fact<MovieFinancials | null>(financials)),
    getUpcoming: handlers.getUpcoming ?? (async () => fact<MovieRecord[]>([detail])),
    search: handlers.search ?? (async () => fact<MovieRecord[]>([detail])),
  };
  return adapter;
}

describe("ingestMovie idempotency", () => {
  it("produces the same movieId and stable child rows across duplicate runs", async () => {
    const store = new InMemoryIngestionStore();
    const adapter = makeFakeAdapter({});

    const first = await ingestMovie(adapter, store, "550", { retrievedAt: "2026-01-01T00:00:00Z" });
    const second = await ingestMovie(adapter, store, "550", { retrievedAt: "2026-02-01T00:00:00Z" });

    expect(second.created).toBe(false);
    expect(first.movieId).toBe(second.movieId);
    const stats = store.stats();
    expect(stats.movies).toBe(1);
    expect(stats.people).toBe(2);
    expect(stats.cast).toBe(2);
    expect(stats.crew).toBe(1);
    expect(stats.genres).toBe(2);
    expect(stats.companies).toBe(1);
    expect(stats.sources.get(`${first.movieId}|tmdb`)).toBe(2);
  });

  it("tolerates missing optional relations without throwing", async () => {
    const store = new InMemoryIngestionStore();
    const adapter = makeFakeAdapter({
      getRatings: async () => fact<MovieRating | null>(null),
      getFinancials: async () => fact<MovieFinancials | null>(null),
      getProductionCompanies: async () => fact<ProductionCompany[] | null>(null),
      getCredits: async () => fact<MovieCredits | null>(null),
      getImages: async () => fact<MovieImages | null>(null),
    });
    const ref = await ingestMovie(adapter, store, "550");
    expect(ref.created).toBe(true);
    const stats = store.stats();
    expect(stats.ratings).toBe(0);
    expect(stats.financials).toBe(0);
    expect(stats.cast).toBe(0);
  });

  it("throws NOT_FOUND when the adapter returns null for the primary movie", async () => {
    const store = new InMemoryIngestionStore();
    const adapter = makeFakeAdapter({
      getMovie: async () => fact<MovieDetail | null>(null),
    });
    await expect(ingestMovie(adapter, store, "99999")).rejects.toBeInstanceOf(ProviderError);
    expect(store.stats().movies).toBe(0);
  });

  it("skips ingestion of relations when includeRelations=false", async () => {
    const store = new InMemoryIngestionStore();
    const adapter = makeFakeAdapter({});
    const ref = await ingestMovie(adapter, store, "550", { includeRelations: false });
    expect(ref.movieId).toBeTruthy();
    const stats = store.stats();
    expect(stats.cast).toBe(0);
    expect(stats.ratings).toBe(0);
    expect(stats.financials).toBe(0);
  });
});