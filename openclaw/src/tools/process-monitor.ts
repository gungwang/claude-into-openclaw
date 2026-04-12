/**
 * Background Process Monitor (Track E — Advanced Tools)
 *
 * Tracks background processes spawned by the agent, providing:
 * - Output buffering (rolling window)
 * - Status polling and log retrieval
 * - Watch patterns that trigger notifications on specific output matches
 * - Rate-limiting and overload protection for watch patterns
 * - Session-scoped tracking for cleanup
 *
 * Ported from hermes-agent `tools/process_registry.py`.
 * Adapted to TypeScript with an in-memory registry and event callbacks.
 */

import { execFile, type ChildProcess } from "node:child_process";

// ── Types ──

export type ProcessSession = {
  id: string;
  command: string;
  taskId: string;
  sessionKey: string;
  pid: number | undefined;
  cwd: string | undefined;
  startedAt: number;
  exited: boolean;
  exitCode: number | undefined;
  outputBuffer: string;
};

export type ProcessMonitorConfig = {
  /** Enable process monitoring. Default: true. */
  enabled: boolean;
  /** Max output buffer size (chars). Default: 200_000. */
  maxOutputChars: number;
  /** Max concurrent tracked processes. Default: 64. */
  maxProcesses: number;
  /** Time to keep finished processes (ms). Default: 1_800_000 (30 min). */
  finishedTtlMs: number;
  /** Watch pattern rate limit: max notifications per window. Default: 8. */
  watchMaxPerWindow: number;
  /** Watch pattern rate window (ms). Default: 10_000. */
  watchWindowMs: number;
};

export const DEFAULT_PROCESS_MONITOR_CONFIG: ProcessMonitorConfig = {
  enabled: true,
  maxOutputChars: 200_000,
  maxProcesses: 64,
  finishedTtlMs: 1_800_000,
  watchMaxPerWindow: 8,
  watchWindowMs: 10_000,
};

export type WatchPattern = {
  /** Regex pattern to match in output. */
  pattern: string;
  /** Label for the notification. */
  label: string;
};

export type ProcessSpawnResult = {
  ok: boolean;
  sessionId?: string;
  error?: string;
};

export type ProcessPollResult = {
  id: string;
  running: boolean;
  exitCode: number | undefined;
  output: string;
  outputTruncated: boolean;
};

export type WatchNotification = {
  sessionId: string;
  pattern: string;
  label: string;
  matchedLine: string;
  timestamp: number;
};

// ── Process monitor registry ──

export type ProcessMonitor = {
  /** Spawn a background process and track it. */
  spawn(params: {
    command: string;
    cwd?: string;
    taskId?: string;
    sessionKey?: string;
    watchPatterns?: readonly WatchPattern[];
  }): ProcessSpawnResult;
  /** Poll a process for status and output. */
  poll(sessionId: string): ProcessPollResult | undefined;
  /** Kill a tracked process. */
  kill(sessionId: string): boolean;
  /** List all tracked processes (optionally filter by session key). */
  list(sessionKey?: string): readonly ProcessSession[];
  /** Register a notification callback for watch pattern matches. */
  onWatch(callback: (notification: WatchNotification) => void): void;
  /** Clean up finished processes past TTL. */
  prune(): number;
  /** Get active process count. */
  activeCount(): number;
};

let nextProcessId = 0;

export function createProcessMonitor(
  config: ProcessMonitorConfig = DEFAULT_PROCESS_MONITOR_CONFIG,
): ProcessMonitor {
  const sessions = new Map<string, ProcessSessionInternal>();
  const watchCallbacks: Array<(notification: WatchNotification) => void> = [];

  type ProcessSessionInternal = ProcessSession & {
    process?: ChildProcess;
    watchPatterns: WatchPattern[];
    watchWindowHits: number;
    watchWindowStart: number;
  };

  function appendOutput(session: ProcessSessionInternal, chunk: string): void {
    session.outputBuffer += chunk;
    if (session.outputBuffer.length > config.maxOutputChars) {
      session.outputBuffer = session.outputBuffer.slice(-config.maxOutputChars);
    }

    // Check watch patterns
    if (session.watchPatterns.length > 0) {
      for (const line of chunk.split("\n")) {
        for (const wp of session.watchPatterns) {
          try {
            if (new RegExp(wp.pattern).test(line)) {
              emitWatch(session, wp, line);
            }
          } catch {
            // Invalid regex — skip
          }
        }
      }
    }
  }

  function emitWatch(
    session: ProcessSessionInternal,
    wp: WatchPattern,
    matchedLine: string,
  ): void {
    const now = Date.now();
    if (now - session.watchWindowStart > config.watchWindowMs) {
      session.watchWindowStart = now;
      session.watchWindowHits = 0;
    }

    if (session.watchWindowHits >= config.watchMaxPerWindow) return;
    session.watchWindowHits++;

    const notification: WatchNotification = {
      sessionId: session.id,
      pattern: wp.pattern,
      label: wp.label,
      matchedLine: matchedLine.slice(0, 500),
      timestamp: now,
    };

    for (const cb of watchCallbacks) {
      try {
        cb(notification);
      } catch {
        // Non-fatal
      }
    }
  }

  return {
    spawn(params): ProcessSpawnResult {
      if (!config.enabled) {
        return { ok: false, error: "Process monitoring is disabled" };
      }

      if (sessions.size >= config.maxProcesses) {
        // Prune finished first
        this.prune();
        if (sessions.size >= config.maxProcesses) {
          return { ok: false, error: `Max processes reached (${config.maxProcesses})` };
        }
      }

      const id = `proc-${++nextProcessId}-${Date.now().toString(36)}`;

      const session: ProcessSessionInternal = {
        id,
        command: params.command,
        taskId: params.taskId ?? "",
        sessionKey: params.sessionKey ?? "",
        pid: undefined,
        cwd: params.cwd,
        startedAt: Date.now(),
        exited: false,
        exitCode: undefined,
        outputBuffer: "",
        watchPatterns: [...(params.watchPatterns ?? [])],
        watchWindowHits: 0,
        watchWindowStart: Date.now(),
      };

      try {
        // Parse command into shell execution
        const child = execFile(
          "/bin/sh",
          ["-c", params.command],
          {
            cwd: params.cwd,
            maxBuffer: config.maxOutputChars * 2,
          },
        );

        session.pid = child.pid;
        session.process = child;

        child.stdout?.on("data", (chunk: Buffer) => {
          appendOutput(session, chunk.toString());
        });

        child.stderr?.on("data", (chunk: Buffer) => {
          appendOutput(session, chunk.toString());
        });

        child.on("exit", (code) => {
          session.exited = true;
          session.exitCode = code ?? undefined;
        });

        child.on("error", (err) => {
          session.exited = true;
          appendOutput(session, `\n[Process error: ${err.message}]\n`);
        });

        sessions.set(id, session);
        return { ok: true, sessionId: id };
      } catch (err) {
        return {
          ok: false,
          error: `Spawn failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },

    poll(sessionId: string): ProcessPollResult | undefined {
      const session = sessions.get(sessionId);
      if (!session) return undefined;

      return {
        id: session.id,
        running: !session.exited,
        exitCode: session.exitCode,
        output: session.outputBuffer,
        outputTruncated: session.outputBuffer.length >= config.maxOutputChars,
      };
    },

    kill(sessionId: string): boolean {
      const session = sessions.get(sessionId);
      if (!session || session.exited) return false;

      try {
        session.process?.kill("SIGTERM");
        // Grace period, then SIGKILL
        setTimeout(() => {
          if (!session.exited) {
            session.process?.kill("SIGKILL");
          }
        }, 5_000);
        return true;
      } catch {
        return false;
      }
    },

    list(sessionKey?: string): readonly ProcessSession[] {
      const result: ProcessSession[] = [];
      for (const session of sessions.values()) {
        if (sessionKey && session.sessionKey !== sessionKey) continue;
        const { process: _, watchPatterns: _w, watchWindowHits: _h, watchWindowStart: _s, ...rest } = session;
        result.push(rest);
      }
      return result;
    },

    onWatch(callback): void {
      watchCallbacks.push(callback);
    },

    prune(): number {
      const now = Date.now();
      let removed = 0;
      for (const [id, session] of sessions) {
        if (session.exited && now - session.startedAt > config.finishedTtlMs) {
          sessions.delete(id);
          removed++;
        }
      }
      return removed;
    },

    activeCount(): number {
      let count = 0;
      for (const session of sessions.values()) {
        if (!session.exited) count++;
      }
      return count;
    },
  };
}

// ── Tool definitions ──

export function getProcessMonitorToolDefinitions(): readonly {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}[] {
  return [
    {
      name: "process_spawn",
      description:
        "Spawn a background process and track its output. Returns a session ID for polling.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to run." },
          cwd: { type: "string", description: "Working directory." },
          watch_patterns: {
            type: "array",
            items: {
              type: "object",
              properties: {
                pattern: { type: "string", description: "Regex pattern to watch for." },
                label: { type: "string", description: "Notification label." },
              },
              required: ["pattern", "label"],
            },
            description: "Patterns to watch for in output.",
          },
        },
        required: ["command"],
      },
    },
    {
      name: "process_poll",
      description: "Get the status and output of a tracked background process.",
      parameters: {
        type: "object",
        properties: {
          session_id: { type: "string", description: "Process session ID." },
        },
        required: ["session_id"],
      },
    },
    {
      name: "process_kill",
      description: "Kill a tracked background process.",
      parameters: {
        type: "object",
        properties: {
          session_id: { type: "string", description: "Process session ID." },
        },
        required: ["session_id"],
      },
    },
    {
      name: "process_list",
      description: "List all tracked background processes.",
      parameters: { type: "object", properties: {} },
    },
  ];
}
