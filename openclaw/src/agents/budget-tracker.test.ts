import { describe, expect, it } from "vitest";
import {
  createBudgetTracker,
  estimateCostUsd,
  formatBudgetSummary,
  type BudgetConfig,
} from "./budget-tracker.js";

describe("estimateCostUsd", () => {
  it("computes cost from tokens and rate", () => {
    const cost = estimateCostUsd({ inputTokens: 1000, outputTokens: 500, costPer1kInput: 0.01, costPer1kOutput: 0.03 });
    // 1000/1000 * 0.01 + 500/1000 * 0.03 = 0.01 + 0.015 = 0.025
    expect(cost).toBeCloseTo(0.025, 4);
  });

  it("returns 0 for zero tokens", () => {
    expect(estimateCostUsd({ inputTokens: 0, outputTokens: 0, costPer1kInput: 0.01, costPer1kOutput: 0.03 })).toBe(0);
  });
});

describe("createBudgetTracker", () => {
  const config: BudgetConfig = {
    maxTotalCostUsd: 1.0,
    warnAtPct: 0.8,
  };

  it("tracks costs and enforces budget", () => {
    const tracker = createBudgetTracker(config);
    tracker.record({ inputTokens: 10000, outputTokens: 5000, costPer1kInput: 0.01, costPer1kOutput: 0.03 });
    const state = tracker.getState();
    expect(state.totalCostUsd).toBeGreaterThan(0);
    expect(state.entries.length).toBe(1);
  });

  it("returns ok check when under budget", () => {
    const tracker = createBudgetTracker(config);
    tracker.record({ inputTokens: 100, outputTokens: 50, costPer1kInput: 0.01, costPer1kOutput: 0.03 });
    const check = tracker.check();
    expect(check.exceeded).toBe(false);
    expect(check.warning).toBe(false);
  });

  it("returns exceeded when over budget", () => {
    const tracker = createBudgetTracker({ maxTotalCostUsd: 0.001, warnAtPct: 0.8 });
    tracker.record({ inputTokens: 100000, outputTokens: 50000, costPer1kInput: 0.01, costPer1kOutput: 0.03 });
    const check = tracker.check();
    expect(check.exceeded).toBe(true);
  });

  it("returns warning near threshold", () => {
    const tracker = createBudgetTracker({ maxTotalCostUsd: 0.03, warnAtPct: 0.5 });
    // This should exceed 50% of $0.03 = $0.015
    tracker.record({ inputTokens: 1000, outputTokens: 500, costPer1kInput: 0.01, costPer1kOutput: 0.03 });
    const check = tracker.check();
    expect(check.warning).toBe(true);
  });
});

describe("formatBudgetSummary", () => {
  it("formats a budget state as string", () => {
    const tracker = createBudgetTracker({ maxTotalCostUsd: 1.0, warnAtPct: 0.8 });
    tracker.record({ inputTokens: 1000, outputTokens: 500, costPer1kInput: 0.01, costPer1kOutput: 0.03 });
    const summary = formatBudgetSummary(tracker.getState());
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
  });
});
