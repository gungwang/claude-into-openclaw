import { describe, expect, it } from "vitest";
import {
  createMessageInjector,
  type MessageInjectorConfig,
} from "./plugin-message-injection.js";

describe("createMessageInjector", () => {
  const config: MessageInjectorConfig = {
    enabled: true,
    maxQueueSize: 100,
    maxContentLength: 50_000,
    allowedRoles: ["user", "system"],
  };

  it("creates an injector with inject and drain methods", () => {
    const injector = createMessageInjector(config);
    expect(injector).toHaveProperty("inject");
    expect(injector).toHaveProperty("drain");
    expect(injector).toHaveProperty("getStats");
  });

  it("injects and drains messages", () => {
    const injector = createMessageInjector(config);
    const result = injector.inject({
      role: "system",
      content: "Remember: the user prefers concise answers.",
      pluginId: "preferences",
      priority: 10,
    });
    expect(result.ok).toBe(true);
    expect(injector.queueSize()).toBe(1);

    const drained = injector.drain();
    expect(drained).toHaveLength(1);
    expect(drained[0]!.content).toBe(
      "Remember: the user prefers concise answers.",
    );
    expect(drained[0]!.pluginId).toBe("preferences");
    expect(injector.queueSize()).toBe(0);
  });

  it("respects maxQueueSize limit", () => {
    const injector = createMessageInjector({ ...config, maxQueueSize: 2 });
    injector.inject({ content: "m1", pluginId: "p1" });
    injector.inject({ content: "m2", pluginId: "p2" });
    const result = injector.inject({ content: "m3", pluginId: "p3" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Queue full");
    }
    expect(injector.queueSize()).toBe(2);
  });

  it("tracks stats correctly", () => {
    const injector = createMessageInjector(config);
    injector.inject({
      role: "system",
      content: "test",
      pluginId: "p1",
      priority: 1,
    });
    injector.drain();
    const stats = injector.getStats();
    expect(stats.totalInjected).toBe(1);
    expect(stats.totalDrained).toBe(1);
  });
});
