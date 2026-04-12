/**
 * Benchmark Environments — Evaluation harness adapters (Track G — Training Pipeline)
 *
 * Integrates with external benchmark suites (e.g. TerminalBench-2, SWE-bench)
 * to evaluate agent performance on standardised tasks. Each benchmark adapter
 * loads a dataset of tasks, runs the agent through each one, and scores results.
 *
 * Ported from hermes-agent `environments/benchmarks/`.
 */

import type { ExecutionEnvironment, CommandResult } from "../environments/index.js";

// ── Task / Result types ──

export type BenchmarkTask = {
  readonly id: string;
  readonly name: string;
  readonly instruction: string;
  readonly category?: string;
  /** Optional Docker image to run the task in. */
  dockerImage?: string;
  /** Optional test script content to verify the task. */
  testScript?: string;
  /** Arbitrary metadata from the benchmark dataset. */
  meta?: Record<string, unknown>;
};

export type TaskResult = {
  readonly taskId: string;
  readonly taskName: string;
  readonly category?: string;
  readonly passed: boolean;
  /** 1.0 if passed, 0.0 if failed (binary reward). */
  readonly reward: number;
  readonly durationMs: number;
  readonly error?: string;
};

export type BenchmarkSummary = {
  readonly benchmarkName: string;
  readonly totalTasks: number;
  readonly passedTasks: number;
  readonly failedTasks: number;
  readonly overallPassRate: number;
  readonly categoryPassRates: Record<string, { passed: number; total: number; rate: number }>;
  readonly results: readonly TaskResult[];
  readonly totalDurationMs: number;
};

// ── Benchmark environment interface ──

export type BenchmarkEnvironment = {
  readonly name: string;

  /** Load tasks from the dataset. */
  loadTasks(): Promise<readonly BenchmarkTask[]>;

  /** Run a single task, returning a scored result. */
  runTask(
    task: BenchmarkTask,
    env: ExecutionEnvironment,
    agentRunner: TaskAgentRunner,
    options?: { timeoutMs?: number },
  ): Promise<TaskResult>;

  /** Run all tasks and aggregate scores. */
  evaluate(
    env: ExecutionEnvironment,
    agentRunner: TaskAgentRunner,
    options?: { concurrency?: number; timeoutMs?: number; filter?: readonly string[] },
  ): Promise<BenchmarkSummary>;
};

/** Callback the benchmark invokes to let the agent solve a task. */
export type TaskAgentRunner = (
  task: BenchmarkTask,
  env: ExecutionEnvironment,
) => Promise<void>;

// ── TerminalBench-2 adapter ──

export type TerminalBench2Config = {
  readonly datasetPath: string;
  readonly testTimeout?: number;
  readonly taskTimeout?: number;
  readonly skipTasks?: readonly string[];
};

export function createTerminalBench2(config: TerminalBench2Config): BenchmarkEnvironment {
  const testTimeout = config.testTimeout ?? 180_000;
  const taskTimeout = config.taskTimeout ?? 1_800_000;
  const skipSet = new Set(config.skipTasks ?? []);

  return {
    name: "terminalbench2",

    async loadTasks(): Promise<readonly BenchmarkTask[]> {
      const { createReadStream } = await import("node:fs");
      const { createInterface } = await import("node:readline");

      const tasks: BenchmarkTask[] = [];
      const rl = createInterface({ input: createReadStream(config.datasetPath) });

      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const row = JSON.parse(trimmed) as {
          id?: string;
          name?: string;
          instruction?: string;
          category?: string;
          docker_image?: string;
          test_script?: string;
          [k: string]: unknown;
        };

        const name = row.name ?? row.id ?? `task_${tasks.length}`;
        if (skipSet.has(name)) continue;

        tasks.push({
          id: row.id ?? name,
          name,
          instruction: row.instruction ?? "",
          category: row.category,
          dockerImage: row.docker_image,
          testScript: row.test_script,
          meta: row,
        });
      }

      return tasks;
    },

    async runTask(task, env, agentRunner, options): Promise<TaskResult> {
      const timeout = options?.timeoutMs ?? taskTimeout;
      const start = Date.now();

      try {
        // Run the agent with a timeout
        await Promise.race([
          agentRunner(task, env),
          rejectAfter(timeout, `Task ${task.name} exceeded ${timeout}ms timeout`),
        ]);

        // Verify via test script if available
        let passed = true;
        if (task.testScript) {
          const testResult = await Promise.race([
            env.execute(task.testScript),
            rejectAfter(testTimeout, `Test verification exceeded ${testTimeout}ms timeout`),
          ]) as CommandResult;
          passed = testResult.exitCode === 0;
        }

        return {
          taskId: task.id,
          taskName: task.name,
          category: task.category,
          passed,
          reward: passed ? 1.0 : 0.0,
          durationMs: Date.now() - start,
        };
      } catch (err) {
        return {
          taskId: task.id,
          taskName: task.name,
          category: task.category,
          passed: false,
          reward: 0.0,
          durationMs: Date.now() - start,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async evaluate(env, agentRunner, options): Promise<BenchmarkSummary> {
      const allTasks = await this.loadTasks();
      const concurrency = options?.concurrency ?? 1;
      const filter = options?.filter ? new Set(options.filter) : null;

      const tasks = filter
        ? allTasks.filter((t) => filter.has(t.name) || filter.has(t.id))
        : allTasks;

      const results: TaskResult[] = [];
      const evalStart = Date.now();

      // Process tasks with concurrency control
      const pending: Promise<void>[] = [];
      let idx = 0;

      function scheduleNext(): Promise<void> | null {
        if (idx >= tasks.length) return null;
        const task = tasks[idx++];

        const p = (async () => {
          const r = await (this as unknown as BenchmarkEnvironment).runTask(
            task, env, agentRunner, options,
          );
          results.push(r);
        })();

        return p;
      }

      // Simple semaphore-based concurrency
      for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
        const run = async (): Promise<void> => {
          while (idx < tasks.length) {
            const task = tasks[idx++];
            const r = await (this as BenchmarkEnvironment).runTask(
              task, env, agentRunner, options,
            );
            results.push(r);
          }
        };
        pending.push(run());
      }

      await Promise.all(pending);

      // Aggregate
      const categoryMap = new Map<string, { passed: number; total: number }>();
      let passedTotal = 0;

      for (const r of results) {
        if (r.passed) passedTotal++;
        const cat = r.category ?? "uncategorized";
        const entry = categoryMap.get(cat) ?? { passed: 0, total: 0 };
        entry.total++;
        if (r.passed) entry.passed++;
        categoryMap.set(cat, entry);
      }

      const categoryPassRates: Record<string, { passed: number; total: number; rate: number }> = {};
      for (const [cat, { passed, total }] of categoryMap) {
        categoryPassRates[cat] = { passed, total, rate: total > 0 ? passed / total : 0 };
      }

      return {
        benchmarkName: "terminalbench2",
        totalTasks: results.length,
        passedTasks: passedTotal,
        failedTasks: results.length - passedTotal,
        overallPassRate: results.length > 0 ? passedTotal / results.length : 0,
        categoryPassRates,
        results,
        totalDurationMs: Date.now() - evalStart,
      };
    },
  };
}

// ── Generic JSONL benchmark adapter ──

export type JsonlBenchmarkConfig = {
  readonly name: string;
  readonly datasetPath: string;
  readonly taskTimeout?: number;
  /** Map raw dataset rows to BenchmarkTask. */
  mapRow(row: Record<string, unknown>, index: number): BenchmarkTask;
  /** Score agent output (default: check test script exit code). */
  scorer?: (task: BenchmarkTask, env: ExecutionEnvironment) => Promise<boolean>;
};

export function createJsonlBenchmark(config: JsonlBenchmarkConfig): BenchmarkEnvironment {
  const taskTimeout = config.taskTimeout ?? 1_800_000;
  const tb2Like = createTerminalBench2({
    datasetPath: config.datasetPath,
    taskTimeout,
  });

  return {
    name: config.name,

    async loadTasks(): Promise<readonly BenchmarkTask[]> {
      const { createReadStream } = await import("node:fs");
      const { createInterface } = await import("node:readline");

      const tasks: BenchmarkTask[] = [];
      const rl = createInterface({ input: createReadStream(config.datasetPath) });
      let idx = 0;

      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const row = JSON.parse(trimmed) as Record<string, unknown>;
        tasks.push(config.mapRow(row, idx++));
      }

      return tasks;
    },

    async runTask(task, env, agentRunner, options): Promise<TaskResult> {
      const timeout = options?.timeoutMs ?? taskTimeout;
      const start = Date.now();

      try {
        await Promise.race([
          agentRunner(task, env),
          rejectAfter(timeout, `Task ${task.name} exceeded timeout`),
        ]);

        const passed = config.scorer
          ? await config.scorer(task, env)
          : true;

        return {
          taskId: task.id,
          taskName: task.name,
          category: task.category,
          passed,
          reward: passed ? 1.0 : 0.0,
          durationMs: Date.now() - start,
        };
      } catch (err) {
        return {
          taskId: task.id,
          taskName: task.name,
          category: task.category,
          passed: false,
          reward: 0.0,
          durationMs: Date.now() - start,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },

    evaluate: tb2Like.evaluate,
  };
}

// ── Helpers ──

function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}
