# Hermes → OpenClaw Architectural Decision Records

> Seven ADRs — one per schema-level decision as specified in SPEC §9 item #4.

---

## Table of Contents

1. [ADR-001: Session Persistence Schema and SQLite Configuration](#adr-001-session-persistence-schema-and-sqlite-configuration)
2. [ADR-002: Skills Security Scanning Threat Pattern Taxonomy](#adr-002-skills-security-scanning-threat-pattern-taxonomy)
3. [ADR-003: Plugin Hook Taxonomy and SDK Extension](#adr-003-plugin-hook-taxonomy-and-sdk-extension)
4. [ADR-004: Browser Automation Provider Backend Abstraction](#adr-004-browser-automation-provider-backend-abstraction)
5. [ADR-005: Gateway Adapter Pattern for Chinese Enterprise Platforms](#adr-005-gateway-adapter-pattern-for-chinese-enterprise-platforms)
6. [ADR-006: Training Trajectory Format Specification](#adr-006-training-trajectory-format-specification)
7. [ADR-007: Prompt Caching Strategy Per Provider](#adr-007-prompt-caching-strategy-per-provider)

---

## ADR-001: Session Persistence Schema and SQLite Configuration

**Status:** Accepted  
**Date:** 2026-04-10  
**Track:** A — Session Intelligence  
**Module:** `src/agents/session-persistence.ts`

### Context

OpenClaw sessions are ephemeral — conversation history is lost on process exit. Hermes-agent persists every session and message in SQLite, enabling trajectory export, session search, and cost analytics. We need a persistence layer that:

1. Works in single-process CLI and multi-process server modes.
2. Does not add a hard runtime dependency (SQLite may not be available in all environments).
3. Supports full-text search across message content.
4. Allows future migration to other backends (PostgreSQL, DuckDB).

### Decision

**Use an injectable `SqliteDatabase` interface passed as a factory parameter to `openSessionDatabase()`.**

Schema:

- **`sessions`** table: `id TEXT PK`, `source`, `userId`, `agentId`, `model`, `parentSessionId`, `startedAt INTEGER`, `endedAt`, `endReason`, `messageCount`, `toolCallCount`, `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `estimatedCostUsd`, `title`.
- **`messages`** table: `id INTEGER PK AUTOINCREMENT`, `sessionId TEXT FK`, `role`, `content`, `toolCallId`, `toolCalls`, `toolName`, `timestamp INTEGER`, `tokenCount`, `finishReason`, `reasoning`.
- **`messages_fts`** virtual table: FTS5 on `content` and `role`, content-synced to `messages`.

SQLite configuration: WAL mode enabled by default (`walMode: true`), `journal_mode = WAL`, `synchronous = NORMAL`, `foreign_keys = ON`.

### Alternatives Considered

| Alternative | Rejected because |
|---|---|
| Hard `import` of `better-sqlite3` | Breaks environments without native addons (Termux, Cloudflare Workers) |
| JSON-file-per-session | No full-text search, no relational queries, O(n) session listing |
| IndexedDB (browser-only) | OpenClaw is primarily CLI/server; not available in Node.js without polyfill |
| Abstract `DatabaseProvider` with SQLite + Postgres | Over-engineering for current scope; injectable factory already allows swapping |

### Consequences

- **Positive:** Zero-dependency at import time; testable with in-memory mock; FTS5 enables `searchMessages()` without external search engine.
- **Negative:** Consumers must provide a `(dbPath: string) => SqliteDatabase` factory, adding one line of wiring.
- **Risks:** FTS5 not available in all SQLite builds — mitigated by graceful degradation (the module creates the FTS table in a try/catch).

---

## ADR-002: Skills Security Scanning Threat Pattern Taxonomy

**Status:** Accepted  
**Date:** 2026-04-10  
**Track:** B — Supply Chain Security  
**Module:** `src/agents/skills-guard.ts`

### Context

Agent skills are user-contributed code packages that run with the agent's permissions. Hermes uses a trust-level system but lacks deep content scanning. OpenClaw needs:

1. A threat taxonomy aligned with OWASP/MITRE ATT&CK categories.
2. Pattern-based scanning that works without executing skill code.
3. A trust-level system that gates installation decisions.
4. A verdict system that can be enforced or advisory.

### Decision

**12-category threat taxonomy with 4 severity levels and 3 trust tiers.**

Threat categories:
`exfiltration`, `injection`, `destructive`, `persistence`, `network`, `obfuscation`, `execution`, `traversal`, `mining`, `supply_chain`, `privilege_escalation`, `credential_exposure`.

Severity levels: `critical`, `high`, `medium`, `low`.

Trust levels: `builtin` (shipped with OpenClaw), `trusted` (verified publisher), `community` (unverified), `agent_created` (generated at runtime).

Verdicts: `safe` (no findings), `caution` (low/medium findings, install allowed with warning), `dangerous` (high/critical findings, install blocked unless `--force`).

Scanning approach: Regex pattern matching on file content — no AST parsing, no execution. Each pattern has an `id`, `severity`, `category`, `description`, and a regex. Matches include file path, line number, and matched text.

### Alternatives Considered

| Alternative | Rejected because |
|---|---|
| AST-based analysis (Semgrep, ESLint) | Requires language-specific parsers; skills can be any language |
| Sandbox execution + behavioral analysis | Too heavyweight for installation gate; useful as a later enhancement |
| Allowlist-only (no scanning) | Insufficient for community skills; no protection against supply chain attacks |
| ML-based classifier | Requires training data; regex patterns are auditable and deterministic |

### Consequences

- **Positive:** Deterministic, auditable, no external dependencies; `contentHash()` enables change detection.
- **Negative:** Regex patterns have false positives (e.g., `curl` in documentation); `shouldAllowInstall()` has a `force` override.
- **Risks:** Novel attack patterns not covered by the 12 categories — mitigated by making the pattern list extensible.

---

## ADR-003: Plugin Hook Taxonomy and SDK Extension

**Status:** Accepted  
**Date:** 2026-04-10  
**Track:** D — Plugin Enhancements  
**Modules:** `src/agents/plugin-hooks.ts`, `src/agents/plugin-context-engine.ts`, `src/agents/plugin-message-injection.ts`

### Context

OpenClaw has a nascent plugin system. Hermes provides a richer extensibility model with lifecycle hooks, context injection, and message augmentation. We need:

1. A hook taxonomy that covers the full agent lifecycle.
2. Fault isolation — a buggy plugin must not crash the agent.
3. Priority ordering — multiple plugins on the same hook execute in deterministic order.
4. A way for plugins to inject context and messages into the conversation.

### Decision

**8-point hook taxonomy with per-callback try/catch and configurable timeouts.**

Hook names (in lifecycle order):
1. `session_start` — session begins
2. `pre_llm_call` — before each LLM request
3. `post_llm_call` — after each LLM response
4. `pre_tool_call` — before each tool execution
5. `post_tool_call` — after each tool execution
6. `session_end` — session ends normally
7. `session_finalize` — cleanup regardless of end reason
8. `session_reset` — session state cleared

Each registration carries: `pluginId`, `hookName`, `priority` (lower = first), `callback`, `timeoutMs`.

**Supplementary systems:**
- `PluginToolsetRegistry` — plugins can register custom tool definitions.
- `ContextEngineRegistry` — exactly one active context engine (last-registered wins); built-in `FileContextEngine` as default.
- `MessageInjector` — priority-sorted queue with `interrupt` flag for urgent messages; `drain()` empties queue, `drainInterrupts()` returns only interrupt-flagged messages.

### Alternatives Considered

| Alternative | Rejected because |
|---|---|
| EventEmitter-based hooks | No priority ordering, no timeout enforcement, no per-plugin fault isolation |
| Middleware chain (Express-style) | No `next()` — hooks are notification-based, not request/response |
| Single `onMessage`/`onTool` callback | Insufficient granularity for pre/post patterns |
| Plugin sandboxing (VM/Worker) | Over-engineering; trust boundary is at skill level, not plugin level |

### Consequences

- **Positive:** Plugins cannot crash the agent; deterministic execution order; stats tracking per hook.
- **Negative:** Async hooks add latency proportional to callback count; no cancellation (hooks are fire-and-forget).
- **Risks:** Malicious plugins can stall via long-running callbacks — mitigated by per-callback `timeoutMs` with default.

---

## ADR-004: Browser Automation Provider Backend Abstraction

**Status:** Accepted  
**Date:** 2026-04-11  
**Track:** E — Advanced Tools  
**Module:** `src/tools/browser-automation.ts`

### Context

Hermes supports browser-use through direct Playwright integration. OpenClaw needs browser capabilities for web research, form filling, and visual inspection, but:

1. Playwright is a 100+ MB dependency not appropriate for all deployments.
2. Cloud browser backends (Browserbase, Firecrawl) offer serverless alternatives.
3. The `browser-use` Python package provides a high-level AI-native interface.
4. Tool definitions must be stable regardless of backend.

### Decision

**`BrowserProvider` interface with 4 known kinds; `BrowserSessionManager` orchestrates sessions via a provider factory.**

Provider kinds: `local` (Playwright), `browserbase` (cloud), `firecrawl` (scraper-optimised), `browser-use` (AI-native).

Interface contract — every provider implements:
`createSession`, `closeSession`, `navigate`, `snapshot`, `click`, `type`, `scroll`, `back`, `pressKey`, `getImages`, `describeVisual`, `getConsole`.

Tool definitions are static (returned by `getBrowserToolDefinitions()`); the manager resolves the active provider at session creation time. Provider selection is config-driven (`BrowserAutomationConfig.provider`).

The provider factory is injected: `(kind: BrowserProviderKind) => BrowserProvider`. This allows the host to supply concrete implementations without the module importing any browser library.

### Alternatives Considered

| Alternative | Rejected because |
|---|---|
| Direct Playwright import | Hard dependency; breaks serverless/container-minimal deployments |
| CDP (Chrome DevTools Protocol) only | Lower-level than needed; doesn't cover cloud backends |
| Separate tool files per provider | Tool names would differ; agents would need provider-aware prompts |
| WebDriver/Selenium | Outdated; no vision capabilities; poor async support |

### Consequences

- **Positive:** Zero browser dependencies at import time; swappable backends; single set of tool definitions for all providers.
- **Negative:** Lowest-common-denominator API — provider-specific features (e.g., Browserbase recording) not exposed in base interface.
- **Risks:** Provider API drift — mitigated by version-pinning in config and adapter pattern allowing per-provider mapping.

---

## ADR-005: Gateway Adapter Pattern for Chinese Enterprise Platforms

**Status:** Accepted  
**Date:** 2026-04-11  
**Track:** F — Gateway Platforms  
**Modules:** `src/channels/adapters/wecom.ts`, `src/channels/adapters/dingtalk.ts`, `src/channels/adapters/feishu.ts`

### Context

Hermes supports WeCom, DingTalk, and Feishu as message gateways. These platforms share a common pattern:

1. Token management (access tokens with TTL refresh).
2. Message encryption/signing (AES-CBC for WeCom, HMAC-SHA256 for DingTalk, SHA256 for Feishu).
3. Inbound webhook/callback parsing.
4. Outbound message sending (text, markdown, cards).

But their APIs, auth flows, and payload formats are entirely different.

### Decision

**Per-platform adapter modules with injectable HTTP and crypto providers; shared structural conventions but no shared base class.**

Each adapter exports:
- A **token manager** factory (for platforms that use access tokens): `createWeComTokenManager()`, `createFeishuTokenManager()`.
- A **crypto/signing** helper: `createWeComCrypto()`, `generateDingTalkSignature()`, `verifyFeishuCallback()`.
- A **client** factory: `createWeComClient()`, `createDingTalkClient()`, `createFeishuClient()`.
- Type-safe inbound message parsing: `parseInboundMessage()` / `parseInboundEvent()`.

All HTTP calls go through injectable clients (`WeComHttpClient`, `DingTalkHttpClient`, `FeishuHttpClient`) — typed interfaces with a single `post()` method. No `fetch` or `axios` at module scope.

Crypto operations use injectable providers where available (WeCom `CryptoProvider`); DingTalk and Feishu use HMAC computation that can be provided by the host.

### Alternatives Considered

| Alternative | Rejected because |
|---|---|
| Shared `GatewayAdapter` base class | APIs too different; abstract methods would be mostly platform-specific |
| Single `createGatewayAdapter(platform)` factory | Forces all platforms into one type signature; loses per-platform type safety |
| Direct `node:crypto` imports | Breaks non-Node environments; prevents testing without mocks |
| Third-party SDKs (`wechatwork-sdk`, `dingtalk-sdk`) | Adds dependency weight; SDKs often lag behind API changes |

### Consequences

- **Positive:** Each adapter is self-contained and independently testable; full TypeScript type safety per platform.
- **Negative:** Some code duplication (token refresh logic); no polymorphic `GatewayAdapter` for generic routing.
- **Risks:** API changes by platform vendors — mitigated by adapter pattern isolating change surface.

---

## ADR-006: Training Trajectory Format Specification

**Status:** Accepted  
**Date:** 2026-04-11  
**Track:** G — Training & Evaluation Pipeline  
**Module:** `src/training/trajectory-format.ts`

### Context

Hermes uses a specific JSONL format for training trajectories:

```json
{
  "id": "...",
  "prompt": "...",
  "conversations": [{ "turns": [{ "from": "human", "value": "..." }] }],
  "model": "...",
  "toolsets": [...],
  "toolStats": {...},
  "reasoningStats": {...}
}
```

OpenClaw session messages use a different format (`role: user/assistant/tool`). We need bidirectional conversion and quality filtering.

### Decision

**Adopt the Hermes trajectory format as-is for interoperability; provide conversion utilities.**

Role mapping: `user` → `human`, `assistant` → `gpt`, `tool` → `tool`, `system` → `system`.

Key utilities:
- `messagesToTrajectoryTurns()` — converts OpenClaw messages to Hermes turns.
- `extractToolStats()` / `extractReasoningStats()` — derives metadata from turn content.
- `readTrajectoryJsonl()` — async generator for streaming large files.
- `createTrajectoryWriter()` — append-only JSONL writer.
- `filterBadTrajectories()` — removes records with empty conversations, no human turns, or only system turns.
- `validateTrajectoryRecord()` — runtime type validation for untrusted JSONL input.

### Alternatives Considered

| Alternative | Rejected because |
|---|---|
| Custom OpenClaw format | Loses Hermes ecosystem compatibility; no benefit over established format |
| OpenAI fine-tuning format (`messages` array) | Loses tool statistics and multi-conversation structure |
| Parquet/Arrow storage | Requires additional dependencies; JSONL is streamable and human-readable |
| Protocol Buffers | Over-engineering for sequential write/read pattern |

### Consequences

- **Positive:** Direct compatibility with Hermes training tools; streaming I/O for large datasets; quality filtering prevents bad data from entering training.
- **Negative:** Hermes `from` field uses non-standard role names (`gpt` instead of `assistant`); conversion required at boundary.
- **Risks:** Format evolution in Hermes — mitigated by `validateTrajectoryRecord()` catching unknown shapes.

---

## ADR-007: Prompt Caching Strategy Per Provider

**Status:** Accepted  
**Date:** 2026-04-10  
**Track:** C — Developer Experience  
**Module:** `src/agents/prompt-caching.ts`

### Context

LLM providers offer different caching mechanisms:
- **Anthropic:** Explicit `cache_control: { type: "ephemeral" }` breakpoints on message content blocks. Up to 4 breakpoints per request. Cache hit rate depends on prefix stability.
- **OpenAI:** `predicted_outputs` for output caching; automatic prefix caching (no explicit API).
- **Other providers:** No standardised caching API.

Hermes applies caching annotations to system prompts and long context. OpenClaw should do the same transparently.

### Decision

**Provider-detection + per-provider annotation strategy with metrics tracking.**

Three providers: `anthropic`, `openai`, `generic`.

- **Anthropic strategy:** Insert `cache_control` breakpoints on the system message and the longest user messages (up to `maxBreakpoints`, default 4). Only annotate messages exceeding `minBlockTokens` (default 1024).
- **OpenAI strategy:** No-op on message annotation (caching is automatic); metrics tracked for reporting.
- **Generic strategy:** Pass-through with no modifications.

Provider detection: `detectCacheProvider()` maps provider name strings (`"anthropic"`, `"claude"` → `anthropic`; `"openai"`, `"gpt"` → `openai`; else → `generic`).

Metrics: `CacheMetrics` tracks `totalCalls`, `breakpointsApplied`, and `byProvider` counters. Immutable — `recordCacheApplication()` returns a new `CacheMetrics` object.

### Alternatives Considered

| Alternative | Rejected because |
|---|---|
| Always apply Anthropic-style breakpoints | Breaks non-Anthropic providers that don't expect `cache_control` |
| External caching layer (Redis/Memcached) | Different problem — this is about provider-native prefix caching, not response caching |
| KV-cache management in OpenClaw | Too low-level; providers manage their own KV caches |
| No caching support | Misses 50-90% cost reduction on long conversations |

### Consequences

- **Positive:** Transparent caching for Anthropic users; no-op for others; metrics enable cost-savings reporting.
- **Negative:** Only 3 providers supported; new providers require a new strategy branch.
- **Risks:** Anthropic API changes to cache_control format — mitigated by centralising annotation logic in one function.

---

## ADR Index

| ADR | Track | Key Decision |
|-----|-------|-------------|
| 001 | A | Injectable SQLite with FTS5; WAL mode; `SqliteDatabase` interface |
| 002 | B | 12-category threat taxonomy; regex scanning; 3-tier trust levels |
| 003 | D | 8-point hook lifecycle; per-callback fault isolation; context engine registry |
| 004 | E | `BrowserProvider` interface; 4 backends; injected provider factory |
| 005 | F | Per-platform adapters; injectable HTTP/crypto; no shared base class |
| 006 | G | Hermes JSONL format adopted; role mapping; streaming I/O; quality filtering |
| 007 | C | Provider-detected caching; Anthropic breakpoints; immutable metrics |
