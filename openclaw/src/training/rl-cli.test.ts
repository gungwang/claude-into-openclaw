import { describe, expect, it } from "vitest";
import {
  checkRequirements,
  allRequirementsMet,
  formatRequirementChecks,
  formatTrainingResult,
  formatEvalResult,
  RL_SYSTEM_PROMPT,
  RL_TOOLSETS,
  type RlTrainingResult,
  type RlEvalResult,
} from "./rl-cli.js";

describe("RL_SYSTEM_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof RL_SYSTEM_PROMPT).toBe("string");
    expect(RL_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });
});

describe("RL_TOOLSETS", () => {
  it("includes terminal, web, rl", () => {
    expect(RL_TOOLSETS).toContain("terminal");
    expect(RL_TOOLSETS).toContain("web");
    expect(RL_TOOLSETS).toContain("rl");
  });
});

describe("checkRequirements", () => {
  it("passes when all keys present", () => {
    const checks = checkRequirements({
      OPENROUTER_API_KEY: "key1",
      TINKER_API_KEY: "key2",
      WANDB_API_KEY: "key3",
    });
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(allRequirementsMet(checks)).toBe(true);
  });

  it("fails when keys are missing", () => {
    const checks = checkRequirements({});
    expect(checks.some((c) => !c.ok)).toBe(true);
    expect(allRequirementsMet(checks)).toBe(false);
  });

  it("partially fails for subset of keys", () => {
    const checks = checkRequirements({
      OPENROUTER_API_KEY: "key1",
    });
    const ok = checks.filter((c) => c.ok);
    const fail = checks.filter((c) => !c.ok);
    expect(ok.length).toBe(1);
    expect(fail.length).toBe(2);
  });
});

describe("formatRequirementChecks", () => {
  it("returns formatted string", () => {
    const checks = checkRequirements({ OPENROUTER_API_KEY: "k" });
    const text = formatRequirementChecks(checks);
    expect(text).toContain("OPENROUTER_API_KEY");
    expect(text).toContain("✓");
    expect(text).toContain("✗");
  });
});

describe("formatTrainingResult", () => {
  it("formats a training result", () => {
    const result: RlTrainingResult = {
      runName: "test-run",
      stats: { completed: 10, total: 12, failed: 1, skipped: 1 },
      outputFile: "/tmp/out.jsonl",
      durationMs: 5000,
    };
    const text = formatTrainingResult(result);
    expect(text).toContain("test-run");
    expect(text).toContain("10");
    expect(text).toContain("12");
  });
});

describe("formatEvalResult", () => {
  it("formats an eval result", () => {
    const result: RlEvalResult = {
      summary: {
        benchmarkName: "terminalbench2",
        totalTasks: 10,
        passedTasks: 8,
        failedTasks: 2,
        overallPassRate: 0.8,
        categoryPassRates: { general: { passed: 8, total: 10, rate: 0.8 } },
        results: [],
        totalDurationMs: 30000,
      },
      durationMs: 30000,
    };
    const text = formatEvalResult(result);
    expect(text).toContain("80.0%");
    expect(text).toContain("terminalbench2");
  });
});
