import { describe, expect, it } from "vitest";
import {
  createBudgetTracker,
  estimateCostUsd,
  formatBudgetSummary,
  DEFAULT_BUDGET_CONFIG,
  type BudgetConfig,
  type CostEntry,
} from "./budget-tracker.js";

describe("estimateCostUsd", () => {
  it("computes cost from tokens and rate", () => {
    // 1000 input tokens at $3/M + 500 output tokens at $15/M
    // = (1000/1_000_000)*3 + (500/1_000_000)*15 = 0.003 + 0.0075 = 0.0105
    const cost = estimateCostUsd(1000, 500, 3, 15);
    expect(cost).toBeCloseTo(0.0105, 4);
  });

  it("returns 0 for zero tokens", () => {
    expect(estimateCostUsd(0, 0, 3, 15)).toBe(0);
  });
});

describe("createBudgetTracker", () => {
  const config: BudgetConfig = {
    sessionBudgetUsd: 1.0,
    turnBudgetUsd: 0.5,
    defaultResultSizeChars: 100_000,
    turnBudgetChars: 200_000,
    previewSizeChars: 1_500,
    toolOverrides: {},
    toolResultOverrides: {},
  };

  function makeCostEntry(overrides: Partial<CostEntry> = {}): CostEntry {
    return {
      toolName: "test_tool",
      costUsd: 0.01,
      inputTokens: 1000,
      outputTokens: 500,
      timestamp: Date.now(),
      ...overrides,
    };
  }

  it("tracks costs and records entries", () => {
    const tracker = createBudgetTracker(config);
    tracker.newTurn();
    tracker.recordCost(makeCostEntry({ costUsd: 0.05 }));
    const state = tracker.getState();
    expect(state.sessionCostUsd).toBeCloseTo(0.05, 4);
    expect(state.turnCostUsd).toBeCloseTo(0.05, 4);
    expect(state.entries.length).toBe(1);
    expect(state.turnCount).toBe(1);
  });

  it("returns allowed when under budget", () => {
    const tracker = createBudgetTracker(config);
    tracker.newTurn();
    tracker.recordCost(makeCostEntry({ costUsd: 0.001 }));
    const check = tracker.checkBudget("test_tool", 0.001);
    expect(check.allowed).toBe(true);
  });

  it("returns not allowed when session budget exceeded", () => {
    const tracker = createBudgetTracker({
      ...config,
      sessionBudgetUsd: 0.001,
    });
    tracker.newTurn();
    const check = tracker.checkBudget("test_tool", 0.01);
    expect(check.allowed).toBe(false);
    if (!check.allowed) {
      expect(check.reason).toContain("Session budget exceeded");
    }
  });

  it("returns not allowed when turn budget exceeded", () => {
    const tracker = createBudgetTracker({
      ...config,
      turnBudgetUsd: 0.01,
    });
    tracker.newTurn();
    tracker.recordCost(makeCostEntry({ costUsd: 0.009 }));
    const check = tracker.checkBudget("test_tool", 0.005);
    expect(check.allowed).toBe(false);
    if (!check.allowed) {
      expect(check.reason).toContain("Turn budget exceeded");
    }
  });

  it("marks exceeded after recording cost that exhausts session budget", () => {
    const tracker = createBudgetTracker({
      ...config,
      sessionBudgetUsd: 0.01,
    });
    tracker.newTurn();
    tracker.recordCost(makeCostEntry({ costUsd: 0.01 }));
    const state = tracker.getState();
    expect(state.exceeded).toBe(true);
    expect(state.exceedReason).toContain("Session budget exhausted");
  });

  it("resets turn counters on newTurn", () => {
    const tracker = createBudgetTracker(config);
    tracker.newTurn();
    tracker.recordCost(makeCostEntry({ costUsd: 0.05 }));
    tracker.newTurn();
    const state = tracker.getState();
    expect(state.turnCostUsd).toBe(0);
    expect(state.turnCharsUsed).toBe(0);
    expect(state.sessionCostUsd).toBeCloseTo(0.05, 4);
    expect(state.turnCount).toBe(2);
  });

  it("enforces per-tool cost overrides", () => {
    const tracker = createBudgetTracker({
      ...config,
      toolOverrides: { expensive_tool: 0.001 },
    });
    tracker.newTurn();
    const check = tracker.checkBudget("expensive_tool", 0.01);
    expect(check.allowed).toBe(false);
    if (!check.allowed) {
      expect(check.reason).toContain("expensive_tool");
    }
  });

  it("tracks result chars and enforces turn char budget", () => {
    const tracker = createBudgetTracker({
      ...config,
      turnBudgetChars: 100,
    });
    tracker.newTurn();
    const r1 = tracker.recordResultChars("test_tool", 60);
    expect(r1.allowed).toBe(true);
    const r2 = tracker.recordResultChars("test_tool", 60);
    expect(r2.allowed).toBe(false);
    if (!r2.allowed) {
      expect(r2.reason).toContain("Turn char budget exceeded");
    }
  });

  it("resolves result thresholds with pinned > override > default", () => {
    const tracker = createBudgetTracker({
      ...config,
      toolResultOverrides: { grep: 50_000 },
    });
    // Pinned tool (read_file) always returns Infinity
    expect(tracker.resolveResultThreshold("read_file")).toBe(Infinity);
    // Override
    expect(tracker.resolveResultThreshold("grep")).toBe(50_000);
    // Default
    expect(tracker.resolveResultThreshold("unknown_tool")).toBe(config.defaultResultSizeChars);
  });
});

describe("formatBudgetSummary", () => {
  it("formats a budget state as string", () => {
    const tracker = createBudgetTracker();
    tracker.newTurn();
    tracker.recordCost({
      toolName: "test_tool",
      costUsd: 0.05,
      inputTokens: 1000,
      outputTokens: 500,
      timestamp: Date.now(),
    });
    const summary = formatBudgetSummary(tracker.getState());
    expect(typeof summary).toBe("string");
    expect(summary).toContain("Session cost:");
    expect(summary).toContain("Turn cost:");
    expect(summary).toContain("Tool calls: 1");
  });

  it("includes exceeded warning when budget blown", () => {
    const tracker = createBudgetTracker({
      ...DEFAULT_BUDGET_CONFIG,
      sessionBudgetUsd: 0.001,
    });
    tracker.newTurn();
    tracker.recordCost({
      toolName: "test_tool",
      costUsd: 0.01,
      inputTokens: 5000,
      outputTokens: 2000,
      timestamp: Date.now(),
    });
    const summary = formatBudgetSummary(tracker.getState());
    expect(summary).toContain("EXCEEDED");
  });
});
