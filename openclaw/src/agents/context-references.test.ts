import { describe, expect, it } from "vitest";
import {
  parseContextReferences,
  expandContextReferences,
  generateSubdirectoryHints,
  DEFAULT_CONTEXT_REFERENCES_CONFIG,
  type ContextReference,
  type ContextReferenceResult,
  type SubdirectoryHint,
} from "./context-references.js";

describe("parseContextReferences", () => {
  it("parses @file references", () => {
    const refs = parseContextReferences("Look at @file:src/main.ts for the entrypoint");
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0].kind).toBe("file");
    expect(refs[0].target).toBe("src/main.ts");
  });

  it("parses @url references", () => {
    const refs = parseContextReferences("See @url:https://docs.example.com/api");
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0].kind).toBe("url");
  });

  it("parses @folder references", () => {
    const refs = parseContextReferences("Check @folder:src/components");
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0].kind).toBe("folder");
    expect(refs[0].target).toBe("src/components");
  });

  it("returns empty array for text without references", () => {
    expect(parseContextReferences("Just a plain message")).toEqual([]);
  });

  it("handles multiple references in one string", () => {
    const refs = parseContextReferences("See @file:a.ts and @file:b.ts");
    expect(refs.length).toBe(2);
  });

  it("parses @diff and @staged simple references", () => {
    const refs = parseContextReferences("Show me @diff and @staged");
    expect(refs.length).toBe(2);
    expect(refs[0].kind).toBe("diff");
    expect(refs[1].kind).toBe("staged");
  });

  it("parses @file references with line ranges", () => {
    const refs = parseContextReferences("See @file:src/main.ts:10-20");
    expect(refs.length).toBe(1);
    expect(refs[0].kind).toBe("file");
    expect(refs[0].target).toBe("src/main.ts");
    expect(refs[0].lineStart).toBe(10);
    expect(refs[0].lineEnd).toBe(20);
  });

  it("returns empty array for empty string", () => {
    expect(parseContextReferences("")).toEqual([]);
  });
});

describe("expandContextReferences", () => {
  it("returns expansion result with warnings for missing files", async () => {
    const result = await expandContextReferences(
      "Look at @file:nonexistent.ts",
      "/tmp/test-project",
    );
    expect(result).toEqual(
      expect.objectContaining({
        originalMessage: "Look at @file:nonexistent.ts",
        references: expect.any(Array),
        warnings: expect.any(Array),
        injectedTokens: expect.any(Number),
        expanded: expect.any(Boolean),
        blocked: false,
      }),
    );
  });

  it("returns unexpanded result when disabled", async () => {
    const result = await expandContextReferences(
      "Look at @file:something.ts",
      "/tmp/test-project",
      { ...DEFAULT_CONTEXT_REFERENCES_CONFIG, enabled: false },
    );
    expect(result.expanded).toBe(false);
    expect(result.references).toEqual([]);
    expect(result.injectedTokens).toBe(0);
  });

  it("returns unexpanded result when no references present", async () => {
    const result = await expandContextReferences(
      "Just a normal message",
      "/tmp/test-project",
    );
    expect(result.expanded).toBe(false);
    expect(result.references).toHaveLength(0);
  });
});

describe("generateSubdirectoryHints", () => {
  it("generates hints for a given directory", async () => {
    const hints = await generateSubdirectoryHints("/tmp");
    expect(hints).toBeInstanceOf(Array);
    for (const hint of hints) {
      expect(hint).toHaveProperty("path");
      expect(hint).toHaveProperty("description");
      expect(hint).toHaveProperty("fileCount");
    }
  });

  it("returns empty for nonexistent directory", async () => {
    const hints = await generateSubdirectoryHints("/tmp/nonexistent-dir-" + Date.now());
    expect(hints).toEqual([]);
  });
});
