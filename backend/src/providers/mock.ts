import type { Fact } from "../types.js";
import { mkProvenance, type MovieDataProvider, type MovieRecord } from "./types.js";

/**
 * Deterministic dev/data provider. Facts it returns are stored in TypeScript
 * constants (acting like the data/ reference layer), NOT generated. It exists so
 * the backend runs without external credentials; it is explicitly unsuitable for
 * production and is never confused with a real provider.
 */
const facts = new Map<string, MovieRecord>([
  [
    "tt0111161",
    {
      id: "tt0111161",
      title: "The Shawshank Redemption",
      releaseYear: 1994,
      runtimeMinutes: 142,
      overview: "Two imprisoned men bond over a number of years, finding solace and eventual redemption.",
      genre: ["Drama"],
      rating: { average: 9.3, votes: 2800000 },
    },
  ],
  [
    "tt0468569",
    {
      id: "tt0468569",
      title: "The Dark Knight",
      releaseYear: 2008,
      runtimeMinutes: 152,
      overview: "The Joker wreaks havoc and chaos on the people of Gotham City.",
      genre: ["Action", "Crime", "Drama"],
      rating: { average: 9.0, votes: 2700000 },
    },
  ],
  [
    "tt1375666",
    {
      id: "tt1375666",
      title: "Inception",
      releaseYear: 2010,
      runtimeMinutes: 148,
      overview: "A thief who steals corporate secrets through dream-sharing technology.",
      genre: ["Action", "Sci-Fi", "Thriller"],
      rating: { average: 8.8, votes: 2400000 },
    },
  ],
]);

export class MockProvider implements MovieDataProvider {
  readonly name = "mock";

  async getMovie(id: string): Promise<Fact<MovieRecord | null>> {
    const value = facts.get(id) ?? null;
    return { value, provenance: mkProvenance("mock", "static", `mock:movie:${id}`, 1) };
  }

  async search(query: { title: string; year?: number; limit?: number }): Promise<Fact<MovieRecord[]>> {
    const q = query.title.toLowerCase();
    const value = [...facts.values()]
      .filter((m) => m.title.toLowerCase().includes(q))
      .filter((m) => (query.year ? m.releaseYear === query.year : true))
      .slice(0, query.limit ?? 10);
    return { value, provenance: mkProvenance("mock", "static", `mock:search:${q}`, 1) };
  }
}