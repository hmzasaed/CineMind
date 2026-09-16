import type { Fact } from "../types.js";
import {
  mkProvenance,
  type Attribution,
  type CastCredit,
  type CrewCredit,
  type MovieCredits,
  type MovieDataAdapter,
  type MovieDetail,
  type MovieFinancials,
  type MovieImages,
  type MovieRating,
  type MovieRecord,
  type ProductionCompany,
} from "./types.js";

/**
 * Deterministic dev/data provider. Facts are stored in TypeScript constants
 * (the data/ reference layer), never generated or scraped. It exists so the
 * backend runs without external credentials and so tests are deterministic; it
 * is explicitly unsuitable for production and never confused with a real
 * provider.
 */

interface MockFacts {
  movie: MovieDetail;
  credits: MovieCredits;
  images: MovieImages;
  ratings: MovieRating;
  financials: MovieFinancials;
  companies: ProductionCompany[];
}

const SHAWSHANK: MockFacts = {
  movie: {
    id: "tt0111161",
    title: "The Shawshank Redemption",
    originalTitle: "The Shawshank Redemption",
    releaseYear: 1994,
    runtimeMinutes: 142,
    overview: "Two imprisoned men bond over a number of years, finding solace and eventual redemption.",
    tagline: "Fear can hold you prisoner. Hope can set you free.",
    genre: ["Drama"],
    rating: { average: 9.3, votes: 2800000 },
    certification: "R",
    posterPath: "https://example.invalid/t/p/w500/tt0111161.jpg",
    backdropPath: "https://example.invalid/t/p/w780/tt0111161.jpg",
    imdbId: "tt0111161",
    externalIds: { imdb_id: "tt0111161" },
    budget: 25000000,
    revenue: 28800000,
    productionCompanies: [{ id: "mock:castlerock", name: "Castle Rock Entertainment" }],
  },
  credits: {
    id: "tt0111161",
    cast: [
      { personId: "nm0000209", name: "Tim Robbins", character: "Andy Dufresne", order: 0, gender: "male", creditId: "mock:tt0111161:0" },
      { personId: "nm0000151", name: "Morgan Freeman", character: "Ellis Boyd 'Red' Redding", order: 1, gender: "male", creditId: "mock:tt0111161:1" },
    ],
    crew: [
      { personId: "nm0001104", name: "Frank Darabont", department: "Directing", job: "Director", gender: "male", creditId: "mock:tt0111161:c0" },
    ],
  },
  images: {
    id: "tt0111161",
    posters: [{ path: "https://example.invalid/t/p/original/tt0111161-p.jpg", width: 1000, height: 1500, language: "en" }],
    backdrops: [{ path: "https://example.invalid/t/p/original/tt0111161-b.jpg", width: 1920, height: 1080 }],
  },
  ratings: { id: "tt0111161", average: 9.3, votes: 2800000, certification: "R" },
  financials: { id: "tt0111161", budget: 25000000, revenue: 28800000, currency: "USD" },
  companies: [{ id: "mock:castlerock", name: "Castle Rock Entertainment" }],
};

const DARK_KNIGHT: MockFacts = {
  movie: {
    id: "tt0468569",
    title: "The Dark Knight",
    originalTitle: "The Dark Knight",
    releaseYear: 2008,
    runtimeMinutes: 152,
    overview: "The Joker wreaks havoc and chaos on the people of Gotham City.",
    tagline: "Why so serious?",
    genre: ["Action", "Crime", "Drama"],
    rating: { average: 9.0, votes: 2700000 },
    certification: "PG-13",
    posterPath: "https://example.invalid/t/p/w500/tt0468569.jpg",
    backdropPath: "https://example.invalid/t/p/w780/tt0468569.jpg",
    imdbId: "tt0468569",
    externalIds: { imdb_id: "tt0468569" },
    budget: 185000000,
    revenue: 1006000000,
    productionCompanies: [{ id: "mock:dc", name: "DC Entertainment" }],
  },
  credits: {
    id: "tt0468569",
    cast: [
      { personId: "nm0000288", name: "Christian Bale", character: "Bruce Wayne", order: 0, gender: "male", creditId: "mock:tt0468569:0" },
      { personId: "nm0005132", name: "Heath Ledger", character: "Joker", order: 1, gender: "male", creditId: "mock:tt0468569:1" },
    ],
    crew: [
      { personId: "nm0634240", name: "Christopher Nolan", department: "Directing", job: "Director", gender: "male", creditId: "mock:tt0468569:c0" },
    ],
  },
  images: {
    id: "tt0468569",
    posters: [{ path: "https://example.invalid/t/p/original/tt0468569-p.jpg", width: 1000, height: 1500, language: "en" }],
    backdrops: [{ path: "https://example.invalid/t/p/original/tt0468569-b.jpg", width: 1920, height: 1080 }],
  },
  ratings: { id: "tt0468569", average: 9.0, votes: 2700000, certification: "PG-13" },
  financials: { id: "tt0468569", budget: 185000000, revenue: 1006000000, currency: "USD" },
  companies: [{ id: "mock:dc", name: "DC Entertainment" }],
};

const INCEPTION: MockFacts = {
  movie: {
    id: "tt1375666",
    title: "Inception",
    originalTitle: "Inception",
    releaseYear: 2010,
    runtimeMinutes: 148,
    overview: "A thief who steals corporate secrets through dream-sharing technology.",
    tagline: "Your mind is the scene of the crime.",
    genre: ["Action", "Sci-Fi", "Thriller"],
    rating: { average: 8.8, votes: 2400000 },
    certification: "PG-13",
    posterPath: "https://example.invalid/t/p/w500/tt1375666.jpg",
    backdropPath: "https://example.invalid/t/p/w780/tt1375666.jpg",
    imdbId: "tt1375666",
    externalIds: { imdb_id: "tt1375666" },
    budget: 160000000,
    revenue: 829000000,
    productionCompanies: [{ id: "mock:legendary", name: "Legendary Entertainment" }],
  },
  credits: {
    id: "tt1375666",
    cast: [
      { personId: "nm0000138", name: "Leonardo DiCaprio", character: "Dom Cobb", order: 0, gender: "male", creditId: "mock:tt1375666:0" },
      { personId: "nm0330687", name: "Joseph Gordon-Levitt", character: "Arthur", order: 1, gender: "male", creditId: "mock:tt1375666:1" },
      { personId: "nm0005017", name: "Elliot Page", character: "Ariadne", order: 2, gender: "unknown", creditId: "mock:tt1375666:2" },
    ],
    crew: [
      { personId: "nm0634240", name: "Christopher Nolan", department: "Directing", job: "Director", gender: "male", creditId: "mock:tt1375666:c0" },
    ],
  },
  images: {
    id: "tt1375666",
    posters: [{ path: "https://example.invalid/t/p/original/tt1375666-p.jpg", width: 1000, height: 1500, language: "en" }],
    backdrops: [{ path: "https://example.invalid/t/p/original/tt1375666-b.jpg", width: 1920, height: 1080 }],
  },
  ratings: { id: "tt1375666", average: 8.8, votes: 2400000, certification: "PG-13" },
  financials: { id: "tt1375666", budget: 160000000, revenue: 829000000, currency: "USD" },
  companies: [{ id: "mock:legendary", name: "Legendary Entertainment" }],
};

const FACTS: Record<string, MockFacts> = {
  tt0111161: SHAWSHANK,
  tt0468569: DARK_KNIGHT,
  tt1375666: INCEPTION,
};

export class MockProvider implements MovieDataAdapter {
  readonly name = "mock";
  readonly attribution: Attribution = {
    provider: "mock",
    licensed: false,
    notice: "Static fixture data for development and tests only",
  };

  lastCacheStatus() {
    return "miss" as const;
  }

  async getMovie(id: string): Promise<Fact<MovieDetail | null>> {
    const value = FACTS[id]?.movie ?? null;
    return { value, provenance: mkProvenance("mock", "static", `mock:movie:${id}`, 1) };
  }

  async search(query: { title: string; year?: number; limit?: number }): Promise<Fact<MovieRecord[]>> {
    const q = query.title.toLowerCase();
    const value = Object.values(FACTS)
      .map((f) => f.movie)
      .filter((m) => m.title.toLowerCase().includes(q))
      .filter((m) => (query.year ? m.releaseYear === query.year : true))
      .slice(0, query.limit ?? 10);
    return { value, provenance: mkProvenance("mock", "static", `mock:search:${q}`, 1) };
  }

  async getUpcoming(options?: { limit?: number }): Promise<Fact<MovieRecord[]>> {
    const value = Object.values(FACTS)
      .map((f) => f.movie)
      .slice(0, options?.limit ?? 10);
    return { value, provenance: mkProvenance("mock", "static", "mock:upcoming", 1) };
  }

  async getCredits(id: string): Promise<Fact<MovieCredits | null>> {
    const value = FACTS[id]?.credits ?? null;
    return { value, provenance: mkProvenance("mock", "static", `mock:movie:${id}:credits`, 1) };
  }

  async getImages(id: string): Promise<Fact<MovieImages | null>> {
    const value = FACTS[id]?.images ?? null;
    return { value, provenance: mkProvenance("mock", "static", `mock:movie:${id}:images`, 1) };
  }

  async getRatings(id: string): Promise<Fact<MovieRating | null>> {
    const value = FACTS[id]?.ratings ?? null;
    return { value, provenance: mkProvenance("mock", "static", `mock:movie:${id}:ratings`, 1) };
  }

  async getProductionCompanies(id: string): Promise<Fact<ProductionCompany[] | null>> {
    const value = FACTS[id]?.companies ?? null;
    return { value, provenance: mkProvenance("mock", "static", `mock:movie:${id}:companies`, 1) };
  }

  async getFinancials(id: string): Promise<Fact<MovieFinancials | null>> {
    const value = FACTS[id]?.financials ?? null;
    return { value, provenance: mkProvenance("mock", "static", `mock:movie:${id}:financials`, 1) };
  }
}