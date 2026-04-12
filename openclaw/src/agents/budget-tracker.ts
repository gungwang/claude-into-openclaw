/**
 * Cost Budget Tracker (Track C — Developer Experience)
 *
 * Per-tool and per-session cost budget limits. Tracks cumulative cost
 * and halts execution when limits are exceeded. Supports per-tool
 * overrides with pinned thresholds for critical tools.
 *
 * Ported from hermes-agent `tools/budget_config.py`.
 * Adapted to TypeScript. Immutable config, mutable tracker.
 */

// ── Types ──

export type BudgetConfig = {
  /** Session-level cost budget (USD). 0 = unlimited. Default: 0. */
  sessionBudgetUsd: number;
  /** Per-turn cost budget (USD). 0 = unlimited. Default: 0. */
  turnBudgetUsd: number;
  /** Default per-tool result size threshold (chars). Default: 100_000. */
  defaultResultSizeChars: number;
  /** Per-turn aggregate char budget for tool results. Default: 200_000. */
  turnBudgetChars: number;
  /** Inline preview size after persistence (chars). Default: 1_500. */
  previewSizeChars: number;
  /** Per-tool cost overrides (USD). */
  toolOverrides: Record<string, number>;
  /** Per-tool result size overrides (chars). */
  toolResultOverrides: Record<string, number>;
};

export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  sessionBudgetUsd: 0,
  turnBudgetUsd: 0,
  defaultResultSizeChars: 100_000,
  turnBudgetChars: 200_000,
  previewSizeChars: 1_500,
  toolOverrides: {},
  toolResultOverrides: {},
};

/**
 * Tools whose result-size thresholds must never be overridden.
 * read_file = Infinity prevents infinite persist->read->persist loops.
 */
const PINNED_THRESHOLDS: Readonly<Record<string, number>> = {
  read_file: Infinity,
};

export type CostEntry = {
  toolName: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  timestamp: number;
};

export type BudgetState = {
  sessionCostUsd: number;
  turnCostUsd: number;
  turnCharsUsed: number;
  entries: readonly CostEntry[];
  turnCount: number;
  exceeded: boolean;
  exceedReason: string | undefined;
};

export type BudgetCheckResult =
  | { allowed: true }
  | { allowed: false; reason: string };

// ── Budget tracker ──

/**
 * Mutable budget tracker for a single session.
 *
 * Usage:
 *   const tracker = createBudgetTracker(config);
 *   tracker.newTurn();
 *   const check = tracker.checkBudget("read_file", estimatedCost);
 *   if (!check.allowed) { halt(); }
 *   tracker.recordCost({ toolName, costUsd, ... });
 */
export type BudgetTracker = {
  /** Start a new turn — resets per-turn counters. */
  newTurn(): void;
  /** Check whether a tool call is within budget before executing. */
  checkBudget(toolName: string, estimatedCostUsd: number): BudgetCheckResult;
  /** Record actual cost after a tool call completes. */
  recordCost(entry: CostEntry): void;
  /** Record tool-result chars used this turn. */
  recordResultChars(toolName: string, chars: number): BudgetCheckResult;
  /** Resolve the result-size threshold for a tool. */
  resolveResultThreshold(toolName: string): number;
  /** Get current state snapshot (for telemetry / journal). */
  getState(): BudgetState;
};

export function createBudgetTracker(
  config: BudgetConfig = DEFAULT_BUDGET_CONFIG,
): BudgetTracker {
  let sessionCostUsd = 0;
  let turnCostUsd = 0;
  let turnCharsUsed = 0;
  let turnCount = 0;
  let exceeded = false;
  let exceedReason: string | undefined;
  const entries: CostEntry[] = [];

  return {
    newTurn() {
      turnCostUsd = 0;
      turnCharsUsed = 0;
      turnCount++;
    },

    checkBudget(toolName: string, estimatedCostUsd: number): BudgetCheckResult {
      if (exceeded) {
        return { allowed: false, reason: exceedReason ?? "Budget previously exceeded" };
      }

      // Check per-tool override
      const toolLimit = config.toolOverrides[toolName];
      if (toolLimit !== undefined && estimatedCostUsd > toolLimit) {
        return {
          allowed: false,
          reason: `Tool "${toolName}" estimated cost $${estimatedCostUsd.toFixed(4)} exceeds limit $${toolLimit.toFixed(4)}`,
        };
      }

      // Check turn budget
      if (config.turnBudgetUsd > 0 && turnCostUsd + estimatedCostUsd > config.turnBudgetUsd) {
        return {
          allowed: false,
          reason: `Turn budget exceeded: $${(turnCostUsd + estimatedCostUsd).toFixed(4)} > $${config.turnBudgetUsd.toFixed(4)}`,
        };
      }

      // Check session budget
      if (
        config.sessionBudgetUsd > 0 &&
        sessionCostUsd + estimatedCostUsd > config.sessionBudgetUsd
      ) {
        return {
          allowed: false,
          reason: `Session budget exceeded: $${(sessionCostUsd + estimatedCostUsd).toFixed(4)} > $${config.sessionBudgetUsd.toFixed(4)}`,
        };
      }

      return { allowed: true };
    },

    recordCost(entry: CostEntry) {
      sessionCostUsd += entry.costUsd;
      turnCostUsd += entry.costUsd;
      entries.push(entry);

      // Check if we've now exceeded budgets
      if (config.sessionBudgetUsd > 0 && sessionCostUsd >= config.sessionBudgetUsd) {
        exceeded = true;
        exceedReason = `Session budget exhausted: $${sessionCostUsd.toFixed(4)} >= $${config.sessionBudgetUsd.toFixed(4)}`;
      }
    },

    recordResultChars(toolName: string, chars: number): BudgetCheckResult {
      turnCharsUsed += chars;
      if (config.turnBudgetChars > 0 && turnCharsUsed > config.turnBudgetChars) {
        return {
          allowed: false,
          reason: `Turn char budget exceeded: ${turnCharsUsed} > ${config.turnBudgetChars}`,
        };
      }
      return { allowed: true };
    },

    resolveResultThreshold(toolName: string): number {
      // Priority: pinned > tool overrides > default
      if (toolName in PINNED_THRESHOLDS) {
        return PINNED_THRESHOLDS[toolName];
      }
      if (toolName in config.toolResultOverrides) {
        return config.toolResultOverrides[toolName];
      }
      return config.defaultResultSizeChars;
    },

    getState(): BudgetState {
      return {
        sessionCostUsd,
        turnCostUsd,
        turnCharsUsed,
        entries: [...entries],
        turnCount,
        exceeded,
        exceedReason,
      };
    },
  };
}

// ── Cost estimation helpers ──

/**
 * Estimate cost for a model call based on token usage.
 * Prices are approximate — real billing comes from the provider.
 */
export function estimateCostUsd(
  inputTokens: number,
  outputTokens: number,
  inputPricePerMillion: number,
  outputPricePerMillion: number,
): number {
  return (
    (inputTokens / 1_000_000) * inputPricePerMillion +
    (outputTokens / 1_000_000) * outputPricePerMillion
  );
}

/** Well-known model pricing (USD per million tokens). */
export const MODEL_PRICING: Readonly<
  Record<string, { input: number; output: number }>
> = {
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-3-5-sonnet-20241022": { input: 3, output: 15 },
  "claude-3-5-haiku-20241022": { input: 1, output: 5 },
  "claude-3-opus-20240229": { input: 15, output: 75 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "o1-preview": { input: 15, output: 60 },
  "o1-mini": { input: 3, output: 12 },
};

/**
 * Format a budget state for display.
 */
export function formatBudgetSummary(state: BudgetState): string {
  const lines: string[] = [
    `Session cost: $${state.sessionCostUsd.toFixed(4)}`,
    `Turn cost: $${state.turnCostUsd.toFixed(4)}`,
    `Turn chars: ${state.turnCharsUsed.toLocaleString()}`,
    `Turns: ${state.turnCount}`,
    `Tool calls: ${state.entries.length}`,
  ];
  if (state.exceeded) {
    lines.push(`⚠ EXCEEDED: ${state.exceedReason}`);
  }
  return lines.join("\n");
}
