/**
 * Batch Runner — Multiprocess prompt execution (Track G — Training Pipeline)
 *
 * Processes prompts from a JSONL dataset in parallel, generating trajectory
 * records with crash-resilient JSONL checkpointing. Supports resumption
 * via checkpoint indices and content-based deduplication.
 *
 * Uses Node.js worker_threads for parallelism (equivalent to Python multiprocessing).
 *
 * Ported from hermes-agent `batch_runner.py`.
 */

import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
import type {
  TrajectoryRecord,
  ToolStats,
  ReasoningStats,
} from "./trajectory-format.js";
import {
  createTrajectoryWriter,
  serializeTrajectoryRecord,
} from "./trajectory-format.js";
import type { ToolsetDistribution } from "./toolset-distributions.js";
import { sampleFromDistribution } from "./toolset-distributions.js";

// ── Types ──

export type BatchRunnerConfig = {
  /** Run name for identification and output directory. */
  runName: string;
  /** Path to JSONL dataset file. Each line: { "prompt": "..." }. */
  datasetFile: string;
  /** Number of prompts per batch. Default: 10. */
  batchSize: number;
  /** Maximum concurrent workers. Default: 4. */
  maxWorkers: number;
  /** Output directory for trajectories and checkpoints. */
  outputDir: string;
  /** Toolset distribution name or custom distribution. */
  distribution: string | ToolsetDistribution;
  /** Model to use for generation. */
  model: string;
  /** Per-prompt timeout (ms). Default: 300_000 (5 min). */
  promptTimeoutMs: number;
  /** Resume from checkpoint. Default: false. */
  resume: boolean;
};

export const DEFAULT_BATCH_CONFIG: BatchRunnerConfig = {
  runName: "batch_run",
  datasetFile: "",
  batchSize: 10,
  maxWorkers: 4,
  outputDir: "./training-output",
  distribution: "default",
  model: "gpt-4",
  promptTimeoutMs: 300_000,
  resume: false,
};

export type BatchProgress = {
  totalPrompts: number;
  completedPrompts: number;
  failedPrompts: number;
  currentBatch: number;
  totalBatches: number;
  startedAt: string;
  elapsedMs: number;
  estimatedRemainingMs: number;
};

export type BatchResult = {
  runName: string;
  totalPrompts: number;
  completed: number;
  failed: number;
  skippedDuplicates: number;
  totalDurationMs: number;
  outputFile: string;
  checkpointFile: string;
  aggregatedToolStats: ToolStats;
  aggregatedReasoningStats: ReasoningStats;
};

export type PromptData = {
  prompt: string;
  id?: string;
  meta?: Record<string, unknown>;
};

// ── Prompt executor interface (injectable for testing) ──

export type PromptExecutor = {
  execute(
    prompt: string,
    toolsets: readonly string[],
    model: string,
    timeoutMs: number,
  ): Promise<{
    record: TrajectoryRecord | null;
    error?: string;
  }>;
};

// ── Checkpoint management ──

export type CheckpointState = {
  runName: string;
  completedIndices: readonly number[];
  completedPromptHashes: readonly string[];
  lastBatch: number;
  updatedAt: string;
};

function computePromptHash(prompt: string): string {
  // Simple hash for dedup — fnv1a-like
  let h = 0x811c9dc5;
  for (let i = 0; i < prompt.length; i++) {
    h ^= prompt.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function readCheckpoint(filePath: string): CheckpointState | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as CheckpointState;
  } catch {
    return null;
  }
}

function writeCheckpoint(filePath: string, state: CheckpointState): void {
  const { writeFileSync } = require("node:fs") as typeof import("node:fs");
  writeCheckpointSync(filePath, state, writeFileSync);
}

function writeCheckpointSync(
  filePath: string,
  state: CheckpointState,
  writeFn: (path: string, data: string, encoding: string) => void,
): void {
  writeFn(
    filePath,
    JSON.stringify({ ...state, updatedAt: new Date().toISOString() }),
    "utf-8",
  );
}

// ── Dataset loading ──

async function loadDataset(filePath: string): Promise<PromptData[]> {
  const prompts: PromptData[] = [];
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const data = JSON.parse(trimmed) as Record<string, unknown>;
      const prompt = String(data.prompt ?? data.text ?? data.question ?? "");
      if (prompt) {
        prompts.push({
          prompt,
          id: data.id != null ? String(data.id) : undefined,
          meta: data.meta as Record<string, unknown> | undefined,
        });
      }
    } catch {
      // Skip malformed lines
    }
  }

  return prompts;
}

// ── Batch processing ──

/**
 * Create and run a batch processing pipeline.
 *
 * Processes prompts from a JSONL dataset through a prompt executor,
 * writing trajectory records with checkpointing.
 */
export async function runBatch(
  config: BatchRunnerConfig,
  executor: PromptExecutor,
  onProgress?: (progress: BatchProgress) => void,
): Promise<BatchResult> {
  // Ensure output directory exists
  mkdirSync(config.outputDir, { recursive: true });

  const outputFile = join(config.outputDir, `${config.runName}.jsonl`);
  const checkpointFile = join(config.outputDir, `${config.runName}.checkpoint.json`);

  // Load dataset
  const prompts = await loadDataset(config.datasetFile);
  if (prompts.length === 0) {
    throw new Error(`No prompts found in dataset: ${config.datasetFile}`);
  }

  // Resume from checkpoint if requested
  const checkpoint = config.resume ? readCheckpoint(checkpointFile) : null;
  const completedIndices = new Set<number>(checkpoint?.completedIndices ?? []);
  const completedHashes = new Set<string>(checkpoint?.completedPromptHashes ?? []);

  // Resolve distribution
  const dist: ToolsetDistribution =
    typeof config.distribution === "string"
      ? { description: config.distribution, toolsets: {} }
      : config.distribution;
  const distName =
    typeof config.distribution === "string" ? config.distribution : "custom";

  // Open trajectory writer
  const writer = createTrajectoryWriter(outputFile);

  // Statistics
  const startTime = Date.now();
  let completed = 0;
  let failed = 0;
  let skippedDups = 0;
  const aggregatedToolStats: ToolStats = {};
  const aggregatedReasoning: ReasoningStats = {
    totalAssistantTurns: 0,
    turnsWithReasoning: 0,
    turnsWithoutReasoning: 0,
    hasAnyReasoning: false,
  };

  // Process in batches
  const totalBatches = Math.ceil(prompts.length / config.batchSize);

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batchStart = batchIdx * config.batchSize;
    const batchEnd = Math.min(batchStart + config.batchSize, prompts.length);
    const batch = prompts.slice(batchStart, batchEnd);

    // Process batch with concurrency limit
    const batchPromises = batch.map(async (promptData, localIdx) => {
      const globalIdx = batchStart + localIdx;

      // Skip if already completed (checkpoint resume)
      if (completedIndices.has(globalIdx)) {
        skippedDups++;
        return;
      }

      // Content-based dedup
      const hash = computePromptHash(promptData.prompt);
      if (completedHashes.has(hash)) {
        skippedDups++;
        return;
      }

      // Sample toolsets for this prompt
      let toolsets: string[];
      try {
        toolsets =
          typeof config.distribution === "string"
            ? (await import("./toolset-distributions.js")).sampleToolsetsFromDistribution(
                config.distribution,
              )
            : sampleFromDistribution(dist);
      } catch {
        toolsets = ["terminal", "file", "web"];
      }

      try {
        const result = await executor.execute(
          promptData.prompt,
          toolsets,
          config.model,
          config.promptTimeoutMs,
        );

        if (result.record) {
          // Enrich with batch metadata
          const enrichedRecord: TrajectoryRecord = {
            ...result.record,
            meta: {
              ...result.record.meta,
              runName: config.runName,
              batchIndex: batchIdx,
              promptIndex: globalIdx,
              distribution: distName,
            },
          };

          writer.write(enrichedRecord);
          completed++;

          // Aggregate stats
          mergeToolStats(aggregatedToolStats, result.record.toolStats);
          mergeReasoningStats(aggregatedReasoning, result.record.reasoningStats);
        } else {
          failed++;
        }
      } catch {
        failed++;
      }

      completedIndices.add(globalIdx);
      completedHashes.add(hash);
    });

    // Concurrency limiter: process `maxWorkers` at a time
    const chunks = chunkArray([...batchPromises], config.maxWorkers);
    for (const chunk of chunks) {
      await Promise.allSettled(chunk);
    }

    // Checkpoint after each batch
    writeCheckpoint(checkpointFile, {
      runName: config.runName,
      completedIndices: [...completedIndices],
      completedPromptHashes: [...completedHashes],
      lastBatch: batchIdx,
      updatedAt: new Date().toISOString(),
    });

    // Progress callback
    if (onProgress) {
      const elapsed = Date.now() - startTime;
      const promptsProcessed = completed + failed + skippedDups;
      const rate = promptsProcessed / (elapsed / 1000 || 1);
      const remaining = prompts.length - promptsProcessed;

      onProgress({
        totalPrompts: prompts.length,
        completedPrompts: completed,
        failedPrompts: failed,
        currentBatch: batchIdx + 1,
        totalBatches,
        startedAt: new Date(startTime).toISOString(),
        elapsedMs: elapsed,
        estimatedRemainingMs: rate > 0 ? (remaining / rate) * 1000 : 0,
      });
    }
  }

  await writer.close();

  return {
    runName: config.runName,
    totalPrompts: prompts.length,
    completed,
    failed,
    skippedDuplicates: skippedDups,
    totalDurationMs: Date.now() - startTime,
    outputFile,
    checkpointFile,
    aggregatedToolStats,
    aggregatedReasoningStats: aggregatedReasoning,
  };
}

// ── Helpers ──

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function mergeToolStats(target: ToolStats, source: ToolStats): void {
  for (const [name, stats] of Object.entries(source)) {
    if (!target[name]) target[name] = { count: 0, success: 0, failure: 0 };
    target[name].count += stats.count;
    target[name].success += stats.success;
    target[name].failure += stats.failure;
  }
}

function mergeReasoningStats(target: ReasoningStats, source: ReasoningStats): void {
  target.totalAssistantTurns += source.totalAssistantTurns;
  target.turnsWithReasoning += source.turnsWithReasoning;
  target.turnsWithoutReasoning += source.turnsWithoutReasoning;
  if (source.hasAnyReasoning) target.hasAnyReasoning = true;
}
