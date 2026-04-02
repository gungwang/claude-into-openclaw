# claude-openclaw — Complete Technical Reference

**Project ID:** claude-openclaw  
**Repository:** `/home/wang/projects/claud-code-src/claw-code/openclaw`  
**Base version:** OpenClaw v3.31  
**Date:** 2026-04-01  
**PRs:** #2 through #9 (all merged to main)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Summary](#2-architecture-summary)
3. [Track A — Canonical Tool Identity Layer](#3-track-a--canonical-tool-identity-layer)
4. [Track B — Route Explainability & Benchmarking](#4-track-b--route-explainability--benchmarking)
5. [Track C — Adapter Maturity Levels (Parity Rubric)](#5-track-c--adapter-maturity-levels-parity-rubric)
6. [Track D — Policy Decision Traceability](#6-track-d--policy-decision-traceability)
7. [Track E — Mode Contract Test Matrix](#7-track-e--mode-contract-test-matrix)
8. [Track F — Skill Vetting + Runtime Trust Labels](#8-track-f--skill-vetting--runtime-trust-labels)
9. [Track G — Session Event Journal Facade](#9-track-g--session-event-journal-facade)
10. [Runtime Wiring — Gateway APIs & Integration](#10-runtime-wiring--gateway-apis--integration)
11. [File Inventory](#11-file-inventory)
12. [Test Commands](#12-test-commands)
13. [API Reference](#13-api-reference)
14. [ADR Index](#14-adr-index)
15. [Follow-Up Items](#15-follow-up-items)

---

## 1. Project Overview

### Origin

The `claw-code` repository mirrors a Claude-code-style harness with 207 command entries and 184 tool entries. Analysis revealed that OpenClaw could benefit from **migration-grade observability and adapter ergonomics** — specifically:

- Canonical identity and deduping for large tool surfaces
- Deterministic routing and explainability
- Strict parity governance (metadata → dry-run → active runtime)
- Mode contract testing
- Richer adapter lifecycle and policy visibility

### Approach

All changes are **additive and non-breaking**. No existing tool invocation behavior, policy enforcement, or dispatch logic was modified. Each track introduces new modules with optional integration points.

### Delivery

| Phase | Tracks | Focus |
|-------|--------|-------|
| Phase 1 | A, D | Observability foundations |
| Phase 2 | B, E | Quality controls |
| Phase 3 | C, F | Governance & ecosystem safety |
| Additive | G | Session event journal |
| Wiring | — | Gateway APIs, run loop integration, CI gate |

---

## 2. Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                     Gateway RPC Layer                        │
│  tools.explain │ tools.maturityReport │ session.journal      │
└────────┬────────────────┬──────────────────┬────────────────┘
         │                │                  │
    ┌────▼────┐    ┌──────▼──────┐   ┌──────▼──────┐
    │ Route   │    │ Maturity    │   │ Session     │
    │ Explain │    │ Report      │   │ Journal     │
    │ Engine  │    │ Generator   │   │ Registry    │
    └────┬────┘    └──────┬──────┘   └──────┬──────┘
         │                │                  │
    ┌────▼────────────────▼──────────────────▼────────────────┐
    │              Core Primitives Layer                        │
    │                                                          │
    │  tool-identity.ts     ← canonical IDs, namespaces        │
    │  policy-reason-codes.ts ← structured deny reasons        │
    │  route-explainability.ts ← traces, signals, benchmarks   │
    │  mode-contracts.ts    ← lifecycle, errors, envelopes     │
    │  maturity-trust.ts    ← L0-L4 levels, trust labels       │
    │  session-event-journal.ts ← typed events, filtering      │
    │  journal-integration.ts   ← run loop helpers             │
    └──────────────┬───────────────────────────────────────────┘
                   │
    ┌──────────────▼───────────────────────────────────────────┐
    │           Existing OpenClaw Runtime                       │
    │                                                          │
    │  pi-tools.ts          ← tool assembly + identity diag    │
    │  tool-policy-pipeline.ts ← policy filtering + reasons    │
    │  pi-tools.before-tool-call.ts ← hook blocks + reasons    │
    │  exec-policy.ts       ← exec deny + reasons              │
    │  tool-policy.ts       ← owner-only + reasons             │
    │  plugins/tools.ts     ← plugin meta + identity hints     │
    │  pi-embedded-runner/run.ts ← journal lifecycle events    │
    │  server-methods.ts    ← gateway handler registration     │
    └──────────────────────────────────────────────────────────┘
```

---

## 3. Track A — Canonical Tool Identity Layer

**PR:** #2 (dev.1)  
**Problem:** Human-readable tool names are not globally unique. Name collisions make audits and routing brittle at scale.

### Solution

New module: `src/agents/tool-identity.ts`

#### Types

```typescript
type ToolNamespace = "core" | "plugin" | "skill" | "provider" | "local";

type ToolCapabilityClass =
  | "read" | "write" | "execute" | "network"
  | "messaging" | "scheduling" | "other";

type CanonicalToolIdentity = {
  id: string;              // machine identity, stable
  displayName: string;     // human-facing name
  namespace: ToolNamespace;
  capabilityClass: ToolCapabilityClass;
  version?: string;
  sourceDigest?: string;
};
```

#### Fallback ID Derivation

When no explicit ID is supplied:
- Core tools: `core:<toolName>` (e.g., `core:read`)
- Plugin tools: `plugin:<pluginId>:<toolName>` (e.g., `plugin:voice-call:start_call`)
- Provider tools: `provider:<providerId>:<toolName>`

#### Functions

| Function | Purpose |
|----------|---------|
| `normalizeCanonicalToolId(id)` | Lowercase, trim, separator-safe |
| `deriveFallbackCanonicalToolId(params)` | Deterministic ID from namespace+name |
| `inferCapabilityClassFromToolName(name)` | Map known tool names to classes |
| `validateCanonicalToolIdentity(identity)` | Return structured issues |
| `findDuplicateCanonicalIds(identities)` | Groups with >1 entry per ID |
| `findAmbiguousDisplayNames(identities)` | Same display name, different IDs |

#### Integration

In `pi-tools.ts` → `createOpenClawCodingTools()`:
- After final tool list assembly, `buildCanonicalIdentities()` runs
- `emitCanonicalIdentityDiagnostics()` logs warnings for duplicates/ambiguity
- No dispatch behavior change

In `plugins/tools.ts`:
- `PluginToolMeta` extended with optional `canonicalIdHint` and `namespace`
- Auto-derived at plugin registration time

---

## 4. Track B — Route Explainability & Benchmarking

**PR:** #4 (dev.3)  
**Problem:** When tool surfaces grow, understanding *why* a tool is available or missing is critical for debugging.

### Solution

New module: `src/agents/route-explainability.ts`

#### Resolution Trace

```typescript
type ToolResolutionTrace = {
  query: string;
  timestamp: string;
  sessionKey?: string;
  agentId?: string;
  totalBeforePolicy: number;
  totalAfterPolicy: number;
  candidates: ToolResolutionCandidate[];
  policyDecisions: PolicyDecisionRecord[];
};

type ToolResolutionCandidate = {
  toolName: string;
  canonicalId: string;
  namespace: ToolNamespace;
  available: boolean;
  signals: RouteSignal[];
};
```

#### Signal Types

| Signal | Meaning |
|--------|---------|
| `exact_match` | Tool name matched the query |
| `alias_match` | Matched via display name (future) |
| `policy_allowed` | Survived all policy filters |
| `policy_filtered` | Removed by a specific policy step |
| `owner_only_filtered` | Removed by owner-only guard |
| `provider_filtered` | Removed by model provider policy |
| `message_provider_filtered` | Removed by message provider policy |

#### Functions

| Function | Purpose |
|----------|---------|
| `buildToolResolutionTrace(params)` | Build full trace from before/after lists |
| `explainToolResolution(trace, name)` | Single-tool lookup |
| `formatToolResolutionTrace(trace)` | Human-readable diagnostic |
| `evaluateBenchmarkCase(case, trace)` | Benchmark evaluation |

#### Benchmark Corpus

`test-fixtures/route-benchmark-corpus.ts` — 14 deterministic cases:
- Core tool availability for owners
- Owner-only denial for non-owners
- Message provider filtering (voice, node, discord)
- Session management tool availability

CI gate: `test/route-benchmark.test.ts`

---

## 5. Track C — Adapter Maturity Levels (Parity Rubric)

**PR:** #6 (dev.5)  
**Problem:** Binary "exists vs works" hides real tool maturity.

### Solution

New module: `src/agents/maturity-trust.ts`

#### Maturity Levels

| Level | Label | Criteria |
|-------|-------|----------|
| L0 | Discoverable | Has name + description; listed in catalog |
| L1 | Schema-validated | JSON Schema defined; appears in inventory |
| L2 | Dry-run capable | Policy checks pass; error taxonomy defined |
| L3 | Production-active | Real execution; error handling; used in production |
| L4 | Production-hardened | Telemetry; benchmark tests; stable across releases |

#### Trust Labels

**Source:** `core` | `first-party` | `community` | `local`  
**Vetting:** `unreviewed` | `reviewed` | `verified`

#### Report Artifact

```typescript
type MaturityReportArtifact = {
  generatedAt: string;
  version: string;
  entries: ToolMaturityEntry[];
  summary: {
    total: number;
    byLevel: Record<string, number>;
    bySource: Record<string, number>;
    byVetting: Record<string, number>;
  };
};
```

#### Core Tool Defaults

`src/agents/maturity-trust-defaults.ts` — all 29 core tools tagged:
- All source: `core`
- All vetting: `reviewed` or `verified`
- Maturity range: L2–L4 (no core tool below L2)

#### Functions

| Function | Purpose |
|----------|---------|
| `describeMaturityLevel(level)` | Get descriptor |
| `formatMaturityBadge(level, trust)` | Human-readable badge string |
| `buildMaturityReportArtifact(entries, version)` | Full report |
| `formatMaturityReportMarkdown(report)` | Markdown capability table |

---

## 6. Track D — Policy Decision Traceability

**PR:** #3 (dev.2)  
**Problem:** Users need "why blocked/allowed" answers with reproducible logic.

### Solution

New module: `src/agents/policy-reason-codes.ts`

#### Reason Code Format

`<category>:<specific_reason>`

#### Categories & Codes

| Category | Codes |
|----------|-------|
| `exec` | `security_deny`, `approval_required`, `allowlist_miss`, `shell_wrapper_blocked` |
| `tool_policy` | `profile_deny`, `global_deny`, `global_provider_deny`, `agent_deny`, `agent_provider_deny`, `group_deny`, `sandbox_deny`, `subagent_deny`, `namespace_deny` |
| `hook` | `plugin_blocked` |
| `approval` | `denied_by_user`, `timeout`, `cancelled`, `gateway_unavailable` |
| `auth` | `owner_only`, `sender_unauthorized` |
| `loop` | `critical`, `warning` |

#### PolicyDecisionRecord

```typescript
type PolicyDecisionRecord = {
  code: PolicyReasonCode;
  message: string;
  policySource?: string;    // e.g., "tools.exec.security"
  toolName?: string;
  details?: Record<string, unknown>;
};
```

#### Integration Points

| File | What was wired |
|------|----------------|
| `exec-policy.ts` | 3 deny branches: security_deny, approval_required, allowlist_miss/shell_wrapper |
| `tool-policy-pipeline.ts` | Opt-in `policyDecisions[]` accumulator; maps step labels to reason codes |
| `pi-tools.before-tool-call.ts` | Plugin blocks, approval denials/timeouts, loop detection |
| `tool-policy.ts` | Owner-only guard: `auth:owner_only` |

---

## 7. Track E — Mode Contract Test Matrix

**PR:** #5 (dev.4)  
**Problem:** Mode complexity risks drift without explicit contracts.

### Solution

New module: `src/agents/mode-contracts.ts`

#### Modes Covered

| Mode | Description | Retry | Default Timeout | Errors |
|------|-------------|-------|-----------------|--------|
| `direct` | Gateway host execution | No | 120s | 5 |
| `sandbox` | Isolated container | Yes (1) | 120s | 6 |
| `gateway` | Delegated to gateway | Yes (2) | 300s | 5 |
| `node` | Paired remote device | Yes (2) | 60s | 6 |
| `subagent` | In-gateway sub-agent | No | 0 | 5 |
| `acp:run` | One-shot ACP harness | No | 0 | 6 |
| `acp:session` | Persistent ACP harness | No | 0 | 7 |

#### Error Taxonomy

Each error has:
- `category`: auth | network | policy | runtime | timeout | resource | config
- `code`: unique within mode
- `retryable`: boolean
- `userFacingMessage`: deterministic, user-friendly

#### Failure Envelope

```typescript
type ModeFailureEnvelope = {
  mode: AnyMode;
  state: ModeLifecycleState;
  error: ModeError;
  timestamp: string;
  context?: Record<string, unknown>;
};
```

#### Functions

| Function | Purpose |
|----------|---------|
| `getModeContract(mode)` | Get full contract |
| `findModeError(mode, code)` | Lookup specific error |
| `listModesWithRetry()` | Modes that support retry |
| `createModeFailureEnvelope(...)` | Build failure envelope |
| `formatModeFailureEnvelope(env)` | Human-readable diagnostic |

---

## 8. Track F — Skill Vetting + Runtime Trust Labels

**Merged with Track C** — trust labels are part of the maturity/trust system.

Trust metadata is attached to every tool via `ToolMaturityEntry.trust`:

```typescript
type TrustLabel = {
  source: "core" | "first-party" | "community" | "local";
  vetting: "unreviewed" | "reviewed" | "verified";
};
```

Future: policy can require `reviewed` or `verified` for certain capability classes before enabling a tool.

---

## 9. Track G — Session Event Journal Facade

**PR:** #7 (dev.6)  
**Problem:** Complex runs need a concise event timeline separate from raw transcript.

### Solution

New module: `src/agents/session-event-journal.ts`

#### Event Types

| Type | Description |
|------|-------------|
| `message_in` | Inbound user/system message |
| `message_out` | Outbound assistant message |
| `route_selected` | Tool/route selection |
| `tool_call_start` | Tool execution began |
| `tool_call_end` | Tool execution finished (with duration) |
| `policy_decision` | Policy denied a tool call |
| `compaction_start` | Context compaction initiated |
| `compaction_end` | Context compaction completed |
| `memory_flush` | Session memory flushed |
| `session_start` | Session started |
| `session_end` | Session ended |
| `error` | Error occurred |
| `custom` | Extension point |

#### Event Structure

```typescript
type JournalEvent = {
  id: string;
  type: JournalEventType;
  timestamp: string;
  severity: "debug" | "info" | "warn" | "error";
  summary: string;
  correlationId?: string;
  durationMs?: number;
  payload?: Record<string, unknown>;
};
```

#### Functions

| Function | Purpose |
|----------|---------|
| `createSessionEventJournal(params)` | Create empty journal |
| `journalToolCallStart/End(...)` | Tool lifecycle events |
| `journalPolicyDecision(...)` | Policy deny events |
| `journalCompactionStart/End(...)` | Compaction lifecycle |
| `filterJournalEvents(journal, filter)` | Query by type/severity/correlation |
| `formatJournalTimeline(journal)` | Human-readable timeline |
| `exportJournalAsJson(journal)` | JSON export |

---

## 10. Runtime Wiring — Gateway APIs & Integration

**PRs:** #8 (dev.7), #9 (dev.8)

### Gateway RPC Endpoints

#### `tools.explain`

Explains why a tool is or isn't available for a given context.

**Params:**
```json
{
  "toolName": "exec",
  "agentId": "main",
  "senderIsOwner": true,
  "format": "json"
}
```

**Response (JSON):**
```json
{
  "query": "exec",
  "agentId": "main",
  "profile": "coding",
  "candidate": {
    "toolName": "exec",
    "canonicalId": "core:exec",
    "namespace": "core",
    "available": true,
    "signals": [
      { "kind": "exact_match", "source": "query" },
      { "kind": "policy_allowed", "source": "tool-policy-pipeline" }
    ]
  },
  "trace": {
    "totalBeforePolicy": 35,
    "totalAfterPolicy": 28,
    "policyDecisions": []
  }
}
```

**Implementation:** Runs the real policy pipeline (`createOpenClawTools` → `applyToolPolicyPipeline`) with `policyDecisions[]` accumulator. Not a stub.

#### `tools.maturityReport`

Generates the maturity report artifact for all core tools.

**Params:**
```json
{
  "format": "markdown",
  "version": "3.31"
}
```

**Response:** Full markdown capability table or JSON artifact.

#### `session.journal`

Exports or queries a session's event journal.

**Params:**
```json
{
  "sessionKey": "agent:main:main",
  "format": "timeline",
  "types": ["tool_call_start", "tool_call_end"],
  "severity": ["warn", "error"]
}
```

**Response:** Filtered journal events or formatted timeline text.

### Run Loop Journal Integration

`src/agents/journal-integration.ts` — typed helpers that no-op when journal is `undefined`:

| Helper | Call Site |
|--------|-----------|
| `recordInboundMessage()` | Before run loop starts |
| `recordCompactionStart/End()` | Around timeout-recovery compaction |
| `recordRunError()` | On retry-limit exhaustion |
| `recordOutboundMessage()` | Before returning payloads |
| `recordToolCallStart/End()` | Available for attempt-level wiring |
| `recordPolicyDecision()` | Available for policy pipeline |
| `recordMemoryFlush()` | Available for memory hooks |

### CI Benchmark Gate

`test/route-benchmark.test.ts` — runs all 14 corpus cases with simulated policy rules. Fails CI if any expected tool availability regresses.

---

## 11. File Inventory

### New Files (created by this project)

```
src/agents/
├── tool-identity.ts                 # Track A: canonical IDs
├── tool-identity.test.ts
├── policy-reason-codes.ts           # Track D: reason codes
├── policy-reason-codes.test.ts
├── route-explainability.ts          # Track B: explain engine
├── route-explainability.test.ts
├── mode-contracts.ts                # Track E: mode contracts
├── mode-contracts.test.ts
├── maturity-trust.ts                # Track C/F: maturity + trust
├── maturity-trust.test.ts
├── maturity-trust-defaults.ts       # Core tool maturity entries
├── session-event-journal.ts         # Track G: event journal
├── session-event-journal.test.ts
├── journal-integration.ts           # Run loop helpers
└── journal-integration.test.ts

src/gateway/server-methods/
└── tools-diagnostics.ts             # Gateway: explain, maturity, journal

test/
└── route-benchmark.test.ts          # CI benchmark gate

test-fixtures/
└── route-benchmark-corpus.ts        # Benchmark cases

docs/diagnostics/
├── ADR-canonical-tool-identity.md
├── ADR-policy-reason-codes.md
├── ADR-route-explainability.md
├── ADR-mode-contract-matrix.md
├── ADR-maturity-trust-labels.md
├── ADR-session-event-journal.md
├── ADR-runtime-wiring.md
└── ADR-deep-runtime-wiring.md
```

### Modified Files

```
src/agents/pi-tools.ts                    # Identity diagnostics + __testing exports
src/agents/tool-policy.ts                 # Owner-only reason codes
src/agents/tool-policy-pipeline.ts        # policyDecisions accumulator + reason mapping
src/agents/pi-tools.before-tool-call.ts   # Hook/approval/loop reason codes
src/node-host/exec-policy.ts              # Exec deny reason codes
src/plugins/tools.ts                      # Plugin identity hints
src/gateway/server-methods.ts             # Register diagnostic handlers
src/agents/pi-embedded-runner/run.ts      # Journal lifecycle events
src/agents/pi-embedded-runner/run/params.ts # Optional journal param
```

---

## 12. Test Commands

```bash
cd /home/wang/projects/claud-code-src/claw-code/openclaw

# Track A — Canonical identity
corepack pnpm exec vitest run src/agents/tool-identity.test.ts

# Track D — Policy reason codes
corepack pnpm exec vitest run src/agents/policy-reason-codes.test.ts

# Track B — Route explainability
corepack pnpm exec vitest run src/agents/route-explainability.test.ts

# Track E — Mode contracts
corepack pnpm exec vitest run src/agents/mode-contracts.test.ts

# Track C/F — Maturity/trust
corepack pnpm exec vitest run src/agents/maturity-trust.test.ts

# Track G — Session journal
corepack pnpm exec vitest run src/agents/session-event-journal.test.ts

# Journal integration helpers
corepack pnpm exec vitest run src/agents/journal-integration.test.ts

# CI benchmark gate
corepack pnpm exec vitest run test/route-benchmark.test.ts

# All project tests at once
corepack pnpm exec vitest run \
  src/agents/tool-identity.test.ts \
  src/agents/policy-reason-codes.test.ts \
  src/agents/route-explainability.test.ts \
  src/agents/mode-contracts.test.ts \
  src/agents/maturity-trust.test.ts \
  src/agents/session-event-journal.test.ts \
  src/agents/journal-integration.test.ts \
  test/route-benchmark.test.ts
```

---

## 13. API Reference

### Gateway RPC Methods

| Method | Params | Returns |
|--------|--------|---------|
| `tools.explain` | `toolName` (required), `agentId?`, `senderIsOwner?`, `format?` | Resolution trace with signals and policy decisions |
| `tools.maturityReport` | `format?` (json\|markdown), `version?` | Maturity report artifact or markdown |
| `session.journal` | `sessionKey` (required), `format?` (json\|timeline), `types?`, `severity?`, `correlationId?` | Filtered journal events |

### Exported Module APIs

| Module | Key Exports |
|--------|------------|
| `tool-identity` | `normalizeCanonicalToolId`, `deriveFallbackCanonicalToolId`, `findDuplicateCanonicalIds`, `findAmbiguousDisplayNames` |
| `policy-reason-codes` | `createPolicyDecision`, `formatPolicyDecision`, `reasonCategory`, `PolicyReasonCode`, `PolicyDecisionRecord` |
| `route-explainability` | `buildToolResolutionTrace`, `explainToolResolution`, `formatToolResolutionTrace`, `evaluateBenchmarkCase` |
| `mode-contracts` | `getModeContract`, `findModeError`, `createModeFailureEnvelope`, `formatModeFailureEnvelope`, `MODE_CONTRACTS` |
| `maturity-trust` | `describeMaturityLevel`, `formatMaturityBadge`, `buildMaturityReportArtifact`, `formatMaturityReportMarkdown` |
| `session-event-journal` | `createSessionEventJournal`, `appendJournalEvent`, `journalToolCall*`, `filterJournalEvents`, `formatJournalTimeline` |
| `journal-integration` | `createRunJournal`, `recordInboundMessage`, `recordToolCallStart/End`, `recordCompactionStart/End`, `recordRunError` |
| `tools-diagnostics` (gateway) | `registerSessionJournal`, `getSessionJournal`, `removeSessionJournal` |

---

## 14. ADR Index

| ADR | Track | Key Decision |
|-----|-------|-------------|
| [Canonical Tool Identity](docs/diagnostics/ADR-canonical-tool-identity.md) | A | Stable machine-readable IDs with fallback derivation |
| [Policy Reason Codes](docs/diagnostics/ADR-policy-reason-codes.md) | D | Structured deny reasons on all enforcement paths |
| [Route Explainability](docs/diagnostics/ADR-route-explainability.md) | B | Resolution traces with typed signals + benchmark harness |
| [Mode Contract Matrix](docs/diagnostics/ADR-mode-contract-matrix.md) | E | Per-mode lifecycle, error taxonomy, failure envelopes |
| [Maturity & Trust Labels](docs/diagnostics/ADR-maturity-trust-labels.md) | C/F | L0–L4 levels + source/vetting trust labels |
| [Session Event Journal](docs/diagnostics/ADR-session-event-journal.md) | G | Normalized event timeline with correlation IDs |
| [Runtime Wiring](docs/diagnostics/ADR-runtime-wiring.md) | — | Gateway APIs, journal helpers, CI benchmark |
| [Deep Runtime Wiring](docs/diagnostics/ADR-deep-runtime-wiring.md) | — | Run loop journal, full pipeline explain, journal export |

---

## 15. Follow-Up Items

These are incremental improvements identified during implementation, roughly ordered by value:

| Item | Effort | Value | Description |
|------|--------|-------|-------------|
| Wire journal into `runEmbeddedAttempt` | Medium | High | Per-tool-call start/end timing inside attempts |
| Persist journals to session store | Medium | High | Durable post-mortem debugging |
| CI pipeline config | Low | High | Add route benchmark to `.github/workflows` |
| Expand benchmark corpus | Low | Medium | Add cases as new policy paths are created |
| `tools.catalog` maturity enrichment | Low | Medium | Include maturity/trust in catalog response |
| Journal WebSocket streaming | Medium | Medium | Live dashboard events |
| Plugin SDK maturity fields | Low | Medium | Optional `maturity`/`trust` in plugin manifest |
| Full test suite regression run | Low | High | Verify no regressions across all existing tests |
| Fix pre-existing xai/web_search test | Low | Low | Unrelated to this project but good cleanup |

---

*Generated as part of the claude-openclaw project. All code is additive and non-breaking.*
