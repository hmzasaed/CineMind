import type { z } from "zod";

export type LLMProviderName =
  | "mock"
  | "rule-based"
  | "openai"
  | "gemini"
  | "groq"
  | "mistral";

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CostMetadata {
  estimatedCostUsd: number;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface RetryPolicy {
  maxRetries: number;
  initialBackoffMs: number;
  backoffFactor: number;
  timeoutMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 2,
  initialBackoffMs: 200,
  backoffFactor: 2,
  timeoutMs: 15000,
};

export interface LLMConfig {
  provider: LLMProviderName;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  retryPolicy?: Partial<RetryPolicy>;
  temperature?: number;
  maxTokens?: number;
}

export interface GenerateTextParams {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface GenerateStructuredParams<T> {
  messages: LLMMessage[];
  schema: z.ZodType<T>;
  schemaName?: string;
  schemaDescription?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface LLMResponse<T = string> {
  data: T;
  rawText: string;
  tokenUsage: TokenUsage;
  cost: CostMetadata;
  durationMs: number;
  provider: LLMProviderName;
  model: string;
}

export class LLMError extends Error {
  readonly provider: LLMProviderName;
  readonly status?: number;
  readonly isRetryable: boolean;

  constructor(
    message: string,
    provider: LLMProviderName,
    options?: { status?: number; isRetryable?: boolean; cause?: unknown }
  ) {
    super(message);
    this.name = "LLMError";
    this.provider = provider;
    this.status = options?.status;
    this.isRetryable = options?.isRetryable ?? false;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

