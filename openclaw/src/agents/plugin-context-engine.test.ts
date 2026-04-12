import { describe, expect, it } from "vitest";
import {
  createContextEngineRegistry,
  createFileContextEngine,
  type ContextQuery,
  type ContextEngine,
  type ContextRetrievalResult,
} from "./plugin-context-engine.js";

function makeEngine(name: string, result?: Partial<ContextRetrievalResult>): ContextEngine {
  return {
    name,
    description: `${name} engine`,
    retrieve: async () => ({
      items: [],
      totalTokens: 0,
      truncated: false,
      engineName: name,
      durationMs: 0,
      ...result,
    }),
  };
}

function makeQuery(overrides?: Partial<ContextQuery>): ContextQuery {
  return { query: "test query", cwd: "/tmp", maxTokens: 500, ...overrides };
}

describe("createContextEngineRegistry", () => {
  it("registers and retrieves an engine", () => {
    const registry = createContextEngineRegistry();
    const engine = makeEngine("test-engine");
    const ok = registry.register("plugin-a", engine);
    expect(ok).toBe(true);
    expect(registry.hasCustomEngine()).toBe(true);
    expect(registry.getActive()).toBe(engine);
    expect(registry.getActivePluginId()).toBe("plugin-a");
  });

  it("returns undefined when no engine is registered", () => {
    const registry = createContextEngineRegistry();
    expect(registry.getActive()).toBeUndefined();
    expect(registry.getActivePluginId()).toBeUndefined();
    expect(registry.hasCustomEngine()).toBe(false);
  });

  it("rejects a second registration (single-engine constraint)", () => {
    const registry = createContextEngineRegistry();
    registry.register("plugin-a", makeEngine("e1"));
    const ok = registry.register("plugin-b", makeEngine("e2"));
    expect(ok).toBe(false);
    // First engine still active
    expect(registry.getActive()?.name).toBe("e1");
  });

  it("retrieves context via the active engine", async () => {
    const registry = createContextEngineRegistry();
    registry.register("plugin-a", makeEngine("e1", {
      items: [{ content: "item1", source: "e1", relevance: 0.9, tokens: 100 }],
      totalTokens: 100,
    }));
    const result = await registry.retrieve(makeQuery());
    expect(result.items).toHaveLength(1);
    expect(result.totalTokens).toBe(100);
    expect(result.engineName).toBe("e1");
  });

  it("returns empty result when no engine is registered", async () => {
    const registry = createContextEngineRegistry();
    const result = await registry.retrieve(makeQuery());
    expect(result.items).toHaveLength(0);
    expect(result.totalTokens).toBe(0);
    expect(result.engineName).toBe("none");
  });

  it("unregisters the active engine", () => {
    const registry = createContextEngineRegistry();
    registry.register("plugin-a", makeEngine("e1"));
    const ok = registry.unregister("plugin-a");
    expect(ok).toBe(true);
    expect(registry.hasCustomEngine()).toBe(false);
    expect(registry.getActive()).toBeUndefined();
  });

  it("rejects unregister from a different plugin id", () => {
    const registry = createContextEngineRegistry();
    registry.register("plugin-a", makeEngine("e1"));
    const ok = registry.unregister("plugin-b");
    expect(ok).toBe(false);
    expect(registry.hasCustomEngine()).toBe(true);
  });
});

describe("createFileContextEngine", () => {
  it("creates an engine with name 'file-context'", () => {
    const engine = createFileContextEngine(async () => "content");
    expect(engine.name).toBe("file-context");
    expect(engine.description).toBeTruthy();
  });

  it("returns empty results when no file patterns are given", async () => {
    const engine = createFileContextEngine(async () => "content");
    const result = await engine.retrieve(makeQuery({ filePatterns: [] }));
    expect(result.items).toHaveLength(0);
  });

  it("reads files matching provided patterns", async () => {
    const readFile = async (path: string) => `contents of ${path}`;
    const engine = createFileContextEngine(readFile);
    const result = await engine.retrieve(makeQuery({ filePatterns: ["a.ts", "b.ts"] }));
    expect(result.items).toHaveLength(2);
    expect(result.items[0].source).toBe("a.ts");
    expect(result.items[1].source).toBe("b.ts");
    expect(result.totalTokens).toBeGreaterThan(0);
  });
});
