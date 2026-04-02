# ADR: Maturity Levels & Trust Labels (P3)

- **Status:** Accepted
- **Date:** 2026-04-01
- **Scope:** Tool/skill maturity rubric (L0–L4), trust source/vetting labels, report artifact

## Context

Binary "exists vs works" hides real maturity. When tools range from "metadata stub" to "battle-tested in production," a flat catalog provides no visibility into what's actually reliable.

Similarly, as OpenClaw's plugin/skill ecosystem grows, users need transparency about where a tool came from and how thoroughly it's been reviewed.

## Decision

### Maturity Levels (L0–L4)

| Level | Label | Criteria |
|-------|-------|----------|
| L0 | Discoverable | Has name + description; listed in catalog |
| L1 | Schema-validated | JSON Schema defined; appears in inventory |
| L2 | Dry-run capable | Policy checks pass; error taxonomy defined |
| L3 | Production-active | Real execution; error handling; timeout/retry; used in production |
| L4 | Production-hardened | Telemetry; benchmark/replay tests; stable across releases |

### Trust Labels

**Source:** `core` | `first-party` | `community` | `local`
**Vetting:** `unreviewed` | `reviewed` | `verified`

### Report Artifact

`MaturityReportArtifact` is a machine-readable JSON structure:
- Per-tool entries with maturity level, trust, and capabilities
- Summary with counts by level, source, and vetting
- Markdown renderer for docs-ready capability tables

### Core Tool Defaults

All 29 core tools have default maturity entries:
- Source: `core` for all
- Vetting: `reviewed` or `verified`
- Maturity: L2–L4 (no core tool is below L2)

### Key design choices

1. **Maturity is descriptive, not prescriptive** — levels inform, they don't gate. Policy enforcement uses the existing tool-policy pipeline.
2. **Report generation from code** — the artifact is built from `CORE_TOOL_MATURITY_ENTRIES`, not hand-edited docs. This prevents staleness.
3. **Plugin entries are additive** — plugins can supply their own maturity metadata; the report merges core + plugin entries.

## Non-goals (this PR)

- No CI gating on maturity levels
- No install-time trust enforcement (future: policy can require `reviewed` for certain capability classes)
- No automatic maturity promotion from test coverage metrics

## Follow-up

- Wire maturity labels into `tools.catalog` gateway response
- Add CLI command for report generation: `openclaw tools maturity-report`
- CI check: new tools must have maturity entry
- Plugin SDK: optional `maturity` and `trust` fields in plugin manifest
