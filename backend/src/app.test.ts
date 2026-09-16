import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

const config = loadConfig({
  ...process.env,
  MOVIE_PROVIDER: "mock",
  JWT_SECRET: "a-super-secret-jwt-signing-key-for-tests-only-123456",
  BACKEND_LOG_LEVEL: "silent",
} as NodeJS.ProcessEnv);

let app: FastifyInstance;
let token: string;

beforeAll(async () => {
  app = await buildApp({ config });
  token = app.jwt.sign({ userId: "test-user-1" }, { expiresIn: "1h" });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("health", () => {
  it("returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ok");
  });
});

describe("movies", () => {
  it("returns a movie with provenance from the mock provider", async () => {
    const res = await app.inject({ method: "GET", url: "/movies/tt0111161" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.movie.title).toBe("The Shawshank Redemption");
    expect(body.provenance.sourceKind).toBe("static");
    expect(body.provenance.confidence).toBe(1);
  });

  it("404s unknown movies", async () => {
    const res = await app.inject({ method: "GET", url: "/movies/nope" });
    expect(res.statusCode).toBe(404);
  });

  it("searches by title", async () => {
    const res = await app.inject({ method: "GET", url: "/movies?title=dark&limit=5" });
    expect(res.statusCode).toBe(200);
    const titles = res.json().movies.map((m: { title: string }) => m.title);
    expect(titles).toContain("The Dark Knight");
  });
});

describe("watchlist", () => {
  it("requires auth", async () => {
    const res = await app.inject({ method: "GET", url: "/watchlist" });
    expect(res.statusCode).toBe(401);
  });

  it("adds, lists, then removes a movie", async () => {
    const add = await app.inject({
      method: "POST",
      url: "/watchlist",
      headers: { authorization: `Bearer ${token}` },
      payload: { movieId: "tt0468569" },
    });
    expect(add.statusCode).toBe(201);

    const list = await app.inject({
      method: "GET",
      url: "/watchlist",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().watchlist).toHaveLength(1);
    expect(list.json().watchlist[0].movie.value.title).toBe("The Dark Knight");

    const remove = await app.inject({
      method: "DELETE",
      url: "/watchlist/tt0468569",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(remove.statusCode).toBe(204);
  });

  it("409s on duplicate add", async () => {
    await app.inject({
      method: "POST",
      url: "/watchlist",
      headers: { authorization: `Bearer ${token}` },
      payload: { movieId: "tt1375666" },
    });
    const dup = await app.inject({
      method: "POST",
      url: "/watchlist",
      headers: { authorization: `Bearer ${token}` },
      payload: { movieId: "tt1375666" },
    });
    expect(dup.statusCode).toBe(409);
  });
});

describe("validation", () => {
  it("rejects malformed search queries", async () => {
    const res = await app.inject({ method: "GET", url: "/movies?title=" });
    expect(res.statusCode).toBe(400);
  });
});