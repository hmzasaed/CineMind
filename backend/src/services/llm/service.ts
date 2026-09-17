import {
  DEFAULT_RETRY_POLICY,
  LLMError,
  type GenerateStructuredParams,
  type GenerateTextParams,
  type LLMConfig,
  type LLMProviderName,
  type LLMResponse,
  type RetryPolicy,
  type TokenUsage,
} from "./types.js";
import { estimateCost } from "./pricing.js";

export abstract class LLMService {
  readonly provider: LLMProviderName;
  readonly model: string;
  protected readonly retryPolicy: RetryPolicy;

  constructor(config: LLMConfig) {
    this.provider = config.provider;
    this.model = config.model;
    this.retryPolicy = {
      ...DEFAULT_RETRY_POLICY,
      ...(config.retryPolicy ?? {}),
    };
  }

  /**
   * Generate raw text response from the model.
   */
  async generateText(params: GenerateTextParams): Promise<LLMResponse<string>> {
    const startTime = Date.now();
    const timeoutMs = params.timeoutMs ?? this.retryPolicy.timeoutMs;

    const result = await this.withRetry(async (signal) => {
      return this.doGenerateText(params, signal);
    }, timeoutMs);

    const durationMs = Date.now() - startTime;
    const cost = estimateCost(this.provider, this.model, result.tokenUsage);

    return {
      data: result.text,
      rawText: result.text,
      tokenUsage: result.tokenUsage,
      cost,
      durationMs,
      provider: this.provider,
      model: this.model,
    };
  }

  /**
   * Generate typed structured output conforming to a Zod schema.
   */
  async generateStructured<T>(
    params: GenerateStructuredParams<T>
  ): Promise<LLMResponse<T>> {
    const startTime = Date.now();
    const timeoutMs = params.timeoutMs ?? this.retryPolicy.timeoutMs;

    const result = await this.withRetry(async (signal) => {
      return this.doGenerateStructured<T>(params, signal);
    }, timeoutMs);

    const durationMs = Date.now() - startTime;
    const cost = estimateCost(this.provider, this.model, result.tokenUsage);

    return {
      data: result.data,
      rawText: result.rawText,
      tokenUsage: result.tokenUsage,
      cost,
      durationMs,
      provider: this.provider,
      model: this.model,
    };
  }

  /**
   * Execute with timeout and retry policy for transient errors (429, 5xx, network drops).
   */
  protected async withRetry<R>(
    fn: (signal: AbortSignal) => Promise<R>,
    timeoutMs: number
  ): Promise<R> {
    let lastError: unknown;
    let attempt = 0;
    const maxAttempts = this.retryPolicy.maxRetries + 1;

    while (attempt < maxAttempts) {
      attempt++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const result = await fn(controller.signal);
        clearTimeout(timer);
        return result;
      } catch (err: unknown) {
        clearTimeout(timer);
        lastError = err;

        const isAbort =
          err instanceof Error &&
          (err.name === "AbortError" || controller.signal.aborted);

        if (isAbort) {
          lastError = new LLMError(
            `LLM request timed out after ${timeoutMs}ms`,
            this.provider,
            { status: 504, isRetryable: attempt < maxAttempts, cause: err }
          );
        }

        const isRetryable =
          lastError instanceof LLMError
            ? lastError.isRetryable
            : isAbort;

        if (!isRetryable || attempt >= maxAttempts) {
          break;
        }

        // Exponential backoff with small random jitter
        const backoff =
          this.retryPolicy.initialBackoffMs *
          Math.pow(this.retryPolicy.backoffFactor, attempt - 1);
        const jitter = Math.random() * 50;
        await new Promise((resolve) => setTimeout(resolve, backoff + jitter));
      }
    }

    if (lastError instanceof LLMError) {
      throw lastError;
    }
    throw new LLMError(
      lastError instanceof Error ? lastError.message : "LLM operation failed",
      this.provider,
      { cause: lastError }
    );
  }

  protected abstract doGenerateText(
    params: GenerateTextParams,
    signal: AbortSignal
  ): Promise<{ text: string; tokenUsage: TokenUsage }>;

  protected abstract doGenerateStructured<T>(
    params: GenerateStructuredParams<T>,
    signal: AbortSignal
  ): Promise<{ data: T; rawText: string; tokenUsage: TokenUsage }>;
}
