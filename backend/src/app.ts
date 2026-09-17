import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { loadConfig, resolveCorsOrigin, type AppConfig } from "./config.js";
import { loggerOptions } from "./logger.js";
import { createMovieDataAdapter } from "./providers/index.js";
import type { MovieDataAdapter, WatchlistStore } from "./providers/types.js";
import { createIngestionJobStore, type IngestionJobStore } from "./jobs/store.js";
import { createIngestionStore, type IngestionStore } from "./services/ingestion.js";
import { errorHandler } from "./middleware/error-handler.js";
import { makeRequestLogHook } from "./middleware/request-log.js";
import { makeOptionalAuth, makeRequireAppRole, makeRequireAuth } from "./auth/middleware.js";
import { createProfileStore } from "./auth/profile.js";
import { createTokenVerifier } from "./auth/verifier.js";
import type { ProfileRoleStore, TokenVerifier } from "./auth/types.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { registerMovieRoutes } from "./routes/movies.js";
import { registerWatchlistRoutes } from "./routes/watchlist.js";
import { registerFavoritesRoutes, registerWatchHistoryRoutes } from "./routes/library.js";
import { registerRatingRoutes } from "./routes/ratings.js";
import { registerReviewRoutes } from "./routes/reviews.js";
import { registerModerationRoutes } from "./routes/moderation.js";
import { registerProfileRoutes } from "./routes/profile.js";
import { registerChatRoutes } from "./routes/chat.js";
import { createLLMService, type LLMService } from "./services/llm/index.js";
import { createChatStore, type ChatStore } from "./chat/store.js";
import { ChatOrchestrator } from "./chat/orchestrator.js";
import { createWatchlistStore, createFavoritesStore, createWatchHistoryStore } from "./social/library-stores.js";
import { createRatingStore } from "./social/ratings-store.js";
import { createReviewStore } from "./social/reviews-store.js";
import { createModerationStore } from "./social/moderation-store.js";
import { createProfileStatsStore } from "./social/profile-stats-store.js";
import type {
  FavoritesStore,
  ModerationStore,
  ProfileStatsStore,
  RatingStore,
  ReviewStore,
  WatchHistoryStore,
} from "./social/types.js";

export interface AppDeps {
  config: AppConfig;
  /**
   * Token verification strategy. Defaults to Supabase JWKS when SUPABASE_URL
   * is set, otherwise HS256 with JWT_SECRET (local dev/tests).
   */
  verifier?: TokenVerifier;
  /** App-role resolution. Defaults to the Supabase admin service. */
  profileStore?: ProfileRoleStore;
  /** Movie data adapter. Defaults to the env-configured provider. */
  adapter?: MovieDataAdapter;
  /** Ingestion job store. Defaults to Supabase (or in-memory for dev/tests). */
  jobStore?: IngestionJobStore;
  /** Movie persistence (provider id -> internal uuid). Defaults to Supabase (or in-memory). */
  ingestionStore?: IngestionStore;
  /** Watchlist store. Defaults to Supabase (or in-memory for dev/tests). */
  watchlistStore?: WatchlistStore;
  /** Favorites store. Defaults to Supabase (or in-memory for dev/tests). */
  favoritesStore?: FavoritesStore;
  /** Watch-history store. Defaults to Supabase (or in-memory for dev/tests). */
  watchHistoryStore?: WatchHistoryStore;
  /** User movie rating store (separate from external/AI critic scores). */
  ratingStore?: RatingStore;
  /** Review store. */
  reviewStore?: ReviewStore;
  /** Moderation store (report triage, review status overrides). */
  moderationStore?: ModerationStore;
  /** Per-user profile statistics store. */
  profileStatsStore?: ProfileStatsStore;
  /** LLM service abstraction. Defaults to configured provider. */
  llmService?: LLMService;
  /** Chat and conversation persistence store. */
  chatStore?: ChatStore;
  /** Chat agent orchestrator. */
  orchestrator?: ChatOrchestrator;
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
    exposedHeaders: ["WWW-Authenticate", "X-Provider", "X-Provider-Cache"],
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

  const adapter = deps.adapter ?? createMovieDataAdapter(config);
  const jobStore = deps.jobStore ?? createIngestionJobStore(config);
  const ingestionStore = deps.ingestionStore ?? createIngestionStore(config);

  const watchlistStore = deps.watchlistStore ?? createWatchlistStore(config, adapter, ingestionStore);
  const favoritesStore = deps.favoritesStore ?? createFavoritesStore(config, adapter, ingestionStore);
  const watchHistoryStore = deps.watchHistoryStore ?? createWatchHistoryStore(config, adapter, ingestionStore);
  const ratingStore = deps.ratingStore ?? createRatingStore(config, adapter, ingestionStore);
  const reviewStore = deps.reviewStore ?? createReviewStore(config, adapter, ingestionStore);
  const moderationStore = deps.moderationStore ?? createModerationStore(config, reviewStore);
  const profileStatsStore =
    deps.profileStatsStore ??
    createProfileStatsStore(config, { watchlistStore, favoritesStore, watchHistoryStore, ratingStore, reviewStore });

  const optionalAuth = makeOptionalAuth(verifier);

  const llmService = deps.llmService ?? createLLMService(config);
  const chatStore = deps.chatStore ?? createChatStore(config);
  const orchestrator =
    deps.orchestrator ??
    new ChatOrchestrator({
      adapter,
      llmService,
    });

  registerHealthRoutes(app);
  registerMovieRoutes(app, adapter);
  registerWatchlistRoutes(app, adapter, watchlistStore, requireAuth);
  registerFavoritesRoutes(app, adapter, favoritesStore, requireAuth);
  registerWatchHistoryRoutes(app, adapter, watchHistoryStore, requireAuth);
  registerRatingRoutes(app, adapter, ratingStore, requireAuth);
  registerReviewRoutes(app, {
    provider: adapter,
    store: reviewStore,
    requireAuth,
    optionalAuth,
    reviewRateLimit: { max: config.reviewRateLimitMax, timeWindow: config.reviewRateLimitWindowMs },
    reportRateLimit: { max: config.reportRateLimitMax, timeWindow: config.reportRateLimitWindowMs },
  });
  registerModerationRoutes(app, { store: moderationStore, requireAuth, requireAdmin });
  registerProfileRoutes(app, { profileStatsStore, requireAuth });
  registerAuthRoutes(app, { requireAuth, requireAdmin, profileStore });
  registerJobRoutes(app, { jobStore, requireAuth, requireAdmin });
  registerChatRoutes(app, { orchestrator, chatStore });

  return app;
}

export function appFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<FastifyInstance> {
  return buildApp({ config: loadConfig(env) });
}