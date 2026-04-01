# claude-openclaw — Execution Plans

Generated: 2026-04-01 (America/New_York)

This document combines the three planning artifacts discussed:
1. Project execution plan (phases, priorities, risks)
2. First PR slice checklist
3. Literal patch plan (file-by-file)

---

## Plan 1 — Project Execution Plan

## Priorities (in order)
1. **P0: Canonical tool identity + ambiguity warnings**
2. **P1: Policy decision reason-code traceability**
3. **P2: Route explainability diagnostics + benchmark harness**
4. **P3: Maturity (L0–L4) artifacts + trust labels**
5. **P4: Mode contract matrix + standardized failure envelopes**
6. **P5: Optional session event journal facade**

## Phase 1 — Observability Foundations (P0/P1)
**Goal:** Add clarity without changing core runtime behavior.

- Canonical identity metadata for tools/commands:
  - stable `id`, `displayName`, `namespace`, `capabilityClass`, `version/sourceDigest`
- Collision detection + ambiguity warnings
- Structured policy reason codes on deny/block paths

### Likely code touchpoints
- `src/agents/pi-tools.ts`
- `src/agents/openclaw-tools.ts`
- `src/plugins/tools.ts`
- `src/agents/tool-policy-pipeline.ts`
- `src/agents/pi-tool-definition-adapter.ts`

### Exit criteria
- No breaking changes to existing tool names/calls
- Warnings for ambiguity are deterministic
- Denials include machine-readable reason code + source pointer

## Phase 2 — Quality Controls (P2/P4)
**Goal:** Make routing and mode behavior testable and explainable.

- Add internal route explain output (`candidate`, `score`, `signals`, `winner`)
- Build benchmark corpus for route-quality regression
- Define + test mode contract matrix (auth/connect/timeout/retry/error taxonomy)

### Exit criteria
- CI gate on benchmark regressions for critical intents
- Contract test suite exists for each mode path

## Phase 3 — Governance & Ecosystem Safety (P3)
**Goal:** Make capability maturity and trust posture visible.

- Maturity rubric artifact (L0–L4) + docs generation
- Skill/tool trust labels (`core/first-party/community/local`, `unreviewed/reviewed/verified`)
- Contributor template updates for new tools/skills

### Exit criteria
- Every non-experimental tool has maturity + trust metadata
- Docs pages are generated from machine-readable artifacts

## Risk areas and mitigations
1. **Metadata sprawl / maintenance burden**  
   Mitigation: auto-derive where possible; make only `id` + `namespace` mandatory initially.
2. **Debug data leakage in explain traces**  
   Mitigation: verbose/debug gating + redaction by default.
3. **Policy-code drift (reason != actual enforcement)**  
   Mitigation: emit reason codes only at enforcement points.
4. **Label staleness (maturity/trust)**  
   Mitigation: CI checks + report generation from tests/config.
5. **Back-compat regressions**  
   Mitigation: keep name-based routing supported; warn only on ambiguity.

---

## Plan 2 — First PR Slice Checklist

## PR-1
**Title:** `feat(tools): add canonical tool identity scaffold + ambiguity diagnostics (no behavior change)`

**Goal:** Introduce canonical IDs and ambiguity detection without changing dispatch/routing behavior.

### In scope
- Canonical identity model for tools
- Deterministic ID derivation fallback for existing tools
- Ambiguity/collision diagnostics
- Unit tests
- ADR draft

### Out of scope
- Enforcing canonical IDs for dispatch
- Route scoring/explainability
- Policy reason code taxonomy rollout

### Compatibility constraints
- Existing tool names and behavior unchanged
- No breaking changes in tool invocation paths
- Diagnostics only (warn/debug), not hard-fail in PR-1

## File-by-file checklist
- [ ] Add new module: `src/agents/tool-identity.ts`
- [ ] Extend plugin metadata plumbing in `src/plugins/tools.ts`
- [ ] Integrate identity diagnostics in `src/agents/pi-tools.ts`
- [ ] (Optional) Add canonical-id context to `src/agents/pi-tool-definition-adapter.ts` logs
- [ ] Add tests for identity derivation, duplicate IDs, ambiguous names
- [ ] Add ADR: `docs/adr/ADR-canonical-tool-identity.md`

## Test checklist
- [ ] `tool-identity` unit tests
- [ ] plugin metadata tests include identity hints
- [ ] `pi-tools` diagnostics warnings tests
- [ ] no behavior change assertions for tool invocation

## Suggested commit breakdown
1. `feat(agents): add canonical tool identity primitives`
2. `feat(plugins): attach plugin identity hints for tools`
3. `feat(agents): emit ambiguity and duplicate-id diagnostics`
4. `test(agents): cover canonical identity and ambiguity warnings`
5. `docs(adr): define canonical tool identity schema`

## Acceptance checklist
- [ ] No changes to invocation behavior
- [ ] Existing tests pass
- [ ] New identity tests pass
- [ ] Warning messages deterministic/readable
- [ ] ADR merged with migration notes

---

## Plan 3 — Literal Patch Plan (PR-1)

## 1) New file: `src/agents/tool-identity.ts`

### Types
- `ToolNamespace = "core" | "plugin" | "skill" | "provider" | "local"`
- `ToolCapabilityClass = "read" | "write" | "execute" | "network" | "messaging" | "scheduling" | "other"`
- `CanonicalToolIdentity`
- `ToolIdentityIssue`, `ToolIdentityIssueCode`
- `DuplicateCanonicalId`, `AmbiguousDisplayName`

### Functions
- `normalizeCanonicalToolId(id: string): string`
- `deriveFallbackCanonicalToolId({ namespace, toolName, pluginId?, providerId? }): string`
- `inferCapabilityClassFromToolName(name: string): ToolCapabilityClass`
- `validateCanonicalToolIdentity(identity): ToolIdentityIssue[]`
- `findDuplicateCanonicalIds(identities): DuplicateCanonicalId[]`
- `findAmbiguousDisplayNames(identities): AmbiguousDisplayName[]`

### Behavior notes
- ID normalization: trim + lowercase + separator-safe formatting
- Plugin fallback IDs: `plugin:<pluginId>:<toolName>`
- Core fallback IDs: `core:<toolName>`
- Duplicate and ambiguity checks are deterministic

## 2) Edit: `src/plugins/tools.ts`

### Extend `PluginToolMeta` (non-breaking)
Current fields:
- `pluginId`
- `optional`

Add optional fields:
- `canonicalIdHint?: string`
- `namespace?: "plugin"`

### Registration update
When storing metadata for each plugin tool, also set:
- `namespace: "plugin"`
- `canonicalIdHint` derived via `deriveFallbackCanonicalToolId(...)`

## 3) Edit: `src/agents/pi-tools.ts`

### Add imports
- From `./tool-identity.js`:
  - fallback derivation
  - normalization
  - duplicate/ambiguity detection
  - capability inference
  - `CanonicalToolIdentity` type

### Add helper(s)
- `buildCanonicalIdentities(tools: AnyAgentTool[]): CanonicalToolIdentity[]`
- `emitToolIdentityDiagnostics(identities: CanonicalToolIdentity[]): void`

### Invocation point
Inside `createOpenClawCodingTools(...)`, after final tool list assembly and before return:
- build identity list
- emit warnings for duplicate canonical IDs
- emit warnings for ambiguous display names

No dispatch behavior changes.

## 4) Optional edit: `src/agents/pi-tool-definition-adapter.ts`

Enhance debug/error logs to include canonical fallback ID context where practical.

## 5) Tests

### New: `src/agents/tool-identity.test.ts`
- normalization behavior
- core fallback ID
- plugin fallback ID
- duplicate-id detection
- ambiguous-display detection
- capability class inference

### Update plugin tests
- assert plugin tool metadata includes canonical identity hint when available

### Update pi-tools tests
- warnings emitted for duplicate canonical IDs
- warnings emitted for ambiguous display names
- no warning for unique identity surfaces
- no behavior changes in tool invocation path

## 6) ADR

Add: `docs/adr/ADR-canonical-tool-identity.md`
- Context/problem
- Decision/schema
- Fallback derivation rules
- PR-1 non-goals
- Migration path to stricter enforcement

## 7) Implementation order
1. `tool-identity.ts` + unit tests
2. `plugins/tools.ts` identity hints
3. `pi-tools.ts` diagnostics integration
4. tests for diagnostics
5. ADR
6. targeted tests then broader suite

---

## Notes
- This document is planning-only and does not change runtime behavior by itself.
- PR-1 is intentionally low-risk and additive to prepare for later routing/policy/maturity work.
