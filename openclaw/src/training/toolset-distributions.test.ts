import { describe, expect, it } from "vitest";
import {
  DISTRIBUTIONS,
  getDistribution,
  listDistributions,
  sampleToolsetsFromDistribution,
  sampleFromDistribution,
  validateDistribution,
  createCustomDistribution,
  type ToolsetDistribution,
} from "./toolset-distributions.js";

describe("DISTRIBUTIONS", () => {
  it("contains at least the standard presets", () => {
    expect(DISTRIBUTIONS).toHaveProperty("default");
    expect(DISTRIBUTIONS).toHaveProperty("research");
    expect(DISTRIBUTIONS).toHaveProperty("safe");
    expect(DISTRIBUTIONS).toHaveProperty("minimal");
    expect(DISTRIBUTIONS).toHaveProperty("development");
  });

  it("all distributions have valid probabilities (0-100)", () => {
    for (const [_name, dist] of Object.entries(DISTRIBUTIONS)) {
      for (const [_tool, prob] of Object.entries(dist.toolsets)) {
        expect(prob).toBeGreaterThanOrEqual(0);
        expect(prob).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("getDistribution", () => {
  it("returns a known distribution by name", () => {
    const dist = getDistribution("default");
    expect(dist).not.toBeNull();
    expect(dist!.description).toBe("All available tools, all the time");
  });

  it("returns null for unknown name", () => {
    expect(getDistribution("nonexistent")).toBeNull();
  });
});

describe("listDistributions", () => {
  it("returns all built-in distribution names", () => {
    const names = listDistributions();
    expect(names).toContain("default");
    expect(names).toContain("minimal");
    expect(names).toContain("research");
  });
});

describe("sampleToolsetsFromDistribution", () => {
  it("returns at least one toolset", () => {
    const result = sampleToolsetsFromDistribution("default");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns only toolsets present in the distribution", () => {
    const names = Object.keys(DISTRIBUTIONS.minimal.toolsets);
    for (let i = 0; i < 20; i++) {
      const sampled = sampleToolsetsFromDistribution("minimal");
      for (const s of sampled) {
        expect(names).toContain(s);
      }
    }
  });

  it("throws for unknown distribution name", () => {
    expect(() => sampleToolsetsFromDistribution("nonexistent")).toThrow(
      "Unknown distribution: nonexistent",
    );
  });
});

describe("sampleFromDistribution", () => {
  it("returns toolsets from a distribution object", () => {
    const result = sampleFromDistribution(DISTRIBUTIONS.default);
    expect(result.length).toBeGreaterThan(0);
  });

  it("filters by knownToolsets when provided", () => {
    const known = new Set(["web", "terminal"]);
    for (let i = 0; i < 20; i++) {
      const result = sampleFromDistribution(DISTRIBUTIONS.default, known);
      for (const s of result) {
        expect(known.has(s)).toBe(true);
      }
    }
  });
});

describe("validateDistribution", () => {
  it("accepts distributions whose toolsets are all known", () => {
    const dist: ToolsetDistribution = {
      description: "test",
      toolsets: { terminal: 90, web: 50 },
    };
    const known = new Set(["terminal", "web", "vision"]);
    const result = validateDistribution(dist, known);
    expect(result.valid).toBe(true);
    expect(result.unknown).toEqual([]);
  });

  it("reports unknown toolsets", () => {
    const dist: ToolsetDistribution = {
      description: "has unknown",
      toolsets: { terminal: 80, exotic: 50 },
    };
    const known = new Set(["terminal", "web"]);
    const result = validateDistribution(dist, known);
    expect(result.valid).toBe(false);
    expect(result.unknown).toEqual(["exotic"]);
  });

  it("reports multiple unknown toolsets", () => {
    const dist: ToolsetDistribution = {
      description: "all unknown",
      toolsets: { foo: 50, bar: 50 },
    };
    const known = new Set(["terminal"]);
    const result = validateDistribution(dist, known);
    expect(result.valid).toBe(false);
    expect(result.unknown).toEqual(["foo", "bar"]);
  });
});

describe("createCustomDistribution", () => {
  it("creates a distribution with description and toolsets", () => {
    const dist = createCustomDistribution("my-dist", { terminal: 100, web: 30 });
    expect(dist.description).toBe("my-dist");
    expect(dist.toolsets.terminal).toBe(100);
    expect(dist.toolsets.web).toBe(30);
  });

  it("clamps probabilities to [0, 100]", () => {
    const dist = createCustomDistribution("clamped", { a: 150, b: -10 });
    expect(dist.toolsets.a).toBe(100);
    expect(dist.toolsets.b).toBe(0);
  });
});
