import { describe, expect, it } from "vitest";
import {
  DISTRIBUTIONS,
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

  it("all distributions have valid probabilities (0-1)", () => {
    for (const [name, dist] of Object.entries(DISTRIBUTIONS)) {
      for (const [tool, prob] of Object.entries(dist.toolsets)) {
        expect(prob).toBeGreaterThanOrEqual(0);
        expect(prob).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("sampleToolsetsFromDistribution", () => {
  it("returns at least one toolset", () => {
    const result = sampleToolsetsFromDistribution(DISTRIBUTIONS.default);
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns only toolsets present in the distribution", () => {
    const dist = DISTRIBUTIONS.minimal;
    const names = Object.keys(dist.toolsets);
    for (let i = 0; i < 20; i++) {
      const sampled = sampleToolsetsFromDistribution(dist);
      for (const s of sampled) {
        expect(names).toContain(s);
      }
    }
  });
});

describe("sampleFromDistribution", () => {
  it("returns a named distribution result", () => {
    const result = sampleFromDistribution("default");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("validateDistribution", () => {
  it("accepts valid distributions", () => {
    const dist: ToolsetDistribution = {
      name: "test",
      toolsets: { terminal: 0.9, web: 0.5 },
    };
    expect(validateDistribution(dist)).toBe(true);
  });

  it("rejects distributions with probability > 1", () => {
    const dist: ToolsetDistribution = {
      name: "bad",
      toolsets: { terminal: 1.5 },
    };
    expect(validateDistribution(dist)).toBe(false);
  });

  it("rejects distributions with negative probability", () => {
    const dist: ToolsetDistribution = {
      name: "bad",
      toolsets: { terminal: -0.1 },
    };
    expect(validateDistribution(dist)).toBe(false);
  });

  it("rejects distributions with no toolsets", () => {
    const dist: ToolsetDistribution = { name: "empty", toolsets: {} };
    expect(validateDistribution(dist)).toBe(false);
  });
});

describe("createCustomDistribution", () => {
  it("creates a named distribution", () => {
    const dist = createCustomDistribution("my-dist", { terminal: 1.0, web: 0.3 });
    expect(dist.name).toBe("my-dist");
    expect(dist.toolsets.terminal).toBe(1.0);
  });
});
