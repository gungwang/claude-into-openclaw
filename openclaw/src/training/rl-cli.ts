/**
 * rl-cli — RL Training CLI interface (Track G — Training Pipeline)
 *
 * Orchestrates RL training workflows:
 * - Lists available training environments
 * - Loads & validates configuration
 * - Runs batch training via batch-runner
 * - Runs evaluation via benchmark harness
 * - Reports progress and results
 *
 * Ported from hermes-agent `rl_cli.py`.
 */

import type { BatchRunnerConfig, BatchRunnerStats, PromptExecutor } from "./batch-runner.js";
import type { BenchmarkEnvironment, BenchmarkSummary, TaskAgentRunner } from "./benchmarks/index.js";
import type { ExecutionEnvironment } from "./environments/index.js";
import type { ToolsetDistribution } from "./toolset-distributions.js";

// ── Config ──

export type RlCliConfig = {
  readonly model: string;
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly maxIterations?: number;
  readonly saveTrajectories?: boolean;
  readonly outputDir?: string;
  /** Toolsets to enable for RL workflows (default: ["terminal", "web", "rl"]). */
  readonly toolsets?: readonly string[];
};

export type TrainCommandArgs = {
  readonly task: string;
  readonly datasetPath: string;
  readonly distribution?: string;
  readonly batchSize?: number;
  readonly maxWorkers?: number;
  readonly resume?: boolean;
  readonly runName?: string;
};

export type EvalCommandArgs = {
  readonly benchmarkName: string;
  readonly datasetPath: string;
  readonly concurrency?: number;
  readonly timeoutMs?: number;
  readonly filter?: readonly string[];
};

// ── Available environment listing ──

export type EnvironmentInfo = {
  readonly name: string;
  readonly description?: string;
  readonly path?: string;
};

export type RlTrainingResult = {
  readonly runName: string;
  readonly stats: BatchRunnerStats;
  readonly outputFile: string;
  readonly durationMs: number;
};

export type RlEvalResult = {
  readonly summary: BenchmarkSummary;
  readonly durationMs: number;
};

// ── RL system prompt ──

export const RL_SYSTEM_PROMPT = `You are an automated post-training engineer specialising in reinforcement learning for language models.

## Workflow

1. DISCOVER available RL environments
2. INSPECT environment code (verifiers, data loading, rewards)
3. CONFIGURE environment and training parameters
4. TEST with sample prompts before full training
5. TRAIN with conservative settings, monitoring progress
6. EVALUATE results and iterate

## Guidelines

- Always test before training — training runs take hours
- Monitor metrics: reward/mean and percent_correct
- Wait at least 30 minutes between status checks
- Start with small total_steps to validate, then scale up
`.trim();

export const RL_TOOLSETS = ["terminal", "web", "rl"] as const;

// ── Requirements check ──

export type RequirementCheck = {
  readonly name: string;
  readonly ok: boolean;
  readonly message?: string;
};

export function checkRequirements(env: Record<string, string | undefined>): readonly RequirementCheck[] {
  const checks: RequirementCheck[] = [];

  // API key
  if (env.OPENROUTER_API_KEY) {
    checks.push({ name: "OPENROUTER_API_KEY", ok: true });
  } else {
    checks.push({ name: "OPENROUTER_API_KEY", ok: false, message: "Not set — required for agent" });
  }

  // Tinker API key
  if (env.TINKER_API_KEY) {
    checks.push({ name: "TINKER_API_KEY", ok: true });
  } else {
    checks.push({ name: "TINKER_API_KEY", ok: false, message: "Not set — required for RL service" });
  }

  // WandB
  if (env.WANDB_API_KEY) {
    checks.push({ name: "WANDB_API_KEY", ok: true });
  } else {
    checks.push({ name: "WANDB_API_KEY", ok: false, message: "Not set — required for metrics" });
  }

  return checks;
}

export function allRequirementsMet(checks: readonly RequirementCheck[]): boolean {
  return checks.every((c) => c.ok);
}

// ── Train command ──

export async function runTraining(
  config: RlCliConfig,
  args: TrainCommandArgs,
  executor: PromptExecutor,
  onProgress?: (completed: number, total: number, stats: BatchRunnerStats) => void,
): Promise<RlTrainingResult> {
  // Dynamic imports to avoid circular refs at module level
  const { runBatch, loadDataset } = await import("./batch-runner.js");
  const { DISTRIBUTIONS } = await import("./toolset-distributions.js");

  const runName = args.runName ?? `rl-${Date.now()}`;
  const outputDir = config.outputDir ?? ".";
  const outputFile = `${outputDir}/${runName}.trajectories.jsonl`;

  const dist = args.distribution
    ? DISTRIBUTIONS[args.distribution as keyof typeof DISTRIBUTIONS]
    : undefined;

  const batchConfig: BatchRunnerConfig = {
    runName,
    datasetFile: args.datasetPath,
    batchSize: args.batchSize ?? 10,
    maxWorkers: args.maxWorkers ?? 4,
    distribution: dist as ToolsetDistribution | undefined,
    model: config.model,
    outputFile,
    resume: args.resume ?? false,
  };

  const start = Date.now();

  const stats = await runBatch(batchConfig, executor, (completed, total, s) => {
    onProgress?.(completed, total, s);
  });

  return {
    runName,
    stats,
    outputFile,
    durationMs: Date.now() - start,
  };
}

// ── Eval command ──

export async function runEvaluation(
  benchmark: BenchmarkEnvironment,
  env: ExecutionEnvironment,
  agentRunner: TaskAgentRunner,
  args: EvalCommandArgs,
): Promise<RlEvalResult> {
  const start = Date.now();

  const summary = await benchmark.evaluate(env, agentRunner, {
    concurrency: args.concurrency ?? 1,
    timeoutMs: args.timeoutMs,
    filter: args.filter,
  });

  return {
    summary,
    durationMs: Date.now() - start,
  };
}

// ── Format helpers ──

export function formatRequirementChecks(checks: readonly RequirementCheck[]): string {
  return checks
    .map((c) => `  ${c.ok ? "✓" : "✗"} ${c.name}${c.message ? ` — ${c.message}` : ""}`)
    .join("\n");
}

export function formatTrainingResult(result: RlTrainingResult): string {
  const { stats, runName, outputFile, durationMs } = result;
  const sec = (durationMs / 1000).toFixed(1);
  return [
    `Run: ${runName}`,
    `Completed: ${stats.completed} / ${stats.total} prompts`,
    `Skipped: ${stats.skipped}`,
    `Failed: ${stats.failed}`,
    `Output: ${outputFile}`,
    `Duration: ${sec}s`,
  ].join("\n");
}

export function formatEvalResult(result: RlEvalResult): string {
  const { summary, durationMs } = result;
  const sec = (durationMs / 1000).toFixed(1);
  const lines = [
    `Benchmark: ${summary.benchmarkName}`,
    `Pass rate: ${(summary.overallPassRate * 100).toFixed(1)}% (${summary.passedTasks}/${summary.totalTasks})`,
  ];

  for (const [cat, { rate, passed, total }] of Object.entries(summary.categoryPassRates)) {
    lines.push(`  ${cat}: ${(rate * 100).toFixed(1)}% (${passed}/${total})`);
  }

  lines.push(`Duration: ${sec}s`);
  return lines.join("\n");
}
