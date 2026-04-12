import { describe, expect, it } from "vitest";
import {
  applyPromptCaching,
  detectCacheProvider,
  createCacheMetrics,
  recordCacheApplication,
  DEFAULT_PROMPT_CACHING_CONFIG,
  type PromptCachingConfig,
  type MessageLike,
  type CacheMetrics,
} from "./prompt-caching.js";

describe("detectCacheProvider", () => {
  it("detects anthropic from model name", () => {
    expect(detectCacheProvider("claude-3-opus")).toBe("anthropic");
    expect(detectCacheProvider("claude-3.5-sonnet")).toBe("anthropic");
  });

  it("detects openai from model name", () => {
    expect(detectCacheProvider("gpt-4")).toBe("openai");
    expect(detectCacheProvider("gpt-4o")).toBe("openai");
  });

  it("returns generic for unknown models", () => {
    expect(detectCacheProvider("some-unknown-model")).toBe("generic");
  });
});

describe("applyPromptCaching", () => {
  const config: PromptCachingConfig = {
    enabled: true,
    anthropicCacheTtl: "5m",
    anthropicMaxBreakpoints: 4,
    openaiPredictedOutputs: true,
  };

  it("returns marked messages with cache control for anthropic", () => {
    const messages: MessageLike[] = [
      { role: "system", content: "You are a helpful assistant. ".repeat(20) },
      { role: "user", content: "Hello" },
    ];
    const result = applyPromptCaching(messages, "anthropic", config);
    expect(result.breakpointsApplied).toBeGreaterThan(0);
    expect(result.provider).toBe("anthropic");
    expect(result.messages.length).toBe(messages.length);
  });

  it("skips caching when disabled", () => {
    const messages: MessageLike[] = [
      { role: "user", content: "Hello" },
    ];
    const result = applyPromptCaching(messages, "anthropic", { ...config, enabled: false });
    expect(result.breakpointsApplied).toBe(0);
  });

  it("skips caching for generic provider", () => {
    const messages: MessageLike[] = [
      { role: "user", content: "Hello" },
    ];
    const result = applyPromptCaching(messages, "generic", config);
    expect(result.breakpointsApplied).toBe(0);
    expect(result.provider).toBe("generic");
  });
});

describe("createCacheMetrics", () => {
  it("creates empty metrics", () => {
    const metrics = createCacheMetrics();
    expect(metrics.totalCalls).toBe(0);
    expect(metrics.breakpointsApplied).toBe(0);
    expect(metrics.byProvider).toEqual({ anthropic: 0, openai: 0, generic: 0 });
  });

  it("records cache application", () => {
    let metrics = createCacheMetrics();
    metrics = recordCacheApplication(metrics, {
      messages: [],
      breakpointsApplied: 3,
      provider: "anthropic",
    });
    expect(metrics.totalCalls).toBe(1);
    expect(metrics.breakpointsApplied).toBe(3);
    expect(metrics.byProvider.anthropic).toBe(1);
  });
});
