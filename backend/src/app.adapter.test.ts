import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSecretKey } from "node:crypto";
import { SignJWT } from "jose";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig, type AppConfig } from "../src/config.js";
import { HmacJwtVerifier } from "../src/auth/verifier.js";
import { StaticProfileRoleStore } from "../src/auth/profile.js";
import type { AppRole } from "../src/auth/types.js";
import { InMemoryIngestionJobStore } from "../src/jobs/store.js";
import { ProviderError } from "../src/providers/errors.js";
import { decorateAdapter } from "../src/providers/decorators.js";
import type { Fact } from "../src/types.js";
import type {
  MovieDataAdapter,
  MovieDetail,
  MovieCredits,
  MovieImages,
  MovieRating,
  ProductionCompany,
  MovieFinancials,
  MovieRecord,
} from "../src/providers/types.js";
import { mkProvenance } from "../src/providers/types.js";

const SECRET = "test-secret-that-is-at-least-24-characters-long-0001";
const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

function signToken(payload: { sub: string }, ttlSeconds = 3600): Promise<string> {
  const jwt = new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.sub)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds);
  return jwt.sign(createSecretKey(SECRET, "utf8"));
}

const detail: MovieDetail = {
  id: "x1",
  title: "Adapter Movie",
  releaseYear: 2024,
  genre: ["Drama"],
  rating: { average: 7.5, votes: 42 },
  certification: "R",
  budget: 1000000,
  revenue: 2000000,
  productionCompanies: [{ id: "c1", name: "Studio X" }],
  imdbId: "ttX1",
};

function fact<T>(value: T): Fact<T> {
  return { value, provenance: mkProvenance("fake", "api", "fake:x1", 0.9) };
}

/** Provider-agnostic fake with every capability + injectable failures. */
function makeFakeAdapter(mode: { [key: string]: () => Promise<unknown> } = {}): MovieDataAdapter {
  const getMovie: MovieDataAdapter["getMovie"] = async (id) => {
    if (id in mode) return (await mode[id]()) as Fact<MovieDetail | null>;
    return fact<MovieDetail | null>(id === "x1" ? detail : null);
  };
  return {
    name: "fake",
    attribution: { provider: "fake", licensed: false, notice: "test only" },
    lastCacheStatus: () => "miss",
    getMovie,
    search: async () => fact<MovieRecord[]>([detail]),
    getUpcoming: async () => fact<MovieRecord[]>([detail]),
    getCredits: async () =>
      fact<MovieCredits | null>({ id: "x1", cast: [{ personId: "p1", name: "Actor", character: "Lead", order: 0 }], crew: [] }),
    getImages: async () =>
      fact<MovieImages | null>({ id: "x1", posters: [{ path: "https://fake.invalid/p.jpg" }], backdrops: [] }),
    getRatings: async () => fact<MovieRating | null>({ id: "x1", average: 7.5, votes: 42, certification: "R" }),
    getProductionCompanies: async () =>
      fact<ProductionCompany[] | null>([{ id: "c1", name: "Studio X", originCountry: "US" }]),
    getFinancials: async () =>
      fact<MovieFinancials | null>({ id: "x1", budget: 1000000, revenue: 2000000, currency: "USD" }),
  };
}

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ...loadConfig({ ...process.env, MOVIE_PROVIDER: "mock", JWT_SECRET: SECRET, BACKEND_LOG_LEVEL: "silent" } as NodeJS.ProcessEnv),
    ...overrides,
  };
}

const verifier = new HmacJwtVerifier({ secret: SECRET });
const profiles: Record<string, AppRole> = { [ADMIN_ID]: "admin", [USER_ID]: "user" };
const profileStore = new StaticProfileRoleStore(profiles);

let app: FastifyInstance;
let adminToken: string;
let userToken: string;

beforeAll(async () => {
  adminToken = await signToken({ sub: ADMIN_ID });
  userToken = await signToken({ sub: USER_ID });
  const failing = makeFakeAdapter({
    "upstream-fail": async () => {
      throw new ProviderError("UPSTREAM", "boom", "fake");
    },
    quota: async () => {
      throw new ProviderError("UPSTREAM_QUOTA", "quota exceeded", "fake");
    },
    invalid: async () => {
      throw new ProviderError("INVALID_RESPONSE", "bad payload", "fake");
    },
    rate: async () => {
      throw new ProviderError("UPSTREAM_RATE_LIMITED", "slow down", "fake", { retryAfterMs: 5000 });
    },
  });
  app = await buildApp({
    config: makeConfig(),
    verifier,
    profileStore,
    adapter: failing,
    jobStore: new InMemoryIngestionJobStore(),
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("adapter capabilities over HTTP", () => {
  it("returns a movie detail with provenance + attribution + provider headers", async () => {
    const res = await app.inject({ method: "GET", url: "/movies/x1" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.movie.title).toBe("Adapter Movie");
    expect(body.provenance.sourceName).toBe("fake");
    expect(body.attribution).toMatchObject({ provider: "fake", licensed: false });
    expect(res.headers["x-provider"]).toBe("fake");
    expect(res.headers["x-provider-cache"]).toBe("miss");
  });

  it("exposes credits, images, ratings, companies, and financials", async () => {
    for (const [path, key] of [
      ["/movies/x1/credits", "credits"],
      ["/movies/x1/images", "images"],
      ["/movies/x1/ratings", "ratings"],
      ["/movies/x1/companies", "companies"],
      ["/movies/x1/financials", "financials"],
    ] as const) {
      const res = await app.inject({ method: "GET", url: path });
      expect(res.statusCode).toBe(200);
      expect(res.json()[key]).toBeTruthy();
    }
  });

  it("lists upcoming releases", async () => {
    const res = await app.inject({ method: "GET", url: "/movies/upcoming?limit=2" });
    expect(res.statusCode).toBe(200);
    expect(res.json().movies).toHaveLength(1);
  });

  it("404s unknown movies", async () => {
    const res = await app.inject({ method: "GET", url: "/movies/nope" });
    expect(res.statusCode).toBe(404);
  });

  it("normalizes provider failures to stable HTTP errors", async () => {
    const cases: Array<[string, number, string]> = [
      ["upstream-fail", 502, "PROVIDER_UNAVAILABLE"],
      ["quota", 429, "PROVIDER_QUOTA_EXCEEDED"],
      ["invalid", 502, "PROVIDER_INVALID_RESPONSE"],
      ["rate", 429, "PROVIDER_RATE_LIMITED"],
    ];
    for (const [id, status, code] of cases) {
      const res = await app.inject({ method: "GET", url: `/movies/${id}` });
      expect(res.statusCode).toBe(status);
      expect(res.json().error.code).toBe(code);
    }
  });
});

describe("stale-cache behavior over HTTP", () => {
  it("serves a stale cached fact with the x-provider-cache header after a transient failure", async () => {
    let failing = false;
    const failingRoot = makeFakeAdapter({
      "stale-movie": async () => {
        if (failing) throw new ProviderError("UPSTREAM", "down", "fake");
        return fact<MovieDetail | null>({ ...detail, id: "stale-movie", title: "Stale Movie" });
      },
    });
    const adapter = decorateAdapter(failingRoot, {
      timeoutMs: 200,
      maxAttempts: 1,
      baseDelayMs: 10,
      cacheTtlMs: 40,
      serveStaleOnError: true,
    });
    const staleApp = await buildApp({
      config: makeConfig(),
      verifier,
      profileStore,
      adapter,
      jobStore: new InMemoryIngestionJobStore(),
    });
    try {
      await staleApp.ready();
      const first = await staleApp.inject({ method: "GET", url: "/movies/stale-movie" });
      expect(first.statusCode).toBe(200);
      expect(first.headers["x-provider-cache"]).toBe("miss");

      failing = true;
      await new Promise((r) => setTimeout(r, 60));
      const second = await staleApp.inject({ method: "GET", url: "/movies/stale-movie" });
      expect(second.statusCode).toBe(200);
      expect(second.headers["x-provider-cache"]).toBe("stale");
      expect(second.json().movie.title).toBe("Stale Movie");
    } finally {
      await staleApp.close();
    }
  });
});

describe("admin ingestion jobs", () => {
  it("rejects unauthenticated enqueues with 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/jobs",
      payload: { kind: "refresh_movie", externalId: "x1", provider: "fake" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects non-admin enqueues with 403", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/jobs",
      headers: { authorization: `Bearer ${userToken}` },
      payload: { kind: "refresh_movie", externalId: "x1", provider: "fake" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("enqueues a job (202), lists it, and fetches it by id", async () => {
    const enqueued = await app.inject({
      method: "POST",
      url: "/admin/jobs",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { kind: "refresh_movie", externalId: "x1", provider: "fake", payload: { source: "manual" } },
    });
    expect(enqueued.statusCode).toBe(202);
    const job = enqueued.json().job;
    expect(job).toMatchObject({ kind: "refresh_movie", externalId: "x1", provider: "fake", status: "pending" });

    const listed = await app.inject({
      method: "GET",
      url: "/admin/jobs?limit=10",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().jobs.map((j: { id: string }) => j.id)).toContain(job.id);

    const byId = await app.inject({
      method: "GET",
      url: `/admin/jobs/${job.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(byId.statusCode).toBe(200);
    expect(byId.json().job.id).toBe(job.id);
  });

  it("rejects invalid job payloads with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/jobs",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { kind: "refresh_movie" }, // missing externalId
    });
    expect(res.statusCode).toBe(400);
  });
});