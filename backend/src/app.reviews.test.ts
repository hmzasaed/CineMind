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
const USER_A = "55555555-5555-4555-8555-555555555555";
const USER_B = "66666666-6666-4666-8666-666666666666";

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ...loadConfig({
      ...process.env,
      MOVIE_PROVIDER: "mock",
      JWT_SECRET: SECRET,
      BACKEND_LOG_LEVEL: "silent",
    } as NodeJS.ProcessEnv),
    reviewRateLimitMax: 100,
    reportRateLimitMax: 100,
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

const MOVIE_ID = "tt0111161";
const VALID_BODY = "This movie really stuck with me long after the credits rolled.";

describe("review CRUD + ownership", () => {
  let reviewId: string;

  it("rejects a review shorter than 20 characters", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/movies/${MOVIE_ID}/reviews`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { body: "too short" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("creates a review", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/movies/${MOVIE_ID}/reviews`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { body: VALID_BODY, rating: 9, hasSpoilers: true },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.review.movieId).toBe(MOVIE_ID);
    expect(body.review.hasSpoilers).toBe(true);
    expect(body.review.status).toBe("published");
    expect(body.review.likesCount).toBe(0);
    reviewId = body.review.id;
  });

  it("rejects a second review for the same movie from the same user", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/movies/${MOVIE_ID}/reviews`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { body: VALID_BODY },
    });
    expect(res.statusCode).toBe(409);
  });

  it("404s editing someone else's review (not 403 — no existence leak)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/reviews/${reviewId}`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { body: "trying to hijack this review with new text" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("404s deleting someone else's review", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/reviews/${reviewId}`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("lets the owner edit their own review", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/reviews/${reviewId}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { body: "Updated: still one of my favorites of all time." },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().review.body).toContain("Updated");
  });

  it("hides the spoiler-free body behind hasSpoilers so the client can gate it", async () => {
    const res = await app.inject({ method: "GET", url: `/movies/${MOVIE_ID}/reviews` });
    const review = res.json().reviews.find((r: { id: string }) => r.id === reviewId);
    expect(review.hasSpoilers).toBe(true);
    expect(typeof review.body).toBe("string"); // backend always returns the text; UI enforces the gate
  });

  it("likes and unlikes idempotently, reflected in likesCount", async () => {
    const like1 = await app.inject({
      method: "PUT",
      url: `/reviews/${reviewId}/like`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(like1.statusCode).toBe(204);
    const like2 = await app.inject({
      method: "PUT",
      url: `/reviews/${reviewId}/like`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(like2.statusCode).toBe(204);

    const list = await app.inject({
      method: "GET",
      url: `/movies/${MOVIE_ID}/reviews`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    const review = list.json().reviews.find((r: { id: string }) => r.id === reviewId);
    expect(review.likesCount).toBe(1);
    expect(review.likedByMe).toBe(true);

    const unlike = await app.inject({
      method: "DELETE",
      url: `/reviews/${reviewId}/like`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(unlike.statusCode).toBe(204);
    const listAfter = await app.inject({ method: "GET", url: `/movies/${MOVIE_ID}/reviews` });
    expect(listAfter.json().reviews.find((r: { id: string }) => r.id === reviewId).likesCount).toBe(0);
  });

  it("reports a review, then rejects a duplicate report from the same user", async () => {
    const first = await app.inject({
      method: "POST",
      url: `/reviews/${reviewId}/report`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { reason: "spam" },
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().report.reason).toBe("spam");

    const dup = await app.inject({
      method: "POST",
      url: `/reviews/${reviewId}/report`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { reason: "other", details: "still spam" },
    });
    expect(dup.statusCode).toBe(409);
  });

  it("404s reporting a nonexistent review", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/reviews/does-not-exist/report",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { reason: "spam" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("404s deleting a review that was already removed", async () => {
    const del = await app.inject({
      method: "DELETE",
      url: `/reviews/${reviewId}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(del.statusCode).toBe(204);
    const delAgain = await app.inject({
      method: "DELETE",
      url: `/reviews/${reviewId}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(delAgain.statusCode).toBe(404);
  });
});

describe("pagination and sorting", () => {
  const movieId = "tt0468569"; // The Dark Knight (mock fixture)

  beforeAll(async () => {
    // Only 2 distinct users exist in this file, and reviews are unique per
    // (user, movie) — so this movie gets exactly 2 reviews, one per author.
    await app.inject({
      method: "POST",
      url: `/movies/${movieId}/reviews`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { body: "Review from user A with enough characters to pass validation.", rating: 6 },
    });
    await app.inject({
      method: "POST",
      url: `/movies/${movieId}/reviews`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { body: "Review from user B with enough characters to pass validation.", rating: 8 },
    });
  });

  it("paginates with meta", async () => {
    const res = await app.inject({ method: "GET", url: `/movies/${movieId}/reviews?page=1&pageSize=1` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.reviews).toHaveLength(1);
    expect(body.meta).toMatchObject({ page: 1, pageSize: 1, total: 2 });
  });

  it("sorts newest first by default", async () => {
    const res = await app.inject({ method: "GET", url: `/movies/${movieId}/reviews?pageSize=10` });
    const dates = res.json().reviews.map((r: { createdAt: string }) => r.createdAt);
    const sorted = [...dates].sort((a, b) => b.localeCompare(a));
    expect(dates).toEqual(sorted);
  });

  it("rejects an invalid sort value", async () => {
    const res = await app.inject({ method: "GET", url: `/movies/${movieId}/reviews?sort=bogus` });
    expect(res.statusCode).toBe(400);
  });
});

describe("reviews/mine", () => {
  it("lists only the caller's own non-deleted reviews", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/reviews/mine",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    for (const review of res.json().reviews) {
      expect(review.userId).toBe(USER_A);
    }
  });
});
