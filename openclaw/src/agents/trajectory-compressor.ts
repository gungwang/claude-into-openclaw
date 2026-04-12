/**
 * Trajectory Compressor — Budget-Aware Compression (Track A — Session Intelligence)
 *
 * Post-processes conversation histories to compress them within a token
 * budget while preserving execution context. Protects first and last
 * turns, compresses middle spans with API-generated summaries.
 *
 * Ported from hermes-agent `trajectory_compressor.py`.
 * Adapted to TypeScript with Promise-based concurrency (p-limit).
 */

// ── Types ──

export type ConversationTurn = {
  role: string;
  content: string;
  toolCallId?: string;
  toolName?: string;
  tokenCount?: number;
};

export type CompressionConfig = {
  /** Target maximum tokens for the compressed conversation. */
  targetMaxTokens: number;
  /** Target tokens for the replacement summary. */
  summaryTargetTokens: number;
  /** Protect the first system message. */
  protectFirstSystem: boolean;
  /** Protect the first human message. */
  protectFirstHuman: boolean;
  /** Protect the first assistant response. */
  protectFirstAssistant: boolean;
  /** Protect the first tool result. */
  protectFirstTool: boolean;
  /** Number of trailing turns to protect. */
  protectLastNTurns: number;
  /** Append a notice about summarization. */
  addSummaryNotice: boolean;
  /** Text of the summary notice. */
  summaryNoticeText: string;
  /** Maximum concurrent summarization requests. */
  maxConcurrentRequests: number;
  /** Skip trajectories already under target. */
  skipUnderTarget: boolean;
};

export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  targetMaxTokens: 15250,
  summaryTargetTokens: 750,
  protectFirstSystem: true,
  protectFirstHuman: true,
  protectFirstAssistant: true,
  protectFirstTool: true,
  protectLastNTurns: 4,
  addSummaryNotice: true,
  summaryNoticeText:
    "\n\nSome of your previous tool responses may be summarized to preserve context.",
  maxConcurrentRequests: 10,
  skipUnderTarget: true,
};

export type CompressionResult = {
  originalTokens: number;
  compressedTokens: number;
  reductionPct: number;
  turnsRemoved: number;
  summaryInserted: boolean;
  compressed: ConversationTurn[];
};

export type CompressionMetrics = {
  totalProcessed: number;
  totalSkipped: number;
  totalCompressed: number;
  averageReduction: number;
  minReduction: number;
  maxReduction: number;
};

// ── Token estimation ──

/**
 * Rough token count estimation (4 chars ≈ 1 token).
 * Override with a real tokenizer for production accuracy.
 */
export type TokenCounter = (text: string) => number;

const defaultTokenCounter: TokenCounter = (text) =>
  Math.ceil(text.length / 4);

// ── Summarize callback ──

/**
 * Async callback to generate a summary of compressed turns.
 * Caller provides the implementation (e.g., call an LLM API).
 */
export type SummarizeFn = (
  turns: ConversationTurn[],
  targetTokens: number,
) => Promise<string>;

// ── Protection logic ──

function computeProtectedIndices(
  turns: ConversationTurn[],
  config: CompressionConfig,
): Set<number> {
  const protected_ = new Set<number>();

  let foundSystem = false;
  let foundHuman = false;
  let foundAssistant = false;
  let foundTool = false;

  for (let i = 0; i < turns.length; i++) {
    const role = turns[i].role;
    if (config.protectFirstSystem && !foundSystem && role === "system") {
      protected_.add(i);
      foundSystem = true;
    }
    if (config.protectFirstHuman && !foundHuman && (role === "user" || role === "human")) {
      protected_.add(i);
      foundHuman = true;
    }
    if (config.protectFirstAssistant && !foundAssistant && (role === "assistant" || role === "gpt")) {
      protected_.add(i);
      foundAssistant = true;
    }
    if (config.protectFirstTool && !foundTool && role === "tool") {
      protected_.add(i);
      foundTool = true;
    }
  }

  // Protect last N turns
  const lastStart = Math.max(0, turns.length - config.protectLastNTurns);
  for (let i = lastStart; i < turns.length; i++) {
    protected_.add(i);
  }

  return protected_;
}

function estimateTotalTokens(
  turns: ConversationTurn[],
  tokenCounter: TokenCounter,
): number {
  return turns.reduce(
    (sum, t) => sum + (t.tokenCount ?? tokenCounter(t.content)),
    0,
  );
}

// ── Compressor ──

/**
 * Compress a conversation trajectory to fit within the token budget.
 *
 * Strategy:
 * 1. Identify protected turns (first system/human/assistant/tool + last N)
 * 2. Calculate compressible middle span
 * 3. If already under budget, skip
 * 4. Remove middle turns until under budget (greedy from largest)
 * 5. Replace removed span with a summary message
 */
export async function compressTrajectory(
  turns: ConversationTurn[],
  summarize: SummarizeFn,
  config: Partial<CompressionConfig> = {},
  tokenCounter: TokenCounter = defaultTokenCounter,
): Promise<CompressionResult> {
  const cfg: CompressionConfig = { ...DEFAULT_COMPRESSION_CONFIG, ...config };

  const originalTokens = estimateTotalTokens(turns, tokenCounter);

  // Skip if already under target
  if (cfg.skipUnderTarget && originalTokens <= cfg.targetMaxTokens) {
    return {
      originalTokens,
      compressedTokens: originalTokens,
      reductionPct: 0,
      turnsRemoved: 0,
      summaryInserted: false,
      compressed: turns.slice(),
    };
  }

  const protectedIndices = computeProtectedIndices(turns, cfg);

  // Identify compressible middle span
  const compressible: Array<{ index: number; tokens: number }> = [];
  for (let i = 0; i < turns.length; i++) {
    if (!protectedIndices.has(i)) {
      compressible.push({
        index: i,
        tokens: turns[i].tokenCount ?? tokenCounter(turns[i].content),
      });
    }
  }

  if (compressible.length === 0) {
    return {
      originalTokens,
      compressedTokens: originalTokens,
      reductionPct: 0,
      turnsRemoved: 0,
      summaryInserted: false,
      compressed: turns.slice(),
    };
  }

  // Determine how many tokens to remove
  const overage = originalTokens - cfg.targetMaxTokens + cfg.summaryTargetTokens;
  if (overage <= 0) {
    return {
      originalTokens,
      compressedTokens: originalTokens,
      reductionPct: 0,
      turnsRemoved: 0,
      summaryInserted: false,
      compressed: turns.slice(),
    };
  }

  // Greedy removal: sort compressible by tokens (largest first)
  const sortedCompressible = compressible
    .slice()
    .sort((a, b) => b.tokens - a.tokens);

  const toRemove = new Set<number>();
  let removedTokens = 0;

  for (const item of sortedCompressible) {
    if (removedTokens >= overage) break;
    toRemove.add(item.index);
    removedTokens += item.tokens;
  }

  if (toRemove.size === 0) {
    return {
      originalTokens,
      compressedTokens: originalTokens,
      reductionPct: 0,
      turnsRemoved: 0,
      summaryInserted: false,
      compressed: turns.slice(),
    };
  }

  // Generate summary of removed turns
  const removedTurns = turns.filter((_, i) => toRemove.has(i));
  const summary = await summarize(removedTurns, cfg.summaryTargetTokens);

  // Build compressed output
  const compressed: ConversationTurn[] = [];
  let summaryInserted = false;

  for (let i = 0; i < turns.length; i++) {
    if (toRemove.has(i)) {
      if (!summaryInserted) {
        const summaryContent =
          summary + (cfg.addSummaryNotice ? cfg.summaryNoticeText : "");
        compressed.push({
          role: "user",
          content: summaryContent,
          tokenCount: tokenCounter(summaryContent),
        });
        summaryInserted = true;
      }
      // Skip removed turn
    } else {
      compressed.push(turns[i]);
    }
  }

  const compressedTokens = estimateTotalTokens(compressed, tokenCounter);
  const reductionPct =
    originalTokens > 0
      ? ((originalTokens - compressedTokens) / originalTokens) * 100
      : 0;

  return {
    originalTokens,
    compressedTokens,
    reductionPct,
    turnsRemoved: toRemove.size,
    summaryInserted,
    compressed,
  };
}

// ── Metrics aggregation ──

export function aggregateCompressionMetrics(
  results: CompressionResult[],
): CompressionMetrics {
  const compressed = results.filter((r) => r.turnsRemoved > 0);
  const skipped = results.filter((r) => r.turnsRemoved === 0);

  const reductions = compressed.map((r) => r.reductionPct);
  const avgReduction =
    reductions.length > 0
      ? reductions.reduce((a, b) => a + b, 0) / reductions.length
      : 0;

  return {
    totalProcessed: results.length,
    totalSkipped: skipped.length,
    totalCompressed: compressed.length,
    averageReduction: Math.round(avgReduction * 100) / 100,
    minReduction: reductions.length > 0 ? Math.min(...reductions) : 0,
    maxReduction: reductions.length > 0 ? Math.max(...reductions) : 0,
  };
}
