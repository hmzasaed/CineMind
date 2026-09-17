import { describe, expect, it } from "vitest";
import { TmdbProvider } from "./tmdb.js";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

const API_KEY = "test-key";
const BASE = "https://example.invalid/3";

function provider(fetchImpl: typeof fetch): TmdbProvider {
  return new TmdbProvider(API_KEY, BASE, fetchImpl);
}

const movie = {
  id: 550,
  title: "Fight Club",
  original_title: "Fight Club",
  release_date: "1999-10-15",
  runtime: 139,
  overview: "An insomniac office worker...",
  tagline: "Mischief. Mayhem. Soap.",
  imdb_id: "tt0137523",
  backdrop_path: "/bc.jpg",
  poster_path: "/p.jpg",
  genres: [{ id: 18, name: "Drama" }],
  vote_average: 8.8,
  vote_count: 2200000,
  budget: 63000000,
  revenue: 100800000,
  production_companies: [{ id: 508, name: "Regency Enterprises", logo_path: null, origin_country: "US" }],
};

describe("TmdbProvider.getMovie", () => {
  it("normalizes a valid detail payload", async () => {
    const p = provider(() => Promise.resolve(jsonResponse(movie)));
    const fact = await p.getMovie("550");
    expect(fact.value).toMatchObject({
      id: "550",
      title: "Fight Club",
      releaseYear: 1999,
      runtimeMinutes: 139,
      genre: ["Drama"],
      rating: { average: 8.8, votes: 2200000 },
      imdbId: "tt0137523",
      budget: 63000000,
      revenue: 100800000,
    });
    expect(fact.provenance.sourceKind).toBe("api");
    expect(p.attribution.licensed).toBe(true);
    expect(p.attribution.termsUrl).toBeTruthy();
  });

  it("accepts missing optional fields (returns a record with gaps, never a mock)", async () => {
    const partial = {
      id: 550,
      title: "Fight Club",
    };
    const p = provider(() => Promise.resolve(jsonResponse(partial)));
    const fact = await p.getMovie("550");
    expect(fact.value?.title).toBe("Fight Club");
    expect(fact.value?.releaseYear).toBeUndefined();
    expect(fact.value?.runtimeMinutes).toBeUndefined();
    expect(fact.value?.genre).toEqual([]);
    expect(fact.value?.rating).toBeUndefined();
  });

  it("rejects an invalid payload shape with INVALID_RESPONSE", async () => {
    const p = provider(() => Promise.resolve(jsonResponse({ id: "not-a-number", nonsense: true })));
    await expect(p.getMovie("550")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("rejects non-JSON bodies as invalid, not invented facts", async () => {
    const p = provider(() => Promise.resolve(new Response("<html>gateway error</html>", { status: 200 })));
    await expect(p.getMovie("550")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("returns null for a 404 (unknown movie)", async () => {
    const calls: string[] = [];
    const p = provider(async (input) => {
      calls.push(String(input));
      return jsonResponse({ status_message: "not found" }, 404);
    });
    const fact = await p.getMovie("99999");
    expect(fact.value).toBeNull();
  });

  it("maps a 500 to UPSTREAM", async () => {
    const p = provider(() => Promise.resolve(jsonResponse({}, 500)));
    await expect(p.getMovie("550")).rejects.toMatchObject({ code: "UPSTREAM", status: 500 });
  });

  it("maps a 429 to UPSTREAM_RATE_LIMITED with retry-after", async () => {
    const p = provider(() => Promise.resolve(jsonResponse({}, 429, { "retry-after": "30" })));
    await expect(p.getMovie("550")).rejects.toMatchObject({
      code: "UPSTREAM_RATE_LIMITED",
      retryAfterMs: 30000,
    });
  });

  it("maps 401/403 to UPSTREAM_QUOTA", async () => {
    for (const status of [401, 403]) {
      const p = provider(() => Promise.resolve(jsonResponse({}, status)));
      await expect(p.getMovie("550")).rejects.toMatchObject({ code: "UPSTREAM_QUOTA" });
    }
  });
});

describe("TmdbProvider.search / getUpcoming", () => {
  it("parses search results and slices by limit", async () => {
    const p = provider(() =>
      Promise.resolve(jsonResponse({ page: 1, total_results: 2, results: [movie, { ...movie, id: 551, title: "XX" }] })),
    );
    const fact = await p.search({ title: "fight", limit: 1 });
    expect(fact.value).toHaveLength(1);
    expect(fact.value[0].title).toBe("Fight Club");
  });

  it("parses upcoming listings", async () => {
    const p = provider(() =>
      Promise.resolve(jsonResponse({ page: 1, total_results: 1, results: [{ ...movie, id: 700, release_date: "2026-11-20" }] })),
    );
    const fact = await p.getUpcoming({ limit: 5 });
    expect(fact.value[0].id).toBe("700");
  });
});

describe("TmdbProvider credits / images / ratings / companies", () => {
  it("parses credits into normalized cast + crew", async () => {
    const p = provider(() =>
      Promise.resolve(
        jsonResponse({
          id: 550,
          cast: [{ id: 819, name: "Edward Norton", character: "The Narrator", order: 0, gender: 2, credit_id: "52fe" }],
          crew: [{ id: 376, name: "David Fincher", department: "Directing", job: "Director", gender: 2, credit_id: "xx" }],
        }),
      ),
    );
    const fact = await p.getCredits("550");
    expect(fact.value?.cast[0]).toMatchObject({ personId: "819", character: "The Narrator", gender: "male", order: 0 });
    expect(fact.value?.crew[0]).toMatchObject({ job: "Director", department: "Directing" });
  });

  it("parses images with absolute urls", async () => {
    const p = provider(() =>
      Promise.resolve(
        jsonResponse({
          id: 550,
          posters: [{ file_path: "/p.jpg", width: 1000, height: 1500, iso_639_1: "en" }],
          backdrops: [{ file_path: "/b.jpg", width: 1920, height: 1080, iso_639_1: null }],
        }),
      ),
    );
    const fact = await p.getImages("550");
    expect(fact.value?.posters[0].path).toMatch(/\/t\/p\/original\/p\.jpg$/);
    expect(fact.value?.backdrops[0].language).toBeUndefined();
  });

  it("extracts US certification from release dates", async () => {
    const p = provider((input) => {
      const url = String(input);
      if (url.includes("release_dates")) {
        return Promise.resolve(
          jsonResponse({
            id: 550,
            results: [
              { iso_3166_1: "GB", release_dates: [{ certification: "18" }] },
              { iso_3166_1: "US", release_dates: [{ certification: "R" }] },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse(movie));
    });
    const fact = await p.getRatings("550");
    expect(fact.value).toMatchObject({ average: 8.8, votes: 2200000, certification: "R" });
  });

  it("returns production companies for known movies", async () => {
    const p = provider(() => Promise.resolve(jsonResponse(movie)));
    const fact = await p.getProductionCompanies("550");
    expect(fact.value?.[0]).toMatchObject({ id: "508", name: "Regency Enterprises", originCountry: "US" });
  });

  it("returns null (not a 500) for unknown movies on capability endpoints", async () => {
    const p = provider(() => Promise.resolve(jsonResponse({}, 404)));
    await expect(p.getCredits("99999")).resolves.toMatchObject({ value: null });
    await expect(p.getFinancials("99999")).resolves.toMatchObject({ value: null });
  });
});