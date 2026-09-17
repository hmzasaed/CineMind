import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { ApiClient } from "./api";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ApiClient", () => {
  it("sends auth token and parses movies search", async () => {
    const captured: { url?: string; init?: unknown } = {};
    const client = new ApiClient("http://test", () => "tok-123");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      captured.url = String(input);
      captured.init = init;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            movies: [{ id: "tt0468569", title: "The Dark Knight", genre: ["Action"] }],
            provenance: { sourceName: "mock", sourceKind: "static", confidence: 1 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }) as typeof fetch;

    try {
      const result = await client.searchMovies("dark knight");
      expect(captured.url).toBe("http://test/movies?title=dark+knight");
      expect(captured.init).toMatchObject({ headers: { Authorization: "Bearer tok-123" } });
      expect(result.movies[0].id).toBe("tt0468569");
      expect(result.provenance.sourceKind).toBe("static");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("omits the Authorization header when signed out", async () => {
    const captured: { init?: unknown } = {};
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      captured.init = init;
      return Promise.resolve(new Response(JSON.stringify({ movies: [], provenance: {} }), { status: 200 }));
    }) as typeof fetch;
    const client = new ApiClient("http://test", () => null);

    await client.searchMovies("interstellar");

    const headers = (captured.init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("surfaces backend error messages", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { code: "CONFLICT", message: "already on the watchlist" } }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      )) as typeof fetch;
    const client = new ApiClient("http://test");
    await expect(client.addToWatchlist("tt0468569")).rejects.toThrow("already on the watchlist");
  });

  it("throws Unauthorized on 401 responses", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      )) as typeof fetch;
    const client = new ApiClient("http://test", () => null);
    await expect(client.getMe()).rejects.toThrow("Unauthorized");
  });

  it("sends GET /movies/upcoming with limit", async () => {
    const captured: { url?: string; init?: unknown } = {};
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      captured.url = String(input);
      captured.init = init;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            movies: [{ id: "up1", title: "Up", genre: ["Sci-Fi"] }],
            provenance: { sourceName: "mock-upcoming", sourceKind: "api", confidence: 0.9 },
          }),
          { status: 200 },
        ),
      );
    }) as typeof fetch;
    const client = new ApiClient("http://test", () => null);
    const res = await client.getUpcoming(5);
    expect(captured.url).toBe("http://test/movies/upcoming?limit=5");
    expect(res.movies[0].id).toBe("up1");
  });

  it("sends DELETE /watchlist/{id}", async () => {
    const captured: { url?: string; method?: string } = {};
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      captured.url = String(input);
      captured.method = init?.method;
      return Promise.resolve(new Response(null, { status: 204 }));
    }) as typeof fetch;
    const client = new ApiClient("http://test", () => null);
    await client.removeFromWatchlist("tt123");
    expect(captured.url).toBe("http://test/watchlist/tt123");
    expect(captured.method).toBe("DELETE");
  });

  it("PUTs a rating with optional categories", async () => {
    const captured: { url?: string; method?: string; body?: string } = {};
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      captured.url = String(input);
      captured.method = init?.method;
      captured.body = init?.body as string;
      return Promise.resolve(
        new Response(
          JSON.stringify({ rating: { id: "r1", movieId: "tt1", score: 8, categories: [], createdAt: "", updatedAt: "" } }),
          { status: 200 },
        ),
      );
    }) as typeof fetch;
    const client = new ApiClient("http://test", () => "tok");
    const res = await client.putRating("tt1", { score: 8, categories: [{ category: "acting", score: 9 }] });
    expect(captured.url).toBe("http://test/movies/tt1/rating");
    expect(captured.method).toBe("PUT");
    expect(JSON.parse(captured.body!)).toEqual({ score: 8, categories: [{ category: "acting", score: 9 }] });
    expect(res.rating.score).toBe(8);
  });

  it("gets the DB-only rating summary, separate from external ratings", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            summary: { average: 7.5, count: 2, categories: {} },
            provenance: { sourceName: "movie_ratings", sourceKind: "database", confidence: 1 },
          }),
          { status: 200 },
        ),
      )) as typeof fetch;
    const client = new ApiClient("http://test", () => null);
    const res = await client.getRatingSummary("tt1");
    expect(res.summary.count).toBe(2);
    expect(res.provenance.sourceKind).toBe("database");
  });

  it("creates a review with a spoiler flag", async () => {
    const captured: { url?: string; body?: string } = {};
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      captured.url = String(input);
      captured.body = init?.body as string;
      return Promise.resolve(
        new Response(JSON.stringify({ review: { id: "rev1", hasSpoilers: true } }), { status: 201 }),
      );
    }) as typeof fetch;
    const client = new ApiClient("http://test", () => "tok");
    await client.createReview("tt1", { body: "A review long enough to pass validation checks.", hasSpoilers: true });
    expect(captured.url).toBe("http://test/movies/tt1/reviews");
    expect(JSON.parse(captured.body!).hasSpoilers).toBe(true);
  });

  it("sends pagination and sort params for GET reviews", async () => {
    const captured: { url?: string } = {};
    globalThis.fetch = ((input: RequestInfo | URL) => {
      captured.url = String(input);
      return Promise.resolve(
        new Response(JSON.stringify({ reviews: [], meta: { page: 2, pageSize: 5, total: 0, pageCount: 1 } }), {
          status: 200,
        }),
      );
    }) as typeof fetch;
    const client = new ApiClient("http://test", () => null);
    await client.getReviews("tt1", { page: 2, pageSize: 5, sort: "most_liked" });
    expect(captured.url).toBe("http://test/movies/tt1/reviews?page=2&pageSize=5&sort=most_liked");
  });

  it("likes and unlikes a review via idempotent PUT/DELETE", async () => {
    const methods: string[] = [];
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      methods.push(init?.method ?? "");
      return Promise.resolve(new Response(null, { status: 204 }));
    }) as typeof fetch;
    const client = new ApiClient("http://test", () => "tok");
    await client.likeReview("rev1");
    await client.unlikeReview("rev1");
    expect(methods).toEqual(["PUT", "DELETE"]);
  });

  it("surfaces a 409 when reporting a review twice", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { code: "CONFLICT", message: "You already reported this review" } }), {
          status: 409,
        }),
      )) as typeof fetch;
    const client = new ApiClient("http://test", () => "tok");
    await expect(client.reportReview("rev1", { reason: "spam" })).rejects.toThrow("already reported");
  });

  it("PUTs a favorite idempotently", async () => {
    const captured: { url?: string; method?: string } = {};
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      captured.url = String(input);
      captured.method = init?.method;
      return Promise.resolve(new Response(null, { status: 204 }));
    }) as typeof fetch;
    const client = new ApiClient("http://test", () => "tok");
    await client.addFavorite("tt1");
    expect(captured.url).toBe("http://test/favorites/tt1");
    expect(captured.method).toBe("PUT");
  });

  it("fetches profile stats", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            stats: {
              reviewsCount: 3,
              avgRatingGiven: 8.2,
              watchlistCount: 1,
              favoritesCount: 2,
              watchedCount: 4,
              likesReceived: 5,
            },
          }),
          { status: 200 },
        ),
      )) as typeof fetch;
    const client = new ApiClient("http://test", () => "tok");
    const res = await client.getProfileStats();
    expect(res.stats.reviewsCount).toBe(3);
    expect(res.stats.avgRatingGiven).toBe(8.2);
  });
});