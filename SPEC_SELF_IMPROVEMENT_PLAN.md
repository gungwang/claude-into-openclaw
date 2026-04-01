# claw-code Self-Improvement Specification (Plan Only)

## 1) Purpose

This document defines a **plan-only** specification for improving the current `claw-code` Python rewrite.  
No implementation is included here.

Primary goal: evolve the project from a **snapshot-mirroring scaffold** into a **runtime-capable harness toolkit** with clear parity tracking, safer execution boundaries, and real command/tool behavior.

---

## 2) Current State (Observed)

Based on repository analysis (`src/`, `tests/`, CLI behavior):

- The project currently exposes a rich CLI surface (`summary`, `manifest`, `route`, `bootstrap`, `turn-loop`, etc.).
- Commands/tools are loaded from JSON snapshots (`commands_snapshot.json`, `tools_snapshot.json`) and treated as mirrored metadata.
- Execution paths (`execute_command`, `execute_tool`, runtime mode handlers) are mostly **simulated** and return explanatory strings.
- Many subsystem packages are placeholders with archive metadata only.
- Parity audit currently degrades to “archive unavailable” when local archive is absent.
- Test suite validates scaffold behavior and inventory counts; little behavioral/runtime correctness beyond simulation.

In short: good structural scaffolding and inventory coverage, limited functional runtime semantics.

---

## 3) Product Direction

### Vision
Deliver a usable Python harness runtime with:

1. **Executable command/tool adapters** (not only mirrored descriptions)
2. **Deterministic routing + policy enforcement**
3. **Session/transcript lifecycle suitable for long-running agent usage**
4. **Reliable parity and migration tracking from archived surfaces**

### Non-Goals (for this plan cycle)

- 1:1 full clone of original proprietary behavior.
- Immediate implementation of all 200+ commands and 180+ tools.
- Premature optimization or distributed runtime complexity.

---

## 4) Key Gaps and Improvement Opportunities

## A. Command/Tool Identity & Snapshot Quality

### Problem
- Snapshot entries include many duplicate names (e.g., command names duplicated by file-level indexing; tool names like `UI`, `prompt`, `constants` repeated heavily).
- Name-only lookups can be ambiguous and non-deterministic for execution.

### Specification
- Introduce canonical identity model:
  - `id` (stable unique key)
  - `display_name`
  - `source_hint`
  - `category` (builtin/plugin/skill/mcp/etc.)
  - `entry_type` (command/tool/component/helper)
- Enforce uniqueness constraints by `id`.
- Preserve duplicate display names but disambiguate via namespace-qualified IDs.

### Acceptance Criteria
- No ambiguous lookup in `get_command/get_tool` paths.
- CLI supports `show-command <id>` and `show-tool <id>` deterministically.
- Snapshot validation reports duplicate display names explicitly.

---

## B. Routing Quality (From Substring Match to Structured Ranking)

### Problem
- Current routing score is simple token substring matching across name/source/responsibility.
- Low semantic precision; easy false positives.

### Specification
- Replace/extend scoring with weighted signals:
  - exact-name match > alias match > keyword match > source_hint match
  - category priors (e.g., routing tool-intent prompts to tools first)
  - optional intent classifier for command-vs-tool vs mixed workflows
- Add top-k rationale output for explainability.

### Acceptance Criteria
- Route quality benchmark set with curated prompts.
- ≥30% improvement in top-1 route accuracy over baseline substring matcher (internal benchmark).
- `route --explain` returns score components.

---

## C. Execution Semantics (Shim → Real Adapter Runtime)

### Problem
- `execute_command` / `execute_tool` currently return “would handle …” messages.

### Specification
- Introduce adapter contract:
  - `prepare(context, input)`
  - `validate(policy)`
  - `execute()`
  - `finalize()`
- Support three execution modes:
  1. `simulated` (current behavior)
  2. `dry-run` (validation + plan only)
  3. `active` (actual side effects)
- Add per-entry capability declarations (file/network/process/mcp).

### Acceptance Criteria
- At least one vertical slice implemented per class (command/tool/mode).
- Active execution blocked when policy/capability mismatch.
- Structured execution result schema (status, output, events, usage, policy decisions).

---

## D. Policy & Permission Model Hardening

### Problem
- Permission model currently supports deny names/prefixes only.
- No action-level policy, no audit-grade decision logs.

### Specification
- Define policy DSL/config model:
  - allow/deny by capability + namespace + risk level
  - environment-based defaults (trusted/untrusted)
  - per-session policy overrides
- Log policy decisions with reason codes.

### Acceptance Criteria
- Policy checks run before execution in all active modes.
- Denials are reproducible with machine-readable reason codes.
- Audit log can reconstruct “why a command/tool was denied.”

---

## E. Session & Transcript Durability

### Problem
- Session persistence is minimal JSON with basic token counters.
- Transcript flush is in-memory flag only; no event timeline abstraction.

### Specification
- Move to append-only event journal model:
  - message_received, route_selected, policy_checked, execution_started, execution_finished, session_compacted
- Versioned session schema with migration support.
- Add retention strategy + compaction checkpoints.

### Acceptance Criteria
- Crash-safe restoration from journal.
- Backward-compatible load for older session JSONs via migrations.
- Deterministic replay reproduces routing and policy decisions (given same config).

---

## F. Parity Audit Reliability & Governance

### Problem
- Audit depends on local archive presence; fallback is minimal.
- No progress accounting by executable parity levels.

### Specification
- Define parity levels per entry:
  - L0 Metadata mirrored
  - L1 Discoverable/Queryable
  - L2 Validated dry-run
  - L3 Active runtime support
- Add machine-readable parity dashboard artifact (`parity_report.json`).
- Distinguish “archive missing” vs “not yet ported” vs “intentionally omitted.”

### Acceptance Criteria
- CI publishes parity report artifact each run.
- README parity section generated from report, not manual prose.
- Every tracked command/tool mapped to a parity level.

---

## G. Runtime Modes: Real Connectivity Contracts

### Problem
- `remote/ssh/teleport/direct/deep-link` paths currently return placeholders.

### Specification
- Define mode contracts:
  - connection lifecycle (init/auth/connect/health/teardown)
  - timeout/retry policy
  - structured errors
- Create pluggable transport interface + mock transport for tests.

### Acceptance Criteria
- Each mode has contract tests with mocked transport.
- CLI returns actionable diagnostics on failures (auth timeout, host unreachable, permission denied).

---

## H. Testing Strategy Upgrade

### Problem
- Existing tests verify scaffold presence and command invocation success paths; limited semantic correctness.

### Specification
- Add test layers:
  1. Unit tests for routing/policy/scoring
  2. Contract tests for adapter lifecycle
  3. Snapshot validation tests (ID uniqueness, schema integrity)
  4. Golden tests for session replay determinism
  5. Integration tests for mode transports with mocks

### Acceptance Criteria
- Coverage targets by subsystem (routing/policy/session/execution).
- CI gates on schema validation + deterministic replay tests.

---

## I. Developer Experience and Documentation

### Problem
- Current docs explain scaffold status but not migration architecture for contributors.

### Specification
- Add architecture docs:
  - runtime data flow
  - adapter authoring guide
  - parity-level rubric
  - policy model guide
- Add contributor templates for porting a command/tool vertical slice.

### Acceptance Criteria
- New contributor can port one command/tool using documented template in <1 day.
- Architectural diagrams synced with code-generated artifacts where possible.

---

## 5) Prioritized Roadmap

## Phase 0 (Foundation)

- Freeze schemas for command/tool identity and session events.
- Add snapshot validator and duplicate-name report.
- Add parity-level taxonomy and report generator.

**Outcome:** trustworthy inventory and migration observability.

## Phase 1 (Runtime Core)

- Implement adapter lifecycle contract.
- Implement policy engine v1 (capability + namespace rules).
- Implement execution result schema and event journaling.

**Outcome:** safe, testable execution framework.

## Phase 2 (Quality & Behavior)

- Upgrade routing/scoring and add route explainability.
- Add deterministic replay and compaction strategies.
- Add transport contracts for remote/ssh/teleport/direct/deep-link.

**Outcome:** behavior quality + operability.

## Phase 3 (Porting Throughput)

- Port selected high-impact commands/tools to L2/L3 parity.
- Add contributor workflow and templates.
- Expand CI + parity dashboard publication.

**Outcome:** scalable migration pipeline and measurable runtime parity progress.

---

## 6) Initial High-Impact Vertical Slices (Recommended)

1. **Command slice:** `review` or similarly central workflow command.
2. **Tool slice:** `MCPTool` (or equivalent high-leverage external tool adapter).
3. **Mode slice:** `ssh-mode` with mocked + real transport abstraction.
4. **Policy slice:** destructive execution gating with reasoned denials.

Reason: these provide immediate user-visible value while exercising the full stack (routing → policy → execution → session logging).

---

## 7) Risks & Mitigations

- **Risk:** scope explosion from trying to fully port everything at once.  
  **Mitigation:** parity levels + vertical-slice strategy.

- **Risk:** ambiguous snapshot identities causing brittle runtime behavior.  
  **Mitigation:** canonical IDs + schema validation in CI.

- **Risk:** unsafe side effects when moving from simulated to active execution.  
  **Mitigation:** default dry-run, explicit active mode, strict policy checks.

- **Risk:** non-deterministic sessions/replays.  
  **Mitigation:** event journal, deterministic config capture, golden replay tests.

---

## 8) Success Metrics

- % commands/tools mapped to canonical IDs.
- % entries with parity level ≥ L2 and ≥ L3.
- Route benchmark accuracy (top-1/top-3).
- Policy decision coverage (% executions with explicit allow/deny reason code).
- Deterministic replay pass rate.
- CI stability and contributor time-to-first-port.

---

## 9) Deliverables (Spec Cycle)

This planning cycle should produce:

1. Architecture Decision Records (ADRs) for:
   - identity schema
   - adapter lifecycle
   - policy model
   - session event journal
2. Parity rubric and reporting format.
3. Routing benchmark dataset and scoring harness spec.
4. Contributor playbook for command/tool vertical slices.

---

## 10) Explicit Constraint

This document is a **specification only** and intentionally avoids implementation changes.
