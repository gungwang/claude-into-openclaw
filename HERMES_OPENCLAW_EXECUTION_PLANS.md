# Hermes → OpenClaw Execution Plans (Retrospective)

> Post-implementation record of what was built, in what order, and how it was verified.
> All phases are **complete** and committed on branch `dev.9`.

---

## Phase 0 (P0) — Tracks A + B · Commit `1b07f30`

**Goal:** Session intelligence and supply-chain security foundations.

### Files Created (14)

| # | File | Track | Purpose |
|---|------|-------|---------|
| 1 | `src/config/types.session-intelligence.ts` | A | Config types for error classification, credential pool, rate limits, persistence, compression, routing |
| 2 | `src/agents/error-classifier.ts` | A | HTTP-status + message-pattern error classifier with failover recommendations |
| 3 | `src/agents/credential-pool.ts` | A | Multi-credential rotation with 4 selection strategies |
| 4 | `src/agents/rate-limit-tracker.ts` | A | Provider-specific rate-limit header parser |
| 5 | `src/agents/session-persistence.ts` | A | SQLite session/message store with FTS5 search |
| 6 | `src/agents/trajectory-compressor.ts` | A | Conversation summarisation with protected-turn windows |
| 7 | `src/agents/smart-model-routing.ts` | A | Task-complexity → model-tier routing engine |
| 8 | `src/config/types.supply-chain-security.ts` | B | Config types for skill scanning, sync, URL safety, path security |
| 9 | `src/agents/skills-guard.ts` | B | Regex-based skill content scanner with OWASP threat taxonomy |
| 10 | `src/agents/skills-sync.ts` | B | Manifest-driven bundled skill synchronisation |
| 11 | `src/agents/url-safety.ts` | B | SSRF-safe URL validation (private IP, localhost, dangerous schemes) |
| 12 | `src/agents/path-security.ts` | B | Path traversal detection + sensitive file finder |
| 13 | `src/agents/journal-integration.ts` | A–G | Structured journal recorders for all tracks |
| 14 | (config wiring) | — | OpenClawConfig field additions |

### Verification Criteria
- Zero `tsc` errors across all 14 files.
- All exports use `type`-only imports for type re-exports.
- All external dependencies injected (no hard `import` of `better-sqlite3`, `node:crypto`, etc.).
- String-literal unions instead of enums.

---

## Phase 1 (P1) — Tracks C + D · Commit `f6c55ae`

**Goal:** Developer experience and plugin extensibility.

### Files Created (12)

| # | File | Track | Purpose |
|---|------|-------|---------|
| 1 | `src/config/types.developer-experience.ts` | C | Config types for worktree, caching, references, budget, checkpoints |
| 2 | `src/agents/git-worktree.ts` | C | Worktree lifecycle for concurrent agent sessions |
| 3 | `src/agents/prompt-caching.ts` | C | Anthropic/OpenAI cache_control injection |
| 4 | `src/agents/context-references.ts` | C | @file/@folder/@git/@url/@diff/@staged expansion |
| 5 | `src/agents/budget-tracker.ts` | C | Per-session and per-turn cost enforcement |
| 6 | `src/tools/checkpoint-manager.ts` | C | Shadow-git checkpoint with file-level rollback |
| 7 | `src/config/types.plugin-enhancements.ts` | D | Config types for hooks, context engines, message injection |
| 8 | `src/agents/plugin-hooks.ts` | D | Fault-isolated hook bus with priority ordering |
| 9 | `src/agents/plugin-context-engine.ts` | D | Replaceable RAG context engine registry |
| 10 | `src/agents/plugin-message-injection.ts` | D | Priority-sorted message queue with interrupt support |
| 11 | Journal integration additions | A–G | Recorders for Tracks C + D events |
| 12 | Config wiring | — | OpenClawConfig field additions |

### Verification Criteria
- Zero `tsc` errors.
- `budget-tracker` uses factory function returning interface (no `new`).
- `plugin-hooks` invoke callbacks inside try/catch with per-callback timeout.
- `checkpoint-manager` deduplicates identical consecutive snapshots.

---

## Phase 2 (P2) — Tracks E + F · Commit `4acff6e`

**Goal:** Advanced agent tools and gateway platform adapters.

### Files Created (18)

| # | File | Track | Purpose |
|---|------|-------|---------|
| 1 | `src/config/types.advanced-tools.ts` | E | Config types for browser, MoA, TTS, process monitor, HA |
| 2 | `src/tools/browser-automation.ts` | E | Multi-provider browser tool (local, Browserbase, Firecrawl, browser-use) |
| 3 | `src/tools/mixture-of-agents.ts` | E | Multi-model consensus aggregation |
| 4 | `src/tools/voice-tts.ts` | E | TTS synthesis + transcription + image gen tools |
| 5 | `src/tools/process-monitor.ts` | E | Background process tracking with watch patterns |
| 6 | `src/tools/homeassistant.ts` | E | Home Assistant REST client and tool definitions |
| 7 | `src/config/types.gateway-expansion.ts` | F | Config types for WeCom, DingTalk, Feishu, mirroring, multi-dest |
| 8 | `src/channels/adapters/wecom.ts` | F | WeCom AES-CBC encrypted adapter |
| 9 | `src/channels/adapters/dingtalk.ts` | F | DingTalk HMAC-SHA256 webhook adapter |
| 10 | `src/channels/adapters/feishu.ts` | F | Feishu/Lark tenant-token adapter |
| 11 | `src/channels/gateway-mirroring.ts` | F | Cross-platform session transcript mirroring |
| 12 | `src/channels/multi-destination-delivery.ts` | F | Policy-based multi-target delivery |
| 13–18 | Journal integration + config wiring | — | Remaining recorders and config fields |

### Verification Criteria
- Zero `tsc` errors.
- All gateway adapters have injectable HTTP clients (no `fetch` at module scope).
- Browser automation uses `BrowserProvider` interface, not concrete Playwright imports.
- WeCom crypto uses injectable `CryptoProvider`, not direct `node:crypto`.

---

## Phase 3 (P3) — Track G · Commit `223ff02`

**Goal:** Training and evaluation pipeline.

### Files Created (10)

| # | File | Track | Purpose |
|---|------|-------|---------|
| 1 | `src/config/types.training-pipeline.ts` | G | Config types for trajectory, toolsets, batch, environments, benchmarks, RL |
| 2 | `src/training/trajectory-format.ts` | G | Hermes-compatible JSONL trajectory I/O |
| 3 | `src/training/toolset-distributions.ts` | G | 18 stochastic toolset sampling distributions |
| 4 | `src/training/batch-runner.ts` | G | Crash-resilient multiprocess batch executor |
| 5 | `src/training/environments/index.ts` | G | Local/Docker/SSH execution backends |
| 6 | `src/training/tool-call-parsers/index.ts` | G | 11 model-specific tool-call parsers |
| 7 | `src/training/benchmarks/index.ts` | G | TerminalBench2 + JSONL benchmark harness |
| 8 | `src/training/rl-cli.ts` | G | RL training + evaluation CLI interface |
| 9 | Journal integration additions | G | 6 training-specific recorders |
| 10 | Config wiring | — | `trainingPipeline` on OpenClawConfig |

### Verification Criteria
- Zero `tsc` errors.
- `batch-runner` resumes from checkpoint (reads existing output file).
- `environments` uses injectable `ChildProcessSpawner`.
- `tool-call-parsers` self-register on import.
- All 11 parser names match Hermes naming conventions.

---

## Phase 4 — Test Suites · Commit `825cb46`

**Goal:** Acceptance tests for all 7 tracks.

### Test Files Created (24)

| Track | Test files |
|-------|-----------|
| A (×6) | `error-classifier.test.ts`, `credential-pool.test.ts`, `rate-limit-tracker.test.ts`, `session-persistence.test.ts`, `trajectory-compressor.test.ts`, `smart-model-routing.test.ts` |
| B (×4) | `skills-guard.test.ts`, `skills-sync.test.ts`, `url-safety.test.ts`, `path-security.test.ts` |
| C (×5) | `git-worktree.test.ts`, `prompt-caching.test.ts`, `context-references.test.ts`, `budget-tracker.test.ts`, `checkpoint-manager.test.ts` |
| D (×3) | `plugin-hooks.test.ts`, `plugin-context-engine.test.ts`, `plugin-message-injection.test.ts` |
| E (×2) | `browser-automation.test.ts`, `mixture-of-agents.test.ts` |
| F (×2) | `wecom.test.ts`, `multi-destination-delivery.test.ts` |
| G (×2) | `trajectory-format.test.ts`, `toolset-distributions.test.ts` |

### Verification Criteria
- Zero `tsc` errors across all 24 files.
- Tests use Vitest `describe`/`it`/`expect` patterns.
- No real HTTP, SQLite, or filesystem calls — all injectable dependencies mocked.
- Each test file covers: happy path, error path, edge cases, config defaults.

---

## Phase 5 — Documentation · Commit `ccccca3` + current

| Deliverable | File | Status |
|-------------|------|--------|
| SPEC | `SPEC_OPENCLOW_IMPROVEMENTS_FROM_HERMES_AGENT_ANALYSIS.md` | ✅ Complete |
| Technical reference | `HERMES_OPENCLAW_TECHNICAL_REFERENCE.md` | ✅ Complete |
| Execution plans | `HERMES_OPENCLAW_EXECUTION_PLANS.md` | ✅ This file |
| ADRs | `HERMES_OPENCLAW_ADRS.md` | ✅ Complete |
| Contributor guide | `HERMES_OPENCLAW_CONTRIBUTOR_GUIDE.md` | ✅ Complete |

---

## Commit Chain

```
397535e  (pre-SPEC baseline)
   │
1b07f30  P0: Track A + Track B (14 files)
   │
f6c55ae  P1: Track C + Track D (12 files)
   │
4acff6e  P2: Track E + Track F (18 files)
   │
223ff02  P3: Track G (10 files)
   │
825cb46  Tests: all 7 tracks (24 files)
   │
ccccca3  docs: technical reference
   │
(HEAD)   docs: execution plans + ADRs + contributor guide
```

---

## Risk Log (Retrospective)

| Risk | Mitigation | Outcome |
|------|-----------|---------|
| SQLite `better-sqlite3` not available | Injectable `SqliteDatabase` interface | ✅ No hard dependency |
| Playwright not installed | `BrowserProvider` abstraction | ✅ Provider-factory pattern |
| Chinese platform API keys missing | All adapters work with injected HTTP clients | ✅ Testable without credentials |
| Training on non-Linux host | `ExecutionEnvironment` abstraction over `child_process` | ✅ Docker/SSH available |
| `tsc` breakage across 54+ files | Incremental phase commits with zero-error gates | ✅ All phases clean |
