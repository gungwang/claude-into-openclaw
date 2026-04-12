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
    referenceModels: [
      { id: "model-a", provider: "openai" },
      { id: "model-b", provider: "anthropic" },
    ],
    aggregatorModel: { id: "gpt-4", provider: "openai" },
    maxReferenceTokens: 1000,
    temperature: 0.7,
  };

  it("calls reference models and aggregator", async () => {
    const caller: LlmCaller = vi.fn()
      .mockResolvedValueOnce("Answer from model A")
      .mockResolvedValueOnce("Answer from model B")
      .mockResolvedValueOnce("Aggregated final answer");

    const result = await executeMoaQuery(
      "What is 2+2?",
      config,
      caller,
    );

    expect(caller).toHaveBeenCalledTimes(3);
    expect(result.answer).toBe("Aggregated final answer");
    expect(result.references).toHaveLength(2);
  });

  it("handles reference model failures gracefully", async () => {
    const caller: LlmCaller = vi.fn()
      .mockRejectedValueOnce(new Error("model-a timeout"))
      .mockResolvedValueOnce("Answer from model B")
      .mockResolvedValueOnce("Final answer with partial refs");

    const result = await executeMoaQuery("query", config, caller);
    // Should still produce a result using the successful reference
    expect(result.answer).toBeDefined();
    expect(result.references.length).toBeLessThanOrEqual(2);
  });
});
