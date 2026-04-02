/**
 * Session Event Journal Facade (P5)
 *
 * A normalized event timeline for session diagnostics, separate from raw
 * transcript details. Provides a concise, structured view of what happened
 * during a session run for replay, debugging, and observability dashboards.
 *
 * Events carry correlation IDs that tie back to transcript entries.
 */

// ── Event types ──

export type JournalEventType =
  | "message_in"
  | "message_out"
  | "route_selected"
  | "tool_call_start"
  | "tool_call_end"
  | "policy_decision"
  | "compaction_start"
  | "compaction_end"
  | "memory_flush"
  | "session_start"
  | "session_end"
  | "error"
  | "custom";

export type JournalEventSeverity = "debug" | "info" | "warn" | "error";

// ── Journal event ──

export type JournalEvent = {
  /** Unique event ID within this journal. */
  id: string;
  /** Event type. */
  type: JournalEventType;
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** Severity level for filtering. */
  severity: JournalEventSeverity;
  /** Human-readable summary. */
  summary: string;
  /** Correlation ID tying this event to a transcript entry or tool call. */
  correlationId?: string;
  /** Duration in milliseconds (for start/end pairs). */
  durationMs?: number;
  /** Structured payload (type-dependent). */
  payload?: Record<string, unknown>;
};

// ── Journal ──

export type SessionEventJournal = {
  /** Session key this journal belongs to. */
  sessionKey: string;
  /** Agent ID. */
  agentId?: string;
  /** Run ID (if applicable). */
  runId?: string;
  /** Journal creation timestamp. */
  createdAt: string;
  /** Ordered event list. */
  events: JournalEvent[];
};

// ── Journal builder ──

let eventCounter = 0;

function generateEventId(): string {
  return `evt_${Date.now()}_${++eventCounter}`;
}

export function resetEventCounterForTest(): void {
  eventCounter = 0;
}

export function createSessionEventJournal(params: {
  sessionKey: string;
  agentId?: string;
  runId?: string;
}): SessionEventJournal {
  return {
    sessionKey: params.sessionKey,
    agentId: params.agentId,
    runId: params.runId,
    createdAt: new Date().toISOString(),
    events: [],
  };
}

export function appendJournalEvent(
  journal: SessionEventJournal,
  event: Omit<JournalEvent, "id" | "timestamp">,
): JournalEvent {
  const entry: JournalEvent = {
    id: generateEventId(),
    timestamp: new Date().toISOString(),
    ...event,
  };
  journal.events.push(entry);
  return entry;
}

// ── Convenience event creators ──

export function journalMessageIn(
  journal: SessionEventJournal,
  params: { summary: string; correlationId?: string; payload?: Record<string, unknown> },
): JournalEvent {
  return appendJournalEvent(journal, {
    type: "message_in",
    severity: "info",
    summary: params.summary,
    correlationId: params.correlationId,
    payload: params.payload,
  });
}

export function journalMessageOut(
  journal: SessionEventJournal,
  params: { summary: string; correlationId?: string; payload?: Record<string, unknown> },
): JournalEvent {
  return appendJournalEvent(journal, {
    type: "message_out",
    severity: "info",
    summary: params.summary,
    correlationId: params.correlationId,
    payload: params.payload,
  });
}

export function journalToolCallStart(
  journal: SessionEventJournal,
  params: { toolName: string; toolCallId: string; payload?: Record<string, unknown> },
): JournalEvent {
  return appendJournalEvent(journal, {
    type: "tool_call_start",
    severity: "info",
    summary: `Tool call: ${params.toolName}`,
    correlationId: params.toolCallId,
    payload: { toolName: params.toolName, ...params.payload },
  });
}

export function journalToolCallEnd(
  journal: SessionEventJournal,
  params: {
    toolName: string;
    toolCallId: string;
    durationMs: number;
    success: boolean;
    payload?: Record<string, unknown>;
  },
): JournalEvent {
  return appendJournalEvent(journal, {
    type: "tool_call_end",
    severity: params.success ? "info" : "warn",
    summary: `Tool ${params.success ? "completed" : "failed"}: ${params.toolName} (${params.durationMs}ms)`,
    correlationId: params.toolCallId,
    durationMs: params.durationMs,
    payload: { toolName: params.toolName, success: params.success, ...params.payload },
  });
}

export function journalPolicyDecision(
  journal: SessionEventJournal,
  params: { code: string; message: string; toolName?: string; correlationId?: string },
): JournalEvent {
  return appendJournalEvent(journal, {
    type: "policy_decision",
    severity: "warn",
    summary: `Policy: ${params.code} — ${params.message}`,
    correlationId: params.correlationId,
    payload: { code: params.code, toolName: params.toolName },
  });
}

export function journalCompactionStart(
  journal: SessionEventJournal,
  params: { reason: string; correlationId?: string },
): JournalEvent {
  return appendJournalEvent(journal, {
    type: "compaction_start",
    severity: "info",
    summary: `Compaction started: ${params.reason}`,
    correlationId: params.correlationId,
  });
}

export function journalCompactionEnd(
  journal: SessionEventJournal,
  params: { reason: string; durationMs: number; success: boolean; correlationId?: string },
): JournalEvent {
  return appendJournalEvent(journal, {
    type: "compaction_end",
    severity: params.success ? "info" : "warn",
    summary: `Compaction ${params.success ? "completed" : "failed"}: ${params.reason} (${params.durationMs}ms)`,
    correlationId: params.correlationId,
    durationMs: params.durationMs,
    payload: { success: params.success },
  });
}

export function journalMemoryFlush(
  journal: SessionEventJournal,
  params: { summary: string; correlationId?: string },
): JournalEvent {
  return appendJournalEvent(journal, {
    type: "memory_flush",
    severity: "info",
    summary: params.summary,
    correlationId: params.correlationId,
  });
}

export function journalError(
  journal: SessionEventJournal,
  params: { summary: string; correlationId?: string; payload?: Record<string, unknown> },
): JournalEvent {
  return appendJournalEvent(journal, {
    type: "error",
    severity: "error",
    summary: params.summary,
    correlationId: params.correlationId,
    payload: params.payload,
  });
}

// ── Query / export ──

export function filterJournalEvents(
  journal: SessionEventJournal,
  filter: {
    types?: JournalEventType[];
    severity?: JournalEventSeverity[];
    correlationId?: string;
    after?: string;
    before?: string;
  },
): JournalEvent[] {
  return journal.events.filter((event) => {
    if (filter.types && !filter.types.includes(event.type)) {
      return false;
    }
    if (filter.severity && !filter.severity.includes(event.severity)) {
      return false;
    }
    if (filter.correlationId && event.correlationId !== filter.correlationId) {
      return false;
    }
    if (filter.after && event.timestamp < filter.after) {
      return false;
    }
    if (filter.before && event.timestamp > filter.before) {
      return false;
    }
    return true;
  });
}

export function formatJournalTimeline(journal: SessionEventJournal): string {
  const lines: string[] = [];
  lines.push(`Session Journal: ${journal.sessionKey}`);
  if (journal.agentId) {
    lines.push(`Agent: ${journal.agentId}`);
  }
  if (journal.runId) {
    lines.push(`Run: ${journal.runId}`);
  }
  lines.push(`Events: ${journal.events.length}`);
  lines.push("");

  for (const event of journal.events) {
    const time = event.timestamp.split("T")[1]?.replace("Z", "") ?? event.timestamp;
    const dur = event.durationMs !== undefined ? ` (${event.durationMs}ms)` : "";
    const corr = event.correlationId ? ` [${event.correlationId}]` : "";
    const sev = event.severity === "error" ? " ❌" : event.severity === "warn" ? " ⚠️" : "";
    lines.push(`  ${time} ${event.type}${sev}: ${event.summary}${dur}${corr}`);
  }

  return lines.join("\n");
}

export function exportJournalAsJson(journal: SessionEventJournal): string {
  return JSON.stringify(journal, null, 2);
}
