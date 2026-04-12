import { describe, expect, it } from "vitest";
import {
  createMessageInjector,
  type MessageInjectorConfig,
  type InjectedMessage,
} from "./plugin-message-injection.js";

describe("createMessageInjector", () => {
  const config: MessageInjectorConfig = {
    maxInjectedPerTurn: 5,
    maxTotalTokens: 2000,
  };

  it("creates an injector with add and apply methods", () => {
    const injector = createMessageInjector(config);
    expect(injector).toHaveProperty("add");
    expect(injector).toHaveProperty("apply");
    expect(injector).toHaveProperty("stats");
  });

  it("adds and applies injected messages", () => {
    const injector = createMessageInjector(config);
    injector.add({
      role: "system",
      content: "Remember: the user prefers concise answers.",
      pluginId: "preferences",
      priority: 10,
    });
    const messages = [
      { role: "system" as const, content: "You are helpful." },
      { role: "user" as const, content: "Hi" },
    ];
    const result = injector.apply(messages);
    expect(result.messages.length).toBeGreaterThanOrEqual(messages.length);
    expect(result.injectedCount).toBe(1);
  });

  it("respects maxInjectedPerTurn limit", () => {
    const injector = createMessageInjector({ ...config, maxInjectedPerTurn: 2 });
    for (let i = 0; i < 5; i++) {
      injector.add({
        role: "system",
        content: `Injection ${i}`,
        pluginId: `p${i}`,
        priority: i,
      });
    }
    const result = injector.apply([{ role: "user", content: "Hello" }]);
    // Only 2 should be injected
    expect(result.injectedCount).toBeLessThanOrEqual(2);
  });

  it("tracks stats correctly", () => {
    const injector = createMessageInjector(config);
    injector.add({ role: "system", content: "test", pluginId: "p1", priority: 1 });
    injector.apply([{ role: "user", content: "x" }]);
    const stats = injector.stats();
    expect(stats.totalAdded).toBe(1);
    expect(stats.totalApplied).toBe(1);
  });
});
