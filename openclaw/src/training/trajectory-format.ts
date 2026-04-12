/**
 * Trajectory Format — Hermes-compatible trajectory serialization (Track G — Training Pipeline)
 *
 * Defines the data model for agent interaction trajectories used in training
 * data generation. Supports the Hermes JSONL format with `conversations` field,
 * `from`/`value` turn schema, and tool call metadata.
 *
 * Ported from hermes-agent batch_runner.py trajectory output format.
 */

import { createReadStream, createWriteStream } from "node:fs";
import { createInterface } from "node:readline";

// ── Turn schema ──

export type TurnRole = "system" | "human" | "gpt" | "tool";

/**
 * Single turn in a trajectory. Uses `from`/`value` schema for Hermes compatibility.
 */
export type TrajectoryTurn = {
  from: TurnRole;
  value: string;
  /** Tool call metadata (gpt turns that invoke tools). */
  tool_calls?: readonly TrajectoryToolCall[];
  /** Tool call ID (tool response turns). */
  tool_call_id?: string;
  /** Native reasoning/thinking tokens (if any). */
  reasoning?: string;
};

export type TrajectoryToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

// ── Tool statistics ──

export type ToolStats = Record<
  string,
  { count: number; success: number; failure: number }
>;

export type ToolErrorCounts = Record<string, number>;

export type ReasoningStats = {
  totalAssistantTurns: number;
  turnsWithReasoning: number;
  turnsWithoutReasoning: number;
  hasAnyReasoning: boolean;
};

// ── Trajectory record ──

/**
 * A single trajectory record, representing one complete agent interaction.
 * This is the unit written to JSONL output files.
 */
export type TrajectoryRecord = {
  /** Unique trajectory ID. */
  id: string;
  /** Original prompt text. */
  prompt: string;
  /** Conversation turns in Hermes from/value format. */
  conversations: readonly TrajectoryTurn[];
  /** Model used for generation. */
  model: string;
  /** Active toolsets during this trajectory. */
  toolsets: readonly string[];
  /** Per-tool usage statistics. */
  toolStats: ToolStats;
  /** Per-tool error counts. */
  toolErrorCounts: ToolErrorCounts;
  /** Reasoning coverage statistics. */
  reasoningStats: ReasoningStats;
  /** Generation timestamp (ISO 8601). */
  timestamp: string;
  /** Total wall-clock time (ms). */
  durationMs: number;
  /** Total tokens consumed (input + output). */
  totalTokens?: number;
  /** Batch run metadata. */
  meta?: {
    runName?: string;
    batchIndex?: number;
    promptIndex?: number;
    distribution?: string;
  };
};

// ── Format conversion ──

/**
 * Map OpenAI-style role names to Hermes turn roles.
 */
export function mapRole(openaiRole: string): TurnRole {
  switch (openaiRole) {
    case "system":
      return "system";
    case "user":
      return "human";
    case "assistant":
      return "gpt";
    case "tool":
      return "tool";
    default:
      return "human";
  }
}

/**
 * Convert OpenAI-format message history to Hermes trajectory turns.
 */
export function messagesToTrajectoryTurns(
  messages: readonly {
    role: string;
    content?: string | null;
    tool_calls?: readonly { id: string; type?: string; function: { name: string; arguments: string } }[];
    tool_call_id?: string;
    reasoning?: string;
  }[],
): TrajectoryTurn[] {
  return messages.map((msg) => {
    const turn: TrajectoryTurn = {
      from: mapRole(msg.role),
      value: msg.content ?? "",
    };

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      turn.tool_calls = msg.tool_calls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }));
    }

    if (msg.tool_call_id) {
      turn.tool_call_id = msg.tool_call_id;
    }

    if (msg.reasoning) {
      turn.reasoning = msg.reasoning;
    }

    return turn;
  });
}

// ── Tool statistics extraction ──

/**
 * Extract tool usage statistics from trajectory turns.
 */
export function extractToolStats(turns: readonly TrajectoryTurn[]): ToolStats {
  const stats: ToolStats = {};
  const callMap = new Map<string, string>(); // tool_call_id → tool_name

  for (const turn of turns) {
    if (turn.from === "gpt" && turn.tool_calls) {
      for (const tc of turn.tool_calls) {
        const name = tc.function.name;
        if (!stats[name]) stats[name] = { count: 0, success: 0, failure: 0 };
        stats[name].count++;
        callMap.set(tc.id, name);
      }
    } else if (turn.from === "tool" && turn.tool_call_id) {
      const name = callMap.get(turn.tool_call_id);
      if (name && stats[name]) {
        const isError = isToolResponseError(turn.value);
        if (isError) {
          stats[name].failure++;
        } else {
          stats[name].success++;
        }
      }
    }
  }

  return stats;
}

/**
 * Extract tool error counts from trajectory turns.
 */
export function extractToolErrorCounts(turns: readonly TrajectoryTurn[]): ToolErrorCounts {
  const stats = extractToolStats(turns);
  const counts: ToolErrorCounts = {};
  for (const [name, s] of Object.entries(stats)) {
    counts[name] = s.failure;
  }
  return counts;
}

/**
 * Extract reasoning coverage statistics from trajectory turns.
 */
export function extractReasoningStats(turns: readonly TrajectoryTurn[]): ReasoningStats {
  let total = 0;
  let withReasoning = 0;

  for (const turn of turns) {
    if (turn.from !== "gpt") continue;
    total++;

    const hasScratchpad = turn.value.includes("<REASONING_SCRATCHPAD>");
    const hasNative = turn.reasoning != null && turn.reasoning.trim().length > 0;

    if (hasScratchpad || hasNative) withReasoning++;
  }

  return {
    totalAssistantTurns: total,
    turnsWithReasoning: withReasoning,
    turnsWithoutReasoning: total - withReasoning,
    hasAnyReasoning: withReasoning > 0,
  };
}

// ── Error detection ──

function isToolResponseError(content: string): boolean {
  if (!content) return true;

  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null) {
      if ("error" in parsed && parsed.error != null) return true;
      if (parsed.success === false) return true;
      if ("content" in parsed && typeof parsed.content === "object" && parsed.content?.error != null) {
        return true;
      }
    }
  } catch {
    // Not JSON — check simple patterns
    if (content.trim().toLowerCase().startsWith("error:")) return true;
  }

  return false;
}

// ── JSONL I/O ──

/**
 * Write a single trajectory record as a JSONL line.
 */
export function serializeTrajectoryRecord(record: TrajectoryRecord): string {
  return JSON.stringify(record);
}

/**
 * Parse a JSONL line into a trajectory record.
 */
export function deserializeTrajectoryRecord(line: string): TrajectoryRecord | null {
  try {
    return JSON.parse(line) as TrajectoryRecord;
  } catch {
    return null;
  }
}

/**
 * Stream-read a JSONL trajectory file, yielding records one by one.
 */
export async function* readTrajectoryFile(
  filePath: string,
): AsyncGenerator<TrajectoryRecord, void, void> {
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const record = deserializeTrajectoryRecord(trimmed);
    if (record) yield record;
  }
}

/**
 * Append trajectory records to a JSONL file.
 */
export function createTrajectoryWriter(filePath: string): {
  write(record: TrajectoryRecord): void;
  close(): Promise<void>;
} {
  const stream = createWriteStream(filePath, { flags: "a", encoding: "utf-8" });

  return {
    write(record: TrajectoryRecord): void {
      stream.write(serializeTrajectoryRecord(record) + "\n");
    },
    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        stream.end(() => resolve());
        stream.on("error", reject);
      });
    },
  };
}

// ── Trajectory validation ──

/**
 * Validate a trajectory record for completeness and consistency.
 * Returns list of issues (empty = valid).
 */
export function validateTrajectoryRecord(record: TrajectoryRecord): string[] {
  const issues: string[] = [];

  if (!record.id) issues.push("Missing trajectory ID");
  if (!record.prompt) issues.push("Missing prompt");
  if (!record.conversations || record.conversations.length === 0) {
    issues.push("Empty conversations");
  }
  if (!record.model) issues.push("Missing model");
  if (!record.timestamp) issues.push("Missing timestamp");

  // Check for hallucinated tool names
  if (record.toolStats && record.toolsets) {
    const knownTools = new Set<string>();
    // All tool names that appear in tool_calls should be resolvable
    for (const turn of record.conversations) {
      if (turn.tool_calls) {
        for (const tc of turn.tool_calls) {
          knownTools.add(tc.function.name);
        }
      }
    }
    // This is informational — caller decides filtering policy
  }

  return issues;
}

// ── Bad trajectory filtering ──

/**
 * Filter out bad trajectories based on quality heuristics.
 * Criteria: hallucinated tool names, empty conversations, no reasoning coverage.
 */
export function filterBadTrajectories(
  records: readonly TrajectoryRecord[],
  opts?: {
    requireReasoning?: boolean;
    knownToolNames?: ReadonlySet<string>;
    minTurns?: number;
  },
): TrajectoryRecord[] {
  const requireReasoning = opts?.requireReasoning ?? false;
  const knownTools = opts?.knownToolNames;
  const minTurns = opts?.minTurns ?? 2;

  return records.filter((r) => {
    if (!r.conversations || r.conversations.length < minTurns) return false;

    if (requireReasoning && !r.reasoningStats?.hasAnyReasoning) return false;

    if (knownTools) {
      for (const turn of r.conversations) {
        if (turn.tool_calls) {
          for (const tc of turn.tool_calls) {
            if (!knownTools.has(tc.function.name)) return false;
          }
        }
      }
    }

    return true;
  });
}
