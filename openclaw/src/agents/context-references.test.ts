import { describe, expect, it } from "vitest";
import {
  parseContextReferences,
  expandContextReferences,
  generateSubdirectoryHints,
  type ContextReference,
} from "./context-references.js";

describe("parseContextReferences", () => {
  it("parses @file references", () => {
    const refs = parseContextReferences("Look at @file:src/main.ts for the entrypoint");
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0].kind).toBe("file");
    expect(refs[0].target).toContain("src/main.ts");
  });

  it("parses @url references", () => {
    const refs = parseContextReferences("See @url:https://docs.example.com/api");
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0].kind).toBe("url");
  });

  it("parses @dir references", () => {
    const refs = parseContextReferences("Check @dir:src/components/");
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0].kind).toBe("directory");
  });

  it("returns empty array for text without references", () => {
    expect(parseContextReferences("Just a plain message")).toEqual([]);
  });

  it("handles multiple references in one string", () => {
    const refs = parseContextReferences("See @file:a.ts and @file:b.ts");
    expect(refs.length).toBe(2);
  });
});

describe("expandContextReferences", () => {
  it("returns expansion results for file refs", async () => {
    const refs: ContextReference[] = [
      { kind: "file", target: "nonexistent.ts", raw: "@file:nonexistent.ts" },
    ];
    const result = await expandContextReferences(refs, "/tmp/test-project");
    expect(result).toEqual(
      expect.objectContaining({
        expanded: expect.any(Array),
        errors: expect.any(Array),
      }),
    );
  });
});

describe("generateSubdirectoryHints", () => {
  it("generates hints for a given directory", () => {
    const hints = generateSubdirectoryHints(["src", "tests", "docs"]);
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.some((h) => h.name === "src")).toBe(true);
  });

  it("returns empty for empty input", () => {
    expect(generateSubdirectoryHints([])).toEqual([]);
  });
});
