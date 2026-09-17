import type { LLMProviderName, TokenUsage, CostMetadata } from "./types.js";

/** Cost per 1M tokens (USD) [prompt, completion] */
const PRICING_PER_MILLION: Record<string, [number, number]> = {
  // OpenAI
  "gpt-4o": [2.5, 10.0],
  "gpt-4o-mini": [0.15, 0.6],
  "gpt-3.5-turbo": [0.5, 1.5],
  // Gemini
  "gemini-2.0-flash": [0.1, 0.4],
  "gemini-1.5-flash": [0.075, 0.3],
  "gemini-1.5-pro": [1.25, 5.0],
  // Groq
  "llama-3.3-70b-versatile": [0.59, 0.79],
  "llama-3.1-8b-instant": [0.05, 0.08],
  // Mistral
  "open-mistral-nemo-2407": [0.15, 0.15],
  "mistral-small-latest": [0.2, 0.6],
  // Mock / default
  mock: [0.0, 0.0],
  default: [0.2, 0.8],
};

export function estimateCost(
  _provider: LLMProviderName,
  model: string,
  usage: TokenUsage
): CostMetadata {
  const rates = PRICING_PER_MILLION[model] ?? PRICING_PER_MILLION.default;
  const promptCost = (usage.promptTokens / 1_000_000) * rates[0];
  const completionCost = (usage.completionTokens / 1_000_000) * rates[1];
  const total = Number((promptCost + completionCost).toFixed(7));
  return { estimatedCostUsd: total };
}

