/**
 * CineMind Agent Layer - Main Export
 *
 * This module provides a deterministic, validated agent system for movie intelligence.
 * Key principles:
 * - LLM is NEVER the source of facts (only cites validated tool results)
 * - Deterministic intent routing (no LLM classification)
 * - Explicit tool allowlist (only registered tools executable)
 * - Full input/output validation with Zod
 * - Timeouts, budgets, and operational summaries (no chain-of-thought)
 */

// Intent system
export * from "./intents.js";

// Tool definitions
export * from "./tools.js";

// Deterministic router
export * from "./router.js";

// Tool registry with allowlist
export * from "./registry.js";

// Agent executor
export * from "./executor.js";

// Operational summaries
export * from "./summaries.js";

/**
 * High-level agent factory.
 */
import type { MovieDataAdapter } from "../providers/types.js";
import type { AppConfig } from "../config.js";
import { createAgentExecutor } from "./executor.js";
import { createSummaryStore, createRunSummary } from "./summaries.js";
import type { SummaryStore } from "./summaries.js";
import type { AgentConfig, AgentInput, AgentOutput } from "./executor.js";

export interface AgentDependencies {
  adapter: MovieDataAdapter;
  config: AppConfig;
  agentConfig?: Partial<AgentConfig>;
}

export interface Agent {
  execute(input: AgentInput): Promise<AgentOutput>;
  readonly summaryStore: SummaryStore;
}

/**
 * Create a fully configured agent.
 */
export function createAgent(deps: AgentDependencies): Agent {
  const executor = createAgentExecutor(deps.adapter, deps.agentConfig);
  const summaryStore = createSummaryStore(deps.config);

  return {
    execute: async (input: AgentInput) => {
      const result = await executor.execute(input);

      // Persist operational summary (no chain-of-thought)
      const runSummary = createRunSummary(
        input.requestId,
        input.userId,
        result,
        !!input.userId
      );
      await summaryStore.recordRun(runSummary);

      // Persist tool call details
      // Note: executor doesn't expose raw tool results, so we'd need to enhance
      // For now, the summary store gets the run summary

      return result;
    },
    summaryStore,
  };
}

// Re-export helpers from summaries
export { createRunSummary, createToolCallDetails, hashInput } from "./summaries.js";

// Re-export types
export type { AgentConfig, AgentInput, AgentOutput } from "./executor.js";
export type { SummaryStore, AgentRunSummary, ToolCallDetail } from "./summaries.js";