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
});