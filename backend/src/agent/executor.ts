/**
 * Agent executor with timeouts, budgets, and validation.
 * Orchestrates tool execution, enforces limits, and produces operational summaries.
 * NO chain-of-thought is stored or returned.
 */

import type { MovieDataAdapter } from "../providers/types.js";
import { ToolRegistry, createDefaultRegistry, type ToolContext, type ToolExecutionResult } from "./registry.js";
import { routeIntent, selectTools, type RouterResult, type ToolSelection } from "./router.js";
import type { AnyIntent, IntentCategory } from "./intents.js";

/**
 * Agent configuration.
 */
export interface AgentConfig {
  /** Maximum number of tool calls per request. */
  maxToolCalls: number;
  /** Maximum total execution time in ms. */
  maxExecutionTimeMs: number;
  /** Maximum tool budget (weighted sum of tool costs). */
  maxToolBudget: number;
  /** Whether to allow parallel tool execution. */
  allowParallel: boolean;
}

/**
 * Default agent configuration.
 */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxToolCalls: 5,
  maxExecutionTimeMs: 30000,
  maxToolBudget: 10,
  allowParallel: true,
};

/**
 * Agent execution input.
 */
export interface AgentInput {
  /** User message. */
  message: string;
  /** User ID for personalized features. */
  userId?: string;
  /** Request ID for tracing. */
  requestId: string;
  /** Optional override for intent (bypasses router). */
  forcedIntent?: AnyIntent;
}

/**
 * Tool call record for operational summary.
 */
export interface ToolCallRecord {
  toolName: string;
  input: Record<string, unknown>;
  success: boolean;
  durationMs: number;
  error: string | null;
  provenance: {
    sourceName: string;
    sourceKind: string;
    sourceId: string;
    retrievedAt: string;
    confidence: number;
  } | null;
}

/**
 * Agent execution output.
 */
export interface AgentOutput {
  /** The final response text for the user. */
  response: string;
  /** Structured facts cited in the response. */
  citedFacts: Array<{
    value: unknown;
    provenance: {
      sourceName: string;
      sourceKind: string;
      sourceId: string;
      retrievedAt: string;
      confidence: number;
      ref?: string;
    };
  }>;
  /** Operational summary (NO chain-of-thought). */
  summary: {
    requestId: string;
    intent: AnyIntent;
    intentConfidence: number;
    intentCategory: IntentCategory;
    toolsCalled: ToolCallRecord[];
    totalDurationMs: number;
    toolBudgetUsed: number;
    toolCallsCount: number;
    timedOut: boolean;
    errors: string[];
    isOffTopic: boolean;
  };
}

/**
 * Agent executor class.
 */
export class AgentExecutor {
  private readonly registry: ToolRegistry;
  private readonly config: AgentConfig;
  private readonly adapter: MovieDataAdapter;

  constructor(adapter: MovieDataAdapter, config: Partial<AgentConfig> = {}) {
    this.adapter = adapter;
    this.registry = createDefaultRegistry(adapter);
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
  }

  /**
   * Execute the agent for a user message.
   */
  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    const context: ToolContext = {
      adapter: this.adapter,
      userId: input.userId,
      requestId: input.requestId,
      startTime,
    };

    // Step 1: Route intent (deterministic, no LLM)
    let routerResult: RouterResult;
    if (input.forcedIntent) {
      routerResult = {
        intent: input.forcedIntent,
        confidence: 1.0,
        category: this.getCategory(input.forcedIntent),
        extractedEntities: {},
        isOffTopic: false,
      };
    } else {
      routerResult = routeIntent(input.message);
    }

    // Step 2: Select tools for the intent
    const toolSelection = selectTools(routerResult.intent, routerResult.extractedEntities);

    // Step 3: Check authorization
    if (toolSelection.requiresAuth && !input.userId) {
      return this.createAuthRequiredResponse(routerResult, startTime, input.requestId);
    }

    // Step 4: Execute tools with budget enforcement
    const toolResults = await this.executeTools(toolSelection, context, startTime);

    // Step 5: Build response from tool results
    const response = this.buildResponse(routerResult.intent, toolResults);

    // Step 6: Extract cited facts
    const citedFacts = this.extractCitedFacts(toolResults);

    // Step 7: Build operational summary (NO chain-of-thought)
    const summary = this.buildSummary(
      input.requestId,
      routerResult,
      toolResults,
      Date.now() - startTime
    );

    return {
      response,
      citedFacts,
      summary,
    };
  }

  /**
   * Execute selected tools with budget and timeout enforcement.
   */
  private async executeTools(
    selection: ToolSelection,
    context: ToolContext,
    startTime: number
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];
    let budgetUsed = 0;
    let callsCount = 0;

    // Sort tools by priority
    const sortedTools = [...selection.tools].sort((a, b) => a.priority - b.priority);

    for (const toolCall of sortedTools) {
      // Check budget
      if (callsCount >= this.config.maxToolCalls) {
        results.push(this.createBudgetExceededResult(toolCall.name));
        break;
      }
      if (budgetUsed + 1 > this.config.maxToolBudget) {
        results.push(this.createBudgetExceededResult(toolCall.name));
        break;
      }
      if (Date.now() - startTime > this.config.maxExecutionTimeMs) {
        results.push(this.createTimeoutResult(toolCall.name));
        break;
      }

      // Validate tool is registered
      if (!this.registry.has(toolCall.name)) {
        results.push(this.createUnregisteredToolResult(toolCall.name));
        continue;
      }

      // Validate input
      const tool = this.registry.get(toolCall.name);
      if (!tool) {
        results.push(this.createUnregisteredToolResult(toolCall.name));
        continue;
      }

      const validation = this.registry.validateInput(toolCall.name, toolCall.args);
      if (!validation.success) {
        results.push(this.createValidationErrorResult(toolCall.name, validation.error));
        continue;
      }

      // Execute tool
      try {
        const result = await tool.executor(validation.data, context);
        results.push(result);

        // Update budget
        callsCount++;
        budgetUsed += 1; // Each tool costs 1 budget unit

        // Validate output
        if (result.success && result.data) {
          const outputValidation = this.registry.validateOutput(toolCall.name, result.data);
          if (!outputValidation.success) {
            // Log but don't fail - we have the data
            console.warn(`Tool ${toolCall.name} output validation failed: ${outputValidation.error}`);
          }
        }
      } catch (error) {
        results.push(this.createExecutionErrorResult(toolCall.name, error));
      }
    }

    return results;
  }

  /**
   * Build user-facing response from tool results.
   */
  private buildResponse(intent: AnyIntent, results: ToolExecutionResult[]): string {
    const successfulResults = results.filter((r) => r.success && r.data);

    // Handle chat intents first - they don't require tool results
    const category = this.getCategory(intent);
    if (category === "general_chat") {
      return this.formatChatResponse(intent);
    }

    if (successfulResults.length === 0) {
      return this.getFallbackResponse(intent);
    }

    // Build response based on intent category
    switch (category) {
      case "movie_information":
        return this.formatMovieInfoResponse(intent, successfulResults);
      case "search":
        return this.formatSearchResponse(successfulResults);
      case "recommendation":
        return this.formatRecommendationResponse(successfulResults);
      case "comparison":
        return this.formatComparisonResponse(successfulResults);
      case "review":
      case "user_review":
        return this.formatReviewResponse(successfulResults);
      case "upcoming_movie":
        return this.formatUpcomingResponse(successfulResults);
      case "critic_analysis":
      case "hype_prediction":
        return this.formatAnalysisResponse(successfulResults);
      default:
        return this.formatGenericResponse(successfulResults);
    }
  }

  private formatMovieInfoResponse(_intent: AnyIntent, results: ToolExecutionResult[]): string {
    const data = results[0].data as any;
    if (!data?.data) return "I couldn't find that information.";

    const movie = data.data as any;
    let response = `${movie.title}`;

    if (movie.releaseYear) response += ` (${movie.releaseYear})`;
    if (movie.genre?.length) response += ` — ${movie.genre.join(", ")}`;
    if (movie.runtimeMinutes) response += ` — ${movie.runtimeMinutes} min`;
    if (movie.certification) response += ` — ${movie.certification}`;
    if (movie.rating?.average) response += ` — ★ ${movie.rating.average.toFixed(1)}/10`;
    if (movie.overview) response += `. ${movie.overview}`;

    return response;
  }

  private formatSearchResponse(results: ToolExecutionResult[]): string {
    const data = results[0].data as any;
    if (!data?.data?.length) return "No movies found matching your search.";

    const movies = data.data.slice(0, 5);
    const list = movies.map((m: any, i: number) =>
      `${i + 1}. ${m.title}${m.releaseYear ? ` (${m.releaseYear})` : ""}${m.genre?.length ? ` — ${m.genre.join(", ")}` : ""}`
    ).join("\n");

    return `Found ${data.data.length} movie${data.data.length !== 1 ? "s" : ""}:\n${list}`;
  }

  private formatRecommendationResponse(results: ToolExecutionResult[]): string {
    const data = results[0].data as any;
    if (!data?.data?.length) return "I couldn't find any recommendations.";

    const movies = data.data.slice(0, 5);
    const list = movies.map((m: any, i: number) =>
      `${i + 1}. ${m.title}${m.releaseYear ? ` (${m.releaseYear})` : ""} — ${m.reason ?? "Recommended for you"}`
    ).join("\n");

    return `Here are some recommendations:\n${list}`;
  }

  private formatComparisonResponse(results: ToolExecutionResult[]): string {
    const data = results[0].data as any;
    if (!data?.data?.comparison?.length) return "I couldn't compare those movies.";

    const movies = data.data.comparison;
    let response = `Comparison of ${movies.length} movies:\n\n`;

    for (const m of movies) {
      response += `**${m.title}**${m.releaseYear ? ` (${m.releaseYear})` : ""}\n`;
      if (m.genre?.length) response += `  Genre: ${m.genre.join(", ")}\n`;
      if (m.runtimeMinutes) response += `  Runtime: ${m.runtimeMinutes} min\n`;
      if (m.rating?.average) response += `  Rating: ${m.rating.average.toFixed(1)}/10 (${m.rating.votes?.toLocaleString() ?? "?"} votes)\n`;
      if (m.budget !== undefined) response += `  Budget: $${m.budget?.toLocaleString() ?? "N/A"}\n`;
      if (m.revenue !== undefined) response += `  Revenue: $${m.revenue?.toLocaleString() ?? "N/A"}\n`;
      response += "\n";
    }

    if (data.data.summary) response += data.data.summary;

    return response;
  }

  private formatReviewResponse(results: ToolExecutionResult[]): string {
    const data = results[0].data as any;
    if (!data?.data?.reviews?.length) return "No reviews found for this movie.";

    const reviews = data.data.reviews.slice(0, 3);
    let response = `Found ${data.data.totalResults ?? reviews.length} review${data.data.totalResults !== 1 ? "s" : ""}:\n\n`;

    for (const r of reviews) {
      response += `**${r.author}**${r.rating !== undefined ? ` — ${r.rating}/10` : ""}\n`;
      response += `${r.content.slice(0, 200)}${r.content.length > 200 ? "..." : ""}\n\n`;
    }

    return response;
  }

  private formatUpcomingResponse(results: ToolExecutionResult[]): string {
    const data = results[0].data as any;
    if (!data?.data?.length) return "No upcoming movies found.";

    const movies = data.data.slice(0, 10);
    const list = movies.map((m: any, i: number) =>
      `${i + 1}. ${m.title}${m.releaseDate ? ` — ${m.releaseDate}` : ""}${m.genre?.length ? ` (${m.genre.join(", ")})` : ""}`
    ).join("\n");

    return `Upcoming movies:\n${list}`;
  }

  private formatAnalysisResponse(results: ToolExecutionResult[]): string {
    return "Analysis complete. Based on the available data, here are the key findings: " +
      results.map((r) => r.data?.data ? JSON.stringify(r.data.data).slice(0, 200) : "").filter(Boolean).join("; ");
  }

  private formatChatResponse(_intent: AnyIntent): string {
    // _intent is intentionally unused; all cases return static strings
    // The switch is kept for clarity and future extensibility
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const intent = _intent; // satisfy linter
    switch (intent) {
      case "chat.greeting":
        return "Hello! I'm CineMind, your movie intelligence assistant. I can help you search for movies, get details, compare films, find recommendations, and more. What would you like to know?";
      case "chat.farewell":
        return "Goodbye! Enjoy your movie watching!";
      case "chat.thanks":
        return "You're welcome! Let me know if you need anything else.";
      case "chat.help":
        return "I can help you with:\n• Searching for movies by title\n• Getting detailed movie information (cast, crew, ratings, financials)\n• Comparing movies side by side\n• Finding recommendations\n• Checking upcoming releases\n• Reading reviews\nJust ask me something like 'Tell me about Inception' or 'Compare The Dark Knight and Batman Begins'.";
      case "chat.capabilities":
        return "My capabilities:\n• search_movies — Find movies by title\n• get_movie_details — Full movie metadata\n• get_movie_cast / get_movie_crew — Credits\n• get_movie_financials — Budget & revenue\n• get_movie_ratings — Aggregate scores\n• get_user_reviews — Audience reviews\n• compare_movies — Side-by-side comparison\n• recommend_movies — Personalized recommendations\n• get_upcoming_movies — Upcoming releases";
      default:
        return "I'm here to help with movie questions. What would you like to know?";
    }
  }

  private formatGenericResponse(results: ToolExecutionResult[]): string {
    return results.map((r) => r.data?.data ? JSON.stringify(r.data.data).slice(0, 500) : "").filter(Boolean).join("\n\n") || "No results found.";
  }

  private getFallbackResponse(intent: AnyIntent): string {
    const category = this.getCategory(intent);
    const fallbacks: Record<string, string> = {
      movie_information: "I couldn't find that movie information.",
      search: "No results found for your search.",
      recommendation: "I couldn't generate recommendations at this time.",
      comparison: "I couldn't compare those movies.",
      review: "No reviews available.",
      upcoming_movie: "No upcoming movies found.",
      critic_analysis: "Analysis not available.",
      hype_prediction: "Prediction not available.",
      user_review: "No user reviews found.",
      general_chat: "I'm not sure how to help with that. Try asking about a movie!",
    };
    return fallbacks[category] ?? "I couldn't process that request.";
  }

  /**
   * Extract cited facts from tool results for structured output.
   */
  private extractCitedFacts(results: ToolExecutionResult[]): AgentOutput["citedFacts"] {
    const facts: AgentOutput["citedFacts"] = [];

    for (const result of results) {
      if (result.success && result.data && result.provenance) {
        // The data field contains the tool's output wrapper
        const toolData = result.data as { data?: unknown; provenance?: unknown };
        if (toolData.data) {
          facts.push({
            value: toolData.data,
            provenance: result.provenance,
          });
        }
      }
    }

    return facts;
  }

  /**
   * Build operational summary (NO chain-of-thought).
   */
  private buildSummary(
    requestId: string,
    routerResult: RouterResult,
    toolResults: ToolExecutionResult[],
    totalDurationMs: number
  ): AgentOutput["summary"] {
    const toolsCalled: ToolCallRecord[] = toolResults.map((r) => ({
      toolName: r.metadata.toolName,
      input: {}, // Would be filled from actual execution
      success: r.success,
      durationMs: r.metadata.durationMs,
      error: r.error,
      provenance: r.provenance,
    }));

    const errors = toolResults.filter((r) => !r.success).map((r) => r.error ?? "Unknown error");

    return {
      requestId,
      intent: routerResult.intent,
      intentConfidence: routerResult.confidence,
      intentCategory: routerResult.category,
      toolsCalled,
      totalDurationMs,
      toolBudgetUsed: toolsCalled.length,
      toolCallsCount: toolsCalled.length,
      timedOut: toolResults.some((r) => r.metadata.timedOut),
      errors,
      isOffTopic: routerResult.isOffTopic,
    };
  }

  private createAuthRequiredResponse(routerResult: RouterResult, startTime: number, requestId: string): AgentOutput {
    return {
      response: "This feature requires authentication. Please sign in to continue.",
      citedFacts: [],
      summary: {
        requestId,
        intent: routerResult.intent,
        intentConfidence: routerResult.confidence,
        intentCategory: routerResult.category,
        toolsCalled: [],
        totalDurationMs: Date.now() - startTime,
        toolBudgetUsed: 0,
        toolCallsCount: 0,
        timedOut: false,
        errors: ["Authentication required"],
        isOffTopic: false,
      },
    };
  }

  private createBudgetExceededResult(toolName: string): ToolExecutionResult {
    return {
      success: false,
      data: null,
      error: "Tool budget exceeded",
      provenance: null,
      metadata: {
        toolName,
        durationMs: 0,
        timedOut: false,
        inputValid: true,
        outputValid: false,
      },
    };
  }

  private createTimeoutResult(toolName: string): ToolExecutionResult {
    return {
      success: false,
      data: null,
      error: "Execution timeout",
      provenance: null,
      metadata: {
        toolName,
        durationMs: 0,
        timedOut: true,
        inputValid: true,
        outputValid: false,
      },
    };
  }

  private createUnregisteredToolResult(toolName: string): ToolExecutionResult {
    return {
      success: false,
      data: null,
      error: `Tool "${toolName}" is not registered`,
      provenance: null,
      metadata: {
        toolName,
        durationMs: 0,
        timedOut: false,
        inputValid: true,
        outputValid: false,
      },
    };
  }

  private createValidationErrorResult(toolName: string, error: string): ToolExecutionResult {
    return {
      success: false,
      data: null,
      error: `Input validation failed: ${error}`,
      provenance: null,
      metadata: {
        toolName,
        durationMs: 0,
        timedOut: false,
        inputValid: false,
        outputValid: false,
      },
    };
  }

  private createExecutionErrorResult(toolName: string, error: unknown): ToolExecutionResult {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : String(error),
      provenance: null,
      metadata: {
        toolName,
        durationMs: 0,
        timedOut: false,
        inputValid: true,
        outputValid: false,
      },
    };
  }

  private getCategory(intent: AnyIntent): IntentCategory {
    if (intent.startsWith("movie.info.")) return "movie_information";
    if (intent.startsWith("person.info.")) return "person_information";
    if (intent.startsWith("search.")) return "search";
    if (intent.startsWith("recommend.")) return "recommendation";
    if (intent.startsWith("compare.")) return "comparison";
    if (intent.startsWith("review.")) return "review";
    if (intent.startsWith("critic.")) return "critic_analysis";
    if (intent.startsWith("upcoming.")) return "upcoming_movie";
    if (intent.startsWith("hype.")) return "hype_prediction";
    if (intent.startsWith("user_review.")) return "user_review";
    if (intent.startsWith("chat.")) return "general_chat";
    // Fallback for any future intent types
    return "general_chat";
  }
}

/**
 * Create an agent executor with the default configuration.
 */
export function createAgentExecutor(adapter: MovieDataAdapter, config?: Partial<AgentConfig>): AgentExecutor {
  return new AgentExecutor(adapter, config);
}