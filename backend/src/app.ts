import Fastify, { type FastifyInstance } from "fastify";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { loadConfig, type AppConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createMovieProvider, InMemoryWatchlistStore } from "./providers/index.js";
import { errorHandler } from "./middleware/error-handler.js";
import { makeRequestLogHook } from "./middleware/request-log.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerMovieRoutes } from "./routes/movies.js";
import { registerWatchlistRoutes } from "./routes/watchlist.js";

export interface AppDeps {
  config: AppConfig;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const logger = createLogger(config);
  const app = Fastify({ logger, disableRequestLogging: true });

  await app.register(rateLimit, {
    max: config.rateLimitMaxRequests,
    timeWindow: config.rateLimitWindowMs,
  });

  if (config.jwtSecret) {
    await app.register(jwt, { secret: config.jwtSecret });
  }

  app.addHook("onRequest", makeRequestLogHook(logger));
  app.setErrorHandler(errorHandler(logger));

  const provider = createMovieProvider(config);
  const watchlistStore = new InMemoryWatchlistStore();

  registerHealthRoutes(app);
  registerMovieRoutes(app, provider);
  registerWatchlistRoutes(app, provider, watchlistStore);

  return app;
}

export function appFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<FastifyInstance> {
  return buildApp({ config: loadConfig(env) });
}