# ADR: Runtime Wiring — Gateway APIs, Journal Integration, CI Benchmark (Phase 4)

- **Status:** Accepted
- **Date:** 2026-04-01
- **Scope:** Wire Phase 1–3 primitives into runtime paths

## Context

Phases 1–3 introduced additive scaffolds (canonical identity, policy reason codes, route explainability, mode contracts, maturity labels, session journal) that don't yet connect to runtime execution paths. This phase wires them in.

## Decision

### 1. Gateway RPC Handlers

**`tools.explain`** — given a tool name + optional session/agent context, returns:
- Whether the tool is available
- Canonical ID and namespace
- Signals explaining why (exact match, policy allowed/filtered)
- Policy decisions that affected the tool
- Supports `format=json|text`

**`tools.maturityReport`** — generates the maturity report artifact:
- All core tools with maturity level (L0–L4), trust source, vetting status
- Summary counts by level, source, vetting
- Supports `format=json|markdown`

Both handlers are registered in `coreGatewayHandlers` alongside existing `tools.catalog` and `tools.effective`.

### 2. Journal Integration Helpers

`journal-integration.ts` provides typed helper functions for recording:
- Inbound/outbound messages (with preview truncation)
- Tool call start/end (with duration calculation)
- Policy decisions (from PolicyDecisionRecord)
- Compaction start/end
- Memory flush
- Run errors

All helpers gracefully no-op when journal is `undefined`, so callers can optionally pass a journal without branching.

**Integration points** (for future wiring into run loop):
- `recordInboundMessage` — at prompt receipt
- `recordToolCallStart/End` — in `before_tool_call` / `after_tool_call` hooks
- `recordCompactionStart/End` — in compaction lifecycle hooks
- `recordMemoryFlush` — after memory flush write
- `recordRunError` — on failover or error paths

### 3. CI Benchmark Gate

`test/route-benchmark.test.ts` runs all cases from `test-fixtures/route-benchmark-corpus.ts`:
- Simulates tool availability using known policy rules
- Builds resolution traces from simulated before/after tool lists
- Evaluates each benchmark case against the trace
- Fails CI if any expected availability doesn't match

## Follow-up

- Wire journal helpers into `pi-embedded-runner/run.ts` (call sites identified)
- Wire `policyDecisions` accumulator into `tools.explain` for full pipeline tracing
- Add `session.journal` gateway method to export journal for a session
- Expand benchmark corpus as new policy paths are added
