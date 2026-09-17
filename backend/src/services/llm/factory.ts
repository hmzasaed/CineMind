import type { AppConfig } from "../../config.js";
import { MockLLMService } from "./mock.js";
import { OpenAiCompatLLMService } from "./openai-compat.js";
import type { LLMService } from "./service.js";
import type { LLMConfig } from "./types.js";

export function createLLMService(config: AppConfig, overrides?: Partial<LLMConfig>): LLMService {
  const provider = overrides?.provider ?? config.llmProvider;
  const model = overrides?.model ?? config.llmModel;

  const retryPolicy = {
    maxRetries: config.llmMaxRetries,
    timeoutMs: config.llmTimeoutMs,
    ...(overrides?.retryPolicy ?? {}),
  };

  if (provider === "mock" || provider === "rule-based") {
    return new MockLLMService({
      provider,
      model,
      retryPolicy,
    });
  }

  if (provider === "openai") {
    return new OpenAiCompatLLMService({
      provider: "openai",
      model: model === "mock-model" ? "gpt-4o-mini" : model,
      apiKey: config.openaiApiKey,
      baseUrl: "https://api.openai.com/v1",
      retryPolicy,
    });
  }

  if (provider === "gemini") {
    return new OpenAiCompatLLMService({
      provider: "gemini",
      model: model === "mock-model" ? "gemini-2.0-flash" : model,
      apiKey: config.geminiApiKey,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      retryPolicy,
    });
  }

  if (provider === "groq") {
    return new OpenAiCompatLLMService({
      provider: "groq",
      model: model === "mock-model" ? "llama-3.3-70b-versatile" : model,
      apiKey: config.groqApiKey,
      baseUrl: "https://api.groq.com/openai/v1",
      retryPolicy,
    });
  }

  if (provider === "mistral") {
    return new OpenAiCompatLLMService({
      provider: "mistral",
      model: model === "mock-model" ? "open-mistral-nemo-2407" : model,
      apiKey: config.mistralApiKey,
      baseUrl: "https://api.mistral.ai/v1",
      retryPolicy,
    });
  }

  return new MockLLMService({ provider: "mock", model: "mock-model", retryPolicy });
}

