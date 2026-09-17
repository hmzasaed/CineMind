import { LLMService } from "./service.js";
import {
  LLMError,
  type GenerateStructuredParams,
  type GenerateTextParams,
  type LLMConfig,
  type TokenUsage,
} from "./types.js";

export class OpenAiCompatLLMService extends LLMService {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: LLMConfig) {
    super(config);
    this.apiKey = config.apiKey ?? "";
    this.baseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  }

  protected override async doGenerateText(
    params: GenerateTextParams,
    signal: AbortSignal
  ): Promise<{ text: string; tokenUsage: TokenUsage }> {
    const payload = {
      model: this.model,
      messages: params.messages,
      temperature: params.temperature ?? 0.2,
      max_tokens: params.maxTokens ?? 1024,
    };

    const res = await this.sendRequest("/chat/completions", payload, signal);
    const text = res.choices?.[0]?.message?.content ?? "";
    const tokenUsage: TokenUsage = {
      promptTokens: res.usage?.prompt_tokens ?? 0,
      completionTokens: res.usage?.completion_tokens ?? 0,
      totalTokens: res.usage?.total_tokens ?? 0,
    };

    return { text, tokenUsage };
  }

  protected override async doGenerateStructured<T>(
    params: GenerateStructuredParams<T>,
    signal: AbortSignal
  ): Promise<{ data: T; rawText: string; tokenUsage: TokenUsage }> {
    // We instruct the model to produce valid JSON adhering to instructions
    const systemPrompt: (typeof params.messages)[0] = {
      role: "system",
      content:
        "Respond ONLY with a valid JSON object matching the requested schema. Do not include markdown code fences or conversational filler.",
    };

    const payload = {
      model: this.model,
      messages: [systemPrompt, ...params.messages],
      temperature: params.temperature ?? 0.1,
      response_format: { type: "json_object" },
    };

    const res = await this.sendRequest("/chat/completions", payload, signal);
    const rawText = res.choices?.[0]?.message?.content ?? "{}";

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch (parseErr) {
      throw new LLMError(
        `Failed to parse JSON response from LLM: ${(parseErr as Error).message}`,
        this.provider,
        { status: 422, isRetryable: false }
      );
    }

    const validated = params.schema.safeParse(parsed);
    if (!validated.success) {
      throw new LLMError(
        `LLM structured output failed validation: ${validated.error.message}`,
        this.provider,
        { status: 422, isRetryable: false }
      );
    }

    const tokenUsage: TokenUsage = {
      promptTokens: res.usage?.prompt_tokens ?? 0,
      completionTokens: res.usage?.completion_tokens ?? 0,
      totalTokens: res.usage?.total_tokens ?? 0,
    };

    return { data: validated.data, rawText, tokenUsage };
  }

  private async sendRequest(
    path: string,
    body: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      });
    } catch (err: unknown) {
      const isAbort =
        (err instanceof Error && err.name === "AbortError") || signal.aborted;
      if (isAbort) {
        throw new LLMError("Request timed out", this.provider, {
          status: 504,
          isRetryable: true,
          cause: err,
        });
      }
      throw new LLMError(
        `Network error calling ${this.provider}: ${(err as Error).message}`,
        this.provider,
        { isRetryable: true, cause: err }
      );
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      const isRetryable = res.status === 429 || res.status >= 500;
      throw new LLMError(
        `Provider ${this.provider} returned HTTP ${res.status}: ${errorText}`,
        this.provider,
        { status: res.status, isRetryable }
      );
    }

    return res.json();
  }
}
