import { describe, expect, it } from "vitest";
import {
  applyPromptCaching,
  detectCacheProvider,
  createCacheMetrics,
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

  it("returns null for unknown models", () => {
    expect(detectCacheProvider("some-unknown-model")).toBeNull();
  });
});

describe("applyPromptCaching", () => {
  const config: PromptCachingConfig = {
    enabled: true,
    minTokenThreshold: 10,
  };

  it("returns marked messages with cache control", () => {
    const messages: MessageLike[] = [
      { role: "system", content: "You are a helpful assistant. ".repeat(20) },
      { role: "user", content: "Hello" },
    ];
    const result = applyPromptCaching(messages, config, "anthropic");
    expect(result.applied).toBe(true);
    expect(result.messages.length).toBe(messages.length);
  });

  it("skips caching when disabled", () => {
    const messages: MessageLike[] = [
      { role: "user", content: "Hello" },
    ];
    const result = applyPromptCaching(messages, { ...config, enabled: false }, "anthropic");
    expect(result.applied).toBe(false);
  });

  it("skips caching for null provider", () => {
    const messages: MessageLike[] = [
      { role: "user", content: "Hello" },
    ];
    const result = applyPromptCaching(messages, config, null);
    expect(result.applied).toBe(false);
  });
});

describe("createCacheMetrics", () => {
  it("creates empty metrics", () => {
    const metrics = createCacheMetrics();
    expect(metrics.hits).toBe(0);
    expect(metrics.misses).toBe(0);
    expect(metrics.totalTokensSaved).toBe(0);
  });
});
