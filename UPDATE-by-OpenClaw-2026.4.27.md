# UPDATE by OpenClaw — 2026-04-30 (EDT)

> Requested output path kept as: `UPDATE-by-OpenClaw-2026.4.27.md`

## Executive summary (short)
- Completed **PR-1**: restored canonical tool identity diagnostics and fixed session-journal creation/registration wiring.
- Completed **PR-2**: added typed top-level config surface for Tracks **A–G**.
- Completed controlled **Slice 1** for Tracks E/G: schema + labels/help + tests + regenerated base schema.
- Completed controlled **Slice 2** (default-off runtime gating): Track E process-monitor + Home Assistant tools.
- Completed requested “next 1 and 2”:
  - Track E: added runtime-gated `mixture_of_agents` tool.
  - Track G: added runtime-gated `training_pipeline` tool.
- Maintained rollout policy: **default-off flags, no behavior change unless explicitly enabled**.
- Added/updated targeted tests for new gates/tools and config wiring.
- Re-ran key regressions (`attempt-execution.cli`, `session-event-journal`, `openclaw-tools.tts-config`) and all runs passed.

## What I completed today

## 1) PR-1 completed first (as requested)
**Goal:** restore canonical tool-identity diagnostics and make session journals actually populate/register.

### Delivered
- Reconnected canonical identity diagnostics and added warning dedupe support:
  - `openclaw/src/agents/pi-tools.ts`
- Rewired execution flow to create + register journals and pass journal through embedded path:
  - `openclaw/src/agents/command/attempt-execution.ts`
- Added shared journal registry module:
  - `openclaw/src/agents/session-journal-registry.ts` (new)
- Switched diagnostics endpoint to shared registry:
  - `openclaw/src/gateway/server-methods/tools-diagnostics.ts`
- Added tests for identity diagnostics:
  - `openclaw/src/agents/pi-tools.identity-diagnostics.test.ts` (new)

---

## 2) PR-2 completed next (as requested)
**Goal:** add typed top-level config surface for Tracks A–G.

### Delivered
- Added typed top-level config entries in:
  - `openclaw/src/config/types.openclaw.ts`
- Added exports/wiring in:
  - `openclaw/src/config/types.ts`
- Added support for:
  - `sessionIntelligence`
  - `supplyChainSecurity`
  - `developerExperience`
  - `pluginEnhancements`
  - `advancedTools`
  - `gatewayExpansion`
  - `trainingPipeline`

---

## 3) Controlled slices after PR-1/PR-2

## Slice 1 (schema/type-only for E + G)
- Added schema objects and integrated into `OpenClawSchema`:
  - `openclaw/src/config/zod-schema.ts`
- Added help + labels:
  - `openclaw/src/config/schema.help.ts`
  - `openclaw/src/config/schema.labels.ts`
- Added schema acceptance/rejection tests:
  - `openclaw/src/config/schema.test.ts`
- Regenerated base schema:
  - `openclaw/src/config/schema.base.generated.ts`

## Slice 2 (runtime gates, default-off)
- Added Track E process-monitor toolset (gated):
  - `openclaw/src/agents/tools/process-monitor-tool.ts` (new)
- Added Track E Home Assistant tools (gated):
  - `openclaw/src/agents/tools/homeassistant-tool.ts` (new)
- Registered tools only when explicitly enabled via config; no default behavior change:
  - `openclaw/src/agents/openclaw-tools.ts`
  - `openclaw/src/agents/openclaw-tools.registration.ts`

---

## 4) “next 1 and 2” completed
(Your follow-up: “yes please on the next 1 and 2.”)

### 4.1 Track E — Mixture of Agents tool (runtime-gated)
- Implemented new tool:
  - `openclaw/src/agents/tools/mixture-of-agents-tool.ts` (new)
- Added gating helper and registration wiring:
  - `openclaw/src/agents/openclaw-tools.registration.ts`
  - `openclaw/src/agents/openclaw-tools.ts`
- Gate condition:
  - `advancedTools.mixtureOfAgents.enabled === true`
  - non-embedded mode

### 4.2 Track G — Training Pipeline tool (runtime-gated)
- Implemented new tool:
  - `openclaw/src/agents/tools/training-pipeline-tool.ts` (new)
- Added registration wiring:
  - `openclaw/src/agents/openclaw-tools.ts`
- Gate condition:
  - `trainingPipeline.enabled === true`
  - non-embedded mode
- Tool actions:
  - `status`
  - `list_distributions`
  - `list_parsers`

---

## Test coverage added/updated today

### New tests
- `openclaw/src/agents/tools/mixture-of-agents-tool.test.ts`
- `openclaw/src/agents/tools/training-pipeline-tool.test.ts`
- `openclaw/src/agents/pi-tools.identity-diagnostics.test.ts`

### Updated tests
- `openclaw/src/agents/openclaw-tools.tts-config.test.ts`
- `openclaw/src/agents/openclaw-tools.update-plan.test.ts`

### Regression checks explicitly re-run
- `openclaw/src/agents/command/attempt-execution.cli.test.ts`
- `openclaw/src/agents/session-event-journal.test.ts`
- `openclaw/src/agents/openclaw-tools.tts-config.test.ts`

### Commands used (all green)
- `corepack pnpm exec vitest run src/agents/tools/mixture-of-agents-tool.test.ts src/agents/tools/training-pipeline-tool.test.ts src/agents/openclaw-tools.update-plan.test.ts src/agents/openclaw-tools.tts-config.test.ts`
- `corepack pnpm exec vitest run src/agents/command/attempt-execution.cli.test.ts src/agents/session-event-journal.test.ts src/agents/openclaw-tools.tts-config.test.ts`

---

## Current working-tree snapshot (high-level)
- Core edited files include:
  - `openclaw/src/agents/command/attempt-execution.ts`
  - `openclaw/src/agents/openclaw-tools.registration.ts`
  - `openclaw/src/agents/openclaw-tools.ts`
  - `openclaw/src/agents/pi-tools.ts`
  - `openclaw/src/config/types.openclaw.ts`
  - `openclaw/src/config/types.ts`
  - `openclaw/src/config/zod-schema.ts`
  - `openclaw/src/config/schema.help.ts`
  - `openclaw/src/config/schema.labels.ts`
  - `openclaw/src/config/schema.test.ts`
  - `openclaw/src/config/schema.base.generated.ts`
  - `openclaw/src/gateway/server-methods/tools-diagnostics.ts`
- New files include:
  - `openclaw/src/agents/session-journal-registry.ts`
  - `openclaw/src/agents/tools/homeassistant-tool.ts`
  - `openclaw/src/agents/tools/process-monitor-tool.ts`
  - `openclaw/src/agents/tools/mixture-of-agents-tool.ts`
  - `openclaw/src/agents/tools/mixture-of-agents-tool.test.ts`
  - `openclaw/src/agents/tools/training-pipeline-tool.ts`
  - `openclaw/src/agents/tools/training-pipeline-tool.test.ts`
  - `openclaw/src/agents/pi-tools.identity-diagnostics.test.ts`

---

## Outcome summary
- ✅ PR-1 done
- ✅ PR-2 done
- ✅ Track E runtime-gated slices advanced (process-monitor, Home Assistant, MoA)
- ✅ Track G runtime-gated slice advanced (training_pipeline tool)
- ✅ Default-off policy maintained across new runtime slices
- ✅ Targeted + regression tests passed
