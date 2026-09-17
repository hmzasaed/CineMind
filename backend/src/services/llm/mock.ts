import { LLMService } from "./service.js";
import {
  LLMError,
  type GenerateStructuredParams,
  type GenerateTextParams,
  type LLMConfig,
  type TokenUsage,
} from "./types.js";

export interface MockLLMOptions extends Partial<LLMConfig> {
  simulatedLatencyMs?: number;
  forceError?: {
    status?: number;
    message?: string;
    isRetryable?: boolean;
    failCount?: number;
  };
  forceMalformedJson?: boolean;
  textResponses?: string[];
  structuredResponses?: unknown[];
}

export class MockLLMService extends LLMService {
  private simulatedLatencyMs: number;
  private forceError?: {
    status?: number;
    message?: string;
    isRetryable?: boolean;
    failCount?: number;
  };
  private forceMalformedJson: boolean;
  private textResponses: string[];
  private structuredResponses: unknown[];
  private callCount = 0;

  constructor(options: MockLLMOptions = {}) {
    super({
      provider: options.provider ?? "mock",
      model: options.model ?? "mock-model",
      retryPolicy: options.retryPolicy,
    });
    this.simulatedLatencyMs = options.simulatedLatencyMs ?? 5;
    this.forceError = options.forceError;
    this.forceMalformedJson = options.forceMalformedJson ?? false;
    this.textResponses = [...(options.textResponses ?? [])];
    this.structuredResponses = [...(options.structuredResponses ?? [])];
  }

  setSimulatedLatency(ms: number) {
    this.simulatedLatencyMs = ms;
  }

  setForceError(error?: MockLLMOptions["forceError"]) {
    this.forceError = error;
  }

  setForceMalformedJson(val: boolean) {
    this.forceMalformedJson = val;
  }

  queueTextResponse(res: string) {
    this.textResponses.push(res);
  }

  queueStructuredResponse(res: unknown) {
    this.structuredResponses.push(res);
  }

  getCallCount() {
    return this.callCount;
  }

  private async simulateWork(signal: AbortSignal) {
    this.callCount++;

    if (this.forceError) {
      const shouldFail =
        this.forceError.failCount === undefined ||
        this.callCount <= this.forceError.failCount;

      if (shouldFail) {
        throw new LLMError(
          this.forceError.message ?? "Simulated LLM service failure",
          this.provider,
          {
            status: this.forceError.status ?? 500,
            isRetryable: this.forceError.isRetryable ?? false,
          }
        );
      }
    }

    if (this.simulatedLatencyMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => resolve(), this.simulatedLatencyMs);
        signal.addEventListener("abort", () => {
          clearTimeout(timeout);
          const err = new Error("AbortError");
          err.name = "AbortError";
          reject(err);
        });
      });
    }
  }

  protected override async doGenerateText(
    params: GenerateTextParams,
    signal: AbortSignal
  ): Promise<{ text: string; tokenUsage: TokenUsage }> {
    await this.simulateWork(signal);

    const userMsg = params.messages[params.messages.length - 1]?.content ?? "";
    const text =
      this.textResponses.shift() ??
      `Mock response for query: "${userMsg.slice(0, 50)}"`;

    const promptTokens = Math.max(10, Math.ceil(userMsg.length / 4));
    const completionTokens = Math.max(15, Math.ceil(text.length / 4));

    return {
      text,
      tokenUsage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }

  protected override async doGenerateStructured<T>(
    params: GenerateStructuredParams<T>,
    signal: AbortSignal
  ): Promise<{ data: T; rawText: string; tokenUsage: TokenUsage }> {
    await this.simulateWork(signal);

    if (this.forceMalformedJson) {
      throw new LLMError(
        "Invalid JSON response returned by LLM: Unexpected token < in JSON",
        this.provider,
        { status: 422, isRetryable: false }
      );
    }

    let queued = this.structuredResponses.shift();
    let rawText: string;

    if (queued !== undefined) {
      rawText = typeof queued === "string" ? queued : JSON.stringify(queued);
    } else {
      // Create empty/dummy default matching basic objects
      rawText = JSON.stringify({
        explanation: "Automated mock response",
        facts: [],
      });
      queued = JSON.parse(rawText);
    }

    // Validate using the schema
    const parseResult = params.schema.safeParse(queued);
    if (!parseResult.success) {
      throw new LLMError(
        `Mock output failed schema validation: ${parseResult.error.message}`,
        this.provider,
        { status: 422, isRetryable: false }
      );
    }

    const promptTokens = 50;
    const completionTokens = 75;

    return {
      data: parseResult.data,
      rawText,
      tokenUsage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }
}
