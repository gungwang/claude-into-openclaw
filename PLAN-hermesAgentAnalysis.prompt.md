# Plan: Hermes-Agent Analysis & Spec for OpenClaw

Analyze hermes-agent features, compare against openclaw, and produce a specification document (`SPEC_OPENCLOW_IMPROVEMENTS_FROM_HERMES_AGENT_ANALYSIS.md`) following the same format as the prior claw-code V2 spec.

## Phase 1: Discovery (complete)

Both codebases have been thoroughly explored. 7 improvement tracks identified from 50+ unique/superior hermes-agent features.

## Phase 2: Write specification document

Create `SPEC_OPENCLOW_IMPROVEMENTS_FROM_HERMES_AGENT_ANALYSIS.md` at repo root, structured as:
- Executive summary, observed signals, baseline strengths
- 7 improvement tracks (A–G) each with problem/proposal/outcomes/acceptance criteria
- Priority matrix, delivery phases, risks, success metrics

## 7 Improvement Tracks

| Priority | Track | Description | Key Hermes Source |
|----------|-------|-------------|-------------------|
| **P0** | **D — Session Intelligence** | SQLite WAL+FTS persistence, trajectory compression, smart model routing, error classifier, credential pool, rate limit tracker | `hermes_state.py`, `trajectory_compressor.py`, `agent/smart_model_routing.py`, `agent/error_classifier.py` |
| **P0** | **C — Security & Supply Chain** | Skills security guard (20+ threat patterns), manifest-based skill sync, URL safety, OSV vulnerability scanning, credential file detection | `tools/skills_guard.py`, `tools/skills_sync.py`, `tools/url_safety.py`, `tools/osv_check.py` |
| **P1** | **G — Developer Experience** | Git worktree isolation, prompt caching, context references/subdirectory hints, budget config, clarify tool, manual compression feedback | `cli.py` (worktree), `agent/prompt_caching.py`, `agent/context_references.py`, `tools/budget_config.py` |
| **P1** | **E — Plugin Enhancements** | Richer lifecycle hooks (pre/post tool+LLM), context engine replacement, live message injection, plugin CLI management, plugin-registered toolsets | `hermes_cli/plugins.py`, `hermes_cli/plugins_cmd.py` |
| **P2** | **B — Advanced Tools** | Full browser automation (10 tools, 3 provider backends), Mixture of Agents, voice/TTS, image generation, background process notifications, checkpoint manager | `tools/browser_tool.py`, `tools/mixture_of_agents_tool.py`, `tools/tts_tool.py`, `tools/checkpoint_manager.py` |
| **P2** | **F — Gateway Platforms** | WeCom, DingTalk, Feishu, WeChat, Mattermost, WhatsApp Cloud, SMS, Email, Webhook; plus gateway mirroring and multi-destination delivery | `gateway/platforms/` |
| **P3** | **A — Training Pipeline** | RL CLI, batch runner, toolset distributions, SWE benchmark runner, environment backends (Docker/Modal/SSH/Daytona/Singularity), tool-call parsers | `rl_cli.py`, `batch_runner.py`, `toolset_distributions.py`, `mini_swe_runner.py`, `environments/` |

---

## Track D — Session Intelligence (P0)

### Problem
OpenClaw's session journal is in-memory only (`session-event-journal.ts`). There is no persistent session search, no trajectory compression, no structured error classification for retry logic, no per-provider rate limit tracking, and no credential rotation/recovery. Hermes has mature implementations for all of these.

### Hermes Source References
- `hermes_state.py` — SQLite WAL + FTS5 session DB with schema migration ladder, write-contention handling (BEGIN IMMEDIATE + jitter backoff), session lineage via `parent_session_id`, and full-text search with query sanitization
- `trajectory_compressor.py` — Budget-aware middle-span summarization preserving execution continuity; async fan-out with semaphore; metrics pipeline with per-trajectory and aggregate stats; provider abstraction via `auxiliary_client`
- `agent/smart_model_routing.py` — Task-based automatic model selection logic
- `agent/error_classifier.py` — Structured error taxonomy for retry decisions (transient vs permanent, rate-limit vs auth vs model)
- `agent/credential_pool.py` — Multi-key rotation with recovery on auth failure
- `agent/rate_limit_tracker.py` — Per-provider rate-limit monitoring and backoff coordination
- `agent/usage_pricing.py` — Per-token cost attribution with model-specific pricing tables
- `tools/session_search_tool.py` — Cross-session knowledge retrieval via FTS5

### OpenClaw Integration Targets
- `openclaw/src/agents/session-event-journal.ts` — Extend with persistent backend
- `openclaw/src/agents/journal-integration.ts` — Wire persistence into run loop
- `openclaw/src/agents/pi-embedded-runner/run.ts` — Add error classification, credential rotation, rate-limit awareness
- `openclaw/src/config/types.openclaw.ts` — Add session persistence config section
- New: `openclaw/src/agents/session-persistence.ts` — SQLite backend (better-sqlite3 or sql.js)
- New: `openclaw/src/agents/trajectory-compressor.ts` — Port compression pipeline
- New: `openclaw/src/agents/error-classifier.ts` — Structured error taxonomy
- New: `openclaw/src/agents/smart-model-routing.ts` — Task→model selection
- New: `openclaw/src/agents/rate-limit-tracker.ts` — Per-provider monitoring

### Outcomes
- Sessions survive process restarts with full message history and reasoning artifacts
- Full-text search across all historical sessions
- Automatic trajectory compression reduces token cost for long conversations
- Structured retries prevent user-visible errors for transient API failures
- Credential rotation prevents single-key exhaustion from blocking work

### Acceptance Criteria
- [ ] Session data persists across process restarts with <100ms restore latency
- [ ] FTS search returns relevant results across 1000+ sessions
- [ ] Trajectory compression reduces token count by ≥40% on conversations >50 turns
- [ ] Error classifier correctly categorizes ≥95% of common API errors
- [ ] Credential rotation triggers automatically on 401/429 without user intervention

### TypeScript Adaptation Notes
- SQLite: Use `better-sqlite3` (synchronous, WAL-mode compatible) or `sql.js` (WASM, no native dep). Hermes uses Python sqlite3 with WAL + FTS5 — both Node.js options support this.
- Async compression fan-out: Use `Promise.all` with concurrency limiter (p-limit) instead of Python asyncio semaphore.
- Write contention: Node.js is single-threaded so BEGIN IMMEDIATE + retry is simpler than in Python's multiprocess model.

---

## Track C — Security & Supply Chain (P0)

### Problem
OpenClaw has a maturity-trust framework (`maturity-trust.ts`) but lacks active security scanning of skills before install, no OSV vulnerability checking, no URL safety validation, and no manifest-based skill synchronization. Hermes has a comprehensive supply-chain defense layer.

### Hermes Source References
- `tools/skills_guard.py` — `scan_skill()`, `should_allow_install()`, `format_scan_report()`; 20+ threat pattern categories (exfiltration, injection, destructive, persistence, privilege escalation, obfuscation, symlink escape, binary detection, oversized payloads); trust-level policy matrix (bundled/community/agent-created); `Finding` and `ScanResult` dataclasses
- `tools/skills_sync.py` — `sync_skills()` with manifest-based 3-way reconciliation (bundled origin hash vs current user hash vs new bundled hash); preserves user customizations; atomic manifest writes; migration from v1 format
- `tools/url_safety.py` — URL validation and safety checking before fetch operations
- `tools/osv_check.py` — OSV.dev API integration for dependency vulnerability scanning
- `tools/credential_files.py` — Detection of credential/secret files in workspace
- `tools/path_security.py` — Path traversal and symlink escape prevention

### OpenClaw Integration Targets
- `openclaw/src/agents/skills-install.ts` — Add pre-install security scanning gate
- `openclaw/src/agents/skills.ts` — Add manifest-based sync for bundled skills
- `openclaw/src/agents/maturity-trust.ts` — Extend trust model with scan verdicts
- `openclaw/src/plugins/install.ts` — Add plugin security scanning
- `openclaw/src/config/types.tools.ts` — Add security scanning config options
- New: `openclaw/src/agents/skills-guard.ts` — Port threat pattern scanner
- New: `openclaw/src/agents/skills-sync.ts` — Port manifest-based sync
- New: `openclaw/src/agents/url-safety.ts` — URL validation service
- New: `openclaw/src/agents/osv-check.ts` — OSV vulnerability scanner

### Outcomes
- Skills are scanned for malicious patterns before installation
- Bundled skills update safely without losing user customizations
- URLs are validated before agent fetch operations
- Dependencies are checked against known vulnerability databases
- Credential files are flagged before being exposed to agent context

### Acceptance Criteria
- [ ] Skills guard detects ≥90% of OWASP-classified injection patterns in test corpus
- [ ] Skill sync preserves user modifications across 100% of bundled update cycles
- [ ] URL safety blocks known-malicious and private-network URLs
- [ ] OSV check reports known CVEs for project dependencies
- [ ] Credential file detection flags .env, .pem, .key, and common secret files

---

## Track G — Developer Experience (P1)

### Problem
OpenClaw lacks git worktree isolation for safe concurrent editing, has no provider-specific prompt caching optimization, no automatic context reference injection from project structure, no tool-level budget configuration, and no explicit clarification tool for user disambiguation.

### Hermes Source References
- `cli.py` (lines ~674–773) — Git worktree setup/cleanup for isolated concurrent editing
- `agent/prompt_caching.py` — Provider-specific cache optimization (Anthropic cache_control, OpenAI predicted_outputs, etc.)
- `agent/context_references.py` — Automatic context reference detection and injection from project structure
- `agent/subdirectory_hints.py` — Directory structure hints for navigation
- `tools/budget_config.py` — Per-tool cost budget limits and tracking
- `tools/clarify_tool.py` — Explicit user clarification request tool
- `agent/manual_compression_feedback.py` — User feedback loop for context compression decisions
- `agent/insights.py` — Session analytics and insight generation
- `tools/checkpoint_manager.py` — Git-based checkpoint creation and rollback

### OpenClaw Integration Targets
- `openclaw/src/agents/pi-embedded-runner/run.ts` — Add worktree isolation, prompt caching, context references
- `openclaw/src/agents/pi-tools.ts` — Add clarify tool, budget config
- `openclaw/src/config/types.tools.ts` — Add budget limits per tool
- New: `openclaw/src/agents/git-worktree.ts` — Worktree isolation manager
- New: `openclaw/src/agents/prompt-caching.ts` — Provider-specific cache strategies
- New: `openclaw/src/agents/context-references.ts` — Auto-reference injection
- New: `openclaw/src/agents/budget-tracker.ts` — Cost budget enforcement

### Outcomes
- Concurrent editing sessions don't conflict via worktree isolation
- Token costs reduced via provider-specific prompt caching
- Agent automatically references relevant project files based on directory structure
- Users can set per-tool and per-session cost budgets
- Agent can explicitly ask for clarification instead of guessing

### Acceptance Criteria
- [ ] Git worktree creates and cleans up isolated branches without data loss
- [ ] Prompt caching reduces redundant token usage by ≥30% for Anthropic provider
- [ ] Context references correctly identify ≥80% of relevant files for a given task
- [ ] Budget enforcement halts tool execution when cost limit is exceeded
- [ ] Clarify tool is invoked when agent confidence is below configured threshold

---

## Track E — Plugin Enhancements (P1)

### Problem
OpenClaw's plugin system (`plugins/registry.ts`) supports tool, channel, provider, hook, HTTP route, service, and CLI command registration. However, it lacks granular pre/post hooks for tool and LLM calls, context engine replacement, live message injection into active sessions, and plugin-managed toolset registration. Hermes provides all of these.

### Hermes Source References
- `hermes_cli/plugins.py` — `PluginContext` with `register_tool()`, `register_hook()`, `register_cli_command()`, `register_context_engine()`, `inject_message()`; `PluginManager` with `discover_and_load()`, `invoke_hook()`; hook bus with per-callback fault isolation
- `hermes_cli/plugins_cmd.py` — `cmd_install()`, `cmd_update()`, `cmd_remove()`, `cmd_enable()`, `cmd_disable()`, `cmd_toggle()`; manifest compatibility gating; secure install name sanitization
- Hook names: `pre_tool_call`, `post_tool_call`, `pre_llm_call`, `post_llm_call`, `session_start`, `session_end`, `session_finalize`, `session_reset`

### OpenClaw Integration Targets
- `openclaw/src/plugins/registry.ts` — Extend hook taxonomy with pre/post tool+LLM hooks
- `openclaw/src/plugins/discovery.ts` — Add context engine replacement capability
- `openclaw/src/plugin-sdk/` — Expose new hook types in public SDK
- `openclaw/src/agents/pi-embedded-runner/run.ts` — Wire pre/post hooks into agent loop
- `openclaw/src/gateway/server-methods/` — Add plugin management API methods

### Outcomes
- Plugins can observe and modify tool calls and LLM requests in flight
- Plugins can replace the context engine for custom retrieval strategies
- External systems can inject messages into active sessions for real-time coordination
- Plugin lifecycle management is fully API-accessible

### Acceptance Criteria
- [ ] Pre/post tool hooks fire correctly for every tool invocation with <5ms overhead
- [ ] Context engine replacement correctly serves all existing retrieval queries
- [ ] Message injection delivers content within the current turn's context window
- [ ] Plugin install/update/remove operations are idempotent and crash-safe

---

## Track B — Advanced Tools (P2)

### Problem
OpenClaw has core tools (messaging, sessions, subagents, cron, web fetch, images/pdf) but lacks full browser automation, multi-model consensus (Mixture of Agents), voice/TTS synthesis, audio transcription, image generation, background process notifications with watch patterns, and git-based checkpoint/rollback.

### Hermes Source References
- `tools/browser_tool.py` — 10 browser tools: `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_scroll`, `browser_back`, `browser_press`, `browser_get_images`, `browser_vision`, `browser_console`; provider backends in `tools/browser_providers/` (Browserbase, Firecrawl, browser-use)
- `tools/mixture_of_agents_tool.py` — Multi-model consensus via parallel delegation to different models, then synthesis
- `tools/tts_tool.py` — Text-to-speech synthesis with multiple engine backends
- `tools/voice_mode.py` — Voice interaction mode
- `tools/transcription_tools.py` — Audio transcription
- `tools/image_generation_tool.py` — Image generation tool
- `tools/process_registry.py` — Background process tracking with watch patterns and completion notifications
- `tools/checkpoint_manager.py` — Git-based checkpoint creation and rollback
- `tools/homeassistant_tool.py` — Home Assistant IoT integration (4 tools)

### OpenClaw Integration Targets
- `openclaw/src/agents/pi-tools.ts` — Register new tool definitions
- `openclaw/src/agents/tool-policy-pipeline.ts` — Add policy rules for new tools
- `openclaw/src/agents/subagent-registry.ts` — Extend for MoA pattern
- New: `openclaw/src/tools/browser-automation.ts` — Browser tool suite
- New: `openclaw/src/tools/mixture-of-agents.ts` — Multi-model consensus
- New: `openclaw/src/tools/voice-tts.ts` — Text-to-speech
- New: `openclaw/src/tools/checkpoint-manager.ts` — Git checkpoint/rollback
- New: `openclaw/src/tools/process-monitor.ts` — Background process notifications

### Outcomes
- Agent can navigate, interact with, and extract data from web pages
- Multi-model consensus improves answer quality for complex questions
- Voice output expands accessibility and use cases
- Background processes are monitored with automatic notifications
- Git checkpoints enable safe rollback of agent-made changes

### Acceptance Criteria
- [ ] Browser tools can complete a 5-step web interaction flow end-to-end
- [ ] MoA produces synthesized output from ≥3 models within 2x single-model latency
- [ ] TTS generates audio output for text ≤5000 characters in <10s
- [ ] Background process watch patterns trigger notifications within 1s of match
- [ ] Checkpoint rollback restores exact file state verified by git diff

---

## Track F — Gateway Platforms (P2)

### Problem
OpenClaw supports Telegram, Discord, Slack, Signal, iMessage/BlueBubbles, WhatsApp, Matrix, and Teams. Hermes adds several Chinese enterprise platforms (WeCom, DingTalk, Feishu, WeChat/Weixin) plus Mattermost, SMS, Email, and generic Webhook adapters. It also adds gateway mirroring and multi-destination delivery routing.

### Hermes Source References
- `gateway/platforms/wecom.py`, `gateway/platforms/wecom_crypto.py`, `gateway/platforms/wecom_callback.py` — WeCom (WeChat Work) adapter with message encryption
- `gateway/platforms/dingtalk.py` — DingTalk adapter
- `gateway/platforms/feishu.py` — Feishu/Lark adapter
- `gateway/platforms/weixin.py` — WeChat public account adapter
- `gateway/platforms/mattermost.py` — Mattermost adapter
- `gateway/platforms/sms.py` — SMS adapter
- `gateway/platforms/email.py` — Email adapter
- `gateway/platforms/webhook.py` — Generic webhook adapter
- `gateway/mirror.py` — Gateway mirroring for cross-platform message relay
- `gateway/delivery.py` — Multi-destination delivery routing and target parsing

### OpenClaw Integration Targets
- `openclaw/src/channels/` — Add new channel adapters
- `openclaw/src/gateway/` — Add mirroring and delivery routing
- `openclaw/src/config/types.openclaw.ts` — Add channel config for new platforms
- `openclaw/extensions/` — Add as extension packages

### Outcomes
- OpenClaw gains access to Chinese enterprise market via WeCom/DingTalk/Feishu
- Generic webhook adapter enables integration with any HTTP-capable system
- Email and SMS adapters expand reach to non-chat platforms
- Gateway mirroring enables cross-platform message relay

### Acceptance Criteria
- [ ] Each new adapter sends and receives text messages in platform-specific format
- [ ] WeCom adapter correctly handles message encryption/decryption
- [ ] Webhook adapter accepts and responds to arbitrary HTTP POST payloads
- [ ] Gateway mirroring relays messages between ≥2 platforms with <2s latency
- [ ] Multi-destination delivery correctly routes to all specified targets

### Regulatory Note
Chinese platform adapters (WeCom, DingTalk, Feishu, WeChat) require region-specific API endpoints and may have compliance requirements for data residency. Implementation should support configurable API base URLs and document regulatory considerations.

---

## Track A — Training & Evaluation Pipeline (P3)

### Problem
OpenClaw has no training, evaluation, or benchmark infrastructure. Hermes provides a complete ML-ops pipeline including RL training CLI, batch trajectory generation, toolset distribution sampling, SWE benchmark execution, multi-backend environment management, and model-specific tool-call parsing.

### Hermes Source References
- `rl_cli.py` — RL CLI with dedicated persona, environment listing, tinker-atropos integration, 30-minute check cadence, test-before-train workflow
- `batch_runner.py` — Multiprocess batch execution with JSONL checkpointing, crash-resilient resume via checkpoint indices + content-based dedupe, per-sample toolset stochasticity, bad-trajectory filtering by hallucinated tool names, reasoning-coverage gating
- `toolset_distributions.py` — Independent Bernoulli inclusion per toolset for training diversity; guaranteed non-empty fallback
- `mini_swe_runner.py` — Lightweight single-tool agent loop for SWE trace generation; Hermes-compatible trajectory format
- `environments/hermes_base_env.py` — Environment base class with reward computation, step management, done detection
- `environments/agent_loop.py` — Environment-aware agent loop
- `environments/tool_context.py` — Tool execution context for environment backends
- `environments/tool_call_parsers/` — Model-specific parsers: DeepSeek v3/v3.1, Qwen/Qwen3-Coder, Llama, Mistral, GLM 4.5/4.7, Kimi K2, Hermes, LongCat
- `environments/benchmarks/` — TerminalBench2, TBLite, YC-Bench with eval scripts and YAML configs
- `tools/environments/` — Execution backends: local, Docker, Modal, SSH, Daytona, Singularity

### OpenClaw Integration Targets
- New: `openclaw/src/training/` — Entire training subsystem (new top-level module)
- New: `openclaw/src/training/batch-runner.ts` — Batch trajectory generation
- New: `openclaw/src/training/rl-cli.ts` — RL training interface
- New: `openclaw/src/training/trajectory-format.ts` — Hermes-compatible trajectory serialization
- New: `openclaw/src/training/toolset-distributions.ts` — Stochastic toolset sampling
- New: `openclaw/src/training/environments/` — Environment backend abstractions
- New: `openclaw/src/training/benchmarks/` — Benchmark environment adapters
- New: `openclaw/src/training/tool-call-parsers/` — Model-specific parsing

### Outcomes
- OpenClaw can generate training data from agent interactions
- Batch processing enables large-scale trajectory generation for model fine-tuning
- Toolset distributions create diverse training samples
- Benchmark environments enable systematic agent evaluation
- Multi-backend environments support heterogeneous compute

### Acceptance Criteria
- [ ] Batch runner processes 100 prompts with crash-resilient checkpointing
- [ ] Toolset distributions produce statistically diverse samples across 1000 runs
- [ ] Trajectory format is interoperable with Hermes training pipeline
- [ ] At least 3 environment backends (local, Docker, SSH) are functional
- [ ] At least 1 benchmark environment produces scored evaluation results

### Implementation Note
This track is the most complex and requires a separate design document before implementation. It introduces a new top-level module (`training/`) and has minimal coupling with the existing agent runtime. Recommended approach: start with trajectory format and batch runner (data generation), defer RL CLI and benchmarks to a later phase.

### TypeScript Adaptation Notes
- Multiprocess batch: Use Node.js `worker_threads` or `child_process.fork()` instead of Python `multiprocessing`
- JSONL streaming: Use `readline` interface or streaming JSON parser
- Environment backends: Docker via `dockerode`, SSH via `ssh2`, local via `child_process`
- Tool-call parsers: Port regex-based parsers directly; model-specific XML/JSON extraction patterns are language-agnostic

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| SQLite in Node.js has different performance characteristics than Python | Session persistence may be slower | Benchmark `better-sqlite3` vs `sql.js`; use WAL mode; consider LevelDB as alternative |
| Browser automation adds large dependency surface | Package size bloat, security surface | Make browser tools optional; lazy-load Playwright; use provider backends to externalize |
| Training pipeline is Python-ecosystem-heavy | Significant porting effort; tokenizer dependencies | Start with trajectory format only; keep Python training tools as external pipeline |
| Chinese platform APIs change frequently | Adapter maintenance burden | Use thin adapter pattern; abstract platform-specific logic; community-maintained |
| Plugin hook expansion may break existing plugins | Backward compatibility risk | Add hooks as opt-in; new hook names don't conflict with existing registration |
| Skill security scanning may have false positives | User friction on legitimate skills | Configurable severity thresholds; bypass with explicit `--force` flag |

---

## Delivery Phases

### Phase 1: Foundation (P0 — Session Intelligence + Security)
**Goal**: Persistent sessions and supply-chain security
- Session persistence with SQLite backend
- Full-text session search
- Trajectory compression (basic)
- Skills security guard
- Skills manifest-based sync
- Error classifier
- Credential rotation
**Exit criteria**: All P0 acceptance criteria pass; no regressions in existing tests

### Phase 2: Experience (P1 — Developer Experience + Plugin Enhancements)
**Goal**: Better daily-use experience and richer extensibility
- Git worktree isolation
- Prompt caching (Anthropic + OpenAI)
- Context references auto-injection
- Pre/post tool and LLM hooks
- Context engine replacement API
- Budget configuration
- Clarify tool
**Exit criteria**: All P1 acceptance criteria pass; plugin SDK backward-compatible

### Phase 3: Capabilities (P2 — Advanced Tools + Gateway Platforms)
**Goal**: Expanded tool surface and platform reach
- Browser automation suite
- Mixture of Agents tool
- Voice/TTS tools
- Checkpoint manager
- WeCom, DingTalk, Feishu adapters
- Webhook, Email, SMS adapters
- Gateway mirroring
**Exit criteria**: All P2 acceptance criteria pass; new tools gated behind feature flags

### Phase 4: Training (P3 — Training Pipeline)
**Goal**: Data generation and evaluation infrastructure
- Trajectory format specification
- Batch runner
- Toolset distributions
- Environment backends (local, Docker, SSH)
- Benchmark adapter (1 benchmark)
**Exit criteria**: Separate design doc approved; batch runner processes 100 prompts end-to-end

---

## Success Metrics

| Metric | Target | Track |
|--------|--------|-------|
| Session restore latency | <100ms for 1000-message session | D |
| FTS search precision | ≥90% relevance in top-5 results | D |
| Trajectory compression ratio | ≥40% token reduction on 50+ turn conversations | D |
| Skills guard detection rate | ≥90% on OWASP test corpus | C |
| Prompt cache hit rate | ≥60% for repeat interactions (Anthropic) | G |
| Plugin hook overhead | <5ms per hook invocation | E |
| Browser tool success rate | ≥85% on standard web interaction flows | B |
| MoA latency multiplier | ≤2x single-model baseline | B |
| Batch throughput | ≥10 trajectories/minute on 4-core machine | A |

---

## Deliverables

1. **This specification document** — `SPEC_OPENCLOW_IMPROVEMENTS_FROM_HERMES_AGENT_ANALYSIS.md`
2. **Technical reference** (follow-up) — `HERMES_OPENCLAW_TECHNICAL_REFERENCE.md` with type definitions, function signatures, integration wiring
3. **Execution plan** (follow-up) — `HERMES_OPENCLAW_EXECUTION_PLANS.md` with file-by-file checklists, commit breakdown, test plans
4. **ADRs** — One per track for schema-level decisions
5. **Test suites** — Per-track acceptance test files

---

## Constraint Reminder

- **Plan/spec only** — This document does not implement any code changes
- **Additive/non-breaking** — All proposals extend existing behavior without modifying it
- **Cross-references** — Builds on prior work in `SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2.md`; assumes Tracks A–G from that spec are implemented or in progress
- **Language boundary** — Hermes is Python; OpenClaw is TypeScript. All adaptations must account for ecosystem differences
