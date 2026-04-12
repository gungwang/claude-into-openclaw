# OpenClaw Improvement Specification (Derived from Hermes-Agent Analysis)

- OpenClaw source code: /home/wang/projects/claud-code-src/claw-code/openclaw
- Hermes-Agent source code: /home/wang/projects/claud-code-src/claw-code/hermes-agent

## Target
- Implement or edit source code in /home/wang/projects/claud-code-src/claw-code/openclaw

## Status
Plan/specification only. **No implementation changes** included.

## Objective
Analyze the `hermes-agent` repository as an open-source AI coding agent framework and extract practical improvements for **OpenClaw** that are compatible with OpenClaw's current architecture. Identifies features absent from or significantly superior to OpenClaw's existing capabilities.

## Cross-Reference
Builds on prior work in `SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2.md`. Assumes Tracks A–G from that spec are implemented or in progress. The track lettering in this document (A–G) is independent and specific to hermes-agent–derived improvements.

---

## 1) Executive Summary

The `hermes-agent` codebase is a **production-grade Python AI agent framework** with a shared agent/tool substrate exposed through multiple surfaces (CLI, gateway, ACP, MCP, batch, RL). Key architectural strengths:

- **Session persistence** with SQLite WAL + FTS5, schema migration, write-contention handling, and session lineage tracking.
- **Training & evaluation pipeline** including batch trajectory generation, RL training CLI, toolset distributions, SWE benchmark runners, and multi-backend environment management.
- **Supply-chain security** with threat-pattern scanning (20+ categories), manifest-based skill synchronization, URL safety validation, and OSV vulnerability checking.
- **Rich tool ecosystem** spanning browser automation (10 tools, 3 provider backends), Mixture of Agents, voice/TTS, image generation, background process monitoring, and checkpoint management.
- **Plugin architecture** with pre/post tool+LLM hooks, context engine replacement, live message injection, and full CLI lifecycle management.
- **Gateway platform coverage** for 15+ messaging platforms including Chinese enterprise platforms (WeCom, DingTalk, Feishu, WeChat).

This specification identifies 7 improvement tracks that would bring hermes-agent–caliber capabilities to OpenClaw while preserving OpenClaw's existing TypeScript architecture, plugin system, and channel framework.

---

## 2) What Was Observed in hermes-agent (Relevant Signals)

### 2.1 Persistent session state engine

Hermes uses SQLite with WAL mode and FTS5 for full-text search across all sessions. The schema includes session lineage (`parent_session_id`), token/cost metadata per session, reasoning artifact columns, and automatic schema migration. Write contention is handled with `BEGIN IMMEDIATE` + jitter backoff for multi-process safety.

**Why this matters for OpenClaw:**
OpenClaw's session event journal (`session-event-journal.ts`) is in-memory only. Sessions do not survive process restarts, there is no cross-session search, and no trajectory compression for long conversations.

### 2.2 Training data generation infrastructure

Hermes has a complete pipeline: batch runner with multiprocess execution and JSONL checkpointing, toolset distribution sampling (independent Bernoulli per toolset), SWE benchmark runner, and 6+ environment backends (local, Docker, Modal, SSH, Daytona, Singularity). It also includes 10+ model-specific tool-call parsers (DeepSeek, Qwen, Llama, Mistral, GLM, Kimi, etc.).

**Why this matters for OpenClaw:**
OpenClaw has no training, evaluation, or benchmark infrastructure. As model fine-tuning becomes increasingly accessible, the ability to generate training trajectories from agent interactions is a competitive differentiator.

### 2.3 Supply-chain defense layer

Hermes scans skills before installation with 20+ threat pattern categories (exfiltration, injection, destructive, persistence, privilege escalation, obfuscation, symlink escape, binary detection, oversized payloads). It uses a trust-level policy matrix (bundled/community/agent-created) and manifest-based 3-way sync that preserves user customizations during updates.

**Why this matters for OpenClaw:**
OpenClaw has a maturity-trust framework but lacks active pre-install scanning, vulnerability checking, and safe manifest-based skill synchronization.

### 2.4 Browser automation and multi-modal tools

Hermes provides 10 browser tools with 3 provider backends (Browserbase, Firecrawl, browser-use), Mixture of Agents for multi-model consensus, text-to-speech synthesis, audio transcription, image generation, and background process monitoring with watch patterns.

**Why this matters for OpenClaw:**
OpenClaw's tool surface covers messaging, sessions, subagents, cron, web fetch, and images/PDF but lacks interactive browser control, multi-model consensus, and voice capabilities.

### 2.5 Plugin hook granularity

Hermes plugins can register pre/post hooks for both tool calls and LLM calls, replace the context engine entirely, inject messages into active sessions, and register CLI commands. The hook bus includes per-callback fault isolation.

**Why this matters for OpenClaw:**
OpenClaw's plugin registry supports tool, channel, provider, hook, HTTP route, service, and CLI command registration — but lacks the granular pre/post interception points and context engine replacement that enable advanced plugin behaviors.

### 2.6 Chinese enterprise platform coverage

Hermes includes gateway adapters for WeCom (with message encryption), DingTalk, Feishu/Lark, and WeChat public accounts, plus generic adapters for SMS, Email, Mattermost, and Webhook.

**Why this matters for OpenClaw:**
OpenClaw supports Western platforms (Telegram, Discord, Slack, Signal, WhatsApp, Matrix, Teams) but has no Chinese enterprise platform adapters, limiting market reach.

### 2.7 Developer experience patterns

Hermes provides git worktree isolation for safe concurrent editing, provider-specific prompt caching (Anthropic cache_control, OpenAI predicted_outputs), automatic context reference injection from project structure, per-tool budget configuration, and a clarify tool for explicit user disambiguation.

**Why this matters for OpenClaw:**
These patterns directly reduce token costs, prevent git conflicts in concurrent sessions, and improve agent interaction quality without changing the core agent loop.

---

## 3) OpenClaw Baseline Strengths (from existing implementation)

OpenClaw's documented and implemented foundations include:

- Serialized agent loop with lifecycle streams, wait semantics, and event streaming.
- Queue lanes and per-session consistency guarantees.
- Transcript hygiene and provider-specific sanitization rules.
- Session compaction with pre-compaction memory flush.
- Multi-agent/delegate architecture with policy boundaries.
- Internal/plugin hooks at key lifecycle points.
- Canonical tool identity layer with diagnostic emission.
- Route explainability engine with score decomposition.
- Maturity-trust model with defaults and reporting.
- Policy reason-code taxonomy with traceability.
- Mode contract matrix with standardized failure envelope.
- Session event journal facade with correlation IDs.
- Multi-channel support (Telegram, Discord, Slack, Signal, iMessage, WhatsApp, Matrix, Teams).
- ACP over stdio bridged to Gateway over WebSocket.
- MCP stdio server with channel bridge and permission mediation.
- OpenAI/OpenResponses HTTP compatibility endpoints.

Therefore this spec does **not** propose replacing core OpenClaw architecture; it proposes additive improvements that bring hermes-agent–caliber capabilities to OpenClaw's existing substrate.

---

## 4) Proposed Improvement Tracks for OpenClaw

### Track A — Session Intelligence (Priority: P0)

#### Problem
OpenClaw's session event journal is in-memory only. Sessions do not persist across process restarts, there is no full-text search across historical sessions, no trajectory compression for long conversations, no structured error classification for retry logic, no per-provider rate-limit tracking, and no credential rotation/recovery.

#### Proposal
Port hermes-agent's session persistence and resilience patterns to OpenClaw:

1. **Persistent session database** — SQLite backend with WAL mode and FTS5 full-text search. Schema includes sessions table (model, token counts, cost, provider, title metadata), messages table (content, tool metadata, reasoning columns), and FTS virtual table with triggers. Schema migration ladder with versioning.
2. **Trajectory compression** — Budget-aware middle-span summarization that preserves execution continuity. Replace selected conversation spans with synthetic summaries. Async fan-out with concurrency limiter for API summarization throughput. Metrics pipeline with per-trajectory and aggregate statistics.
3. **Error classifier** — Structured error taxonomy: transient vs permanent, rate-limit vs auth vs model vs network. Maps each error to a retry strategy (immediate retry, backoff, rotate credential, fail).
4. **Credential pool** — Multi-key rotation with automatic recovery on auth failure. Round-robin or priority-based key selection.
5. **Rate-limit tracker** — Per-provider monitoring with backoff coordination. Tracks remaining quota, reset timestamps, and throttle state.
6. **Smart model routing** — Task-based automatic model selection. Routes simple tasks to cheaper/faster models, complex tasks to capable models.
7. **Session search tool** — Cross-session knowledge retrieval via FTS5 exposed as an agent tool.
8. **Usage pricing** — Per-token cost attribution with model-specific pricing tables.

#### Hermes Source References
| Module | Key Functions/Classes | Purpose |
|--------|----------------------|---------|
| `hermes_state.py` | `SessionDB`, `create_session()`, `search_messages()`, `export_session()` | SQLite WAL + FTS5 session persistence |
| `trajectory_compressor.py` | `TrajectoryCompressor.compress_trajectory()`, `CompressionConfig` | Budget-aware conversation compression |
| `agent/error_classifier.py` | Error taxonomy, `classify_error()` | Structured retry decisions |
| `agent/credential_pool.py` | `CredentialPool`, rotation logic | Multi-key management |
| `agent/rate_limit_tracker.py` | `RateLimitTracker`, per-provider state | Quota monitoring + backoff |
| `agent/smart_model_routing.py` | Routing rules, task classification | Task→model selection |
| `agent/usage_pricing.py` | Pricing tables, cost calculation | Per-token cost attribution |
| `tools/session_search_tool.py` | `session_search` tool handler | Cross-session FTS retrieval |

#### OpenClaw Integration Targets
| Target File | Action |
|-------------|--------|
| `openclaw/src/agents/session-event-journal.ts` | Extend with persistent SQLite backend |
| `openclaw/src/agents/journal-integration.ts` | Wire persistence into run loop |
| `openclaw/src/agents/pi-embedded-runner/run.ts` | Add error classification, credential rotation, rate-limit awareness |
| `openclaw/src/config/types.openclaw.ts` | Add session persistence config section |
| New: `openclaw/src/agents/session-persistence.ts` | SQLite backend (better-sqlite3 or sql.js) |
| New: `openclaw/src/agents/trajectory-compressor.ts` | Port compression pipeline |
| New: `openclaw/src/agents/error-classifier.ts` | Structured error taxonomy |
| New: `openclaw/src/agents/smart-model-routing.ts` | Task→model routing |
| New: `openclaw/src/agents/rate-limit-tracker.ts` | Per-provider monitoring |
| New: `openclaw/src/agents/credential-pool.ts` | Multi-key rotation |

#### Outcomes
- Sessions survive process restarts with full message history and reasoning artifacts.
- Full-text search across all historical sessions.
- Automatic trajectory compression reduces token cost for long conversations.
- Structured retries prevent user-visible errors for transient API failures.
- Credential rotation prevents single-key exhaustion from blocking work.
- Smart routing optimizes cost/quality tradeoffs automatically.

#### Acceptance Criteria
- [ ] Session data persists across process restarts with <100ms restore latency.
- [ ] FTS search returns relevant results across 1000+ sessions.
- [ ] Trajectory compression reduces token count by ≥40% on conversations >50 turns.
- [ ] Error classifier correctly categorizes ≥95% of common API errors (401, 429, 500, timeout, network).
- [ ] Credential rotation triggers automatically on 401/429 without user intervention.
- [ ] Smart routing reduces average cost-per-task by ≥20% on mixed workloads.

#### TypeScript Adaptation Notes
- **SQLite**: Use `better-sqlite3` (synchronous, WAL-mode compatible) or `sql.js` (WASM, no native dependency). Both support WAL + FTS5.
- **Async compression fan-out**: Use `Promise.all` with `p-limit` concurrency limiter instead of Python `asyncio.Semaphore`.
- **Write contention**: Node.js single-threaded model makes `BEGIN IMMEDIATE` + retry simpler than Python's multiprocess approach.

---

### Track B — Security & Supply Chain (Priority: P0)

#### Problem
OpenClaw has a maturity-trust framework but lacks active security scanning of skills before installation, no OSV vulnerability checking for project dependencies, no URL safety validation before fetch operations, and no manifest-based skill synchronization that preserves user customizations.

#### Proposal
Port hermes-agent's supply-chain defense layer to OpenClaw:

1. **Skills security guard** — Static security scanner with 20+ threat pattern categories: data exfiltration (HTTP/DNS/webhook), prompt injection, destructive operations (rm -rf, DROP TABLE), persistence mechanisms, privilege escalation, code obfuscation, symlink escape, embedded binaries, oversized payloads. Trust-level policy matrix (bundled → auto-allow; community → scan + gate; agent-created → scan + ask). Produces `ScanResult` with trust level, verdict (allow/warn/block), findings list, and summary.
2. **Skills manifest sync** — Manifest-based 3-way reconciliation: compares bundled origin hash vs current user hash vs new bundled hash. Preserves user customizations, autopushes unchanged skills, and flags conflicts. Atomic manifest writes with v1→v2 migration support.
3. **URL safety checker** — Validates URLs before agent fetch operations. Blocks private-network addresses (RFC 1918, link-local, loopback), known-malicious domains, and URLs with suspicious patterns.
4. **OSV vulnerability scanner** — Queries OSV.dev API for known CVEs in project dependencies. Supports npm, PyPI, and other ecosystems.
5. **Credential file detection** — Identifies .env, .pem, .key, private key files, and common secret patterns in workspace before exposing to agent context.
6. **Path security hardening** — Prevents path traversal (../) and symlink escape attacks in file operations.

#### Hermes Source References
| Module | Key Functions/Classes | Purpose |
|--------|----------------------|---------|
| `tools/skills_guard.py` | `scan_skill()`, `should_allow_install()`, `THREAT_PATTERNS`, `Finding`, `ScanResult` | Threat pattern scanning |
| `tools/skills_sync.py` | `sync_skills()`, `_read_manifest()`, `_dir_hash()` | Manifest-based skill sync |
| `tools/url_safety.py` | URL validation functions | URL safety checking |
| `tools/osv_check.py` | OSV.dev API integration | Dependency vulnerability scanning |
| `tools/credential_files.py` | File pattern matchers | Secret file detection |
| `tools/path_security.py` | Path validation, symlink checks | Path traversal prevention |

#### OpenClaw Integration Targets
| Target File | Action |
|-------------|--------|
| `openclaw/src/agents/skills-install.ts` | Add pre-install security scanning gate |
| `openclaw/src/agents/skills.ts` | Add manifest-based sync for bundled skills |
| `openclaw/src/agents/maturity-trust.ts` | Extend trust model with scan verdicts |
| `openclaw/src/plugins/install.ts` | Add plugin security scanning |
| `openclaw/src/config/types.tools.ts` | Add security scanning config options |
| New: `openclaw/src/agents/skills-guard.ts` | Port threat pattern scanner |
| New: `openclaw/src/agents/skills-sync.ts` | Port manifest-based sync |
| New: `openclaw/src/agents/url-safety.ts` | URL validation service |
| New: `openclaw/src/agents/osv-check.ts` | OSV vulnerability scanner |
| New: `openclaw/src/agents/credential-detector.ts` | Secret file detection |
| New: `openclaw/src/agents/path-security.ts` | Path traversal prevention |

#### Outcomes
- Skills are scanned for malicious patterns before installation.
- Bundled skills update safely without losing user customizations.
- URLs are validated before agent fetch operations.
- Dependencies are checked against known vulnerability databases.
- Credential files are flagged before being exposed to agent context.
- Path traversal attacks are blocked at the file operation layer.

#### Acceptance Criteria
- [ ] Skills guard detects ≥90% of OWASP-classified injection patterns in test corpus.
- [ ] Skill sync preserves user modifications across 100% of bundled update cycles.
- [ ] URL safety blocks known-malicious URLs and all RFC 1918 / loopback / link-local addresses.
- [ ] OSV check reports known CVEs for project dependencies with ≤5s response time.
- [ ] Credential file detection flags .env, .pem, .key, and common secret file patterns.
- [ ] Path security blocks all `../` traversal and symlink escape attempts in tests.

---

### Track C — Developer Experience (Priority: P1)

#### Problem
OpenClaw lacks git worktree isolation for safe concurrent editing, has no provider-specific prompt caching optimization, no automatic context reference injection from project structure, no tool-level budget configuration, and no explicit clarification tool for user disambiguation.

#### Proposal
Port hermes-agent's developer experience patterns to OpenClaw:

1. **Git worktree isolation** — Creates isolated git worktrees for concurrent editing sessions. Each session gets its own branch/worktree, preventing conflicts between parallel agent sessions. Automatic cleanup on session end.
2. **Prompt caching** — Provider-specific cache optimization strategies. Anthropic: uses `cache_control` breakpoints for system prompt and recent context. OpenAI: uses `predicted_outputs` for edit-heavy workflows. Reduces redundant token transmission.
3. **Context references** — Automatic detection and injection of relevant project file references based on directory structure, file types, and naming conventions. Provides the agent with project awareness without manual specification.
4. **Subdirectory hints** — Directory structure navigation hints injected into agent context. Helps the agent understand project organization for file lookups.
5. **Budget configuration** — Per-tool and per-session cost budget limits. Tracks cumulative cost and halts execution when limits are exceeded.
6. **Clarify tool** — An agent-callable tool for explicitly requesting user clarification when the task is ambiguous, instead of guessing.
7. **Manual compression feedback** — User feedback loop for context compression decisions. Allows users to influence what gets compressed vs retained.
8. **Checkpoint manager** — Git-based checkpoint creation and rollback. Agent can create named checkpoints before risky operations and rollback if needed.

#### Hermes Source References
| Module | Key Functions/Classes | Purpose |
|--------|----------------------|---------|
| `cli.py` (lines ~674–773) | Worktree setup/cleanup | Git worktree isolation |
| `agent/prompt_caching.py` | Provider-specific cache strategies | Prompt cache optimization |
| `agent/context_references.py` | Reference detection/injection | Auto context references |
| `agent/subdirectory_hints.py` | Directory hint generation | Project structure awareness |
| `tools/budget_config.py` | Budget limits, cost tracking | Cost budget enforcement |
| `tools/clarify_tool.py` | `clarify` tool handler | User disambiguation |
| `agent/manual_compression_feedback.py` | Feedback loop | Compression control |
| `tools/checkpoint_manager.py` | Checkpoint create/rollback | Git-based checkpoints |

#### OpenClaw Integration Targets
| Target File | Action |
|-------------|--------|
| `openclaw/src/agents/pi-embedded-runner/run.ts` | Add worktree isolation, prompt caching, context references |
| `openclaw/src/agents/pi-tools.ts` | Add clarify tool, budget config |
| `openclaw/src/config/types.tools.ts` | Add budget limits per tool |
| New: `openclaw/src/agents/git-worktree.ts` | Worktree isolation manager |
| New: `openclaw/src/agents/prompt-caching.ts` | Provider-specific cache strategies |
| New: `openclaw/src/agents/context-references.ts` | Auto-reference injection |
| New: `openclaw/src/agents/budget-tracker.ts` | Cost budget enforcement |
| New: `openclaw/src/tools/checkpoint-manager.ts` | Git checkpoint/rollback |

#### Outcomes
- Concurrent editing sessions don't conflict via worktree isolation.
- Token costs reduced via provider-specific prompt caching.
- Agent automatically references relevant project files based on directory structure.
- Users can set per-tool and per-session cost budgets.
- Agent can explicitly ask for clarification instead of guessing.
- Git checkpoints enable safe rollback of agent-made changes.

#### Acceptance Criteria
- [ ] Git worktree creates and cleans up isolated branches without data loss.
- [ ] Prompt caching reduces redundant token usage by ≥30% for Anthropic provider.
- [ ] Context references correctly identify ≥80% of relevant files for a given task.
- [ ] Budget enforcement halts tool execution when cost limit is exceeded.
- [ ] Clarify tool is invoked when agent confidence is below configured threshold.
- [ ] Checkpoint rollback restores exact file state verified by `git diff`.

---

### Track D — Plugin Enhancements (Priority: P1)

#### Problem
OpenClaw's plugin system supports tool, channel, provider, hook, HTTP route, service, and CLI command registration. However, it lacks granular pre/post hooks for tool and LLM calls, context engine replacement, live message injection into active sessions, and plugin-managed toolset registration.

#### Proposal
Extend OpenClaw's plugin system with hermes-agent's finer-grained extension points:

1. **Pre/post tool hooks** — Plugins can intercept tool calls before execution (for validation, logging, modification) and after execution (for post-processing, telemetry, auditing). Hook bus with per-callback fault isolation prevents one plugin from crashing others.
2. **Pre/post LLM hooks** — Plugins can intercept LLM requests before sending (for prompt modification, caching, routing) and after receiving (for response filtering, cost tracking, quality scoring).
3. **Context engine replacement** — Plugins can register a custom context engine that replaces the default retrieval strategy. Enables specialized RAG, vector search, or domain-specific context assembly.
4. **Live message injection** — Plugins can inject messages into an active session's conversation. Enables real-time coordination, external event notification, and bridge integrations.
5. **Plugin-registered toolsets** — Plugins can register named toolsets that become first-class citizens in the toolset graph, composable with built-in toolsets.
6. **Plugin CLI management** — Full install/update/remove/enable/disable/toggle operations with manifest compatibility gating and secure name sanitization.

#### Hermes Source References
| Module | Key Functions/Classes | Purpose |
|--------|----------------------|---------|
| `hermes_cli/plugins.py` | `PluginContext`, `PluginManager`, `invoke_hook()` | Plugin lifecycle, hook bus |
| `hermes_cli/plugins_cmd.py` | `cmd_install()`, `cmd_update()`, `cmd_remove()`, `cmd_enable()`, `cmd_disable()` | Plugin CLI management |
| Hook names | `pre_tool_call`, `post_tool_call`, `pre_llm_call`, `post_llm_call`, `session_start`, `session_end`, `session_finalize`, `session_reset` | Hook taxonomy |

#### OpenClaw Integration Targets
| Target File | Action |
|-------------|--------|
| `openclaw/src/plugins/registry.ts` | Extend hook taxonomy with pre/post tool+LLM hooks |
| `openclaw/src/plugins/discovery.ts` | Add context engine replacement capability |
| `openclaw/src/plugin-sdk/` | Expose new hook types in public SDK |
| `openclaw/src/agents/pi-embedded-runner/run.ts` | Wire pre/post hooks into agent loop |
| `openclaw/src/gateway/server-methods/` | Add plugin management API methods |

#### Outcomes
- Plugins can observe and modify tool calls and LLM requests in flight.
- Plugins can replace the context engine for custom retrieval strategies.
- External systems can inject messages into active sessions for real-time coordination.
- Plugin lifecycle management is fully API-accessible.

#### Acceptance Criteria
- [ ] Pre/post tool hooks fire correctly for every tool invocation with <5ms overhead.
- [ ] Pre/post LLM hooks fire correctly for every LLM request with <5ms overhead.
- [ ] Context engine replacement correctly serves all existing retrieval queries.
- [ ] Message injection delivers content within the current turn's context window.
- [ ] Plugin install/update/remove operations are idempotent and crash-safe.
- [ ] Plugin-registered toolsets appear in toolset listing and compose with built-in sets.

---

### Track E — Advanced Tools (Priority: P2)

#### Problem
OpenClaw has core tools (messaging, sessions, subagents, cron, web fetch, images/PDF) but lacks full browser automation, multi-model consensus (Mixture of Agents), voice/TTS synthesis, audio transcription, image generation, background process notifications with watch patterns, and Home Assistant IoT integration.

#### Proposal
Port hermes-agent's advanced tool capabilities to OpenClaw:

1. **Browser automation suite** — 10 tools: `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_scroll`, `browser_back`, `browser_press`, `browser_get_images`, `browser_vision`, `browser_console`. Provider backend abstraction supports Browserbase (cloud), Firecrawl (extraction-focused), and browser-use (local Playwright).
2. **Mixture of Agents (MoA)** — Multi-model consensus via parallel delegation to different models, followed by synthesis. Improves answer quality for complex questions by combining diverse model perspectives.
3. **Voice/TTS tools** — Text-to-speech synthesis with multiple engine backends. Supports conversational voice output and accessibility use cases.
4. **Audio transcription** — Convert audio to text for processing by the agent.
5. **Image generation** — AI image generation tool for visual content creation.
6. **Background process monitor** — Tracks running background processes with watch patterns that trigger notifications on specific output matches.
7. **Home Assistant integration** — 4 IoT tools: `ha_list_entities`, `ha_get_state`, `ha_list_services`, `ha_call_service` for smart home control.

#### Hermes Source References
| Module | Key Functions/Classes | Purpose |
|--------|----------------------|---------|
| `tools/browser_tool.py` | 10 browser_* tool registrations | Browser automation |
| `tools/browser_providers/` | `base.py`, `browserbase.py`, `firecrawl.py`, `browser_use.py` | Provider backends |
| `tools/mixture_of_agents_tool.py` | MoA parallel delegation + synthesis | Multi-model consensus |
| `tools/tts_tool.py` | `text_to_speech` tool handler | Text-to-speech |
| `tools/voice_mode.py` | Voice interaction mode | Voice I/O |
| `tools/transcription_tools.py` | Audio transcription handler | Speech-to-text |
| `tools/image_generation_tool.py` | `image_generate` tool handler | Image generation |
| `tools/process_registry.py` | Background process tracking, watch patterns | Process monitoring |
| `tools/homeassistant_tool.py` | 4 HA tool handlers | IoT integration |

#### OpenClaw Integration Targets
| Target File | Action |
|-------------|--------|
| `openclaw/src/agents/pi-tools.ts` | Register new tool definitions |
| `openclaw/src/agents/tool-policy-pipeline.ts` | Add policy rules for new tools |
| `openclaw/src/agents/subagent-registry.ts` | Extend for MoA pattern |
| New: `openclaw/src/tools/browser-automation.ts` | Browser tool suite |
| New: `openclaw/src/tools/browser-providers/` | Provider backend abstraction |
| New: `openclaw/src/tools/mixture-of-agents.ts` | Multi-model consensus |
| New: `openclaw/src/tools/voice-tts.ts` | Text-to-speech |
| New: `openclaw/src/tools/checkpoint-manager.ts` | Git checkpoint/rollback |
| New: `openclaw/src/tools/process-monitor.ts` | Background process notifications |
| New: `openclaw/src/tools/homeassistant.ts` | Home Assistant integration |

#### Outcomes
- Agent can navigate, interact with, and extract data from web pages.
- Multi-model consensus improves answer quality for complex questions.
- Voice output expands accessibility and use cases.
- Background processes are monitored with automatic notifications.
- Smart home devices can be controlled through the agent.

#### Acceptance Criteria
- [ ] Browser tools can complete a 5-step web interaction flow end-to-end.
- [ ] MoA produces synthesized output from ≥3 models within 2x single-model latency.
- [ ] TTS generates audio output for text ≤5000 characters in <10s.
- [ ] Background process watch patterns trigger notifications within 1s of match.
- [ ] Home Assistant tools can list entities and call services on a configured instance.

---

### Track F — Gateway Platform Expansion (Priority: P2)

#### Problem
OpenClaw supports Telegram, Discord, Slack, Signal, iMessage/BlueBubbles, WhatsApp, Matrix, and Teams. Hermes adds several Chinese enterprise platforms (WeCom, DingTalk, Feishu, WeChat/Weixin) plus Mattermost, SMS, Email, and generic Webhook adapters. Hermes also provides gateway mirroring and multi-destination delivery routing.

#### Proposal
Add new gateway platform adapters and delivery capabilities to OpenClaw:

1. **WeCom (WeChat Work) adapter** — Enterprise messaging with message encryption/decryption via `wecom_crypto.py` and callback server via `wecom_callback.py`.
2. **DingTalk adapter** — DingTalk API integration for Chinese enterprise messaging.
3. **Feishu/Lark adapter** — Feishu (ByteDance/Lark) API integration.
4. **WeChat public account adapter** — WeChat official account messaging.
5. **Mattermost adapter** — Open-source Slack alternative.
6. **SMS adapter** — SMS messaging via configurable provider.
7. **Email adapter** — Email send/receive for agent interaction.
8. **Webhook adapter** — Generic HTTP webhook for arbitrary integrations.
9. **Gateway mirroring** — Cross-platform message relay between any two connected platforms.
10. **Multi-destination delivery** — Target parsing and dispatch for sending messages to multiple platforms simultaneously.

#### Hermes Source References
| Module | Purpose |
|--------|---------|
| `gateway/platforms/wecom.py` + `wecom_crypto.py` + `wecom_callback.py` | WeCom adapter with encryption |
| `gateway/platforms/dingtalk.py` | DingTalk adapter |
| `gateway/platforms/feishu.py` | Feishu/Lark adapter |
| `gateway/platforms/weixin.py` | WeChat public account adapter |
| `gateway/platforms/mattermost.py` | Mattermost adapter |
| `gateway/platforms/sms.py` | SMS adapter |
| `gateway/platforms/email.py` | Email adapter |
| `gateway/platforms/webhook.py` | Generic webhook adapter |
| `gateway/mirror.py` | Cross-platform message mirroring |
| `gateway/delivery.py` | Multi-destination delivery routing |

#### OpenClaw Integration Targets
| Target File | Action |
|-------------|--------|
| `openclaw/src/channels/` | Add new channel adapter modules |
| `openclaw/src/gateway/` | Add mirroring and delivery routing |
| `openclaw/src/config/types.openclaw.ts` | Add channel config for new platforms |
| `openclaw/extensions/` | Package adapters as extensions |

#### Outcomes
- OpenClaw gains access to Chinese enterprise market via WeCom/DingTalk/Feishu.
- Generic webhook adapter enables integration with any HTTP-capable system.
- Email and SMS adapters expand reach to non-chat platforms.
- Gateway mirroring enables cross-platform message relay.
- Multi-destination delivery routes messages to multiple platforms at once.

#### Acceptance Criteria
- [ ] Each new adapter sends and receives text messages in platform-specific format.
- [ ] WeCom adapter correctly handles message encryption/decryption.
- [ ] Webhook adapter accepts and responds to arbitrary HTTP POST payloads.
- [ ] Gateway mirroring relays messages between ≥2 platforms with <2s latency.
- [ ] Multi-destination delivery correctly routes to all specified targets.

#### Regulatory Note
Chinese platform adapters (WeCom, DingTalk, Feishu, WeChat) require region-specific API endpoints and may have compliance requirements for data residency. Implementation should support configurable API base URLs and document regulatory considerations.

---

### Track G — Training & Evaluation Pipeline (Priority: P3)

#### Problem
OpenClaw has no training, evaluation, or benchmark infrastructure. Hermes provides a complete ML-ops pipeline including RL training CLI, batch trajectory generation, toolset distribution sampling, SWE benchmark execution, multi-backend environment management, and model-specific tool-call parsing.

#### Proposal
Introduce training data generation and evaluation capabilities to OpenClaw:

1. **Batch runner** — Multiprocess prompt execution with JSONL checkpointing. Crash-resilient resume via checkpoint indices + content-based deduplication. Per-sample toolset stochasticity for training diversity. Bad-trajectory filtering by hallucinated tool names. Reasoning-coverage gating.
2. **Toolset distributions** — Independent Bernoulli inclusion per toolset for curriculum/domain shaping. Guaranteed non-empty fallback to highest-probability toolset.
3. **Trajectory format** — Hermes-compatible trajectory serialization (JSONL with `conversations` field, `from`/`value` turn schema, tool call metadata).
4. **SWE benchmark runner** — Lightweight single-tool agent loop for SWE trace generation with minimal overhead.
5. **Environment backends** — Execution backend abstraction: local, Docker, Modal, SSH, Daytona, Singularity. File sync between host and remote environments.
6. **Benchmark environments** — TerminalBench2, TBLite, YC-Bench with eval scripts and YAML configs.
7. **Tool-call parsers** — Model-specific parsers: DeepSeek v3/v3.1, Qwen/Qwen3-Coder, Llama, Mistral, GLM 4.5/4.7, Kimi K2, Hermes, LongCat.
8. **RL training CLI** — Dedicated RL persona runner with environment listing, tinker-atropos integration, and test-before-train workflow.

#### Hermes Source References
| Module | Key Functions/Classes | Purpose |
|--------|----------------------|---------|
| `batch_runner.py` | `BatchRunner.run()`, checkpointing, stats | Batch trajectory generation |
| `toolset_distributions.py` | `sample_toolsets_from_distribution()`, `DISTRIBUTIONS` | Training diversity |
| `mini_swe_runner.py` | `MiniSWERunner.run_task()`, trajectory format | SWE trace generation |
| `rl_cli.py` | `main()`, RL persona, env integration | RL training interface |
| `environments/hermes_base_env.py` | `HermesBaseEnv`, reward, steps, done | Environment base class |
| `environments/agent_loop.py` | Environment-aware agent loop | RL agent orchestration |
| `environments/tool_call_parsers/` | 10+ model-specific parsers | Tool-call extraction |
| `environments/benchmarks/` | TerminalBench2, TBLite, YC-Bench | Benchmark definitions |
| `tools/environments/` | local, Docker, Modal, SSH, Daytona, Singularity | Execution backends |

#### OpenClaw Integration Targets
| Target File | Action |
|-------------|--------|
| New: `openclaw/src/training/` | Entire training subsystem (new top-level module) |
| New: `openclaw/src/training/batch-runner.ts` | Batch trajectory generation |
| New: `openclaw/src/training/trajectory-format.ts` | Hermes-compatible serialization |
| New: `openclaw/src/training/toolset-distributions.ts` | Stochastic toolset sampling |
| New: `openclaw/src/training/environments/` | Environment backend abstractions |
| New: `openclaw/src/training/benchmarks/` | Benchmark environment adapters |
| New: `openclaw/src/training/tool-call-parsers/` | Model-specific parsing |
| New: `openclaw/src/training/rl-cli.ts` | RL training interface |

#### Outcomes
- OpenClaw can generate training data from agent interactions.
- Batch processing enables large-scale trajectory generation for model fine-tuning.
- Toolset distributions create diverse training samples.
- Benchmark environments enable systematic agent evaluation.
- Multi-backend environments support heterogeneous compute.

#### Acceptance Criteria
- [ ] Batch runner processes 100 prompts with crash-resilient checkpointing.
- [ ] Toolset distributions produce statistically diverse samples across 1000 runs.
- [ ] Trajectory format is interoperable with Hermes training pipeline.
- [ ] At least 3 environment backends (local, Docker, SSH) are functional.
- [ ] At least 1 benchmark environment produces scored evaluation results.

#### Implementation Note
This track is the most complex and requires a **separate design document** before implementation. It introduces a new top-level module (`training/`) and has minimal coupling with the existing agent runtime. Recommended approach: start with trajectory format and batch runner (data generation), defer RL CLI and benchmarks to a later phase.

#### TypeScript Adaptation Notes
- **Multiprocess batch**: Use Node.js `worker_threads` or `child_process.fork()` instead of Python `multiprocessing`.
- **JSONL streaming**: Use `readline` interface or streaming JSON parser.
- **Environment backends**: Docker via `dockerode`, SSH via `ssh2`, local via `child_process`.
- **Tool-call parsers**: Port regex-based parsers directly; model-specific XML/JSON extraction patterns are language-agnostic.

---

## 5) High-Impact First-Iteration Candidates

Based on impact-to-effort ratio and dependency analysis, the recommended first iteration scope:

1. **Session persistence with SQLite + FTS** (Track A) — Fills the biggest functional gap; immediate user-visible value.
2. **Skills security guard** (Track B) — Safety-critical; builds on existing maturity-trust framework.
3. **Error classifier + credential rotation** (Track A) — High reliability improvement; low coupling.
4. **Prompt caching** (Track C) — Direct cost reduction; provider-specific but isolated implementation.

These four deliver high operational and safety value without destabilizing existing loop/runtime design.

---

## 6) Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| SQLite in Node.js has different performance characteristics than Python | Session persistence may be slower | Benchmark `better-sqlite3` vs `sql.js`; use WAL mode; consider LevelDB as alternative |
| Browser automation adds large dependency surface | Package size bloat, security surface expansion | Make browser tools optional; lazy-load Playwright; use provider backends to externalize |
| Training pipeline is Python-ecosystem-heavy | Significant porting effort; tokenizer dependencies | Start with trajectory format only; keep Python training tools as external pipeline |
| Chinese platform APIs change frequently | Adapter maintenance burden | Use thin adapter pattern; abstract platform-specific logic; community-maintained |
| Plugin hook expansion may break existing plugins | Backward compatibility risk | Add hooks as opt-in; new hook names don't conflict with existing registration |
| Skill security scanning may have false positives | User friction on legitimate skills | Configurable severity thresholds; bypass with explicit `--force` flag |
| Context engine replacement allows unrestricted plugin behavior | Security risk from malicious plugins | Require explicit user confirmation for context engine replacement; sandbox plugin execution |

---

## 7) Proposed Delivery Phases

### Phase 1 — Foundation (P0: Session Intelligence + Security)

**Goal**: Persistent sessions and supply-chain security.

- Session persistence with SQLite backend
- Full-text session search
- Trajectory compression (basic)
- Skills security guard
- Skills manifest-based sync
- Error classifier
- Credential rotation
- URL safety checker

**Exit criteria**: All P0 acceptance criteria pass; no regressions in existing tests.

### Phase 2 — Experience (P1: Developer Experience + Plugin Enhancements)

**Goal**: Better daily-use experience and richer extensibility.

- Git worktree isolation
- Prompt caching (Anthropic + OpenAI)
- Context references auto-injection
- Pre/post tool and LLM hooks
- Context engine replacement API
- Budget configuration
- Clarify tool
- Plugin CLI management

**Exit criteria**: All P1 acceptance criteria pass; plugin SDK backward-compatible.

### Phase 3 — Capabilities (P2: Advanced Tools + Gateway Platforms)

**Goal**: Expanded tool surface and platform reach.

- Browser automation suite
- Mixture of Agents tool
- Voice/TTS tools
- Background process monitor
- WeCom, DingTalk, Feishu adapters
- Webhook, Email, SMS adapters
- Gateway mirroring

**Exit criteria**: All P2 acceptance criteria pass; new tools gated behind feature flags.

### Phase 4 — Training (P3: Training Pipeline)

**Goal**: Data generation and evaluation infrastructure.

- Trajectory format specification
- Batch runner
- Toolset distributions
- Environment backends (local, Docker, SSH)
- Benchmark adapter (1 benchmark)

**Exit criteria**: Separate design doc approved; batch runner processes 100 prompts end-to-end.

---

## 8) Success Metrics

| Metric | Target | Track |
|--------|--------|-------|
| Session restore latency | <100ms for 1000-message session | A |
| FTS search precision | ≥90% relevance in top-5 results | A |
| Trajectory compression ratio | ≥40% token reduction on 50+ turn conversations | A |
| Skills guard detection rate | ≥90% on OWASP test corpus | B |
| Prompt cache hit rate | ≥60% for repeat interactions (Anthropic) | C |
| Plugin hook overhead | <5ms per hook invocation | D |
| Browser tool success rate | ≥85% on standard web interaction flows | E |
| MoA latency multiplier | ≤2x single-model baseline | E |
| Batch throughput | ≥10 trajectories/minute on 4-core machine | G |

---

## 9) Deliverables (Spec Cycle)

1. **This specification document** — `SPEC_OPENCLOW_IMPROVEMENTS_FROM_HERMES_AGENT_ANALYSIS.md`
2. **Technical reference** (follow-up) — `HERMES_OPENCLAW_TECHNICAL_REFERENCE.md` with type definitions, function signatures, and integration wiring.
3. **Execution plan** (follow-up) — `HERMES_OPENCLAW_EXECUTION_PLANS.md` with file-by-file checklists, commit breakdown, and test plans.
4. **ADRs** — One per track for schema-level decisions:
   - ADR: Session persistence schema and SQLite configuration.
   - ADR: Skills security scanning threat pattern taxonomy.
   - ADR: Plugin hook taxonomy and SDK extension.
   - ADR: Browser automation provider backend abstraction.
   - ADR: Gateway adapter pattern for Chinese enterprise platforms.
   - ADR: Training trajectory format specification.
   - ADR: Prompt caching strategy per provider.
5. **Test suites** — Per-track acceptance test files.
6. **Contributor guide** — For adding new tools, adapters, and security patterns.

---

## 10) Constraint Reminder

- **Plan/spec only** — This document does not include code modifications.
- **Additive/non-breaking** — All proposals extend existing behavior without modifying it.
- **Cross-references** — Builds on prior work in `SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2.md`; assumes Tracks A–G from that spec are implemented or in progress.
- **Language boundary** — Hermes is Python; OpenClaw is TypeScript. All adaptations must account for ecosystem differences (SQLite libraries, async patterns, process models).
- **Hermes source paths** — All references are relative to `hermes-agent/` directory in the workspace.
- **OpenClaw target paths** — All references are relative to `openclaw/` directory in the workspace.
