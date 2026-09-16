import { describe, expect, it } from "vitest";
import { ApiClient } from "../src/lib/api";

describe("ApiClient", () => {
  it("sends auth token and parses movies search", async () => {
    let captured: { url: string; headers: Headers } | null = null;
    const client = new ApiClient(
      "http://test",
      () => "tok-123",
    );

    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      captured = { url: String(input), headers: init?.headers as Headers };
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
      expect(captured?.url).toBe("http://test/movies?title=dark+knight");
      expect(captured?.headers).toMatchObject({ Authorization: "Bearer tok-123" });
      expect(result.movies[0].id).toBe("tt0468569");
      expect(result.provenance.sourceKind).toBe("static");
    } finally {
      globalThis.fetch = originalFetch;
    }
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
});