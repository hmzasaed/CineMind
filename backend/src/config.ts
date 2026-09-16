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
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
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