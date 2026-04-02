# ADR: Session Event Journal Facade (P5)

- **Status:** Accepted
- **Date:** 2026-04-01
- **Scope:** Normalized event journal for session diagnostics

## Context

Complex agent runs produce raw transcripts with interleaved tool calls, compactions, policy decisions, and messages. Debugging requires scanning through verbose transcript data to reconstruct what happened and in what order.

A separate, concise event timeline provides:
- Faster replay and debugging
- Better observability dashboards
- Correlation between journal events and transcript entries

## Decision

### Journal Structure

```ts
SessionEventJournal {
  sessionKey: string;
  agentId?: string;
  runId?: string;
  createdAt: string;
  events: JournalEvent[];
}
```

### Event Types

| Type | Description |
|------|-------------|
| `message_in` | Inbound user/system message |
| `message_out` | Outbound assistant message |
| `route_selected` | Tool/route selection made |
| `tool_call_start` | Tool execution began |
| `tool_call_end` | Tool execution finished (with duration + success) |
| `policy_decision` | Policy denied a tool call |
| `compaction_start` | Context compaction initiated |
| `compaction_end` | Context compaction completed |
| `memory_flush` | Session memory flushed to disk |
| `session_start` | Session started |
| `session_end` | Session ended |
| `error` | Error occurred |
| `custom` | Extension point |

### Event Structure

Each event carries:
- `id`: unique within journal
- `type`: from the type enum above
- `timestamp`: ISO-8601
- `severity`: debug | info | warn | error
- `summary`: human-readable one-liner
- `correlationId`: ties to transcript entry or tool call ID
- `durationMs`: for start/end pairs
- `payload`: structured context (type-dependent)

### Capabilities

- **Convenience creators**: `journalMessageIn()`, `journalToolCallStart()`, etc.
- **Filtering**: by type, severity, correlationId, time range
- **Timeline formatting**: human-readable diagnostic output
- **JSON export**: for dashboards and external tooling

## Integration points

The journal is an in-memory structure created per session/run. Future wiring:
- Append events from `pi-embedded-runner/run.ts` lifecycle hooks
- Append events from `before_tool_call` / `after_tool_call` hooks
- Append events from compaction lifecycle
- Export via gateway method or CLI command

## Non-goals (this PR)

- No persistence to disk (future: append to session store)
- No streaming to lifecycle event bus (future)
- No wiring into the agent run loop (future: hook integration)

## Follow-up

- Wire journal into `pi-embedded-runner` run loop
- Add `session.journal` gateway RPC method
- Stream journal events to lifecycle subscribers
- Optional journal export on session end
