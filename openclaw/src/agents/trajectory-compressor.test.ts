import { describe, expect, it } from "vitest";
import {
  compressTrajectory,
  aggregateCompressionMetrics,
  type CompressionResult,
  type ConversationTurn,
  type SummarizeFn,
} from "./trajectory-compressor.js";

function makeTurns(count: number): ConversationTurn[] {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
    content: `Turn ${i}: ${"x".repeat(200)}`,
  }));
}

const stubSummarize: SummarizeFn = async (turns, targetTokens) =>
  `Summary of ${turns.length} turns (target ${targetTokens})`;

describe("compressTrajectory", () => {
  it("returns unmodified trajectory below threshold", async () => {
    const turns = makeTurns(3);
    const result = await compressTrajectory(turns, stubSummarize, {
      targetMaxTokens: 999_999,
      skipUnderTarget: true,
    });
    expect(result.compressed.length).toBe(turns.length);
    expect(result.turnsRemoved).toBe(0);
  });

  it("compresses long trajectories", async () => {
    const turns = makeTurns(30);
    const result = await compressTrajectory(turns, stubSummarize, {
      targetMaxTokens: 500,
      protectLastNTurns: 2,
      skipUnderTarget: false,
    });
    expect(result.compressed.length).toBeLessThan(30);
    expect(result.originalTokens).toBeGreaterThan(0);
  });

  it("always preserves recent turns", async () => {
    const turns = makeTurns(20);
    const result = await compressTrajectory(turns, stubSummarize, {
      targetMaxTokens: 500,
      protectLastNTurns: 5,
      skipUnderTarget: false,
    });
    // The last 5 original turns should appear at the end of the compressed result
    const lastOriginal = turns.slice(-5).map((t) => t.content);
    const lastCompressed = result.compressed.slice(-5).map((t) => t.content);
    expect(lastCompressed).toEqual(lastOriginal);
  });

  it("result shape has all required fields", async () => {
    const result = await compressTrajectory(makeTurns(15), stubSummarize, {
      targetMaxTokens: 500,
      skipUnderTarget: false,
    });
    expect(result).toEqual(
      expect.objectContaining({
        originalTokens: expect.any(Number),
        compressedTokens: expect.any(Number),
        reductionPct: expect.any(Number),
        turnsRemoved: expect.any(Number),
        summaryInserted: expect.any(Boolean),
        compressed: expect.any(Array),
      }),
    );
  });
});

describe("aggregateCompressionMetrics", () => {
  it("aggregates multiple compression results", () => {
    const results: CompressionResult[] = [
      {
        originalTokens: 1000,
        compressedTokens: 500,
        reductionPct: 50,
        turnsRemoved: 5,
        summaryInserted: true,
        compressed: makeTurns(5),
      },
      {
        originalTokens: 800,
        compressedTokens: 300,
        reductionPct: 62.5,
        turnsRemoved: 5,
        summaryInserted: true,
        compressed: makeTurns(3),
      },
    ];
    const agg = aggregateCompressionMetrics(results);
    expect(agg.totalProcessed).toBe(2);
    expect(agg.totalCompressed).toBe(2);
    expect(agg.totalSkipped).toBe(0);
    expect(agg.averageReduction).toBeGreaterThan(0);
  });
});
