/**
 * Typed, validated tool definitions for the CineMind agent.
 * Every tool input and output is validated with Zod.
 * Tools are pure functions that call the backend API layer.
 */

import { z } from "zod";

/**
 * Base input shared by all movie-specific tools.
 */
const MovieIdInput = z.object({
  movie_id: z.string().min(1).max(64).describe("Provider movie ID (e.g., TMDB ID)"),
});

/**
 * Base output wrapper that includes provenance.
 */
function ToolOutput<T extends z.ZodTypeAny>(schema: T) {
  return z.object({
    success: z.boolean(),
    data: schema.nullable(),
    error: z.string().nullable(),
    provenance: z.object({
      sourceName: z.string(),
      sourceKind: z.enum(["database", "api", "user_data", "ml_model", "web_research", "static", "deterministic"]),
      sourceId: z.string(),
      retrievedAt: z.string(),
      confidence: z.number().min(0).max(1),
      ref: z.string().optional(),
    }).nullable(),
  });
}

/**
 * Tool 1: search_movies
 * Search for movies by title with optional year filter.
 */
export const searchMoviesInputSchema = z.object({
  title: z.string().min(1).max(200).describe("Movie title to search for"),
  year: z.number().int().min(1888).max(2100).optional().describe("Optional release year filter"),
  limit: z.number().int().min(1).max(50).default(10).describe("Maximum results to return"),
});

export const searchMoviesOutputSchema = ToolOutput(z.array(z.object({
  id: z.string(),
  title: z.string(),
  originalTitle: z.string().optional(),
  releaseYear: z.number().optional(),
  runtimeMinutes: z.number().optional(),
  overview: z.string().optional(),
  genre: z.array(z.string()),
  rating: z.object({ average: z.number(), votes: z.number() }).optional(),
  certification: z.string().optional(),
  posterPath: z.string().optional(),
  backdropPath: z.string().optional(),
})));

export type SearchMoviesInput = z.infer<typeof searchMoviesInputSchema>;
export type SearchMoviesOutput = z.infer<typeof searchMoviesOutputSchema>;

/**
 * Tool 2: get_movie_details
 * Get comprehensive movie details including all metadata.
 */
export const getMovieDetailsInputSchema = MovieIdInput;

export const getMovieDetailsOutputSchema = ToolOutput(z.object({
  id: z.string(),
  title: z.string(),
  originalTitle: z.string().optional(),
  releaseYear: z.number().optional(),
  runtimeMinutes: z.number().optional(),
  overview: z.string().optional(),
  tagline: z.string().optional(),
  imdbId: z.string().optional(),
  externalIds: z.record(z.unknown()).optional(),
  genre: z.array(z.string()),
  rating: z.object({ average: z.number(), votes: z.number() }).optional(),
  certification: z.string().optional(),
  posterPath: z.string().optional(),
  backdropPath: z.string().optional(),
  budget: z.number().optional(),
  revenue: z.number().optional(),
  productionCompanies: z.array(z.object({
    id: z.string(),
    name: z.string(),
    logoPath: z.string().optional(),
    originCountry: z.string().optional(),
  })).optional(),
}));

export type GetMovieDetailsInput = z.infer<typeof getMovieDetailsInputSchema>;
export type GetMovieDetailsOutput = z.infer<typeof getMovieDetailsOutputSchema>;

/**
 * Tool 3: get_movie_cast
 * Get cast credits for a movie.
 */
export const getMovieCastInputSchema = MovieIdInput.extend({
  limit: z.number().int().min(1).max(50).default(20).optional(),
});

export const getMovieCastOutputSchema = ToolOutput(z.object({
  id: z.string(),
  cast: z.array(z.object({
    personId: z.string(),
    name: z.string(),
    character: z.string(),
    order: z.number(),
    gender: z.enum(["female", "male", "non_binary", "unknown"]).optional(),
    profilePath: z.string().optional(),
    creditId: z.string().optional(),
  })),
}));

export type GetMovieCastInput = z.infer<typeof getMovieCastInputSchema>;
export type GetMovieCastOutput = z.infer<typeof getMovieCastOutputSchema>;

/**
 * Tool 4: get_movie_crew
 * Get crew credits for a movie.
 */
export const getMovieCrewInputSchema = MovieIdInput.extend({
  limit: z.number().int().min(1).max(50).default(50).optional(),
  department: z.string().optional().describe("Filter by department (e.g., Directing, Writing)"),
  job: z.string().optional().describe("Filter by job (e.g., Director, Screenplay)"),
});

export const getMovieCrewOutputSchema = ToolOutput(z.object({
  id: z.string(),
  crew: z.array(z.object({
    personId: z.string(),
    name: z.string(),
    department: z.string(),
    job: z.string(),
    gender: z.enum(["female", "male", "non_binary", "unknown"]).optional(),
    profilePath: z.string().optional(),
    creditId: z.string().optional(),
  })),
}));

export type GetMovieCrewInput = z.infer<typeof getMovieCrewInputSchema>;
export type GetMovieCrewOutput = z.infer<typeof getMovieCrewOutputSchema>;

/**
 * Tool 5: get_movie_financials
 * Get financial data for a movie.
 */
export const getMovieFinancialsInputSchema = MovieIdInput;

export const getMovieFinancialsOutputSchema = ToolOutput(z.object({
  id: z.string(),
  budget: z.number().optional(),
  revenue: z.number().optional(),
  currency: z.string(),
}));

export type GetMovieFinancialsInput = z.infer<typeof getMovieFinancialsInputSchema>;
export type GetMovieFinancialsOutput = z.infer<typeof getMovieFinancialsOutputSchema>;

/**
 * Tool 6: get_movie_ratings
 * Get aggregate ratings for a movie.
 */
export const getMovieRatingsInputSchema = MovieIdInput;

export const getMovieRatingsOutputSchema = ToolOutput(z.object({
  id: z.string(),
  average: z.number().optional(),
  votes: z.number().optional(),
  certification: z.string().optional(),
}));

export type GetMovieRatingsInput = z.infer<typeof getMovieRatingsInputSchema>;
export type GetMovieRatingsOutput = z.infer<typeof getMovieRatingsOutputSchema>;

/**
 * Tool 7: get_user_reviews
 * Get user reviews for a movie.
 */
export const getUserReviewsInputSchema = MovieIdInput.extend({
  limit: z.number().int().min(1).max(50).default(10).optional(),
  sort: z.enum(["newest", "oldest", "helpful", "rating_high", "rating_low"]).default("newest").optional(),
});

export const getUserReviewsOutputSchema = ToolOutput(z.object({
  id: z.string(),
  reviews: z.array(z.object({
    id: z.string(),
    author: z.string(),
    authorId: z.string().optional(),
    rating: z.number().min(0).max(10).optional(),
    content: z.string(),
    createdAt: z.string(),
    helpfulCount: z.number().optional(),
    isVerified: z.boolean().optional(),
  })),
  totalResults: z.number().optional(),
}));

export type GetUserReviewsInput = z.infer<typeof getUserReviewsInputSchema>;
export type GetUserReviewsOutput = z.infer<typeof getUserReviewsOutputSchema>;

/**
 * Tool 8: compare_movies
 * Compare multiple movies side by side.
 */
export const compareMoviesInputSchema = z.object({
  movie_ids: z.array(z.string().min(1).max(64)).min(2).max(5).describe("2-5 movie IDs to compare"),
  fields: z.array(z.enum([
    "basic", "ratings", "financials", "cast", "crew", "genres", "runtime", "certification", "companies"
  ])).default(["basic", "ratings", "financials"]).optional(),
});

export const compareMoviesOutputSchema = ToolOutput(z.object({
  comparison: z.array(z.object({
    movieId: z.string(),
    title: z.string(),
    releaseYear: z.number().optional(),
    runtimeMinutes: z.number().optional(),
    genre: z.array(z.string()),
    rating: z.object({ average: z.number(), votes: z.number() }).optional(),
    certification: z.string().optional(),
    budget: z.number().optional(),
    revenue: z.number().optional(),
cast: z.array(z.object({ name: z.string(), character: z.string() })).optional(),
      crew: z.array(z.object({ name: z.string(), job: z.string() })).optional(),
      companies: z.array(z.object({ name: z.string() })).optional(),
  })),
  summary: z.string().optional(),
}));

export type CompareMoviesInput = z.infer<typeof compareMoviesInputSchema>;
export type CompareMoviesOutput = z.infer<typeof compareMoviesOutputSchema>;

/**
 * Tool 9: recommend_movies
 * Get movie recommendations based on various criteria.
 */
export const recommendMoviesInputSchema = z.object({
  based_on: z.enum(["movie_id", "genres", "actors", "directors", "trending", "discovery"]).describe("Recommendation basis"),
  movie_id: z.string().min(1).max(64).optional().describe("Required when based_on=movie_id"),
  genres: z.array(z.string()).optional().describe("Genre filters"),
  actor_ids: z.array(z.string()).optional().describe("Actor IDs"),
  director_ids: z.array(z.string()).optional().describe("Director IDs"),
  limit: z.number().int().min(1).max(50).default(10).optional(),
  min_rating: z.number().min(0).max(10).optional(),
  year_from: z.number().int().min(1888).max(2100).optional(),
  year_to: z.number().int().min(1888).max(2100).optional(),
}).refine((data) => {
  if (data.based_on === "movie_id") {
    return data.movie_id !== undefined && data.movie_id.length > 0;
  }
  return true;
}, {
  message: "movie_id is required when based_on is 'movie_id'",
  path: ["movie_id"],
});

export const recommendMoviesOutputSchema = ToolOutput(z.array(z.object({
  id: z.string(),
  title: z.string(),
  releaseYear: z.number().optional(),
  genre: z.array(z.string()),
  rating: z.object({ average: z.number(), votes: z.number() }).optional(),
  overview: z.string().optional(),
  posterPath: z.string().optional(),
  reason: z.string().optional().describe("Why this was recommended"),
})));

export type RecommendMoviesInput = z.infer<typeof recommendMoviesInputSchema>;
export type RecommendMoviesOutput = z.infer<typeof recommendMoviesOutputSchema>;

/**
 * Tool 10: get_upcoming_movies
 * Get upcoming movie releases.
 */
export const getUpcomingMoviesInputSchema = z.object({
  limit: z.number().int().min(1).max(50).default(20).optional(),
  region: z.string().length(2).optional().describe("ISO 3166-1 alpha-2 region code"),
  genre: z.string().optional(),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const getUpcomingMoviesOutputSchema = ToolOutput(z.array(z.object({
  id: z.string(),
  title: z.string(),
  releaseYear: z.number().optional(),
  releaseDate: z.string().optional(),
  genre: z.array(z.string()),
  overview: z.string().optional(),
  posterPath: z.string().optional(),
  rating: z.object({ average: z.number(), votes: z.number() }).optional(),
})));

export type GetUpcomingMoviesInput = z.infer<typeof getUpcomingMoviesInputSchema>;
export type GetUpcomingMoviesOutput = z.infer<typeof getUpcomingMoviesOutputSchema>;

/**
 * Tool registry type mapping tool names to their input/output schemas.
 */
export const TOOL_SCHEMAS = {
  search_movies: { input: searchMoviesInputSchema, output: searchMoviesOutputSchema },
  get_movie_details: { input: getMovieDetailsInputSchema, output: getMovieDetailsOutputSchema },
  get_movie_cast: { input: getMovieCastInputSchema, output: getMovieCastOutputSchema },
  get_movie_crew: { input: getMovieCrewInputSchema, output: getMovieCrewOutputSchema },
  get_movie_financials: { input: getMovieFinancialsInputSchema, output: getMovieFinancialsOutputSchema },
  get_movie_ratings: { input: getMovieRatingsInputSchema, output: getMovieRatingsOutputSchema },
  get_user_reviews: { input: getUserReviewsInputSchema, output: getUserReviewsOutputSchema },
  compare_movies: { input: compareMoviesInputSchema, output: compareMoviesOutputSchema },
  recommend_movies: { input: recommendMoviesInputSchema, output: recommendMoviesOutputSchema },
  get_upcoming_movies: { input: getUpcomingMoviesInputSchema, output: getUpcomingMoviesOutputSchema },
} as const;

export type ToolName = keyof typeof TOOL_SCHEMAS;
export type ToolInput<T extends ToolName> = z.infer<typeof TOOL_SCHEMAS[T]["input"]>;
export type ToolOutput<T extends ToolName> = z.infer<typeof TOOL_SCHEMAS[T]["output"]>;

/**
 * All registered tool names (the allowlist).
 */
export const REGISTERED_TOOLS: readonly ToolName[] = [
  "search_movies",
  "get_movie_details",
  "get_movie_cast",
  "get_movie_crew",
  "get_movie_financials",
  "get_movie_ratings",
  "get_user_reviews",
  "compare_movies",
  "recommend_movies",
  "get_upcoming_movies",
] as const;

/**
 * Check if a tool name is registered.
 */
export function isRegisteredTool(name: string): name is ToolName {
  return REGISTERED_TOOLS.includes(name as ToolName);
}

/**
 * Get the input schema for a tool.
 */
export function getToolInputSchema<T extends ToolName>(name: T): typeof TOOL_SCHEMAS[T]["input"] {
  if (!isRegisteredTool(name)) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return TOOL_SCHEMAS[name].input;
}

/**
 * Get the output schema for a tool.
 */
export function getToolOutputSchema<T extends ToolName>(name: T): typeof TOOL_SCHEMAS[T]["output"] {
  if (!isRegisteredTool(name)) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return TOOL_SCHEMAS[name].output;
}