import { afterEach, describe, expect, it } from "vitest";
import {
  appendJournalEvent,
  createSessionEventJournal,
  exportJournalAsJson,
  filterJournalEvents,
  formatJournalTimeline,
  journalCompactionEnd,
  journalCompactionStart,
  journalError,
  journalMemoryFlush,
  journalMessageIn,
  journalMessageOut,
  journalPolicyDecision,
  journalToolCallEnd,
  journalToolCallStart,
  resetEventCounterForTest,
} from "./session-event-journal.js";

afterEach(() => {
  resetEventCounterForTest();
});

describe("session event journal", () => {
  it("creates an empty journal", () => {
    const journal = createSessionEventJournal({
      sessionKey: "agent:main:main",
      agentId: "main",
    });

    expect(journal.sessionKey).toBe("agent:main:main");
    expect(journal.agentId).toBe("main");
    expect(journal.events).toHaveLength(0);
    expect(journal.createdAt).toBeTruthy();
  });

  it("appends events with auto-generated ids and timestamps", () => {
    const journal = createSessionEventJournal({ sessionKey: "test" });

    const event = appendJournalEvent(journal, {
      type: "session_start",
      severity: "info",
      summary: "Session started",
    });

    expect(event.id).toMatch(/^evt_/);
    expect(event.timestamp).toBeTruthy();
    expect(journal.events).toHaveLength(1);
  });

  it("records message_in and message_out events", () => {
    const journal = createSessionEventJournal({ sessionKey: "test" });

    journalMessageIn(journal, { summary: "User: hello", correlationId: "msg-1" });
    journalMessageOut(journal, { summary: "Assistant: hi there", correlationId: "msg-1" });

    expect(journal.events).toHaveLength(2);
    expect(journal.events[0]!.type).toBe("message_in");
    expect(journal.events[1]!.type).toBe("message_out");
    expect(journal.events[0]!.correlationId).toBe("msg-1");
  });

  it("records tool call start/end with duration and success", () => {
    const journal = createSessionEventJournal({ sessionKey: "test" });

    journalToolCallStart(journal, { toolName: "exec", toolCallId: "tc-1" });
    journalToolCallEnd(journal, {
      toolName: "exec",
      toolCallId: "tc-1",
      durationMs: 1500,
      success: true,
    });

    expect(journal.events).toHaveLength(2);
    expect(journal.events[0]!.type).toBe("tool_call_start");
    expect(journal.events[1]!.type).toBe("tool_call_end");
    expect(journal.events[1]!.durationMs).toBe(1500);
    expect(journal.events[1]!.summary).toContain("completed");
  });

  it("records failed tool calls with warn severity", () => {
    const journal = createSessionEventJournal({ sessionKey: "test" });

    journalToolCallEnd(journal, {
      toolName: "exec",
      toolCallId: "tc-2",
      durationMs: 200,
      success: false,
    });

    expect(journal.events[0]!.severity).toBe("warn");
    expect(journal.events[0]!.summary).toContain("failed");
  });

  it("records policy decisions", () => {
    const journal = createSessionEventJournal({ sessionKey: "test" });

    journalPolicyDecision(journal, {
      code: "exec:allowlist_miss",
      message: "Command not in allowlist",
      toolName: "exec",
    });

    expect(journal.events[0]!.type).toBe("policy_decision");
    expect(journal.events[0]!.severity).toBe("warn");
    expect(journal.events[0]!.payload).toEqual({ code: "exec:allowlist_miss", toolName: "exec" });
  });

  it("records compaction start/end pair", () => {
    const journal = createSessionEventJournal({ sessionKey: "test" });

    journalCompactionStart(journal, { reason: "context overflow", correlationId: "cmp-1" });
    journalCompactionEnd(journal, {
      reason: "context overflow",
      durationMs: 800,
      success: true,
      correlationId: "cmp-1",
    });

    expect(journal.events).toHaveLength(2);
    expect(journal.events[0]!.correlationId).toBe("cmp-1");
    expect(journal.events[1]!.correlationId).toBe("cmp-1");
    expect(journal.events[1]!.durationMs).toBe(800);
  });

  it("records memory flush events", () => {
    const journal = createSessionEventJournal({ sessionKey: "test" });

    journalMemoryFlush(journal, { summary: "Flushed session memory to disk" });

    expect(journal.events[0]!.type).toBe("memory_flush");
  });

  it("records error events", () => {
    const journal = createSessionEventJournal({ sessionKey: "test" });

    journalError(journal, {
      summary: "Provider returned 500",
      payload: { provider: "openai", statusCode: 500 },
    });

    expect(journal.events[0]!.type).toBe("error");
    expect(journal.events[0]!.severity).toBe("error");
  });

  it("filters events by type", () => {
    const journal = createSessionEventJournal({ sessionKey: "test" });
    journalMessageIn(journal, { summary: "hello" });
    journalToolCallStart(journal, { toolName: "read", toolCallId: "tc-1" });
    journalToolCallEnd(journal, { toolName: "read", toolCallId: "tc-1", durationMs: 50, success: true });
    journalError(journal, { summary: "oops" });

    const toolEvents = filterJournalEvents(journal, {
      types: ["tool_call_start", "tool_call_end"],
    });
    expect(toolEvents).toHaveLength(2);
  });

  it("filters events by severity", () => {
    const journal = createSessionEventJournal({ sessionKey: "test" });
    journalMessageIn(journal, { summary: "hello" });
    journalError(journal, { summary: "oops" });
    journalPolicyDecision(journal, { code: "exec:deny", message: "denied" });

    const problems = filterJournalEvents(journal, { severity: ["warn", "error"] });
    expect(problems).toHaveLength(2);
  });

  it("filters events by correlationId", () => {
    const journal = createSessionEventJournal({ sessionKey: "test" });
    journalToolCallStart(journal, { toolName: "exec", toolCallId: "tc-1" });
    journalToolCallStart(journal, { toolName: "read", toolCallId: "tc-2" });
    journalToolCallEnd(journal, { toolName: "exec", toolCallId: "tc-1", durationMs: 100, success: true });

    const tc1Events = filterJournalEvents(journal, { correlationId: "tc-1" });
    expect(tc1Events).toHaveLength(2);
    expect(tc1Events.every((e) => e.correlationId === "tc-1")).toBe(true);
  });

  it("formats a timeline string", () => {
    const journal = createSessionEventJournal({
      sessionKey: "agent:main:main",
      agentId: "main",
      runId: "run-123",
    });
    journalMessageIn(journal, { summary: "User: build a thing" });
    journalToolCallStart(journal, { toolName: "exec", toolCallId: "tc-1" });
    journalToolCallEnd(journal, { toolName: "exec", toolCallId: "tc-1", durationMs: 2000, success: true });
    journalError(journal, { summary: "Provider timeout" });

    const timeline = formatJournalTimeline(journal);
    expect(timeline).toContain("Session Journal: agent:main:main");
    expect(timeline).toContain("Agent: main");
    expect(timeline).toContain("Run: run-123");
    expect(timeline).toContain("Events: 4");
    expect(timeline).toContain("message_in:");
    expect(timeline).toContain("tool_call_start:");
    expect(timeline).toContain("(2000ms)");
    expect(timeline).toContain("❌");
  });

  it("exports journal as JSON", () => {
    const journal = createSessionEventJournal({ sessionKey: "test" });
    journalMessageIn(journal, { summary: "hello" });

    const json = exportJournalAsJson(journal);
    const parsed = JSON.parse(json);
    expect(parsed.sessionKey).toBe("test");
    expect(parsed.events).toHaveLength(1);
  });
});
