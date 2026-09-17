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
const USER_A = "aaaaaaaa-1111-4111-8111-111111111111";
const USER_B = "bbbbbbbb-2222-4222-8222-222222222222";

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

const MOVIE_A = "tt0111161";
const MOVIE_B = "tt0468569";

beforeAll(async () => {
  app = await buildApp({ config: makeConfig(), verifier, profileStore });
  tokenA = await signToken(USER_A);
  tokenB = await signToken(USER_B);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("favorites", () => {
  it("starts empty", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/favorites",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().favorites).toHaveLength(0);
  });

  it("adds a favorite idempotently (PUT toggle-on)", async () => {
    const first = await app.inject({
      method: "PUT",
      url: `/favorites/${MOVIE_A}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(first.statusCode).toBe(204);
    const second = await app.inject({
      method: "PUT",
      url: `/favorites/${MOVIE_A}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(second.statusCode).toBe(204); // no 409 — idempotent, unlike watchlist

    const list = await app.inject({
      method: "GET",
      url: "/favorites",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(list.json().favorites).toHaveLength(1);
  });

  it("scopes favorites to the token's user", async () => {
    await app.inject({
      method: "PUT",
      url: `/favorites/${MOVIE_B}`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    const mine = await app.inject({
      method: "GET",
      url: "/favorites",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(mine.json().favorites).toHaveLength(1);
    expect(mine.json().favorites[0].movie.value.id).toBe(MOVIE_A);
  });

  it("removes a favorite (idempotent DELETE)", async () => {
    const del = await app.inject({
      method: "DELETE",
      url: `/favorites/${MOVIE_A}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(del.statusCode).toBe(204);
    const delAgain = await app.inject({
      method: "DELETE",
      url: `/favorites/${MOVIE_A}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(delAgain.statusCode).toBe(204);
  });

  it("400s adding an unknown movie", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/favorites/does-not-exist",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("watch history", () => {
  it("adds an entry and lists it", async () => {
    const add = await app.inject({
      method: "POST",
      url: "/watch-history",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { movieId: MOVIE_A, status: "finished" },
    });
    expect(add.statusCode).toBe(201);
    expect(add.json().entry.status).toBe("finished");

    const list = await app.inject({
      method: "GET",
      url: "/watch-history",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(list.json().history).toHaveLength(1);
  });

  it("allows multiple entries for the same movie (a rewatch log)", async () => {
    await app.inject({
      method: "POST",
      url: "/watch-history",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { movieId: MOVIE_A, status: "finished" },
    });
    const list = await app.inject({
      method: "GET",
      url: "/watch-history",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(list.json().history).toHaveLength(2);
  });

  it("scopes history to the token's user", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/watch-history",
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(list.json().history).toHaveLength(0);
  });

  it("404s removing another user's entry", async () => {
    const mine = await app.inject({
      method: "GET",
      url: "/watch-history",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const entryId = mine.json().history[0].id;
    const res = await app.inject({
      method: "DELETE",
      url: `/watch-history/${entryId}`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("rejects an invalid status", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/watch-history",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { movieId: MOVIE_A, status: "bogus" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("profile stats", () => {
  it("reflects the caller's own activity only", async () => {
    await app.inject({
      method: "PUT",
      url: `/movies/${MOVIE_A}/rating`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { score: 8 },
    });
    const res = await app.inject({
      method: "GET",
      url: "/profile/stats",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    const stats = res.json().stats;
    expect(stats.watchedCount).toBe(2);
    expect(stats.avgRatingGiven).toBe(8);

    const other = await app.inject({
      method: "GET",
      url: "/profile/stats",
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(other.json().stats.avgRatingGiven).toBeNull();
  });
});
