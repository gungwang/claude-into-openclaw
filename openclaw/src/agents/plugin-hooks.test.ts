import { describe, expect, it, vi } from "vitest";
import {
  createPluginHookBus,
  createPluginToolsetRegistry,
  type PluginHookBusConfig,
} from "./plugin-hooks.js";

describe("createPluginHookBus", () => {
  const config: PluginHookBusConfig = {
    enabled: true,
    callbackTimeoutMs: 5_000,
    faultIsolated: true,
    maxCallbacksPerHook: 50,
  };

  it("creates a bus with registration and invocation", () => {
    const bus = createPluginHookBus(config);
    expect(bus).toHaveProperty("register");
    expect(bus).toHaveProperty("invoke");
    expect(bus).toHaveProperty("hasCallbacks");
    expect(bus).toHaveProperty("getStats");
  });

  it("registers and invokes hooks", async () => {
    const bus = createPluginHookBus(config);
    const cb = vi.fn().mockResolvedValue(undefined);
    bus.register({
      pluginId: "test-plugin",
      hookName: "pre_tool_call",
      callback: cb,
      priority: 0,
    });

    const result = await bus.invoke("pre_tool_call", { toolName: "shell" });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(result.errors).toHaveLength(0);
  });

  it("catches and reports hook errors", async () => {
    const bus = createPluginHookBus(config);
    const failingCb = vi.fn().mockRejectedValue(new Error("boom"));
    bus.register({
      pluginId: "bad-plugin",
      hookName: "pre_tool_call",
      callback: failingCb,
      priority: 0,
    });

    const result = await bus.invoke("pre_tool_call", {});
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]!.error).toContain("boom");
  });

  it("tracks registered hooks via getStats", () => {
    const bus = createPluginHookBus(config);
    bus.register({
      pluginId: "p1",
      hookName: "post_tool_call",
      callback: vi.fn(),
      priority: 0,
    });
    bus.register({
      pluginId: "p2",
      hookName: "post_tool_call",
      callback: vi.fn(),
      priority: 1,
    });
    expect(bus.hasCallbacks("post_tool_call")).toBe(true);
    expect(bus.getStats().post_tool_call).toBe(2);
  });
});

describe("createPluginToolsetRegistry", () => {
  it("registers and retrieves toolsets", () => {
    const registry = createPluginToolsetRegistry();
    registry.register({
      name: "custom_tools",
      description: "Custom tools",
      pluginId: "my-plugin",
      tools: ["my_tool"],
      dependencies: [],
    });
    const toolsets = registry.list();
    expect(toolsets).toHaveLength(1);
    expect(toolsets[0]!.name).toBe("custom_tools");
  });

  it("retrieves toolset by name", () => {
    const registry = createPluginToolsetRegistry();
    registry.register({
      name: "search",
      description: "Search tools",
      pluginId: "p1",
      tools: ["web_search"],
      dependencies: [],
    });
    const ts = registry.get("search");
    expect(ts).toBeDefined();
    expect(ts!.tools[0]).toBe("web_search");
  });
});
