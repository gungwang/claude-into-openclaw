import { describe, expect, it } from "vitest";
import {
  routeTask,
  formatRoutingDecision,
  type SmartModelRouterConfig,
  type TaskContext,
} from "./smart-model-routing.js";

const config: SmartModelRouterConfig = {
  models: [
    {
      modelId: "gpt-4", provider: "openai", tier: "capable",
      contextWindow: 128_000, costPer1kInput: 0.03, costPer1kOutput: 0.06,
      supportsTools: true, supportsVision: true, supportsReasoning: true,
    },
    {
      modelId: "gpt-3.5-turbo", provider: "openai", tier: "fast",
      contextWindow: 16_000, costPer1kInput: 0.001, costPer1kOutput: 0.002,
      supportsTools: true, supportsVision: false, supportsReasoning: false,
    },
    {
      modelId: "claude-haiku", provider: "anthropic", tier: "fast",
      contextWindow: 200_000, costPer1kInput: 0.0008, costPer1kOutput: 0.004,
      supportsTools: true, supportsVision: false, supportsReasoning: false,
    },
  ],
};

function simpleCtx(overrides: Partial<TaskContext> = {}): TaskContext {
  return {
    taskDescription: "explain what this code does",
    contextTokens: 500,
    fileCount: 1,
    expectedToolCalls: 0,
    hasImages: false,
    conversationTurns: 1,
    previousErrors: 0,
    ...overrides,
  };
}

describe("routeTask", () => {
  it("routes simple chat to a fast model", () => {
    const decision = routeTask(simpleCtx(), config);
    expect(decision.selectedModel).toBeDefined();
    expect(["fast", "standard"]).toContain(decision.tier);
  });

  it("routes complex reasoning to a capable model", () => {
    const ctx = simpleCtx({
      taskDescription: "architect a new microservice migration with trade-offs",
      contextTokens: 20_000,
      fileCount: 10,
      expectedToolCalls: 5,
    });
    const decision = routeTask(ctx, config);
    expect(["capable", "premium"]).toContain(decision.tier);
  });

  it("returns a valid model from the config", () => {
    const decision = routeTask(simpleCtx(), config);
    const ids = config.models.map((m) => m.modelId);
    expect(ids).toContain(decision.selectedModel);
  });

  it("includes cost estimate in decision", () => {
    const decision = routeTask(simpleCtx({ taskDescription: "generate a test file" }), config);
    expect(decision).toHaveProperty("estimatedCost");
    expect(typeof decision.estimatedCost).toBe("number");
  });
});

describe("formatRoutingDecision", () => {
  it("returns a human-readable string", () => {
    const decision = routeTask(simpleCtx({ taskDescription: "analyze this architecture" }), config);
    const text = formatRoutingDecision(decision);
    expect(text).toContain(decision.selectedModel);
    expect(typeof text).toBe("string");
  });
});
