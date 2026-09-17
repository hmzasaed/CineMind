import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MockLLMService } from "../mock.js";
import { estimateCost } from "../pricing.js";
import { LLMError } from "../types.js";

describe("LLMService Abstraction", () => {
  it("generates text with token tracking and cost calculation", async () => {
    const service = new MockLLMService({
      provider: "mock",
      model: "mock-model",
      textResponses: ["Inception was directed by Christopher Nolan."],
    });

    const res = await service.generateText({
      messages: [{ role: "user", content: "Who directed Inception?" }],
    });

    expect(res.data).toBe("Inception was directed by Christopher Nolan.");
    expect(res.provider).toBe("mock");
    expect(res.model).toBe("mock-model");
    expect(res.tokenUsage.totalTokens).toBeGreaterThan(0);
    expect(res.cost.estimatedCostUsd).toBeGreaterThanOrEqual(0);
    expect(res.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("supports structured output validation with zod", async () => {
    const service = new MockLLMService();
    const movieSchema = z.object({
      title: z.string(),
      releaseYear: z.number(),
      director: z.string(),
    });

    service.queueStructuredResponse({
      title: "Interstellar",
      releaseYear: 2014,
      director: "Christopher Nolan",
    });

    const res = await service.generateStructured({
      messages: [{ role: "user", content: "Details on Interstellar" }],
      schema: movieSchema,
      schemaName: "MovieDetails",
    });

    expect(res.data.title).toBe("Interstellar");
    expect(res.data.releaseYear).toBe(2014);
    expect(res.data.director).toBe("Christopher Nolan");
  });

  it("handles malformed model output without crashing", async () => {
    const service = new MockLLMService({
      forceMalformedJson: true,
    });

    const testSchema = z.object({ value: z.string() });

    await expect(
      service.generateStructured({
        messages: [{ role: "user", content: "test" }],
        schema: testSchema,
      })
    ).rejects.toThrow(/Invalid JSON/);
  });

  it("retries on retryable errors and succeeds when transient error clears", async () => {
    const service = new MockLLMService({
      forceError: {
        status: 429,
        message: "Rate limit reached",
        isRetryable: true,
        failCount: 1, // fails 1st time, succeeds 2nd time
      },
      textResponses: ["Recovered after rate limit!"],
      retryPolicy: {
        maxRetries: 2,
        initialBackoffMs: 10,
        backoffFactor: 1.5,
        timeoutMs: 1000,
      },
    });

    const res = await service.generateText({
      messages: [{ role: "user", content: "hello" }],
    });

    expect(res.data).toBe("Recovered after rate limit!");
    expect(service.getCallCount()).toBe(2);
  });

  it("fails when retries are exhausted", async () => {
    const service = new MockLLMService({
      forceError: {
        status: 500,
        message: "Internal model crash",
        isRetryable: true,
        failCount: 5,
      },
      retryPolicy: {
        maxRetries: 1,
        initialBackoffMs: 5,
        backoffFactor: 1,
        timeoutMs: 500,
      },
    });

    await expect(
      service.generateText({
        messages: [{ role: "user", content: "hello" }],
      })
    ).rejects.toThrow(/Internal model crash/);
  });

  it("times out if execution exceeds timeout limit", async () => {
    const service = new MockLLMService({
      simulatedLatencyMs: 200,
      retryPolicy: {
        maxRetries: 0,
        initialBackoffMs: 5,
        backoffFactor: 1,
        timeoutMs: 50, // lower than latency
      },
    });

    await expect(
      service.generateText({
        messages: [{ role: "user", content: "hello" }],
        timeoutMs: 50,
      })
    ).rejects.toThrow(/timed out/);
  });

  it("calculates cost according to pricing table", () => {
    const usage = {
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
    };
    const cost = estimateCost("openai", "gpt-4o", usage);
    expect(cost.estimatedCostUsd).toBeGreaterThan(0);
  });
});

