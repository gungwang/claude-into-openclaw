/**
 * Config types for Track G — Training & Evaluation Pipeline.
 *
 * Covers trajectory format settings, toolset distribution overrides,
 * batch runner tunables, environment backends, benchmark harness,
 * and RL training CLI defaults.
 */

// ── Trajectory ──

export type TrajectoryConfig = {
  /** Directory where trajectory JSONL files are written. Default: "./trajectories". */
  outputDir?: string;
  /** Maximum turns per trajectory before truncation. Default: unlimited. */
  maxTurnsPerTrajectory?: number;
  /** Filter out trajectories with no tool calls. Default: false. */
  filterEmptyToolCalls?: boolean;
  /** Filter out trajectories whose content is mostly repeated tokens. Default: true. */
  filterRepetitive?: boolean;
  /** Minimum character length for a trajectory turn to be kept. Default: 0 (no min). */
  minTurnLength?: number;
};

// ── Toolset distributions ──

export type ToolsetDistributionOverride = {
  /** Name of a built-in distribution to use (e.g. "default", "research", "safe"). */
  preset?: string;
  /** Custom per-toolset probabilities (overrides preset). */
  custom?: Record<string, number>;
};

// ── Batch runner ──

export type BatchRunnerTrainingConfig = {
  /** Default batch size (prompts per batch). Default: 10. */
  batchSize?: number;
  /** Max concurrent worker tasks. Default: 4. */
  maxWorkers?: number;
  /** Enable checkpoint resume on restart. Default: true. */
  resumeEnabled?: boolean;
  /** Checkpoint write interval (completed items). Default: every batch. */
  checkpointInterval?: number;
};

// ── Execution environments ──

export type TrainingEnvironmentConfig = {
  /** Default backend: "local" | "docker" | "ssh". Default: "local". */
  defaultBackend?: "local" | "docker" | "ssh";
  /** Docker-specific settings. */
  docker?: {
    /** Docker image to use for task execution. */
    image?: string;
    /** Additional docker run flags. */
    extraFlags?: string[];
    /** Timeout for container startup (ms). Default: 30000. */
    startupTimeoutMs?: number;
  };
  /** SSH-specific settings. */
  ssh?: {
    host?: string;
    port?: number;
    user?: string;
    keyPath?: string;
  };
};

// ── Benchmarks ──

export type BenchmarkConfig = {
  /** Default concurrency for benchmark evaluation. Default: 1. */
  concurrency?: number;
  /** Default per-task timeout (ms). Default: 1800000 (30 min). */
  taskTimeoutMs?: number;
  /** Default test verification timeout (ms). Default: 180000 (3 min). */
  testTimeoutMs?: number;
  /** Tasks to skip by name. */
  skipTasks?: string[];
};

// ── RL CLI ──

export type RlCliTrainingConfig = {
  /** Default model for RL agent. */
  model?: string;
  /** Default base URL for model API. */
  baseUrl?: string;
  /** Max agent iterations per task. Default: 200. */
  maxIterations?: number;
  /** Save trajectories to disk. Default: true. */
  saveTrajectories?: boolean;
  /** Default toolsets for RL workflows. */
  toolsets?: string[];
};

// ── Tool-call parsers ──

export type ToolCallParsersConfig = {
  /** Default parser to use when model family is unknown. Default: "hermes". */
  defaultParser?: string;
  /** Model-to-parser mapping overrides (e.g. { "my-custom-model": "qwen" }). */
  modelParserMap?: Record<string, string>;
};

// ── Top-level aggregate ──

export type TrainingPipelineConfig = {
  /** Enable the training pipeline subsystem. Default: false. */
  enabled?: boolean;
  trajectory?: TrajectoryConfig;
  distribution?: ToolsetDistributionOverride;
  batchRunner?: BatchRunnerTrainingConfig;
  environment?: TrainingEnvironmentConfig;
  benchmark?: BenchmarkConfig;
  rlCli?: RlCliTrainingConfig;
  parsers?: ToolCallParsersConfig;
};
