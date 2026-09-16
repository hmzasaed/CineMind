import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { loadConfig, resolveCorsOrigin, type AppConfig } from "./config.js";
import { loggerOptions } from "./logger.js";
import { createMovieProvider, InMemoryWatchlistStore } from "./providers/index.js";
import { errorHandler } from "./middleware/error-handler.js";
import { makeRequestLogHook } from "./middleware/request-log.js";
import { makeRequireAppRole, makeRequireAuth } from "./auth/middleware.js";
import { createProfileStore } from "./auth/profile.js";
import { createTokenVerifier } from "./auth/verifier.js";
import type { ProfileRoleStore, TokenVerifier } from "./auth/types.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerMovieRoutes } from "./routes/movies.js";
import { registerWatchlistRoutes } from "./routes/watchlist.js";

export interface AppDeps {
  config: AppConfig;
  /**
   * Token verification strategy. Defaults to Supabase JWKS when SUPABASE_URL
   * is set, otherwise HS256 with JWT_SECRET (local dev/tests).
   */
  verifier?: TokenVerifier;
  /** App-role resolution. Defaults to the Supabase admin service. */
  profileStore?: ProfileRoleStore;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({
    logger: loggerOptions(config),
    disableRequestLogging: true,
  });

  // CORS first so preflights are answered before rate limiting counts them.
  await app.register(cors, {
    origin: resolveCorsOrigin(config.corsOrigin),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
    exposedHeaders: ["WWW-Authenticate"],
  });

  await app.register(helmet, { contentSecurityPolicy: false });

  await app.register(rateLimit, {
    max: config.rateLimitMaxRequests,
    timeWindow: config.rateLimitWindowMs,
  });

  const onResponseLog = makeRequestLogHook(app.log);
  app.addHook("onResponse", onResponseLog);
  app.setErrorHandler(errorHandler(app.log));

  const verifier = deps.verifier ?? createTokenVerifier(config);
  const profileStore = deps.profileStore ?? createProfileStore(config);

  const requireAuth = makeRequireAuth(verifier);
  const requireAdmin = makeRequireAppRole(profileStore, "admin");

  const provider = createMovieProvider(config);
  const watchlistStore = new InMemoryWatchlistStore();

  registerHealthRoutes(app);
  registerMovieRoutes(app, provider);
  registerWatchlistRoutes(app, provider, watchlistStore, requireAuth);
  registerAuthRoutes(app, { requireAuth, requireAdmin, profileStore });

  return app;
}

export function appFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<FastifyInstance> {
  return buildApp({ config: loadConfig(env) });
}