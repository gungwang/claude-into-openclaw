import { describe, expect, it, vi } from "vitest";
import {
  createPluginHookBus,
  createPluginToolsetRegistry,
  type PluginHookBus,
  type PluginHookBusConfig,
  type PluginToolsetRegistry,
} from "./plugin-hooks.js";

describe("createPluginHookBus", () => {
  const config: PluginHookBusConfig = {
    maxListeners: 10,
    timeoutMs: 5_000,
  };

  it("creates a bus with registration and invocation", () => {
    const bus = createPluginHookBus(config);
    expect(bus).toHaveProperty("register");
    expect(bus).toHaveProperty("invoke");
    expect(bus).toHaveProperty("listRegistrations");
  });

  it("registers and invokes hooks", async () => {
    const bus = createPluginHookBus(config);
    const cb = vi.fn().mockResolvedValue({ ok: true });
    bus.register("beforeToolCall", cb, { pluginId: "test-plugin" });

    const result = await bus.invoke("beforeToolCall", { toolName: "shell" });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(result.errors).toHaveLength(0);
  });

  it("catches and reports hook errors", async () => {
    const bus = createPluginHookBus(config);
    const failingCb = vi.fn().mockRejectedValue(new Error("boom"));
    bus.register("beforeToolCall", failingCb, { pluginId: "bad-plugin" });

    const result = await bus.invoke("beforeToolCall", {});
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].message).toContain("boom");
  });

  it("lists registered hooks", () => {
    const bus = createPluginHookBus(config);
    bus.register("afterToolCall", vi.fn(), { pluginId: "p1" });
    bus.register("afterToolCall", vi.fn(), { pluginId: "p2" });
    const regs = bus.listRegistrations("afterToolCall");
    expect(regs).toHaveLength(2);
  });
});

describe("createPluginToolsetRegistry", () => {
  it("registers and retrieves toolsets", () => {
    const registry = createPluginToolsetRegistry();
    registry.register({
      pluginId: "my-plugin",
      name: "custom_tools",
      tools: [{ name: "my_tool", description: "A tool", parameters: {} }],
    });
    const toolsets = registry.list();
    expect(toolsets).toHaveLength(1);
    expect(toolsets[0].name).toBe("custom_tools");
  });

  it("retrieves toolset by name", () => {
    const registry = createPluginToolsetRegistry();
    registry.register({
      pluginId: "p1",
      name: "search",
      tools: [{ name: "web_search", description: "Search", parameters: {} }],
    });
    const ts = registry.get("search");
    expect(ts).not.toBeNull();
    expect(ts!.tools[0].name).toBe("web_search");
  });
});
