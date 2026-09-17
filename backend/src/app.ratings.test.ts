import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSecretKey } from "node:crypto";
import { SignJWT } from "jose";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig, type AppConfig } from "../src/config.js";
import { HmacJwtVerifier } from "../src/auth/verifier.js";
import { StaticProfileRoleStore } from "../src/auth/profile.js";
import type { AppRole } from "../src/auth/types.js";

const SECRET = "test-secret-that-is-at-least-24-characters-long-0001";
const USER_A = "33333333-3333-4333-8333-333333333333";
const USER_B = "44444444-4444-4444-8444-444444444444";

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ...loadConfig({
      ...process.env,
      MOVIE_PROVIDER: "mock",
      JWT_SECRET: SECRET,
      BACKEND_LOG_LEVEL: "silent",
    } as NodeJS.ProcessEnv),
    ...overrides,
  };
}

const verifier = new HmacJwtVerifier({ secret: SECRET });
const profiles: Record<string, AppRole> = { [USER_A]: "user", [USER_B]: "user" };
const profileStore = new StaticProfileRoleStore(profiles);

function signToken(sub: string): Promise<string> {
  return new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(sub)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
    .sign(createSecretKey(SECRET, "utf8"));
}

let app: FastifyInstance;
let tokenA: string;
let tokenB: string;

beforeAll(async () => {
  app = await buildApp({ config: makeConfig(), verifier, profileStore });
  tokenA = await signToken(USER_A);
  tokenB = await signToken(USER_B);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const MOVIE_ID = "tt0111161"; // The Shawshank Redemption (mock fixture)

describe("movie ratings", () => {
  it("has no rating before one is set", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/movies/${MOVIE_ID}/rating`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().rating).toBeNull();
  });

  it("upserts a rating with optional category scores", async () => {
    const put = await app.inject({
      method: "PUT",
      url: `/movies/${MOVIE_ID}/rating`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { score: 9, categories: [{ category: "acting", score: 10 }, { category: "story", score: 8 }] },
    });
    expect(put.statusCode).toBe(200);
    const body = put.json();
    expect(body.rating.score).toBe(9);
    expect(body.rating.categories).toHaveLength(2);

    // upsert again with a different score replaces, not duplicates
    const put2 = await app.inject({
      method: "PUT",
      url: `/movies/${MOVIE_ID}/rating`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { score: 7 },
    });
    expect(put2.statusCode).toBe(200);
    expect(put2.json().rating.score).toBe(7);
    expect(put2.json().rating.categories).toHaveLength(0);
  });

  it("rejects an out-of-range score", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/movies/${MOVIE_ID}/rating`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { score: 11 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an unknown category", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/movies/${MOVIE_ID}/rating`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { score: 5, categories: [{ category: "cinematography", score: 5 }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a duplicate category in the same payload", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/movies/${MOVIE_ID}/rating`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { score: 5, categories: [{ category: "acting", score: 5 }, { category: "acting", score: 6 }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("404s an unknown movie id", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/movies/does-not-exist/rating",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { score: 5 },
    });
    expect(res.statusCode).toBe(404);
  });

  it("keeps ratings isolated per user", async () => {
    await app.inject({
      method: "PUT",
      url: `/movies/${MOVIE_ID}/rating`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { score: 3 },
    });
    const mineA = await app.inject({
      method: "GET",
      url: `/movies/${MOVIE_ID}/rating`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const mineB = await app.inject({
      method: "GET",
      url: `/movies/${MOVIE_ID}/rating`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(mineA.json().rating.score).not.toBe(mineB.json().rating.score);
  });

  it("reflects both users in the public summary, kept separate from external ratings", async () => {
    const summary = await app.inject({ method: "GET", url: `/movies/${MOVIE_ID}/ratings/summary` });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().summary.count).toBe(2);
    expect(summary.json().provenance.sourceName).toBe("movie_ratings");

    const external = await app.inject({ method: "GET", url: `/movies/${MOVIE_ID}/ratings` });
    expect(external.statusCode).toBe(200);
    // external endpoint is untouched by user ratings entirely
    expect(external.json()).not.toHaveProperty("summary");
  });

  it("deletes a rating (owner-scoped)", async () => {
    const del = await app.inject({
      method: "DELETE",
      url: `/movies/${MOVIE_ID}/rating`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(del.statusCode).toBe(204);
    const mine = await app.inject({
      method: "GET",
      url: `/movies/${MOVIE_ID}/rating`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(mine.json().rating).toBeNull();
  });

  it("lists the caller's own ratings across movies, paginated", async () => {
    await app.inject({
      method: "PUT",
      url: "/movies/tt0468569/rating",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { score: 6 },
    });
    const res = await app.inject({
      method: "GET",
      url: "/ratings/mine?page=1&pageSize=1",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ratings).toHaveLength(1);
    expect(body.meta.total).toBe(2);
  });
});
