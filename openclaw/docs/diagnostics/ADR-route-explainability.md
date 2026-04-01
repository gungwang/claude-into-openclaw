# ADR: Route Explainability & Benchmarking (P2)

- **Status:** Accepted
- **Date:** 2026-04-01
- **Scope:** Tool resolution diagnostics, explain format, and benchmark harness

## Context

As OpenClaw's tool surface grows, understanding *why* a tool is or isn't available for a given session becomes critical for debugging, support, and policy tuning. Misrouting (wrong tool available/unavailable) is expensive to diagnose without structured trace data.

"Routing" in OpenClaw is really **tool resolution**: given a session context (agent, provider, sender, group), which tools survive the policy pipeline?

## Decision

### Structured Resolution Trace

Introduce `ToolResolutionTrace` — a diagnostic snapshot of tool resolution that captures:

- **Before/after tool lists** (pre- and post-policy)
- **Per-tool candidates** with canonical ID, namespace, availability, and signals
- **Policy decisions** that removed tools (from P1's `PolicyDecisionRecord`)

### Signal Types

Each candidate carries typed signals:
- `exact_match` — tool name matched the query
- `alias_match` — matched via display name or alias (future)
- `policy_allowed` — survived all policy filters
- `policy_filtered` — removed by a specific policy step (with source pointer)
- `owner_only_filtered`, `provider_filtered`, `message_provider_filtered`

### Explain API

- `buildToolResolutionTrace(...)` — builds a full trace
- `explainToolResolution(trace, toolName)` — single-tool lookup
- `formatToolResolutionTrace(trace)` — human-readable diagnostic output

### Benchmark Harness

- `ToolResolutionBenchmarkCase` — describes expected availability for a tool+context pair
- `evaluateBenchmarkCase(case, trace)` — returns pass/fail with actual vs expected
- `test-fixtures/route-benchmark-corpus.ts` — canonical test cases for CI regression

### Integration points

- `applyToolPolicyPipeline` already supports `policyDecisions[]` accumulator (from P1)
- Traces can be built anywhere the before/after tool lists are accessible
- Future: expose via `tools.explain` gateway method or CLI flag

## Non-goals (this PR)

- No runtime trace persistence or streaming to lifecycle events (future Phase 3)
- No integration into the gateway's HTTP tool invoke path yet
- No UI surface for explain traces

## Benchmark corpus strategy

The corpus covers:
- Core tool availability for owners
- Owner-only tool denial for non-owners
- Message provider filtering (voice, node, discord)
- Session management tool availability

Cases are evaluated against resolution traces, not live tool construction, for speed and determinism.

## Follow-up

- Wire `buildToolResolutionTrace` into `createOpenClawCodingTools` with a debug flag
- Add `tools.explain` gateway RPC method
- Expand benchmark corpus as new policy paths are added
- CI gate on benchmark regression
