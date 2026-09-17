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
const ADMIN_ID = "77777777-7777-4777-8777-777777777777";
const USER_ID = "88888888-8888-4888-8888-888888888888";
const REPORTER_ID = "99999999-8888-4999-8999-999999999998";

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
const profiles: Record<string, AppRole> = { [ADMIN_ID]: "admin", [USER_ID]: "user", [REPORTER_ID]: "user" };
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
let adminToken: string;
let userToken: string;
let reporterToken: string;
let reviewId: string;
let reportId: string;

const MOVIE_ID = "tt0111161";

beforeAll(async () => {
  app = await buildApp({ config: makeConfig(), verifier, profileStore });
  adminToken = await signToken(ADMIN_ID);
  userToken = await signToken(USER_ID);
  reporterToken = await signToken(REPORTER_ID);
  await app.ready();

  const created = await app.inject({
    method: "POST",
    url: `/movies/${MOVIE_ID}/reviews`,
    headers: { authorization: `Bearer ${userToken}` },
    payload: { body: "A review that will end up getting reported for moderation review." },
  });
  reviewId = created.json().review.id;

  const reported = await app.inject({
    method: "POST",
    url: `/reviews/${reviewId}/report`,
    headers: { authorization: `Bearer ${reporterToken}` },
    payload: { reason: "harassment", details: "contains personal attacks" },
  });
  reportId = reported.json().report.id;
});

afterAll(async () => {
  await app.close();
});

describe("moderation authorization", () => {
  it("rejects non-admins from listing reports", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/review-reports",
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects non-admins from resolving a report", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/review-reports/${reportId}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { status: "dismissed" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects non-admins from overriding review status", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/reviews/${reviewId}/status`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { status: "deleted" },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("admin moderation actions", () => {
  it("lists open reports", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/review-reports?status=open",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().reports.some((r: { id: string }) => r.id === reportId)).toBe(true);
  });

  it("resolves a report", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/review-reports/${reportId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: "resolved" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().report.status).toBe("resolved");
  });

  it("force-deletes a review, which an owner alone cannot do via PATCH", async () => {
    const ownerAttempt = await app.inject({
      method: "PATCH",
      url: `/reviews/${reviewId}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { status: "deleted" },
    });
    // owner PATCH schema only allows published/hidden, so "deleted" is rejected as invalid
    expect(ownerAttempt.statusCode).toBe(400);

    const adminAttempt = await app.inject({
      method: "PATCH",
      url: `/admin/reviews/${reviewId}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: "deleted" },
    });
    expect(adminAttempt.statusCode).toBe(200);
    expect(adminAttempt.json().review.status).toBe("deleted");
  });

  it("404s resolving an unknown report", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/admin/review-reports/does-not-exist",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: "dismissed" },
    });
    expect(res.statusCode).toBe(404);
  });
});
