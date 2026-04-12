import { describe, expect, it } from "vitest";
import {
  createContextEngineRegistry,
  createFileContextEngine,
  type ContextQuery,
  type ContextEngine,
} from "./plugin-context-engine.js";

describe("createContextEngineRegistry", () => {
  it("registers and retrieves engines", () => {
    const registry = createContextEngineRegistry();
    const engine: ContextEngine = {
      name: "test-engine",
      retrieve: async () => ({ items: [], totalTokens: 0 }),
    };
    registry.register(engine);
    expect(registry.list()).toHaveLength(1);
    expect(registry.get("test-engine")).toBe(engine);
  });

  it("returns null for unknown engines", () => {
    const registry = createContextEngineRegistry();
    expect(registry.get("nonexistent")).toBeNull();
  });

  it("queries all engines and merges results", async () => {
    const registry = createContextEngineRegistry();
    registry.register({
      name: "e1",
      retrieve: async () => ({
        items: [{ content: "item1", source: "e1", relevance: 0.9 }],
        totalTokens: 100,
      }),
    });
    registry.register({
      name: "e2",
      retrieve: async () => ({
        items: [{ content: "item2", source: "e2", relevance: 0.8 }],
        totalTokens: 50,
      }),
    });
    const query: ContextQuery = { text: "test query", maxTokens: 500 };
    const result = await registry.query(query);
    expect(result.items).toHaveLength(2);
    expect(result.totalTokens).toBe(150);
  });
});

describe("createFileContextEngine", () => {
  it("creates an engine with name 'file'", () => {
    const engine = createFileContextEngine({ basePath: "/tmp/test" });
    expect(engine.name).toBe("file");
  });

  it("returns empty results for nonexistent paths", async () => {
    const engine = createFileContextEngine({ basePath: "/tmp/nonexistent-path-xyz" });
    const result = await engine.retrieve({ text: "test", maxTokens: 100 });
    expect(result.items).toHaveLength(0);
  });
});
