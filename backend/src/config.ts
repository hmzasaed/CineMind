import { z } from "zod";

const envSchema = z.object({
  BACKEND_PORT: z.coerce.number().int().positive().default(3000),
  BACKEND_LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  CORS_ORIGIN: z.string().default("*"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(24).optional(),
  MOVIE_PROVIDER: z.enum(["tmdb", "mock"]).default("mock"),
  TMDB_API_KEY: z.string().optional(),
  TMDB_API_BASE_URL: z.string().url().default("https://api.themoviedb.org/3"),
  PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  PROVIDER_RETRY_LIMIT: z.coerce.number().int().min(1).max(5).default(2),
  PROVIDER_BASE_BACKOFF_MS: z.coerce.number().int().positive().default(200),
  PROVIDER_CACHE_TTL_MS: z.coerce.number().int().nonnegative().default(300_000),
  PROVIDER_CACHE_STALE_ON_ERROR: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  JOB_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  LLM_PROVIDER: z.enum(["mock", "rule-based", "openai", "gemini", "groq", "mistral"]).default("mock"),
  LLM_MODEL: z.string().default("mock-model"),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  REVIEW_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  REVIEW_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(3_600_000),
  REPORT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  REPORT_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(3_600_000),
});

export interface AppConfig {
  port: number;
  logLevel: string;
  rateLimitMaxRequests: number;
  rateLimitWindowMs: number;
  corsOrigin: string;
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
  supabaseServiceRoleKey: string | undefined;
  jwtSecret: string | undefined;
  movieProvider: "tmdb" | "mock";
  tmdbApiKey: string | undefined;
  tmdbApiBaseUrl: string;
  providerTimeoutMs: number;
  providerRetryLimit: number;
  providerBaseBackoffMs: number;
  providerCacheTtlMs: number;
  providerCacheStaleOnError: boolean;
  jobPollIntervalMs: number;
  llmProvider: "mock" | "rule-based" | "openai" | "gemini" | "groq" | "mistral";
  llmModel: string;
  openaiApiKey: string | undefined;
  geminiApiKey: string | undefined;
  groqApiKey: string | undefined;
  mistralApiKey: string | undefined;
  llmTimeoutMs: number;
  llmMaxRetries: number;
  reviewRateLimitMax: number;
  reviewRateLimitWindowMs: number;
  reportRateLimitMax: number;
  reportRateLimitWindowMs: number;
}

/**
 * A var that is present but blank (`JWT_SECRET=` in a .env template) means
 * "not set", not "set to empty string" — otherwise an untouched .env line
 * fails validation (e.g. min-length) instead of falling back to its default
 * or optional branch.
 */
function withoutBlanks(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const cleaned: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string" && value.trim() === "") continue;
    cleaned[key] = value;
  }
  return cleaned;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(withoutBlanks(env));
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${message}`);
  }
  const v = parsed.data;
  return {
    port: v.BACKEND_PORT,
    logLevel: v.BACKEND_LOG_LEVEL,
    rateLimitMaxRequests: v.RATE_LIMIT_MAX_REQUESTS,
    rateLimitWindowMs: v.RATE_LIMIT_WINDOW_MS,
    corsOrigin: v.CORS_ORIGIN,
    supabaseUrl: v.SUPABASE_URL,
    supabaseAnonKey: v.SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: v.SUPABASE_SERVICE_ROLE_KEY,
    jwtSecret: v.JWT_SECRET,
    movieProvider: v.MOVIE_PROVIDER,
    tmdbApiKey: v.TMDB_API_KEY,
    tmdbApiBaseUrl: v.TMDB_API_BASE_URL,
    providerTimeoutMs: v.PROVIDER_TIMEOUT_MS,
    providerRetryLimit: v.PROVIDER_RETRY_LIMIT,
    providerBaseBackoffMs: v.PROVIDER_BASE_BACKOFF_MS,
    providerCacheTtlMs: v.PROVIDER_CACHE_TTL_MS,
    providerCacheStaleOnError: v.PROVIDER_CACHE_STALE_ON_ERROR,
    jobPollIntervalMs: v.JOB_POLL_INTERVAL_MS,
    llmProvider: v.LLM_PROVIDER,
    llmModel: v.LLM_MODEL,
    openaiApiKey: v.OPENAI_API_KEY,
    geminiApiKey: v.GEMINI_API_KEY,
    groqApiKey: v.GROQ_API_KEY,
    mistralApiKey: v.MISTRAL_API_KEY,
    llmTimeoutMs: v.LLM_TIMEOUT_MS,
    llmMaxRetries: v.LLM_MAX_RETRIES,
    reviewRateLimitMax: v.REVIEW_RATE_LIMIT_MAX,
    reviewRateLimitWindowMs: v.REVIEW_RATE_LIMIT_WINDOW_MS,
    reportRateLimitMax: v.REPORT_RATE_LIMIT_MAX,
    reportRateLimitWindowMs: v.REPORT_RATE_LIMIT_WINDOW_MS,
  };
}

/**
 * Map the CORS_ORIGIN env value to what @fastify/cors accepts. "*" (default)
 * allows any origin without credentials; a comma-separated list is matched
 * exactly.
 */
export function resolveCorsOrigin(raw: string): string | string[] {
  const value = raw.trim();
  if (value === "" || value === "*" || value === "true") return "*";
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}