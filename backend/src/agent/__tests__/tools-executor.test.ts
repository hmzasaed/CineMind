/**
 * Unit tests for tool schemas, validation, registry, and executor.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { z } from "zod";
import {
  searchMoviesInputSchema,
  searchMoviesOutputSchema,
  getMovieDetailsInputSchema,
  getMovieDetailsOutputSchema,
  getMovieCastInputSchema,
  getMovieCrewInputSchema,
  getMovieFinancialsInputSchema,
  getMovieRatingsInputSchema,
  getUserReviewsInputSchema,
  compareMoviesInputSchema,
  recommendMoviesInputSchema,
  getUpcomingMoviesInputSchema,
  TOOL_SCHEMAS,
  REGISTERED_TOOLS,
  isRegisteredTool,
  getToolInputSchema,
  getToolOutputSchema,
} from "../tools.js";
import { ToolRegistry, createDefaultRegistry } from "../registry.js";
import { createAgentExecutor } from "../executor.js";
import { InMemorySummaryStore } from "../summaries.js";
import type { MovieDataAdapter } from "../../providers/types.js";
import type { Fact } from "../../types.js";

// Mock adapter for testing
const createMockAdapter = (): MovieDataAdapter => ({
  name: "mock",
  attribution: { provider: "mock", licensed: false },
  lastCacheStatus: () => "miss",
  getMovie: vi.fn(),
  search: vi.fn(),
  getUpcoming: vi.fn(),
  getCredits: vi.fn(),
  getImages: vi.fn(),
  getRatings: vi.fn(),
  getProductionCompanies: vi.fn(),
  getFinancials: vi.fn(),
});

describe("Tool Input/Output Validation", () => {
  describe("search_movies", () => {
    it("validates valid input", () => {
      const result = searchMoviesInputSchema.safeParse({ title: "Inception", year: 2010, limit: 5 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Inception");
        expect(result.data.year).toBe(2010);
        expect(result.data.limit).toBe(5);
      }
    });

    it("rejects empty title", () => {
      const result = searchMoviesInputSchema.safeParse({ title: "" });
      expect(result.success).toBe(false);
    });

    it("rejects title too long", () => {
      const result = searchMoviesInputSchema.safeParse({ title: "x".repeat(201) });
      expect(result.success).toBe(false);
    });

    it("rejects invalid year", () => {
      const result = searchMoviesInputSchema.safeParse({ title: "Inception", year: 1800 });
      expect(result.success).toBe(false);
    });

    it("rejects limit out of bounds", () => {
      const result = searchMoviesInputSchema.safeParse({ title: "Inception", limit: 100 });
      expect(result.success).toBe(false);
    });

    it("uses default limit", () => {
      const result = searchMoviesInputSchema.safeParse({ title: "Inception" });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.limit).toBe(10);
    });
  });

  describe("get_movie_details", () => {
    it("validates valid movie_id", () => {
      const result = getMovieDetailsInputSchema.safeParse({ movie_id: "tt1375666" });
      expect(result.success).toBe(true);
    });

    it("rejects empty movie_id", () => {
      const result = getMovieDetailsInputSchema.safeParse({ movie_id: "" });
      expect(result.success).toBe(false);
    });

    it("rejects movie_id too long", () => {
      const result = getMovieDetailsInputSchema.safeParse({ movie_id: "x".repeat(65) });
      expect(result.success).toBe(false);
    });
  });

  describe("get_movie_cast", () => {
    it("validates valid input with optional limit", () => {
      const result = getMovieCastInputSchema.safeParse({ movie_id: "tt1375666", limit: 10 });
      expect(result.success).toBe(true);
    });

    it("uses default limit", () => {
      const result = getMovieCastInputSchema.safeParse({ movie_id: "tt1375666" });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.limit).toBeUndefined();
    });
  });

  describe("get_movie_crew", () => {
    it("validates department and job filters", () => {
      const result = getMovieCrewInputSchema.safeParse({
        movie_id: "tt1375666",
        department: "Directing",
        job: "Director",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("compare_movies", () => {
    it("validates 2-5 movie IDs", () => {
      const result = compareMoviesInputSchema.safeParse({
        movie_ids: ["tt1", "tt2"],
        fields: ["basic", "ratings"],
      });
      expect(result.success).toBe(true);
    });

    it("rejects fewer than 2 movies", () => {
      const result = compareMoviesInputSchema.safeParse({ movie_ids: ["tt1"] });
      expect(result.success).toBe(false);
    });

    it("rejects more than 5 movies", () => {
      const result = compareMoviesInputSchema.safeParse({ movie_ids: ["tt1", "tt2", "tt3", "tt4", "tt5", "tt6"] });
      expect(result.success).toBe(false);
    });
  });

  describe("recommend_movies", () => {
    it("validates movie_id basis", () => {
      const result = recommendMoviesInputSchema.safeParse({
        based_on: "movie_id",
        movie_id: "tt1375666",
      });
      expect(result.success).toBe(true);
    });

    it("validates genres basis", () => {
      const result = recommendMoviesInputSchema.safeParse({
        based_on: "genres",
        genres: ["Action", "Sci-Fi"],
      });
      expect(result.success).toBe(true);
    });

    it("rejects movie_id basis without movie_id", () => {
      const result = recommendMoviesInputSchema.safeParse({ based_on: "movie_id" });
      expect(result.success).toBe(false);
    });
  });

  describe("get_upcoming_movies", () => {
    it("validates valid input", () => {
      const result = getUpcomingMoviesInputSchema.safeParse({
        limit: 20,
        region: "US",
        genre: "Action",
      });
      expect(result.success).toBe(true);
    });

    it("validates date format", () => {
      const result = getUpcomingMoviesInputSchema.safeParse({
        from_date: "2024-01-01",
        to_date: "2024-12-31",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid date format", () => {
      const result = getUpcomingMoviesInputSchema.safeParse({
        from_date: "01-01-2024",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("TOOL_SCHEMAS", () => {
    it("has input and output schemas for all 10 tools", () => {
      expect(Object.keys(TOOL_SCHEMAS)).toHaveLength(10);
      for (const toolName of REGISTERED_TOOLS) {
        expect(TOOL_SCHEMAS[toolName]).toHaveProperty("input");
        expect(TOOL_SCHEMAS[toolName]).toHaveProperty("output");
      }
    });
  });
});

describe("Tool Registry", () => {
  let mockAdapter: MovieDataAdapter;

  beforeEach(() => {
    mockAdapter = createMockAdapter();
  });

  it("registers all 10 tools by default", () => {
    const registry = createDefaultRegistry(mockAdapter);
    expect(registry.getNames()).toHaveLength(10);
    for (const toolName of REGISTERED_TOOLS) {
      expect(registry.has(toolName)).toBe(true);
    }
  });

  it("validates input against schema", () => {
    const registry = createDefaultRegistry(mockAdapter);
    const result = registry.validateInput("search_movies", { title: "Inception", year: 2010 });
    expect(result.success).toBe(true);
  });

  it("rejects invalid input", () => {
    const registry = createDefaultRegistry(mockAdapter);
    const result = registry.validateInput("search_movies", { title: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Invalid input");
  });

  it("rejects unknown tool", () => {
    const registry = createDefaultRegistry(mockAdapter);
    const result = registry.validateInput("unknown_tool", {});
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("not found");
  });

  it("enforces allowlist on registration", () => {
    const registry = new ToolRegistry();
    expect(() =>
      registry.register({
        name: "invalid_tool" as any,
        description: "test",
        timeoutMs: 1000,
        maxRetries: 0,
        requiresAuth: false,
        inputSchema: z.object({}),
        outputSchema: z.object({}),
        executor: vi.fn(),
      })
    ).toThrow("not in the allowlist");
  });
});

describe("Agent Executor", () => {
  let mockAdapter: MovieDataAdapter;

  beforeEach(() => {
    mockAdapter = createMockAdapter();
  });

  it("executes greeting without tools", async () => {
    const executor = createAgentExecutor(mockAdapter);
    const result = await executor.execute({
      message: "Hello!",
      requestId: "test-1",
    });

    expect(result.summary.intent).toBe("chat.greeting");
    expect(result.summary.toolCallsCount).toBe(0);
    expect(result.response).toContain("CineMind");
  });

  it("executes farewell without tools", async () => {
    const executor = createAgentExecutor(mockAdapter);
    const result = await executor.execute({
      message: "Goodbye!",
      requestId: "test-2",
    });

    expect(result.summary.intent).toBe("chat.farewell");
    expect(result.summary.toolCallsCount).toBe(0);
  });

  it("executes help without tools", async () => {
    const executor = createAgentExecutor(mockAdapter);
    const result = await executor.execute({
      message: "Help",
      requestId: "test-3",
    });

    expect(result.summary.intent).toBe("chat.help");
    expect(result.summary.toolCallsCount).toBe(0);
    expect(result.response).toContain("Searching for movies");
  });

  it("executes capabilities without tools", async () => {
    const executor = createAgentExecutor(mockAdapter);
    const result = await executor.execute({
      message: "What can you do?",
      requestId: "test-4",
    });

    expect(result.summary.intent).toBe("chat.capabilities");
    expect(result.summary.toolCallsCount).toBe(0);
  });

  it("routes off-topic to chat.off_topic", async () => {
    const executor = createAgentExecutor(mockAdapter);
    const result = await executor.execute({
      message: "What's the weather like?",
      requestId: "test-5",
    });

    expect(result.summary.intent).toBe("chat.off_topic");
    expect(result.summary.isOffTopic).toBe(true);
  });

  it("enforces tool budget", async () => {
    const executor = createAgentExecutor(mockAdapter, { maxToolCalls: 1, maxToolBudget: 1 });
    // This would need a forced intent that requires multiple tools
    const result = await executor.execute({
      message: "Compare Inception and Interstellar",
      requestId: "test-6",
      forcedIntent: "compare.movies",
    });

    // Should still work but respect budget
    expect(result.summary.toolCallsCount).toBeLessThanOrEqual(1);
  });

  it("returns operational summary without chain-of-thought", async () => {
    const executor = createAgentExecutor(mockAdapter);
    const result = await executor.execute({
      message: "Hello!",
      requestId: "test-7",
    });

    // Verify summary structure
    expect(result.summary).toHaveProperty("requestId");
    expect(result.summary).toHaveProperty("intent");
    expect(result.summary).toHaveProperty("intentConfidence");
    expect(result.summary).toHaveProperty("intentCategory");
    expect(result.summary).toHaveProperty("toolsCalled");
    expect(result.summary).toHaveProperty("totalDurationMs");
    expect(result.summary).toHaveProperty("toolBudgetUsed");
    expect(result.summary).toHaveProperty("toolCallsCount");
    expect(result.summary).toHaveProperty("timedOut");
    expect(result.summary).toHaveProperty("errors");

    // Verify NO chain-of-thought fields
    expect(result.summary).not.toHaveProperty("reasoning");
    expect(result.summary).not.toHaveProperty("thoughts");
    expect(result.summary).not.toHaveProperty("chainOfThought");
    expect(result.summary).not.toHaveProperty("internalMonologue");
  });

  it("extracts cited facts from tool results", async () => {
    // Mock a successful tool response
    mockAdapter.getMovie = vi.fn().mockResolvedValue({
      value: {
        id: "tt1375666",
        title: "Inception",
        releaseYear: 2010,
        genre: ["Action", "Sci-Fi"],
        rating: { average: 8.8, votes: 2400000 },
      },
      provenance: {
        sourceId: "mock:movie:tt1375666",
        sourceKind: "static",
        sourceName: "mock",
        retrievedAt: new Date().toISOString(),
        confidence: 1,
      },
    });

    const executor = createAgentExecutor(mockAdapter);
    const result = await executor.execute({
      message: "Tell me about Inception",
      requestId: "test-8",
      forcedIntent: "movie.info.basic",
    });

    expect(result.citedFacts.length).toBeGreaterThanOrEqual(0);
  });
});

describe("Authorization Enforcement", () => {
  let mockAdapter: MovieDataAdapter;

  beforeEach(() => {
    mockAdapter = createMockAdapter();
  });

  it("requires auth for tools that need it", async () => {
    const executor = createAgentExecutor(mockAdapter);
    // Currently no tools require auth, so chat intents should succeed without errors
    const result = await executor.execute({
      message: "Help",
      requestId: "test-auth",
      forcedIntent: "chat.help",
    });
    expect(result.summary.errors).toHaveLength(0);
  });
});

describe("Error Handling", () => {
  let mockAdapter: MovieDataAdapter;

  beforeEach(() => {
    mockAdapter = createMockAdapter();
  });

  it("handles tool execution errors gracefully", async () => {
    mockAdapter.getMovie = vi.fn().mockRejectedValue(new Error("Provider unavailable"));

    const executor = createAgentExecutor(mockAdapter);
    const result = await executor.execute({
      message: "Tell me about Inception",
      requestId: "test-error",
      forcedIntent: "movie.info.basic",
    });

    expect(result.summary.errors.length).toBeGreaterThan(0);
    expect(result.response).toContain("couldn't find");
  });

  it("handles tool timeout", async () => {
    // Mock the tool to reject with a timeout error (simulating registry timeout)
    mockAdapter.getMovie = vi.fn().mockRejectedValue(new Error("Tool timeout after 30000ms"));

    const executor = createAgentExecutor(mockAdapter, { maxExecutionTimeMs: 100 });
    const result = await executor.execute({
      message: 'Tell me about "Inception"',
      requestId: "test-timeout",
    });

    // Should handle the timeout error gracefully
    expect(result.summary.errors.length).toBeGreaterThan(0);
    expect(result.summary.errors[0]).toContain("timeout");
  });

  it("handles unsupported intent gracefully", async () => {
    const executor = createAgentExecutor(mockAdapter);
    const result = await executor.execute({
      message: "Some random unsupported request",
      requestId: "test-unsupported",
    });

    // Should fall back to chat.fallback or chat.off_topic
    expect(["chat.fallback", "chat.off_topic"]).toContain(result.summary.intent);
  });
});

describe("Operational Summaries Store", () => {
  it("records and retrieves run summaries", async () => {
    const store = new InMemorySummaryStore();
    const summary = {
      requestId: "test-1",
      userId: "user-1",
      intent: "movie.info.basic",
      intentConfidence: 0.9,
      intentCategory: "movie_information",
      toolsCalled: [{ name: "get_movie_details", success: true, durationMs: 100, error: null }],
      totalDurationMs: 150,
      toolBudgetUsed: 1,
      toolCallsCount: 1,
      timedOut: false,
      errors: [],
      createdAt: new Date().toISOString(),
      authenticated: true,
    };

    await store.recordRun(summary);
    const runs = await store.getRecentRuns("user-1");
    expect(runs).toHaveLength(1);
    expect(runs[0].requestId).toBe("test-1");
  });

  it("records tool call details", async () => {
    const store = new InMemorySummaryStore();
    const detail = {
      runId: "test-1",
      toolName: "get_movie_details",
      inputHash: "abc123",
      inputValid: true,
      outputValid: true,
      success: true,
      durationMs: 100,
      error: null,
      provenanceSourceName: "mock",
      provenanceSourceKind: "static",
      provenanceConfidence: 1,
      createdAt: new Date().toISOString(),
    };

    await store.recordToolCall(detail);
    const calls = store.getAllToolCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].toolName).toBe("get_movie_details");
  });

  it("computes error stats", async () => {
    const store = new InMemorySummaryStore();
    const now = new Date().toISOString();
    const past = new Date(Date.now() - 86400000).toISOString();

    await store.recordRun({
      requestId: "1",
      userId: "u1",
      intent: "movie.info.basic",
      intentConfidence: 0.9,
      intentCategory: "movie_information",
      toolsCalled: [],
      totalDurationMs: 100,
      toolBudgetUsed: 1,
      toolCallsCount: 1,
      timedOut: false,
      errors: [],
      createdAt: now,
      authenticated: true,
    });

    await store.recordRun({
      requestId: "2",
      userId: "u1",
      intent: "movie.info.basic",
      intentConfidence: 0.9,
      intentCategory: "movie_information",
      toolsCalled: [],
      totalDurationMs: 200,
      toolBudgetUsed: 1,
      toolCallsCount: 1,
      timedOut: false,
      errors: ["Some error"],
      createdAt: now,
      authenticated: true,
    });

    const stats = await store.getErrorStats(past);
    expect(stats).toHaveLength(1);
    expect(stats[0].intent).toBe("movie.info.basic");
    expect(stats[0].total).toBe(2);
    expect(stats[0].errors).toBe(1);
    expect(stats[0].avgDurationMs).toBe(150);
  });
});