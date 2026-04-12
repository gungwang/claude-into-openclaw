import { describe, expect, it, vi } from "vitest";
import {
  executeMoaQuery,
  getMoaToolDefinition,
  type MoaConfig,
  type LlmCaller,
} from "./mixture-of-agents.js";

describe("getMoaToolDefinition", () => {
  it("returns a valid tool definition", () => {
    const def = getMoaToolDefinition();
    expect(def.name).toBe("mixture_of_agents");
    expect(def).toHaveProperty("description");
    expect(def).toHaveProperty("parameters");
  });
});

describe("executeMoaQuery", () => {
  const config: MoaConfig = {
    enabled: true,
    referenceModels: [
      { id: "model-a", provider: "openai", name: "Model A" },
      { id: "model-b", provider: "anthropic", name: "Model B" },
    ],
    aggregatorModel: { id: "gpt-4", provider: "openai", name: "GPT-4 Aggregator" },
    referenceTemperature: 0.7,
    aggregatorTemperature: 0.4,
    minSuccessfulReferences: 1,
    maxReferenceTokens: 1000,
    maxAggregatorTokens: 1000,
    referenceTimeoutMs: 120_000,
  };

  it("calls reference models and aggregator", async () => {
    const caller: LlmCaller = vi.fn()
      .mockResolvedValueOnce({ content: "Answer from model A" })
      .mockResolvedValueOnce({ content: "Answer from model B" })
      .mockResolvedValueOnce({ content: "Aggregated final answer" });

    const result = await executeMoaQuery(
      "What is 2+2?",
      caller,
      config,
    );

    expect(caller).toHaveBeenCalledTimes(3);
    expect(result.content).toBe("Aggregated final answer");
    expect(result.references).toHaveLength(2);
    expect(result.aggregated).toBe(true);
    expect(result.successfulReferences).toBe(2);
  });

  it("handles reference model failures gracefully", async () => {
    const caller: LlmCaller = vi.fn()
      .mockRejectedValueOnce(new Error("model-a timeout"))
      .mockResolvedValueOnce({ content: "Answer from model B" })
      .mockResolvedValueOnce({ content: "Final answer with partial refs" });

    const result = await executeMoaQuery("query", caller, config);
    // Should still produce a result using the successful reference
    expect(result.content).toBeDefined();
    expect(result.references).toHaveLength(2);
    expect(result.successfulReferences).toBe(1);
  });
});
