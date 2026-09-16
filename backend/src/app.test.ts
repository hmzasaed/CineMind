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
const WRONG_SECRET = "a-completely-different-secret-for-signing-mismatch-0002";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const GHOST_ID = "99999999-9999-4999-8999-999999999999";

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
const profiles: Record<string, AppRole> = { [ADMIN_ID]: "admin", [USER_ID]: "user" };
const profileStore = new StaticProfileRoleStore(profiles);

function signToken(
  payload: { sub: string; email?: string; role?: string; aud?: string },
  ttlSeconds = 3600,
  secret: string = SECRET,
): Promise<string> {
  const jwt = new SignJWT({
    email: payload.email,
    role: payload.role ?? "authenticated",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.sub)
    .setAudience(payload.aud ?? "authenticated")
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds);
  return jwt.sign(createSecretKey(secret, "utf8"));
}

let app: FastifyInstance;
let adminToken: string;
let userToken: string;
let ghostToken: string;

beforeAll(async () => {
  app = await buildApp({
    config: makeConfig(),
    verifier,
    profileStore,
  });
  adminToken = await signToken({ sub: ADMIN_ID, email: "admin@example.com" });
  userToken = await signToken({ sub: USER_ID, email: "user@example.com" });
  ghostToken = await signToken({ sub: GHOST_ID, email: "ghost@example.com" });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("health", () => {
  it("responds publicly without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ok");
  });
});

describe("security headers", () => {
  it("sets helmet default headers", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeTruthy();
    expect(res.headers["strict-transport-security"]).toBeTruthy();
  });
});

describe("cors", () => {
  it("answers preflight requests", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/movies",
      headers: {
        origin: "https://app.example.com",
        "access-control-request-method": "GET",
      },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
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

describe("unauthenticated access", () => {
  it.each(["/auth/me", "/watchlist", "/admin/ping"])("rejects %s without a token", async (url) => {
    const res = await app.inject({ method: "GET", url });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
    expect(res.headers["www-authenticate"]).toContain("Bearer");
  });

  it("rejects non-bearer auth schemes", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: "Basic abcdef" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("keeps public routes open", async () => {
    const res = await app.inject({ method: "GET", url: "/movies/tt0111161" });
    expect(res.statusCode).toBe(200);
  });
});

describe("invalid and expired tokens", () => {
  it("rejects an expired token", async () => {
    const expired = await signToken({ sub: USER_ID }, -60);
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${expired}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a token signed with the wrong key", async () => {
    const forged = await signToken({ sub: USER_ID }, 3600, WRONG_SECRET);
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${forged}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a garbage token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: "Bearer not.a.jwt" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects anon-audience (project key) tokens", async () => {
    const anon = await signToken({ sub: "00000000-0000-4000-8000-0000000000aa", role: "anon", aud: "anon" });
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${anon}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects service-role tokens", async () => {
    const service = await signToken({ sub: "00000000-0000-4000-8000-0000000000bb", role: "service_role" });
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${service}` },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("authenticated access", () => {
  it("returns the verified user identity at /auth/me", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.id).toBe(USER_ID);
    expect(body.user.email).toBe("user@example.com");
    expect(body.user.role).toBe("user");
    expect(body.user.authRole).toBe("authenticated");
  });

  it("reports role null for users without a profile", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${ghostToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.role).toBeNull();
  });
});

describe("role-aware authorization", () => {
  it("blocks non-admins from /admin/ping", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/ping",
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("allows admins into /admin/ping", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/ping",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().admin).toBe(true);
  });
});

describe("ownership checks", () => {
  it("scopes watchlists to the token's user", async () => {
    await app.inject({
      method: "POST",
      url: "/watchlist",
      headers: { authorization: `Bearer ${userToken}` },
      payload: { movieId: "tt0468569" },
    });
    await app.inject({
      method: "POST",
      url: "/watchlist",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { movieId: "tt1375666" },
    });

    const mine = await app.inject({
      method: "GET",
      url: "/watchlist",
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(mine.statusCode).toBe(200);
    const mineBody = mine.json();
    expect(mineBody.watchlist).toHaveLength(1);
    expect(mineBody.watchlist[0].movie.value.id).toBe("tt0468569");

    const theirs = await app.inject({
      method: "GET",
      url: "/watchlist",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(theirs.json().watchlist).toHaveLength(1);
    expect(theirs.json().watchlist[0].movie.value.id).toBe("tt1375666");

    const other = await app.inject({
      method: "GET",
      url: "/watchlist",
      headers: { authorization: `Bearer ${ghostToken}` },
    });
    expect(other.statusCode).toBe(200);
    expect(other.json().watchlist).toHaveLength(0);
  });
});

describe("validation", () => {
  it("rejects malformed search queries", async () => {
    const res = await app.inject({ method: "GET", url: "/movies?title=" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("BAD_REQUEST");
  });

  it("rejects a watchlist add with a missing movie id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/watchlist",
      headers: { authorization: `Bearer ${userToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an oversized movie id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/watchlist",
      headers: { authorization: `Bearer ${userToken}` },
      payload: { movieId: "x".repeat(65) },
    });
    expect(res.statusCode).toBe(400);
  });

  it("turns a malformed JSON body into a 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/watchlist",
      headers: {
        authorization: `Bearer ${userToken}`,
        "content-type": "application/json",
      },
      payload: "{ not json",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_REQUEST");
  });
});

describe("rate limiting", () => {
  let limited: FastifyInstance;

  beforeAll(async () => {
    limited = await buildApp({
      config: makeConfig({ rateLimitMaxRequests: 3, rateLimitWindowMs: 60_000 }),
      verifier,
      profileStore,
    });
    await limited.ready();
  });

  afterAll(async () => {
    await limited.close();
  });

  it("429s once the per-client budget is exhausted", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await limited.inject({ method: "GET", url: "/health" });
      statuses.push(res.statusCode);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
    const last = await limited.inject({ method: "GET", url: "/health" });
    expect(last.statusCode).toBe(429);
    expect(last.json().error.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(last.headers["retry-after"] ?? last.json().error.retryAfter).toBeTruthy();
  });
});