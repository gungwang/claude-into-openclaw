import { describe, expect, it } from "vitest";
import {
  compressTrajectory,
  aggregateCompressionMetrics,
  type CompressionConfig,
  type ConversationTurn,
  type CompressionResult,
} from "./trajectory-compressor.js";

function makeTurns(count: number): ConversationTurn[] {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
    content: `Turn ${i}: ${"x".repeat(200)}`,
  }));
}

const stubTokenCounter = (text: string): number => text.length;
const stubSummarize = async (text: string): Promise<string> =>
  `Summary of ${text.length} chars`;

describe("compressTrajectory", () => {
  const config: CompressionConfig = {
    maxTurns: 10,
    preserveRecent: 3,
    targetReduction: 0.4,
  };

  it("returns unmodified trajectory below threshold", async () => {
    const turns = makeTurns(5);
    const result = await compressTrajectory(
      turns,
      config,
      stubTokenCounter,
      stubSummarize,
    );
    expect(result.turns.length).toBeLessThanOrEqual(turns.length);
  });

  it("compresses long trajectories", async () => {
    const turns = makeTurns(30);
    const result = await compressTrajectory(
      turns,
      config,
      stubTokenCounter,
      stubSummarize,
    );
    expect(result.turns.length).toBeLessThan(30);
    expect(result.metrics.originalTurns).toBe(30);
    expect(result.metrics.compressedTurns).toBeLessThan(30);
  });

  it("always preserves recent turns", async () => {
    const turns = makeTurns(20);
    const result = await compressTrajectory(
      turns,
      { ...config, preserveRecent: 5 },
      stubTokenCounter,
      stubSummarize,
    );
    // The last 5 turns should be intact
    const lastOriginal = turns.slice(-5).map((t) => t.content);
    const lastCompressed = result.turns.slice(-5).map((t) => t.content);
    expect(lastCompressed).toEqual(lastOriginal);
  });

  it("result shape has all required fields", async () => {
    const result = await compressTrajectory(
      makeTurns(15),
      config,
      stubTokenCounter,
      stubSummarize,
    );
    expect(result).toEqual(
      expect.objectContaining({
        turns: expect.any(Array),
        metrics: expect.objectContaining({
          originalTurns: expect.any(Number),
          compressedTurns: expect.any(Number),
          originalTokens: expect.any(Number),
          compressedTokens: expect.any(Number),
        }),
      }),
    );
  });
});

describe("aggregateCompressionMetrics", () => {
  it("aggregates multiple compression results", () => {
    const results: CompressionResult[] = [
      {
        turns: makeTurns(5),
        metrics: { originalTurns: 10, compressedTurns: 5, originalTokens: 1000, compressedTokens: 500 },
      },
      {
        turns: makeTurns(3),
        metrics: { originalTurns: 8, compressedTurns: 3, originalTokens: 800, compressedTokens: 300 },
      },
    ];
    const agg = aggregateCompressionMetrics(results.map((r) => r.metrics));
    expect(agg.originalTurns).toBe(18);
    expect(agg.compressedTurns).toBe(8);
    expect(agg.originalTokens).toBe(1800);
    expect(agg.compressedTokens).toBe(800);
  });
});
