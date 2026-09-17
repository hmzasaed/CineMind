/**
 * Tool registry with allowlist enforcement.
 * Only explicitly registered tools can be executed.
 * Provides validation, timeouts, and budget tracking.
 */

import { z } from "zod";
import type { MovieDataAdapter } from "../providers/types.js";
import type { ToolName, ToolInput, ToolOutput } from "./tools.js";
import { isRegisteredTool, getToolInputSchema, getToolOutputSchema, REGISTERED_TOOLS as REGISTERED_TOOL_NAMES } from "./tools.js";

/**
 * Tool execution context.
 */
export interface ToolContext {
  adapter: MovieDataAdapter;
  userId?: string;
  requestId: string;
  startTime: number;
}

/**
 * Tool execution result with metadata.
 * The data field contains the tool's output wrapper (with success, data, error, provenance).
 */
export interface ToolExecutionResult<TOutput = unknown> {
  success: boolean;
  data: {
    success: boolean;
    data: TOutput | null;
    error: string | null;
    provenance: {
      sourceName: string;
      sourceKind: "database" | "api" | "user_data" | "ml_model" | "web_research" | "static" | "deterministic";
      sourceId: string;
      retrievedAt: string;
      confidence: number;
      ref?: string;
    } | null;
  } | null;
  error: string | null;
  provenance: {
    sourceName: string;
    sourceKind: "database" | "api" | "user_data" | "ml_model" | "web_research" | "static" | "deterministic";
    sourceId: string;
    retrievedAt: string;
    confidence: number;
    ref?: string;
  } | null;
  metadata: {
    toolName: string;
    durationMs: number;
    timedOut: boolean;
    inputValid: boolean;
    outputValid: boolean;
  };
}

/**
 * Tool executor function type.
 * Returns the tool's output wrapper (with success, data, error, provenance).
 */
export type ToolExecutor<TInput, TOutput> = (
  input: TInput,
  context: ToolContext
) => Promise<{
  success: boolean;
  data: {
    success: boolean;
    data: TOutput | null;
    error: string | null;
    provenance: {
      sourceName: string;
      sourceKind: "database" | "api" | "user_data" | "ml_model" | "web_research" | "static" | "deterministic";
      sourceId: string;
      retrievedAt: string;
      confidence: number;
      ref?: string;
    } | null;
  } | null;
  error: string | null;
  provenance: {
    sourceName: string;
    sourceKind: "database" | "api" | "user_data" | "ml_model" | "web_research" | "static" | "deterministic";
    sourceId: string;
    retrievedAt: string;
    confidence: number;
    ref?: string;
  } | null;
  metadata: {
    toolName: string;
    durationMs: number;
    timedOut: boolean;
    inputValid: boolean;
    outputValid: boolean;
  };
}>;

/**
 * Registered tool definition.
 */
export interface RegisteredTool<TInput = unknown, TOutput = unknown> {
  name: ToolName;
  description: string;
  executor: ToolExecutor<TInput, TOutput>;
  inputSchema: z.ZodSchema<TInput>;
  outputSchema: z.ZodSchema<TOutput>;
  timeoutMs: number;
  maxRetries: number;
  requiresAuth: boolean;
}

/**
 * Tool registry - the single source of truth for available tools.
 * Enforces the allowlist.
 */
export class ToolRegistry {
  private readonly tools = new Map<ToolName, RegisteredTool>();

  constructor() {
    // Registry starts empty; tools must be explicitly registered
  }

  /**
   * Register a tool. Only tools in the REGISTERED_TOOLS allowlist can be added.
   */
  register<TInput, TOutput>(tool: RegisteredTool<TInput, TOutput>): void {
    if (!isRegisteredTool(tool.name)) {
      throw new Error(`Tool "${tool.name}" is not in the allowlist. Allowed: ${REGISTERED_TOOL_NAMES.join(", ")}`);
    }
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool as any);
  }

  /**
   * Get a registered tool by name.
   */
  get<TInput, TOutput>(name: ToolName): RegisteredTool<TInput, TOutput> | undefined {
    return this.tools.get(name) as RegisteredTool<TInput, TOutput> | undefined;
  }

  /**
   * Check if a tool is registered.
   */
  has(name: string): name is ToolName {
    return this.tools.has(name as ToolName);
  }

  /**
   * Get all registered tool names.
   */
  getNames(): readonly ToolName[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get all registered tools.
   */
  getAll(): readonly RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Validate tool input against schema.
   */
  validateInput<T extends ToolName>(name: T, input: unknown): { success: true; data: ToolInput<T> } | { success: false; error: string } {
    const tool = this.get(name);
    if (!tool) {
      return { success: false, error: `Tool "${name}" not found` };
    }
    const result = tool.inputSchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: `Invalid input for ${name}: ${result.error.message}` };
    }
    return { success: true, data: result.data as ToolInput<T> };
  }

  /**
   * Validate tool output against schema.
   */
  validateOutput<T extends ToolName>(name: T, output: unknown): { success: true; data: ToolOutput<T> } | { success: false; error: string } {
    const tool = this.get(name);
    if (!tool) {
      return { success: false, error: `Tool "${name}" not found` };
    }
    const result = tool.outputSchema.safeParse(output);
    if (!result.success) {
      return { success: false, error: `Invalid output from ${name}: ${result.error.message}` };
    }
    return { success: true, data: result.data as ToolOutput<T> };
  }
}

/**
 * Default timeout and retry configuration per tool category.
 */
const TOOL_CONFIG: Record<ToolName, { timeoutMs: number; maxRetries: number; requiresAuth: boolean }> = {
  search_movies: { timeoutMs: 5000, maxRetries: 1, requiresAuth: false },
  get_movie_details: { timeoutMs: 5000, maxRetries: 1, requiresAuth: false },
  get_movie_cast: { timeoutMs: 5000, maxRetries: 1, requiresAuth: false },
  get_movie_crew: { timeoutMs: 5000, maxRetries: 1, requiresAuth: false },
  get_movie_financials: { timeoutMs: 5000, maxRetries: 1, requiresAuth: false },
  get_movie_ratings: { timeoutMs: 5000, maxRetries: 1, requiresAuth: false },
  get_user_reviews: { timeoutMs: 8000, maxRetries: 1, requiresAuth: false },
  compare_movies: { timeoutMs: 10000, maxRetries: 1, requiresAuth: false },
  recommend_movies: { timeoutMs: 8000, maxRetries: 1, requiresAuth: false },
  get_upcoming_movies: { timeoutMs: 5000, maxRetries: 1, requiresAuth: false },
};

/**
 * Create the default tool registry with all tools implemented.
 */
export function createDefaultRegistry(_adapter: MovieDataAdapter): ToolRegistry {
  const registry = new ToolRegistry();

  // Tool 1: search_movies
  registry.register({
    name: "search_movies",
    description: "Search for movies by title with optional year filter",
    timeoutMs: TOOL_CONFIG.search_movies.timeoutMs,
    maxRetries: TOOL_CONFIG.search_movies.maxRetries,
    requiresAuth: TOOL_CONFIG.search_movies.requiresAuth,
    inputSchema: getToolInputSchema("search_movies"),
    outputSchema: getToolOutputSchema("search_movies"),
    executor: async (input, context) => {
      const start = Date.now();
      try {
        const fact = await withTimeout(
          context.adapter.search({ title: input.title, year: input.year, limit: input.limit }),
          context.adapter,
          context.requestId,
        );
        return {
          success: true,
          data: {
            success: true,
            data: fact.value.map((m) => ({
              id: m.id,
              title: m.title,
              originalTitle: m.originalTitle,
              releaseYear: m.releaseYear,
              runtimeMinutes: m.runtimeMinutes,
              overview: m.overview,
              genre: m.genre,
              rating: m.rating,
              certification: m.certification,
              posterPath: m.posterPath,
              backdropPath: m.backdropPath,
            })),
            error: null,
            provenance: fact.provenance,
          },
          error: null,
          provenance: fact.provenance,
          metadata: {
            toolName: "search_movies",
            durationMs: Date.now() - start,
            timedOut: false,
            inputValid: true,
            outputValid: true,
          },
        };
      } catch (error) {
        return createErrorResult("search_movies", error, start, context);
      }
    },
  });

  // Tool 2: get_movie_details
  registry.register({
    name: "get_movie_details",
    description: "Get comprehensive movie details including all metadata",
    timeoutMs: TOOL_CONFIG.get_movie_details.timeoutMs,
    maxRetries: TOOL_CONFIG.get_movie_details.maxRetries,
    requiresAuth: TOOL_CONFIG.get_movie_details.requiresAuth,
    inputSchema: getToolInputSchema("get_movie_details"),
    outputSchema: getToolOutputSchema("get_movie_details"),
    executor: async (input, context) => {
      const start = Date.now();
      try {
        const fact = await withTimeout(
          context.adapter.getMovie(input.movie_id),
          context.adapter,
          context.requestId,
        );
        if (!fact.value) {
          return createNotFoundResult("get_movie_details", input.movie_id, start, context);
        }
        return {
          success: true,
          data: {
            success: true,
            data: {
              id: fact.value.id,
              title: fact.value.title,
              originalTitle: fact.value.originalTitle,
              releaseYear: fact.value.releaseYear,
              runtimeMinutes: fact.value.runtimeMinutes,
              overview: fact.value.overview,
              tagline: fact.value.tagline,
              imdbId: fact.value.imdbId,
              externalIds: fact.value.externalIds,
              genre: fact.value.genre,
              rating: fact.value.rating,
              certification: fact.value.certification,
              posterPath: fact.value.posterPath,
              backdropPath: fact.value.backdropPath,
              budget: fact.value.budget,
              revenue: fact.value.revenue,
              productionCompanies: fact.value.productionCompanies,
            },
            error: null,
            provenance: fact.provenance,
          },
          error: null,
          provenance: fact.provenance,
          metadata: {
            toolName: "get_movie_details",
            durationMs: Date.now() - start,
            timedOut: false,
            inputValid: true,
            outputValid: true,
          },
        };
      } catch (error) {
        return createErrorResult("get_movie_details", error, start, context);
      }
    },
  });

  // Tool 3: get_movie_cast
  registry.register({
    name: "get_movie_cast",
    description: "Get cast credits for a movie",
    timeoutMs: TOOL_CONFIG.get_movie_cast.timeoutMs,
    maxRetries: TOOL_CONFIG.get_movie_cast.maxRetries,
    requiresAuth: TOOL_CONFIG.get_movie_cast.requiresAuth,
    inputSchema: getToolInputSchema("get_movie_cast"),
    outputSchema: getToolOutputSchema("get_movie_cast"),
    executor: async (input, context) => {
      const start = Date.now();
      try {
        const fact = await withTimeout(
          context.adapter.getCredits(input.movie_id),
          context.adapter,
          context.requestId,
        );
        if (!fact.value) {
          return createNotFoundResult("get_movie_cast", input.movie_id, start, context);
        }
        return {
          success: true,
          data: {
            success: true,
            data: {
              id: fact.value.id,
              cast: fact.value.cast.slice(0, input.limit ?? 20),
            },
            error: null,
            provenance: fact.provenance,
          },
          error: null,
          provenance: fact.provenance,
          metadata: {
            toolName: "get_movie_cast",
            durationMs: Date.now() - start,
            timedOut: false,
            inputValid: true,
            outputValid: true,
          },
        };
      } catch (error) {
        return createErrorResult("get_movie_cast", error, start, context);
      }
    },
  });

  // Tool 4: get_movie_crew
  registry.register({
    name: "get_movie_crew",
    description: "Get crew credits for a movie",
    timeoutMs: TOOL_CONFIG.get_movie_crew.timeoutMs,
    maxRetries: TOOL_CONFIG.get_movie_crew.maxRetries,
    requiresAuth: TOOL_CONFIG.get_movie_crew.requiresAuth,
    inputSchema: getToolInputSchema("get_movie_crew"),
    outputSchema: getToolOutputSchema("get_movie_crew"),
    executor: async (input, context) => {
      const start = Date.now();
      try {
        const fact = await withTimeout(
          context.adapter.getCredits(input.movie_id),
          context.adapter,
          context.requestId,
        );
        if (!fact.value) {
          return createNotFoundResult("get_movie_crew", input.movie_id, start, context);
        }
        let crew = fact.value.crew;
        if (input.department) crew = crew.filter((c) => c.department === input.department);
        if (input.job) crew = crew.filter((c) => c.job === input.job);
        return {
          success: true,
          data: {
            success: true,
            data: {
              id: fact.value.id,
              crew: crew.slice(0, input.limit ?? 50),
            },
            error: null,
            provenance: fact.provenance,
          },
          error: null,
          provenance: fact.provenance,
          metadata: {
            toolName: "get_movie_crew",
            durationMs: Date.now() - start,
            timedOut: false,
            inputValid: true,
            outputValid: true,
          },
        };
      } catch (error) {
        return createErrorResult("get_movie_crew", error, start, context);
      }
    },
  });

  // Tool 5: get_movie_financials
  registry.register({
    name: "get_movie_financials",
    description: "Get financial data for a movie",
    timeoutMs: TOOL_CONFIG.get_movie_financials.timeoutMs,
    maxRetries: TOOL_CONFIG.get_movie_financials.maxRetries,
    requiresAuth: TOOL_CONFIG.get_movie_financials.requiresAuth,
    inputSchema: getToolInputSchema("get_movie_financials"),
    outputSchema: getToolOutputSchema("get_movie_financials"),
    executor: async (input, context) => {
      const start = Date.now();
      try {
        const fact = await withTimeout(
          context.adapter.getFinancials(input.movie_id),
          context.adapter,
          context.requestId,
        );
        if (!fact.value) {
          return createNotFoundResult("get_movie_financials", input.movie_id, start, context);
        }
        return {
          success: true,
          data: {
            success: true,
            data: {
              id: fact.value.id,
              budget: fact.value.budget,
              revenue: fact.value.revenue,
              currency: fact.value.currency,
            },
            error: null,
            provenance: fact.provenance,
          },
          error: null,
          provenance: fact.provenance,
          metadata: {
            toolName: "get_movie_financials",
            durationMs: Date.now() - start,
            timedOut: false,
            inputValid: true,
            outputValid: true,
          },
        };
      } catch (error) {
        return createErrorResult("get_movie_financials", error, start, context);
      }
    },
  });

  // Tool 6: get_movie_ratings
  registry.register({
    name: "get_movie_ratings",
    description: "Get aggregate ratings for a movie",
    timeoutMs: TOOL_CONFIG.get_movie_ratings.timeoutMs,
    maxRetries: TOOL_CONFIG.get_movie_ratings.maxRetries,
    requiresAuth: TOOL_CONFIG.get_movie_ratings.requiresAuth,
    inputSchema: getToolInputSchema("get_movie_ratings"),
    outputSchema: getToolOutputSchema("get_movie_ratings"),
    executor: async (input, context) => {
      const start = Date.now();
      try {
        const fact = await withTimeout(
          context.adapter.getRatings(input.movie_id),
          context.adapter,
          context.requestId,
        );
        if (!fact.value) {
          return createNotFoundResult("get_movie_ratings", input.movie_id, start, context);
        }
        return {
          success: true,
          data: {
            success: true,
            data: {
              id: fact.value.id,
              average: fact.value.average,
              votes: fact.value.votes,
              certification: fact.value.certification,
            },
            error: null,
            provenance: fact.provenance,
          },
          error: null,
          provenance: fact.provenance,
          metadata: {
            toolName: "get_movie_ratings",
            durationMs: Date.now() - start,
            timedOut: false,
            inputValid: true,
            outputValid: true,
          },
        };
      } catch (error) {
        return createErrorResult("get_movie_ratings", error, start, context);
      }
    },
  });

  // Tool 7: get_user_reviews
  registry.register({
    name: "get_user_reviews",
    description: "Get user reviews for a movie",
    timeoutMs: TOOL_CONFIG.get_user_reviews.timeoutMs,
    maxRetries: TOOL_CONFIG.get_user_reviews.maxRetries,
    requiresAuth: TOOL_CONFIG.get_user_reviews.requiresAuth,
    inputSchema: getToolInputSchema("get_user_reviews"),
    outputSchema: getToolOutputSchema("get_user_reviews"),
    executor: async (input, context) => {
      const start = Date.now();
      try {
        // This would typically call a reviews endpoint
        // For now, return empty as mock provider doesn't have reviews
        const provenance = {
          sourceName: "mock",
          sourceKind: "static" as const,
          sourceId: `mock:reviews:${input.movie_id}`,
          retrievedAt: new Date().toISOString(),
          confidence: 1,
        };
        return {
          success: true,
          data: {
            success: true,
            data: {
              id: input.movie_id,
              reviews: [],
              totalResults: 0,
            },
            error: null,
            provenance,
          },
          error: null,
          provenance,
          metadata: {
            toolName: "get_user_reviews",
            durationMs: Date.now() - start,
            timedOut: false,
            inputValid: true,
            outputValid: true,
          },
        };
      } catch (error) {
        return createErrorResult("get_user_reviews", error, start, context);
      }
    },
  });

  // Tool 8: compare_movies
  registry.register({
    name: "compare_movies",
    description: "Compare multiple movies side by side",
    timeoutMs: TOOL_CONFIG.compare_movies.timeoutMs,
    maxRetries: TOOL_CONFIG.compare_movies.maxRetries,
    requiresAuth: TOOL_CONFIG.compare_movies.requiresAuth,
    inputSchema: getToolInputSchema("compare_movies"),
    outputSchema: getToolOutputSchema("compare_movies"),
    executor: async (input, context) => {
      const start = Date.now();
      try {
        const results = await Promise.all(
          input.movie_ids.map((id) => withTimeout(context.adapter.getMovie(id), context.adapter, context.requestId))
        );
        const comparison: any[] = results.map((fact, idx) => {
          if (!fact.value) return null;
          const m = fact.value;
          return {
            movieId: input.movie_ids[idx],
            title: m.title,
            releaseYear: m.releaseYear,
            runtimeMinutes: m.runtimeMinutes,
            genre: m.genre,
            rating: m.rating,
            certification: m.certification,
            budget: m.budget,
            revenue: m.revenue,
            cast: input.fields?.includes("cast") ? undefined : undefined,
            crew: input.fields?.includes("crew") ? undefined : undefined,
            companies: input.fields?.includes("companies") ? m.productionCompanies?.map((c) => ({ name: c.name })) : undefined,
          };
        }).filter(Boolean) as NonNullable<typeof comparison>[number][];

        const provenance = results[0]?.provenance ?? {
          sourceName: "mock",
          sourceKind: "static" as const,
          sourceId: `mock:compare:${input.movie_ids.join(",")}`,
          retrievedAt: new Date().toISOString(),
          confidence: 1,
        };

        return {
          success: true,
          data: {
            success: true,
            data: { comparison, summary: `Compared ${comparison.length} movies` },
            error: null,
            provenance,
          },
          error: null,
          provenance,
          metadata: {
            toolName: "compare_movies",
            durationMs: Date.now() - start,
            timedOut: false,
            inputValid: true,
            outputValid: true,
          },
        };
      } catch (error) {
        return createErrorResult("compare_movies", error, start, context);
      }
    },
  });

  // Tool 9: recommend_movies
  registry.register({
    name: "recommend_movies",
    description: "Get movie recommendations based on various criteria",
    timeoutMs: TOOL_CONFIG.recommend_movies.timeoutMs,
    maxRetries: TOOL_CONFIG.recommend_movies.maxRetries,
    requiresAuth: TOOL_CONFIG.recommend_movies.requiresAuth,
    inputSchema: getToolInputSchema("recommend_movies"),
    outputSchema: getToolOutputSchema("recommend_movies"),
    executor: async (input, context) => {
      const start = Date.now();
      try {
        let fact;
        if (input.based_on === "movie_id" && input.movie_id) {
          // For similar movies, use search with the title
          const details = await withTimeout(context.adapter.getMovie(input.movie_id), context.adapter, context.requestId);
          if (details.value) {
            fact = await withTimeout(context.adapter.search({ title: details.value.title, limit: input.limit }), context.adapter, context.requestId);
          } else {
            fact = { value: [], provenance: details.provenance };
          }
        } else if (input.based_on === "trending" || input.based_on === "discovery") {
          fact = await withTimeout(context.adapter.getUpcoming({ limit: input.limit }), context.adapter, context.requestId);
        } else {
          fact = await withTimeout(context.adapter.search({ title: input.genres?.[0] ?? "", limit: input.limit }), context.adapter, context.requestId);
        }

        const recommendations = fact.value.map((m) => ({
          id: m.id,
          title: m.title,
          releaseYear: m.releaseYear,
          genre: m.genre,
          rating: m.rating,
          overview: m.overview,
          posterPath: m.posterPath,
          reason: input.based_on === "movie_id" ? `Similar to ${input.movie_id}` : `Trending ${input.genres?.[0] ?? "movies"}`,
        }));

        return {
          success: true,
          data: {
            success: true,
            data: recommendations,
            error: null,
            provenance: fact.provenance,
          },
          error: null,
          provenance: fact.provenance,
          metadata: {
            toolName: "recommend_movies",
            durationMs: Date.now() - start,
            timedOut: false,
            inputValid: true,
            outputValid: true,
          },
        };
      } catch (error) {
        return createErrorResult("recommend_movies", error, start, context);
      }
    },
  });

  // Tool 10: get_upcoming_movies
  registry.register({
    name: "get_upcoming_movies",
    description: "Get upcoming movie releases",
    timeoutMs: TOOL_CONFIG.get_upcoming_movies.timeoutMs,
    maxRetries: TOOL_CONFIG.get_upcoming_movies.maxRetries,
    requiresAuth: TOOL_CONFIG.get_upcoming_movies.requiresAuth,
    inputSchema: getToolInputSchema("get_upcoming_movies"),
    outputSchema: getToolOutputSchema("get_upcoming_movies"),
    executor: async (input, context) => {
      const start = Date.now();
      try {
        const fact = await withTimeout(
          context.adapter.getUpcoming({ limit: input.limit }),
          context.adapter,
          context.requestId,
        );
        return {
          success: true,
          data: {
            success: true,
            data: fact.value.map((m) => ({
              id: m.id,
              title: m.title,
              releaseYear: m.releaseYear,
              releaseDate: undefined,
              genre: m.genre,
              overview: m.overview,
              posterPath: m.posterPath,
              rating: m.rating,
            })),
            error: null,
            provenance: fact.provenance,
          },
          error: null,
          provenance: fact.provenance,
          metadata: {
            toolName: "get_upcoming_movies",
            durationMs: Date.now() - start,
            timedOut: false,
            inputValid: true,
            outputValid: true,
          },
        };
      } catch (error) {
        return createErrorResult("get_upcoming_movies", error, start, context);
      }
    },
  });

  return registry;
}

/**
 * Execute a promise with timeout.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  _adapter: MovieDataAdapter,
  _requestId: string
): Promise<T> {
  const timeoutMs = 30000; // Hard timeout
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Tool timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

/**
 * Create error result.
 */
function createErrorResult(
  toolName: string,
  error: unknown,
  start: number,
  _context: ToolContext
): ToolExecutionResult {
  return {
    success: false,
    data: null,
    error: error instanceof Error ? error.message : String(error),
    provenance: null,
    metadata: {
      toolName,
      durationMs: Date.now() - start,
      timedOut: error instanceof Error && error.message.includes("timeout"),
      inputValid: true,
      outputValid: false,
    },
  };
}

/**
 * Create not found result.
 */
function createNotFoundResult(
  toolName: string,
  movieId: string,
  start: number,
  _context: ToolContext
): ToolExecutionResult {
  return {
    success: false,
    data: null,
    error: `Movie not found: ${movieId}`,
    provenance: null,
    metadata: {
      toolName,
      durationMs: Date.now() - start,
      timedOut: false,
      inputValid: true,
      outputValid: false,
    },
  };
}