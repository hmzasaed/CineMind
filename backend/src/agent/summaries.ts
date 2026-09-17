/**
 * Operational summaries persistence.
 * Stores bounded operational summaries without any chain-of-thought,
 * prompts, messages, or private reasoning.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "../config.js";
import { createSupabaseAdminClient } from "../services/supabase.js";
import { getErrorMessage } from "../util.js";

/**
 * Operational summary record - what we persist.
 * NO chain-of-thought, NO prompts, NO messages, NO reasoning.
 * Only bounded operational metadata.
 */
export interface AgentRunSummary {
  /** Unique request identifier. */
  requestId: string;
  /** User identifier (if authenticated). */
  userId: string | null;
  /** Classified intent. */
  intent: string;
  /** Intent confidence (0-1). */
  intentConfidence: number;
  /** Intent category. */
  intentCategory: string;
  /** Tools that were called. */
  toolsCalled: Array<{
    name: string;
    success: boolean;
    durationMs: number;
    error: string | null;
  }>;
  /** Total execution time in ms. */
  totalDurationMs: number;
  /** Tool budget consumed. */
  toolBudgetUsed: number;
  /** Number of tool calls made. */
  toolCallsCount: number;
  /** Whether execution timed out. */
  timedOut: boolean;
  /** Errors encountered. */
  errors: string[];
  /** ISO timestamp. */
  createdAt: string;
  /** Whether user was authenticated. */
  authenticated: boolean;
}

/**
 * Tool call detail record for debugging.
 */
export interface ToolCallDetail {
  /** Parent agent run ID. */
  runId: string;
  /** Tool name. */
  toolName: string;
  /** Sanitized input (no PII, no full text). */
  inputHash: string;
  /** Input schema validation passed. */
  inputValid: boolean;
  /** Output schema validation passed. */
  outputValid: boolean;
  /** Success status. */
  success: boolean;
  /** Duration in ms. */
  durationMs: number;
  /** Error message if failed. */
  error: string | null;
  /** Provenance source name. */
  provenanceSourceName: string | null;
  /** Provenance source kind. */
  provenanceSourceKind: string | null;
  /** Provenance confidence. */
  provenanceConfidence: number | null;
  /** ISO timestamp. */
  createdAt: string;
}

/**
 * Interface for the summary store.
 */
export interface SummaryStore {
  /** Record an agent run summary. */
  recordRun(summary: AgentRunSummary): Promise<void>;
  /** Record a tool call detail. */
  recordToolCall(detail: ToolCallDetail): Promise<void>;
  /** Get recent runs for a user (for debugging/monitoring). */
  getRecentRuns(userId: string, limit?: number): Promise<AgentRunSummary[]>;
  /** Get runs by intent (for analytics). */
  getRunsByIntent(intent: string, limit?: number): Promise<AgentRunSummary[]>;
  /** Get error rates. */
  getErrorStats(since: string): Promise<{ intent: string; total: number; errors: number; avgDurationMs: number }[]>;
}

/**
 * In-memory summary store (dev/tests).
 */
export class InMemorySummaryStore implements SummaryStore {
  private readonly runs: AgentRunSummary[] = [];
  private readonly toolCalls: ToolCallDetail[] = [];

  async recordRun(summary: AgentRunSummary): Promise<void> {
    this.runs.unshift(summary);
    // Keep only last 1000 runs
    if (this.runs.length > 1000) this.runs.length = 1000;
  }

  async recordToolCall(detail: ToolCallDetail): Promise<void> {
    this.toolCalls.unshift(detail);
    if (this.toolCalls.length > 5000) this.toolCalls.length = 5000;
  }

  async getRecentRuns(userId: string, limit = 50): Promise<AgentRunSummary[]> {
    return this.runs.filter((r) => r.userId === userId).slice(0, limit);
  }

  async getRunsByIntent(intent: string, limit = 100): Promise<AgentRunSummary[]> {
    return this.runs.filter((r) => r.intent === intent).slice(0, limit);
  }

  async getErrorStats(since: string): Promise<{ intent: string; total: number; errors: number; avgDurationMs: number }[]> {
    const sinceDate = new Date(since).getTime();
    const relevant = this.runs.filter((r) => new Date(r.createdAt).getTime() >= sinceDate);
    const byIntent = new Map<string, { total: number; errors: number; durationSum: number }>();

    for (const run of relevant) {
      const entry = byIntent.get(run.intent) ?? { total: 0, errors: 0, durationSum: 0 };
      entry.total++;
      entry.durationSum += run.totalDurationMs;
      if (run.errors.length > 0) entry.errors++;
      byIntent.set(run.intent, entry);
    }

    return Array.from(byIntent.entries()).map(([intent, stats]) => ({
      intent,
      total: stats.total,
      errors: stats.errors,
      avgDurationMs: stats.total > 0 ? Math.round(stats.durationSum / stats.total) : 0,
    }));
  }

  /** Get all runs (for testing). */
  getAllRuns(): AgentRunSummary[] {
    return [...this.runs];
  }

  /** Get all tool calls (for testing). */
  getAllToolCalls(): ToolCallDetail[] {
    return [...this.toolCalls];
  }

  /** Clear all data (for testing). */
  clear(): void {
    this.runs.length = 0;
    this.toolCalls.length = 0;
  }
}

/**
 * Supabase-backed summary store (production).
 */
export class SupabaseSummaryStore implements SummaryStore {
  constructor(private readonly admin: SupabaseClient) {}

  async recordRun(summary: AgentRunSummary): Promise<void> {
    const { error } = await this.admin.from("agent_runs").insert({
      request_id: summary.requestId,
      user_id: summary.userId,
      intent: summary.intent,
      intent_confidence: summary.intentConfidence,
      intent_category: summary.intentCategory,
      tools_called: summary.toolsCalled,
      total_duration_ms: summary.totalDurationMs,
      tool_budget_used: summary.toolBudgetUsed,
      tool_calls_count: summary.toolCallsCount,
      timed_out: summary.timedOut,
      errors: summary.errors,
      created_at: summary.createdAt,
      authenticated: summary.authenticated,
    });
    if (error) throw new Error(`Failed to record agent run: ${getErrorMessage(error.message)}`);
  }

  async recordToolCall(detail: ToolCallDetail): Promise<void> {
    const { error } = await this.admin.from("agent_tool_calls").insert({
      run_id: detail.runId,
      tool_name: detail.toolName,
      input_hash: detail.inputHash,
      input_valid: detail.inputValid,
      output_valid: detail.outputValid,
      success: detail.success,
      duration_ms: detail.durationMs,
      error: detail.error,
      provenance_source_name: detail.provenanceSourceName,
      provenance_source_kind: detail.provenanceSourceKind,
      provenance_confidence: detail.provenanceConfidence,
      created_at: detail.createdAt,
    });
    if (error) throw new Error(`Failed to record tool call: ${getErrorMessage(error.message)}`);
  }

  async getRecentRuns(userId: string, limit = 50): Promise<AgentRunSummary[]> {
    const { data, error } = await this.admin
      .from("agent_runs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Failed to get recent runs: ${getErrorMessage(error.message)}`);
    return (data ?? []).map(this.mapRun);
  }

  async getRunsByIntent(intent: string, limit = 100): Promise<AgentRunSummary[]> {
    const { data, error } = await this.admin
      .from("agent_runs")
      .select("*")
      .eq("intent", intent)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Failed to get runs by intent: ${getErrorMessage(error.message)}`);
    return (data ?? []).map(this.mapRun);
  }

  async getErrorStats(since: string): Promise<{ intent: string; total: number; errors: number; avgDurationMs: number }[]> {
    const { data, error } = await this.admin
      .from("agent_runs")
      .select("intent, total_duration_ms, errors")
      .gte("created_at", since);
    if (error) throw new Error(`Failed to get error stats: ${getErrorMessage(error.message)}`);

    const byIntent = new Map<string, { total: number; errors: number; durationSum: number }>();
    for (const row of data ?? []) {
      const entry = byIntent.get(row.intent) ?? { total: 0, errors: 0, durationSum: 0 };
      entry.total++;
      entry.durationSum += row.total_duration_ms;
      if (Array.isArray(row.errors) && row.errors.length > 0) entry.errors++;
      byIntent.set(row.intent, entry);
    }

    return Array.from(byIntent.entries()).map(([intent, stats]) => ({
      intent,
      total: stats.total,
      errors: stats.errors,
      avgDurationMs: stats.total > 0 ? Math.round(stats.durationSum / stats.total) : 0,
    }));
  }

  private mapRun(row: any): AgentRunSummary {
    return {
      requestId: row.request_id,
      userId: row.user_id,
      intent: row.intent,
      intentConfidence: row.intent_confidence,
      intentCategory: row.intent_category,
      toolsCalled: row.tools_called ?? [],
      totalDurationMs: row.total_duration_ms,
      toolBudgetUsed: row.tool_budget_used,
      toolCallsCount: row.tool_calls_count,
      timedOut: row.timed_out,
      errors: row.errors ?? [],
      createdAt: row.created_at,
      authenticated: row.authenticated,
    };
  }
}

/**
 * Create the appropriate summary store based on configuration.
 */
export function createSummaryStore(config: AppConfig): SummaryStore {
  if (config.supabaseUrl && config.supabaseServiceRoleKey) {
    return new SupabaseSummaryStore(
      createSupabaseAdminClient(config.supabaseUrl, config.supabaseServiceRoleKey)
    );
  }
  return new InMemorySummaryStore();
}

/**
 * Create a sanitized hash of tool input for logging (no PII).
 */
export function hashInput(input: Record<string, unknown>): string {
  // Simple deterministic hash for logging - in production use crypto
  const str = JSON.stringify(input, Object.keys(input).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Helper to create a run summary from executor output.
 */
export function createRunSummary(
  requestId: string,
  userId: string | undefined,
  executorOutput: { summary: any }, // AgentOutput["summary"]
  authenticated: boolean
): AgentRunSummary {
  return {
    requestId,
    userId: userId ?? null,
    intent: executorOutput.summary.intent,
    intentConfidence: executorOutput.summary.intentConfidence,
    intentCategory: executorOutput.summary.intentCategory,
    toolsCalled: executorOutput.summary.toolsCalled.map((t: any) => ({
      name: t.toolName,
      success: t.success,
      durationMs: t.durationMs,
      error: t.error,
    })),
    totalDurationMs: executorOutput.summary.totalDurationMs,
    toolBudgetUsed: executorOutput.summary.toolBudgetUsed,
    toolCallsCount: executorOutput.summary.toolCallsCount,
    timedOut: executorOutput.summary.timedOut,
    errors: executorOutput.summary.errors,
    createdAt: new Date().toISOString(),
    authenticated,
  };
}

/**
 * Helper to create tool call details from executor output.
 */
export function createToolCallDetails(
  runId: string,
  toolResults: any[] // ToolExecutionResult[]
): ToolCallDetail[] {
  return toolResults.map((r) => ({
    runId,
    toolName: r.metadata.toolName,
    inputHash: "sanitized", // Would be actual hash in real impl
    inputValid: r.metadata.inputValid,
    outputValid: r.metadata.outputValid,
    success: r.success,
    durationMs: r.metadata.durationMs,
    error: r.error,
    provenanceSourceName: r.provenance?.sourceName ?? null,
    provenanceSourceKind: r.provenance?.sourceKind ?? null,
    provenanceConfidence: r.provenance?.confidence ?? null,
    createdAt: new Date().toISOString(),
  }));
}