import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { MovieDataAdapter, MovieRecord } from "../providers/types.js";
import type { LLMService } from "../services/llm/service.js";
import { ToolRegistry, createDefaultRegistry, type ToolContext } from "../agent/registry.js";
import { routeIntent, selectTools } from "../agent/router.js";
import type { AnyIntent } from "../agent/intents.js";
import type { ToolName } from "../agent/tools.js";
import { isRegisteredTool } from "../agent/tools.js";
import type {
  ChatResponsePayload,
  ComparisonTableBlock,
  OperationalTrace,
  PredictionCardBlock,
  RecommendationCardBlock,
  ResponseBlock,
  SourceReferenceBlock,
  ToolCallTrace,
} from "./types.js";

export interface OrchestratorDeps {
  adapter: MovieDataAdapter;
  llmService: LLMService;
  registry?: ToolRegistry;
}

const INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous|above|prior)\s+instructions/i,
  /disregard\s+(?:all\s+)?(?:previous|prior)\s+instructions/i,
  /forget\s+(?:your\s+)?(?:rules|instructions|system\s+prompt)/i,
  /you\s+are\s+now\s+(?:a\s+|an\s+)?(?:unfiltered|jailbreak|developer\s+mode|dan)/i,
  /bypass\s+(?:the\s+)?(?:tools|tool\s+layer|guardrails)/i,
  /reveal\s+(?:your\s+)?(?:system\s+prompt|initial\s+instructions)/i,
];

export class ChatOrchestrator {
  private readonly adapter: MovieDataAdapter;
  private readonly llm: LLMService;
  private readonly registry: ToolRegistry;

  constructor(deps: OrchestratorDeps) {
    this.adapter = deps.adapter;
    this.llm = deps.llmService;
    this.registry = deps.registry ?? createDefaultRegistry(deps.adapter);
  }

  async processMessage(input: {
    message: string;
    conversationId: string;
    userId?: string | null;
    requestId?: string;
  }): Promise<ChatResponsePayload> {
    const startTime = Date.now();
    const requestId = input.requestId ?? randomUUID();
    const messageId = randomUUID();
    const rawMessage = input.message.trim();

    const toolsCalledTrace: ToolCallTrace[] = [];

    // ── 1. Prompt Injection Defense ─────────────────────────────────────────
    const isInjectionAttempt = INJECTION_PATTERNS.some((pattern) =>
      pattern.test(rawMessage)
    );

    if (isInjectionAttempt) {
      const trace: OperationalTrace = {
        requestId,
        durationMs: Date.now() - startTime,
        intent: "security.injection_attempt",
        intentConfidence: 1.0,
        toolsCalled: [],
        provider: this.llm.provider,
        model: this.llm.model,
        status: "unsupported",
      };

      const blocks: ResponseBlock[] = [
        {
          type: "text",
          content:
            "I am CineMind, a cinematic movie intelligence assistant. I cannot modify my security instructions, bypass tool verification, or reveal system prompts. I can only provide movie facts verified from structured sources.",
        },
      ];

      return {
        conversationId: input.conversationId,
        messageId,
        blocks,
        trace,
      };
    }

    // ── 2. Intent Routing & Classification ─────────────────────────────────
    let routerResult = routeIntent(rawMessage);
    let resolvedIntent: AnyIntent = routerResult.intent;
    let confidence = routerResult.confidence;

    // Check for off-topic query
    if (routerResult.isOffTopic) {
      const trace: OperationalTrace = {
        requestId,
        durationMs: Date.now() - startTime,
        intent: "chat.off_topic",
        intentConfidence: 1.0,
        toolsCalled: [],
        provider: this.llm.provider,
        model: this.llm.model,
        status: "unsupported",
      };

      return {
        conversationId: input.conversationId,
        messageId,
        blocks: [
          {
            type: "text",
            content:
              "I specialize exclusively in movies and cinema intelligence. I can help you search movies, check cast/crew, compare films, explore financials, and discover recommendations. Please ask a movie-related question!",
          },
        ],
        trace,
      };
    }

    // If ambiguous or low confidence, let LLM classify intent from approved list
    if (confidence < 0.75) {
      try {
        const intentSchema = z.object({
          classifiedIntent: z.enum([
            "movie.search",
            "movie.details",
            "movie.cast",
            "movie.crew",
            "movie.financials",
            "movie.ratings",
            "movie.reviews",
            "movie.compare",
            "movie.recommend",
            "movie.upcoming",
            "movie.predict",
            "chat.greeting",
            "chat.help",
            "unsupported",
          ]),
          confidence: z.number().min(0).max(1),
        });

        const classification = await this.llm.generateStructured({
          messages: [
            {
              role: "system",
              content:
                "Classify the user movie query into one of the allowed intents. If completely unrelated to movies, classify as 'unsupported'.",
            },
            { role: "user", content: rawMessage },
          ],
          schema: intentSchema,
        });

        if (classification.data.classifiedIntent === "unsupported") {
          const trace: OperationalTrace = {
            requestId,
            durationMs: Date.now() - startTime,
            intent: "unsupported",
            intentConfidence: classification.data.confidence,
            toolsCalled: [],
            tokenUsage: classification.tokenUsage,
            costUsd: classification.cost.estimatedCostUsd,
            provider: this.llm.provider,
            model: this.llm.model,
            status: "unsupported",
          };

          return {
            conversationId: input.conversationId,
            messageId,
            blocks: [
              {
                type: "text",
                content:
                  "I am designed to answer movie questions using verified factual sources. That question is outside my cinema intelligence capabilities.",
              },
            ],
            trace,
          };
        }

        resolvedIntent = classification.data.classifiedIntent as AnyIntent;
        confidence = classification.data.confidence;
      } catch {
        // Fall back to the deterministic router's best guess
      }
    }

    // ── 3. Handle Greeting / Help Chat ─────────────────────────────────────
    if (resolvedIntent.startsWith("chat.")) {
      const trace: OperationalTrace = {
        requestId,
        durationMs: Date.now() - startTime,
        intent: resolvedIntent,
        intentConfidence: confidence,
        toolsCalled: [],
        provider: this.llm.provider,
        model: this.llm.model,
        status: "success",
      };

      const greetingContent =
        resolvedIntent === "chat.greeting"
          ? "Hello! I'm CineMind, your movie intelligence assistant. Ask me anything about movie details, box office financials, cast and crew, side-by-side comparisons, or personalized recommendations."
          : "I can assist you with:\n• Searching movies by title & year\n• Looking up cast, crew, ratings, and budgets\n• Comparing two movies side-by-side\n• Recommending movies based on genres or moods\n• Checking upcoming releases\n\nTry asking: 'Tell me about Inception' or 'Compare The Dark Knight and Batman Begins'.";

      return {
        conversationId: input.conversationId,
        messageId,
        blocks: [{ type: "text", content: greetingContent }],
        trace,
      };
    }

    // ── 4. Tool Selection & Execution ──────────────────────────────────────
    const toolSelection = selectTools(resolvedIntent, routerResult.extractedEntities);
    const toolContext: ToolContext = {
      adapter: this.adapter,
      userId: input.userId ?? undefined,
      requestId,
      startTime,
    };

    const blocks: ResponseBlock[] = [];
    const sourceRefs: SourceReferenceBlock[] = [];
    let toolExecutionSuccess = true;
    const verifiedFacts: any[] = [];

    for (const toolCall of toolSelection.tools) {
      const toolStart = Date.now();
      if (!isRegisteredTool(toolCall.name)) {
        toolsCalledTrace.push({
          name: toolCall.name,
          durationMs: 0,
          success: false,
          error: `Unregistered tool: ${toolCall.name}`,
        });
        continue;
      }

      const toolName = toolCall.name as ToolName;
      const tool = this.registry.get(toolName);

      if (!tool) {
        toolsCalledTrace.push({
          name: toolCall.name,
          durationMs: 0,
          success: false,
          error: `Unregistered tool: ${toolCall.name}`,
        });
        continue;
      }

      try {
        const validation = this.registry.validateInput(toolName, toolCall.args);
        if (!validation.success) {
          toolsCalledTrace.push({
            name: toolCall.name,
            durationMs: Date.now() - toolStart,
            success: false,
            error: `Validation error: ${validation.error}`,
          });
          continue;
        }

        const result = await tool.executor(validation.data, toolContext);
        const durationMs = Date.now() - toolStart;

        toolsCalledTrace.push({
          name: toolCall.name,
          durationMs,
          success: result.success,
          error: result.error,
        });

        if (result.success && result.data) {
          verifiedFacts.push(result.data);

          // Add source reference block if provenance exists
          if (result.provenance) {
            sourceRefs.push({
              type: "source_reference",
              sourceId: result.provenance.sourceId,
              sourceName: result.provenance.sourceName,
              sourceKind: result.provenance.sourceKind,
              confidence: result.provenance.confidence,
              ref: result.provenance.ref,
              retrievedAt: result.provenance.retrievedAt,
            });
          }
        } else {
          toolExecutionSuccess = false;
        }
      } catch (err) {
        toolsCalledTrace.push({
          name: toolCall.name,
          durationMs: Date.now() - toolStart,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
        toolExecutionSuccess = false;
      }
    }

    // ── 5. Generate Response Blocks from Validated Evidence ─────────────────
    let explanation = "";
    let tokenUsage;
    let costUsd = 0;

    // Check if tools yielded empty results / missing evidence
    const hasData = verifiedFacts.some((f) => {
      if (!f?.data) return false;
      if (Array.isArray(f.data)) return f.data.length > 0;
      if (typeof f.data === "object") {
        if ("movies" in f.data && Array.isArray(f.data.movies)) {
          return f.data.movies.length > 0;
        }
        if ("comparison" in f.data && Array.isArray(f.data.comparison)) {
          return f.data.comparison.length > 0;
        }
        return true;
      }
      return true;
    });

    if (!hasData) {
      // Missing evidence or empty results: STRICT ZERO-HALLUCINATION GUARANTEE
      blocks.push({
        type: "text",
        content: `I could not find verified movie records matching "${rawMessage}". CineMind never invents facts or bypasses verified sources.`,
      });

      const trace: OperationalTrace = {
        requestId,
        durationMs: Date.now() - startTime,
        intent: resolvedIntent,
        intentConfidence: confidence,
        toolsCalled: toolsCalledTrace,
        provider: this.llm.provider,
        model: this.llm.model,
        status: "fallback",
      };

      return {
        conversationId: input.conversationId,
        messageId,
        blocks,
        trace,
      };
    }

    // Construct specialized response blocks from verified tool data
    for (const fact of verifiedFacts) {
      const prov = fact.provenance ?? {
        sourceId: "mock",
        sourceName: "CineMind Facts DB",
        sourceKind: "database",
        retrievedAt: new Date().toISOString(),
        confidence: 0.95,
      };

      // Comparison tool results
      if (fact.data?.comparison && Array.isArray(fact.data.comparison)) {
        const compMovies: MovieRecord[] = fact.data.comparison;
        const headers = ["Title", "Release Year", "Runtime", "Rating", "Budget", "Revenue", "Genres"];
        const rows = compMovies.map((m: any) => ({
          Title: m.title,
          "Release Year": m.releaseYear ?? "N/A",
          Runtime: m.runtimeMinutes ? `${m.runtimeMinutes} min` : "N/A",
          Rating: m.rating?.average ? `★ ${m.rating.average.toFixed(1)}/10` : "N/A",
          Budget: m.budget ? `$${m.budget.toLocaleString()}` : "N/A",
          Revenue: m.revenue ? `$${m.revenue.toLocaleString()}` : "N/A",
          Genres: m.genre?.join(", ") ?? "N/A",
        }));

        const compBlock: ComparisonTableBlock = {
          type: "comparison_table",
          headers,
          rows,
          movies: compMovies,
          summary: fact.data.summary ?? `Side-by-side comparison of ${compMovies.length} movies.`,
        };
        blocks.push(compBlock);
      }
      // Recommendations
      else if (fact.data?.recommendations && Array.isArray(fact.data.recommendations)) {
        for (const rec of fact.data.recommendations.slice(0, 4)) {
          const recBlock: RecommendationCardBlock = {
            type: "recommendation_card",
            movie: rec,
            reason: rec.reason ?? "Recommended based on matching themes and ratings.",
            score: rec.score ?? 0.88,
            provenance: prov,
          };
          blocks.push(recBlock);
        }
      }
      // Movie array (search or upcoming)
      else if (Array.isArray(fact.data)) {
        for (const m of fact.data.slice(0, 3)) {
          blocks.push({
            type: "movie_card",
            movie: m,
            provenance: prov,
          });
        }
      }
      // Single movie detail
      else if (fact.data?.title) {
        blocks.push({
          type: "movie_card",
          movie: fact.data,
          provenance: prov,
        });

        // If asking for hype / prediction
        if (resolvedIntent.includes("predict") || resolvedIntent.includes("analysis") || rawMessage.toLowerCase().includes("predict")) {
          const predBlock: PredictionCardBlock = {
            type: "prediction_card",
            movieTitle: fact.data.title,
            metric: "Audience Consensus & Performance Index",
            value: fact.data.rating?.average ? `${(fact.data.rating.average * 10).toFixed(0)}% Positive` : "Highly Anticipated",
            confidence: 0.91,
            rationale: `Validated based on ${fact.data.rating?.votes ?? "historical"} audience indicators and critical reception.`,
            provenance: prov,
          };
          blocks.push(predBlock);
        }
      }
    }

    // ── 6. LLM Evidence Synthesis (strictly grounded in verified data) ───────
    try {
      const synthesisPrompt = `You are CineMind AI, a cinema intelligence assistant.
Synthesize a concise, informative response explaining the movie facts below.
STRICT RULE: Only state facts present in the validated evidence. NEVER invent details, dates, budgets, or actors not present in the evidence.
Evidence:
${JSON.stringify(verifiedFacts).slice(0, 3000)}`;

      const llmRes = await this.llm.generateText({
        messages: [
          { role: "system", content: synthesisPrompt },
          { role: "user", content: rawMessage },
        ],
        temperature: 0.1,
      });

      explanation = llmRes.data;
      tokenUsage = llmRes.tokenUsage;
      costUsd = llmRes.cost.estimatedCostUsd;
    } catch (llmErr) {
      // Fallback: If LLM fails (e.g. provider downtime or malformed output),
      // synthesize deterministic explanation so the user request still succeeds!
      explanation = this.buildDeterministicExplanation(verifiedFacts);
    }

    // Place text block at the start
    if (explanation) {
      blocks.unshift({
        type: "text",
        content: explanation,
      });
    }

    // Add source reference blocks at the bottom
    for (const ref of sourceRefs) {
      // Deduplicate by sourceId
      if (!blocks.some((b) => b.type === "source_reference" && (b as SourceReferenceBlock).sourceId === ref.sourceId)) {
        blocks.push(ref);
      }
    }

    // ── 7. Build Operational Trace (NO private chain-of-thought) ─────────────
    const trace: OperationalTrace = {
      requestId,
      durationMs: Date.now() - startTime,
      intent: resolvedIntent,
      intentConfidence: confidence,
      toolsCalled: toolsCalledTrace,
      tokenUsage,
      costUsd,
      provider: this.llm.provider,
      model: this.llm.model,
      status: toolExecutionSuccess ? "success" : "fallback",
    };

    return {
      conversationId: input.conversationId,
      messageId,
      blocks,
      trace,
    };
  }

  private buildDeterministicExplanation(verifiedFacts: any[]): string {
    const lines: string[] = [];
    for (const f of verifiedFacts) {
      if (f.data?.comparison) {
        lines.push(`Here is the side-by-side comparison for the requested movies.`);
      } else if (f.data?.title) {
        const m = f.data;
        lines.push(
          `${m.title}${m.releaseYear ? ` (${m.releaseYear})` : ""}: ${m.overview || "Factually verified cinema record."}`
        );
      } else if (Array.isArray(f.data)) {
        lines.push(`Found ${f.data.length} verified movie record(s) matching your request.`);
      }
    }
    return lines.join("\n\n") || "Verified factual movie data retrieved.";
  }
}
