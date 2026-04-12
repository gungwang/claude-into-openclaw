import { describe, expect, it } from "vitest";
import {
  routeTask,
  formatRoutingDecision,
  type SmartModelRouterConfig,
  type TaskContext,
} from "./smart-model-routing.js";

const config: SmartModelRouterConfig = {
  models: [
    { id: "gpt-4", tier: "large", capabilities: ["reasoning", "code"], costPer1kTokens: 0.03 },
    { id: "gpt-3.5-turbo", tier: "small", capabilities: ["chat"], costPer1kTokens: 0.002 },
    { id: "claude-haiku", tier: "small", capabilities: ["chat", "code"], costPer1kTokens: 0.001 },
  ],
  defaultModel: "gpt-3.5-turbo",
};

describe("routeTask", () => {
  it("routes simple chat to a small model", () => {
    const ctx: TaskContext = { complexity: "low", requiredCapabilities: ["chat"] };
    const decision = routeTask(config, ctx);
    expect(decision.selectedModel).toBeDefined();
    expect(decision.tier).toBe("small");
  });

  it("routes complex reasoning to a large model", () => {
    const ctx: TaskContext = { complexity: "high", requiredCapabilities: ["reasoning"] };
    const decision = routeTask(config, ctx);
    expect(decision.tier).toBe("large");
    expect(decision.selectedModel).toBe("gpt-4");
  });

  it("returns the default model when no capability matches", () => {
    const ctx: TaskContext = { complexity: "low", requiredCapabilities: ["nonexistent" as any] };
    const decision = routeTask(config, ctx);
    expect(decision.selectedModel).toBe(config.defaultModel);
  });

  it("includes cost estimate in decision", () => {
    const ctx: TaskContext = { complexity: "medium", requiredCapabilities: ["code"] };
    const decision = routeTask(config, ctx);
    expect(decision).toHaveProperty("costPer1kTokens");
    expect(typeof decision.costPer1kTokens).toBe("number");
  });
});

describe("formatRoutingDecision", () => {
  it("returns a human-readable string", () => {
    const decision = routeTask(config, { complexity: "high", requiredCapabilities: ["reasoning"] });
    const text = formatRoutingDecision(decision);
    expect(text).toContain(decision.selectedModel);
    expect(typeof text).toBe("string");
  });
});
