import { Type } from "typebox";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import {
  DEFAULT_PROCESS_MONITOR_CONFIG,
  createProcessMonitor,
  type ProcessMonitor,
  type WatchPattern,
} from "../../tools/process-monitor.js";
import type { AnyAgentTool } from "./common.js";
import {
  ToolInputError,
  asToolParamsRecord,
  jsonResult,
  readStringParam,
} from "./common.js";

type ProcessMonitorToolOptions = {
  config?: OpenClawConfig;
  agentSessionKey?: string;
};

const SpawnSchema = Type.Object({
  command: Type.String({ description: "Shell command to run." }),
  cwd: Type.Optional(Type.String({ description: "Working directory." })),
  taskId: Type.Optional(Type.String({ description: "Optional task id for grouping." })),
  watchPatterns: Type.Optional(
    Type.Array(
      Type.Object({
        pattern: Type.String({ description: "Regex pattern to watch for." }),
        label: Type.String({ description: "Notification label." }),
      }),
    ),
  ),
});

const PollKillSchema = Type.Object({
  sessionId: Type.String({ description: "Process session id returned by process_spawn." }),
});

const ListSchema = Type.Object({
  sessionKey: Type.Optional(Type.String({ description: "Optional session key filter." })),
});

function resolveProcessMonitorEnabled(config?: OpenClawConfig): boolean {
  return config?.advancedTools?.processMonitor?.enabled === true;
}

function resolveProcessMonitorConfig(config?: OpenClawConfig) {
  const advanced = config?.advancedTools?.processMonitor;
  return {
    ...DEFAULT_PROCESS_MONITOR_CONFIG,
    ...(advanced?.maxProcesses !== undefined ? { maxProcesses: advanced.maxProcesses } : {}),
    ...(advanced?.outputBufferSize !== undefined
      ? { maxOutputChars: advanced.outputBufferSize }
      : {}),
    ...(advanced?.watchRateLimitMs !== undefined ? { watchWindowMs: advanced.watchRateLimitMs } : {}),
  };
}

let monitorSingleton: ProcessMonitor | undefined;
let monitorConfigKey = "";

function getOrCreateMonitor(config?: OpenClawConfig): ProcessMonitor | null {
  if (!resolveProcessMonitorEnabled(config)) {
    return null;
  }
  const resolved = resolveProcessMonitorConfig(config);
  const key = JSON.stringify(resolved);
  if (!monitorSingleton || monitorConfigKey !== key) {
    monitorSingleton = createProcessMonitor(resolved);
    monitorConfigKey = key;
  }
  return monitorSingleton;
}

function readWatchPatterns(params: Record<string, unknown>): WatchPattern[] | undefined {
  const raw = params.watchPatterns ?? params.watch_patterns;
  if (raw === undefined) {
    return undefined;
  }
  if (!Array.isArray(raw)) {
    throw new ToolInputError("watchPatterns must be an array of { pattern, label } objects.");
  }

  const patterns: WatchPattern[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new ToolInputError("watchPatterns entries must be objects.");
    }
    const record = entry as Record<string, unknown>;
    const pattern = typeof record.pattern === "string" ? record.pattern.trim() : "";
    const label = typeof record.label === "string" ? record.label.trim() : "";
    if (!pattern || !label) {
      throw new ToolInputError("watchPatterns entries require non-empty pattern and label.");
    }
    patterns.push({ pattern, label });
  }

  return patterns;
}

export function createProcessMonitorTools(options?: ProcessMonitorToolOptions): AnyAgentTool[] {
  const processSpawnTool: AnyAgentTool = {
    label: "Process Spawn",
    name: "process_spawn",
    displaySummary: "Spawn and track a background process.",
    description:
      "Spawn a background process under the advanced process monitor and return a session id.",
    parameters: SpawnSchema,
    execute: async (_toolCallId, args) => {
      const monitor = getOrCreateMonitor(options?.config);
      if (!monitor) {
        return jsonResult({ ok: false, error: "advancedTools.processMonitor.enabled is false" });
      }

      const params = asToolParamsRecord(args);
      const command = readStringParam(params, "command", { required: true, label: "command" });
      const cwd = readStringParam(params, "cwd");
      const taskId = readStringParam(params, "taskId") ?? readStringParam(params, "task_id");
      const watchPatterns = readWatchPatterns(params);

      const result = monitor.spawn({
        command,
        cwd,
        taskId,
        sessionKey: options?.agentSessionKey ?? "",
        watchPatterns,
      });
      return jsonResult(result);
    },
  };

  const processPollTool: AnyAgentTool = {
    label: "Process Poll",
    name: "process_poll",
    displaySummary: "Poll tracked process status/output.",
    description: "Return running status and buffered output for a tracked process session.",
    parameters: PollKillSchema,
    execute: async (_toolCallId, args) => {
      const monitor = getOrCreateMonitor(options?.config);
      if (!monitor) {
        return jsonResult({ ok: false, error: "advancedTools.processMonitor.enabled is false" });
      }
      const params = asToolParamsRecord(args);
      const sessionId =
        readStringParam(params, "sessionId") ?? readStringParam(params, "session_id", { required: true });
      const polled = monitor.poll(sessionId);
      if (!polled) {
        return jsonResult({ ok: false, error: `Unknown process session: ${sessionId}` });
      }
      return jsonResult(polled);
    },
  };

  const processKillTool: AnyAgentTool = {
    label: "Process Kill",
    name: "process_kill",
    displaySummary: "Terminate a tracked process.",
    description: "Stop a tracked process by session id.",
    parameters: PollKillSchema,
    execute: async (_toolCallId, args) => {
      const monitor = getOrCreateMonitor(options?.config);
      if (!monitor) {
        return jsonResult({ ok: false, error: "advancedTools.processMonitor.enabled is false" });
      }
      const params = asToolParamsRecord(args);
      const sessionId =
        readStringParam(params, "sessionId") ?? readStringParam(params, "session_id", { required: true });
      const killed = monitor.kill(sessionId);
      return jsonResult({ ok: killed, sessionId });
    },
  };

  const processListTool: AnyAgentTool = {
    label: "Process List",
    name: "process_list",
    displaySummary: "List tracked process sessions.",
    description: "List monitored process sessions, optionally filtered by session key.",
    parameters: ListSchema,
    execute: async (_toolCallId, args) => {
      const monitor = getOrCreateMonitor(options?.config);
      if (!monitor) {
        return jsonResult({ ok: false, error: "advancedTools.processMonitor.enabled is false" });
      }
      const params = asToolParamsRecord(args);
      const explicitSessionKey =
        readStringParam(params, "sessionKey") ?? readStringParam(params, "session_key");
      const sessions = monitor.list(explicitSessionKey ?? options?.agentSessionKey);
      return jsonResult({ ok: true, sessions, count: sessions.length });
    },
  };

  return [processSpawnTool, processPollTool, processKillTool, processListTool];
}

export const __testing = {
  resetProcessMonitorSingleton() {
    monitorSingleton = undefined;
    monitorConfigKey = "";
  },
};
