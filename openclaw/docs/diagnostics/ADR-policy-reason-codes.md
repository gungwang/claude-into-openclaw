# ADR: Policy Decision Reason Codes (P1)

- **Status:** Accepted
- **Date:** 2026-04-01
- **Scope:** Structured reason codes on all deny/block enforcement paths

## Context

When a tool call or command is denied, users and operators need "why" answers with reproducible logic. Existing deny paths return human-readable strings, but there is no machine-readable taxonomy for programmatic diagnostics, compliance reviews, or debug filtering.

## Decision

Introduce a `PolicyDecisionRecord` type attached to every deny/block decision across:

- **exec-policy** (`security=deny`, `approval-required`, `allowlist-miss`, `shell-wrapper-blocked`)
- **tool-policy-pipeline** (profile, global, agent, provider, group, sandbox, subagent denials)
- **before-tool-call hook** (plugin blocks, approval denials/timeouts/cancellations, loop detection)
- **owner-only tool guard** (`auth:owner_only`)

### Reason code format

`<category>:<specific_reason>`

Categories: `exec`, `tool_policy`, `hook`, `approval`, `auth`, `loop`

### PolicyDecisionRecord schema

```ts
{
  code: PolicyReasonCode;       // e.g. "exec:allowlist_miss"
  message: string;              // human-readable
  policySource?: string;        // e.g. "tools.exec.security", "agents.helper.tools.deny"
  toolName?: string;            // which tool was denied
  details?: Record<string, unknown>;  // extra structured context
}
```

## Behavior

- Records are **attached** to existing deny returns — no behavioral changes.
- `policyDecisions` accumulator in `applyToolPolicyPipeline` is opt-in.
- `policyDecisionRecord` on `HookOutcome` and `SystemRunPolicyDecision` is optional.
- Records are available for verbose/debug logging; not exposed to end users by default.

## Non-goals

- No new API surface for querying decisions externally (future work).
- No persistence of decision records (future work for audit trail).

## Follow-up

- Phase 2: expose decision records in verbose diagnostic streams.
- Phase 2: aggregate per-session deny statistics.
- Phase 3: compliance report generation from decision records.
