# Hermes → OpenClaw Technical Reference

> Auto-generated from the implemented modules. Covers all 7 tracks (A–G) across 54+ source files.
> Companion to `SPEC_OPENCLOW_IMPROVEMENTS_FROM_HERMES_AGENT_ANALYSIS.md`.

---

## Table of Contents

1. [Track A — Session Intelligence](#track-a--session-intelligence)
2. [Track B — Supply Chain Security](#track-b--supply-chain-security)
3. [Track C — Developer Experience](#track-c--developer-experience)
4. [Track D — Plugin Enhancements](#track-d--plugin-enhancements)
5. [Track E — Advanced Tools](#track-e--advanced-tools)
6. [Track F — Gateway Platforms](#track-f--gateway-platforms)
7. [Track G — Training & Evaluation Pipeline](#track-g--training--evaluation-pipeline)
8. [Configuration Types](#configuration-types)
9. [Journal Integration](#journal-integration)
10. [Module Dependency Graph](#module-dependency-graph)

---

## Track A — Session Intelligence

### `src/agents/error-classifier.ts`

Structured API error classifier. Drives retry decisions, credential rotation, model fallback, and context compression.

```ts
type FailoverReason =
  | "auth" | "auth_permanent" | "billing" | "rate_limit" | "overloaded"
  | "server_error" | "timeout" | "context_overflow" | "payload_too_large"
  | "model_not_found" | "format_error" | "content_filter" | "unknown";

type ClassifiedError = {
  reason: FailoverReason;
  statusCode: number | undefined;
  provider: string;
  model: string;
  message: string;
  retryable: boolean;
  shouldCompress: boolean;
  shouldRotateCredential: boolean;
  shouldFallback: boolean;
  cooldownMs: number;
};

type ClassifyErrorParams = {
  error: unknown;
  provider: string;
  model: string;
  approxTokens?: number;
  contextLength?: number;
};

function classifyApiError(params: ClassifyErrorParams): ClassifiedError
function formatClassifiedError(classified: ClassifiedError): string
function classifiedErrorSummary(classified: ClassifiedError): Record<string, unknown>
```

**Priority pipeline:** HTTP status → transport error code → message pattern matching → unknown fallback.

### `src/agents/credential-pool.ts`

Round-robin / least-used credential rotation with automatic exhaustion tracking.

```ts
type SelectionStrategy = "fill_first" | "round_robin" | "random" | "least_used";

type PooledCredential = {
  id: string;
  provider: string;
  label?: string;
  priority: number;
  source: string;
  status: CredentialStatus;
  lastErrorCode?: number;
  lastErrorMessage?: string;
  lastErrorAt?: number;
  exhaustedUntil?: number;
  requestCount: number;
  lastUsedAt?: number;
};

type CredentialPoolOptions = {
  provider: string;
  strategy?: SelectionStrategy;
};

function formatCredentialPoolStatus(pool: CredentialPool): string
```

### `src/agents/rate-limit-tracker.ts`

Parses provider-specific rate-limit headers into normalised buckets.

```ts
type RateLimitBucket = {
  limit: number;
  remaining: number;
  resetSeconds: number;
  capturedAt: number;
};

type RateLimitState = {
  provider: string;
  requestsPerMinute?: RateLimitBucket;
  requestsPerHour?: RateLimitBucket;
  tokensPerMinute?: RateLimitBucket;
  tokensPerHour?: RateLimitBucket;
  capturedAt: number;
};

function bucketUsed(bucket: RateLimitBucket): number
function bucketUsagePct(bucket: RateLimitBucket): number
function bucketRemainingSecondsNow(bucket: RateLimitBucket): number
function hasRateLimitData(state: RateLimitState): boolean
function rateLimitAgeSeconds(state: RateLimitState): number
function parseRateLimitHeaders(
  headers: Record<string, string | string[] | undefined>,
  provider: string,
): RateLimitState | undefined
function formatRateLimitDisplay(state: RateLimitState): string
function formatRateLimitCompact(state: RateLimitState): string
```

### `src/agents/session-persistence.ts`

SQLite-backed session and message persistence with full-text search.

```ts
type SessionRecord = {
  id: string; source: string; userId?: string; agentId?: string;
  model?: string; parentSessionId?: string;
  startedAt: number; endedAt?: number; endReason?: string;
  messageCount: number; toolCallCount: number;
  inputTokens: number; outputTokens: number;
  cacheReadTokens: number; cacheWriteTokens: number;
  estimatedCostUsd?: number; title?: string;
};

type MessageRecord = {
  id?: number; sessionId: string; role: string; content?: string;
  toolCallId?: string; toolCalls?: string; toolName?: string;
  timestamp: number; tokenCount?: number; finishReason?: string;
  reasoning?: string;
};

type SessionSearchResult = {
  sessionId: string; messageId: number; role: string;
  content: string; timestamp: number; rank: number;
};

type SessionPersistenceConfig = { dbPath: string; walMode?: boolean };

// Injectable — no dependency on better-sqlite3 at import time
type SqliteDatabase = {
  pragma(source: string): unknown;
  exec(source: string): void;
  prepare(source: string): SqliteStatement;
  close(): void;
};

function openSessionDatabase(
  config: SessionPersistenceConfig,
  factory: (dbPath: string) => SqliteDatabase,
): SessionPersistenceStore
```

### `src/agents/trajectory-compressor.ts`

Conversation trajectory summarisation with turn protection and injectable summariser.

```ts
type ConversationTurn = {
  role: string; content: string;
  toolCallId?: string; toolName?: string; tokenCount?: number;
};

type CompressionConfig = {
  targetMaxTokens: number; summaryTargetTokens: number;
  protectFirstSystem: boolean; protectFirstHuman: boolean;
  protectFirstAssistant: boolean; protectFirstTool: boolean;
  protectLastNTurns: number;
  addSummaryNotice: boolean; summaryNoticeText: string;
  maxConcurrentRequests: number; skipUnderTarget: boolean;
};

type CompressionResult = {
  originalTokens: number; compressedTokens: number; reductionPct: number;
  turnsRemoved: number; summaryInserted: boolean;
  compressed: ConversationTurn[];
};

type CompressionMetrics = {
  totalProcessed: number; totalSkipped: number; totalCompressed: number;
  averageReduction: number; minReduction: number; maxReduction: number;
};

type TokenCounter = (text: string) => number;
type SummarizeFn = (turns: ConversationTurn[], targetTokens: number) => Promise<string>;

async function compressTrajectory(
  turns: ConversationTurn[],
  summarize: SummarizeFn,
  config?: Partial<CompressionConfig>,
  tokenCounter?: TokenCounter,
): Promise<CompressionResult>

function aggregateCompressionMetrics(results: CompressionResult[]): CompressionMetrics
```

### `src/agents/smart-model-routing.ts`

Task-complexity-aware model selection with cost estimation.

```ts
type TaskComplexity = "trivial" | "simple" | "moderate" | "complex" | "expert";
type ModelTier = "fast" | "standard" | "capable" | "premium";

type ModelCapability = {
  modelId: string; provider: string; tier: ModelTier;
  contextWindow: number; costPer1kInput: number; costPer1kOutput: number;
  supportsTools: boolean; supportsVision: boolean; supportsReasoning: boolean;
  maxOutputTokens?: number;
};

type TaskContext = {
  taskDescription: string; contextTokens: number; fileCount: number;
  expectedToolCalls: number; hasImages: boolean;
  conversationTurns: number; previousErrors: number;
};

type RoutingDecision = {
  selectedModel: string; selectedProvider: string; tier: ModelTier;
  reason: string; complexityScore: TaskComplexity; estimatedCost: number;
  alternatives: Array<{ modelId: string; reason: string }>;
};

type SmartModelRouterConfig = {
  models: ModelCapability[];
  forceModel?: string;
  maxCostPerRequest?: number;
  requireToolSupport?: boolean;
};

function routeTask(context: TaskContext, config: SmartModelRouterConfig): RoutingDecision
function formatRoutingDecision(decision: RoutingDecision): string
```

---

## Track B — Supply Chain Security

### `src/agents/skills-guard.ts`

OWASP-informed skill content scanner with threat taxonomy.

```ts
type FindingSeverity = "critical" | "high" | "medium" | "low";

type ThreatCategory =
  | "exfiltration" | "injection" | "destructive" | "persistence"
  | "network" | "obfuscation" | "execution" | "traversal"
  | "mining" | "supply_chain" | "privilege_escalation" | "credential_exposure";

type Finding = {
  patternId: string; severity: FindingSeverity; category: ThreatCategory;
  file: string; line: number; match: string; description: string;
};

type TrustLevel = "builtin" | "trusted" | "community" | "agent_created";
type ScanVerdict = "safe" | "caution" | "dangerous";

type ScanResult = {
  skillName: string; source: string; trustLevel: TrustLevel;
  verdict: ScanVerdict; findings: Finding[];
  scannedAt: string; summary: string;
  fileCount: number; totalSizeBytes: number;
};

function scanSkill(skillPath: string, skillName: string, source?: string): ScanResult
function shouldAllowInstall(result: ScanResult, force?: boolean):
  { allowed: boolean; decision: InstallDecision; reason: string }
function contentHash(skillPath: string): string
function formatScanReport(result: ScanResult): string
```

### `src/agents/skills-sync.ts`

Manifest-driven bundled skill synchronisation with user-modification detection.

```ts
type ManifestEntry = { name: string; hash: string };
type SyncResult = {
  copied: number; updated: number; skipped: number;
  userModified: number; cleaned: number; totalBundled: number;
  errors: string[];
};

function readManifest(skillsDir: string): Map<string, string>
function writeManifest(skillsDir: string, entries: Map<string, string>): void
function dirHash(directory: string): string
function syncSkills(bundledDir: string, targetDir: string, quiet?: boolean): SyncResult
function formatSyncReport(result: SyncResult): string
```

### `src/agents/url-safety.ts`

URL validation with SSRF protection (private IP, localhost, dangerous schemes).

```ts
type UrlSafetyResult = { safe: boolean; reason?: string };

function validateUrlStructure(urlString: string): UrlSafetyResult
async function isUrlSafe(urlString: string): Promise<UrlSafetyResult>
async function filterSafeUrls(urls: string[]): Promise<Array<{ url: string; result: UrlSafetyResult }>>
```

### `src/agents/path-security.ts`

Path traversal detection, directory jail enforcement, sensitive file detection.

```ts
type PathSecurityResult = { safe: boolean; reason?: string };

function hasTraversalComponent(pathStr: string): boolean
function validateWithinDir(targetPath: string, rootDir: string): string | undefined
function validatePath(targetPath: string, rootDir: string): PathSecurityResult
function validatePaths(paths: string[], rootDir: string): Array<{ path: string; result: PathSecurityResult }>
function isSensitiveFile(filePath: string): boolean
function findSensitiveFiles(dirPath: string, options?: { maxDepth?: number }): string[]
```

---

## Track C — Developer Experience

### `src/agents/git-worktree.ts`

Git worktree isolation for concurrent agent sessions.

```ts
type WorktreeInfo = { path: string; branch: string; repoRoot: string; sessionId: string };

type WorktreeConfig = {
  enabled: boolean; worktreeDir: string; branchPrefix: string;
  gitTimeoutMs: number; maxConcurrent: number;
};

type WorktreeResult<T> = { ok: true; value: T } | { ok: false; error: string };

async function findRepoRoot(cwd: string, timeoutMs?: number): Promise<string | undefined>
async function setupWorktree(repoRoot: string, config?: WorktreeConfig): Promise<WorktreeResult<WorktreeInfo>>
async function cleanupWorktree(info: WorktreeInfo, config?: WorktreeConfig): Promise<WorktreeResult<{ removed: boolean; reason: string }>>
async function listWorktrees(repoRoot: string, config?: WorktreeConfig): Promise<WorktreeInfo[]>
```

### `src/agents/prompt-caching.ts`

Provider-aware prompt caching (Anthropic cache_control breakpoints, OpenAI predicted_outputs).

```ts
type CacheProvider = "anthropic" | "openai" | "generic";

type CacheApplicationResult = {
  messages: readonly MessageLike[];
  breakpointsApplied: number;
  provider: CacheProvider;
};

type CacheMetrics = {
  totalCalls: number; breakpointsApplied: number;
  byProvider: Record<CacheProvider, number>;
};

function applyPromptCaching(
  messages: readonly MessageLike[], provider: CacheProvider, config?: PromptCachingConfig,
): CacheApplicationResult
function detectCacheProvider(providerName: string): CacheProvider
function createCacheMetrics(): CacheMetrics
function recordCacheApplication(metrics: CacheMetrics, result: CacheApplicationResult): CacheMetrics
```

### `src/agents/context-references.ts`

`@file`, `@folder`, `@git`, `@url`, `@diff`, `@staged` reference expansion.

```ts
type ReferenceKind = "file" | "folder" | "git" | "url" | "diff" | "staged";

type ContextReference = {
  raw: string; kind: ReferenceKind; target: string;
  start: number; end: number; lineStart?: number; lineEnd?: number;
};

type ContextReferenceResult = {
  message: string; originalMessage: string;
  references: readonly ContextReference[];
  warnings: readonly string[];
  injectedTokens: number; expanded: boolean; blocked: boolean;
};

function parseContextReferences(message: string): ContextReference[]
async function expandContextReferences(
  message: string, cwd: string, config?: ContextReferencesConfig,
): Promise<ContextReferenceResult>
async function generateSubdirectoryHints(cwd: string, maxDepth?: number): Promise<SubdirectoryHint[]>
```

### `src/agents/budget-tracker.ts`

Per-session and per-turn cost tracking with budget enforcement.

```ts
type BudgetTracker = {
  newTurn(): void;
  checkBudget(toolName: string, estimatedCostUsd: number): BudgetCheckResult;
  recordCost(entry: CostEntry): void;
  recordResultChars(toolName: string, chars: number): BudgetCheckResult;
  resolveResultThreshold(toolName: string): number;
  getState(): BudgetState;
};

function createBudgetTracker(config?: BudgetConfig): BudgetTracker
function estimateCostUsd(
  inputTokens: number, outputTokens: number,
  inputPricePerMillion: number, outputPricePerMillion: number,
): number
function formatBudgetSummary(state: BudgetState): string
```

### `src/tools/checkpoint-manager.ts`

Shadow-git checkpoint system with per-turn dedup and file-level rollback.

```ts
type CheckpointManager = {
  newTurn(): void;
  ensureCheckpoint(workingDir: string, reason?: string): Promise<boolean>;
  listCheckpoints(workingDir: string): Promise<readonly CheckpointEntry[]>;
  rollback(workingDir: string, commitHash: string): Promise<CheckpointResult<string>>;
  rollbackFile(workingDir: string, commitHash: string, filePath: string): Promise<CheckpointResult<string>>;
  diffFromCheckpoint(workingDir: string, commitHash: string): Promise<CheckpointResult<string>>;
};

function createCheckpointManager(config?: CheckpointConfig): CheckpointManager
```

---

## Track D — Plugin Enhancements

### `src/agents/plugin-hooks.ts`

Fault-isolated hook bus with priority ordering and per-callback timeouts.

```ts
type PluginBusHookName =
  | "pre_tool_call" | "post_tool_call"
  | "pre_llm_call" | "post_llm_call"
  | "session_start" | "session_end"
  | "session_finalize" | "session_reset";

type PluginHookBus = {
  register(registration: HookRegistration): boolean;
  unregisterPlugin(pluginId: string): number;
  invoke<T = unknown>(hookName: PluginBusHookName, payload: T): Promise<HookInvocationResult>;
  hasCallbacks(hookName: PluginBusHookName): boolean;
  getStats(): Readonly<Record<PluginBusHookName, number>>;
};

type PluginToolsetRegistry = {
  register(toolset: PluginToolset): boolean;
  get(name: string): PluginToolset | undefined;
  list(): readonly PluginToolset[];
  getToolsForToolset(name: string): readonly string[];
  unregisterPlugin(pluginId: string): number;
};

function createPluginHookBus(config?: PluginHookBusConfig): PluginHookBus
function createPluginToolsetRegistry(): PluginToolsetRegistry
```

### `src/agents/plugin-context-engine.ts`

Replaceable context retrieval engine for plugin-provided RAG.

```ts
type ContextEngineRegistry = {
  register(pluginId: string, engine: ContextEngine): boolean;
  unregister(pluginId: string): boolean;
  getActive(): ContextEngine | undefined;
  getActivePluginId(): string | undefined;
  hasCustomEngine(): boolean;
  retrieve(query: ContextQuery): Promise<ContextRetrievalResult>;
};

function createContextEngineRegistry(): ContextEngineRegistry
function createFileContextEngine(readFileFn: (path: string) => Promise<string>): ContextEngine
```

### `src/agents/plugin-message-injection.ts`

Priority-sorted message queue with interrupt support and per-plugin stats.

```ts
type MessageInjector = {
  inject(params: {
    pluginId: string; role?: InjectedMessageRole;
    content: string; priority?: number;
    interrupt?: boolean; metadata?: Record<string, unknown>;
  }): InjectionResult;
  drain(): readonly InjectedMessage[];
  drainInterrupts(): readonly InjectedMessage[];
  queueSize(): number;
  hasInterrupts(): boolean;
  clear(): void;
  getStats(): MessageInjectorStats;
};

function createMessageInjector(config?: MessageInjectorConfig): MessageInjector
```

---

## Track E — Advanced Tools

### `src/tools/browser-automation.ts`

Multi-provider browser automation (local Playwright, Browserbase, Firecrawl, browser-use).

```ts
type BrowserProviderKind = "local" | "browserbase" | "firecrawl" | "browser-use";

type BrowserProvider = {
  readonly kind: BrowserProviderKind;
  createSession(taskId: string): Promise<BrowserSession>;
  closeSession(sessionId: string): Promise<void>;
  navigate(sessionId: string, url: string): Promise<BrowserActionResult>;
  snapshot(sessionId: string): Promise<PageSnapshot>;
  click(sessionId: string, selector: string): Promise<BrowserActionResult>;
  type(sessionId: string, text: string, selector?: string): Promise<BrowserActionResult>;
  scroll(sessionId: string, direction: "up" | "down", amount?: number): Promise<BrowserActionResult>;
  back(sessionId: string): Promise<BrowserActionResult>;
  pressKey(sessionId: string, key: string): Promise<BrowserActionResult>;
  getImages(sessionId: string): Promise<BrowserActionResult>;
  describeVisual(sessionId: string, question?: string): Promise<BrowserActionResult>;
  getConsole(sessionId: string): Promise<BrowserActionResult>;
};

type BrowserSessionManager = {
  getSession(taskId: string): Promise<BrowserSession>;
  executeTool(toolName: BrowserToolName, taskId: string, params: Record<string, unknown>): Promise<BrowserActionResult>;
  closeAll(): Promise<void>;
  activeCount(): number;
};

function getBrowserToolDefinitions(): readonly ToolDefinition[]
function createBrowserSessionManager(
  config: BrowserAutomationConfig,
  providerFactory: (kind: BrowserProviderKind) => BrowserProvider,
): BrowserSessionManager
```

### `src/tools/mixture-of-agents.ts`

Multi-model consensus via reference models + aggregator.

```ts
type LlmCaller = (params: {
  model: string; provider: string;
  messages: readonly { role: string; content: string }[];
  temperature: number; maxTokens: number;
}) => Promise<{ content: string }>;

type MoaResult = {
  content: string; references: readonly ReferenceResult[];
  totalDurationMs: number; successfulReferences: number; aggregated: boolean;
};

async function executeMoaQuery(
  userPrompt: string, llmCaller: LlmCaller, config?: MoaConfig,
): Promise<MoaResult>

function getMoaToolDefinition(): { name: string; description: string; parameters: Record<string, unknown> }
```

### `src/tools/voice-tts.ts`

Multi-provider TTS (Edge, ElevenLabs, OpenAI, MiniMax), transcription (Whisper), image generation.

```ts
type TtsProvider = "edge" | "elevenlabs" | "openai" | "minimax" | "generic";

type TtsTool = {
  synthesize(text: string, provider?: TtsProvider): Promise<TtsResult>;
  checkAvailability(): Promise<boolean>;
  getToolDefinition(): { name: string; description: string; parameters: Record<string, unknown> };
};

function createTtsTool(config: TtsConfig, engineFactory: (provider: TtsProvider, config: TtsConfig) => TtsEngine): TtsTool
function getTranscriptionToolDefinition(): { name: string; description: string; parameters: Record<string, unknown> }
function getImageGenToolDefinition(): { name: string; description: string; parameters: Record<string, unknown> }
```

### `src/tools/process-monitor.ts`

Background process tracking with output buffering and watch-pattern notifications.

```ts
type ProcessMonitor = {
  spawn(params: { command: string; cwd?: string; taskId?: string; sessionKey?: string; watchPatterns?: readonly WatchPattern[] }): ProcessSpawnResult;
  poll(sessionId: string): ProcessPollResult | undefined;
  kill(sessionId: string): boolean;
  list(sessionKey?: string): readonly ProcessSession[];
  onWatch(callback: (notification: WatchNotification) => void): void;
  prune(): number;
  activeCount(): number;
};

function createProcessMonitor(config?: ProcessMonitorConfig): ProcessMonitor
function getProcessMonitorToolDefinitions(): readonly { name: string; description: string; parameters: Record<string, unknown> }[]
```

### `src/tools/homeassistant.ts`

Home Assistant entity control via REST API.

```ts
type HomeAssistantClient = {
  listEntities(domain?: string, area?: string): Promise<HaResult<readonly HaEntity[]>>;
  getState(entityId: string): Promise<HaResult<HaEntityState>>;
  listServices(domain?: string): Promise<HaResult<readonly HaService[]>>;
  callService(domain: string, service: string, entityId?: string, data?: Record<string, unknown>): Promise<HaResult<string>>;
};

function createHomeAssistantClient(config: HomeAssistantConfig, httpClient: HaHttpClient): HomeAssistantClient
function getHomeAssistantToolDefinitions(): readonly { name: string; description: string; parameters: Record<string, unknown> }[]
```

---

## Track F — Gateway Platforms

### `src/channels/adapters/wecom.ts`

WeCom (企业微信) adapter with AES-CBC message encryption and access-token management.

```ts
function createWeComTokenManager(config: WeComConfig, http: WeComHttpClient): WeComTokenManager
function createWeComCrypto(config: WeComConfig): WeComCrypto
function createWeComClient(
  config: WeComConfig, http: WeComHttpClient,
  tokenManager: WeComTokenManager, crypto: WeComCrypto,
): WeComClient

// WeComClient interface
type WeComClient = {
  sendText(toUser: string, content: string): Promise<WeComResult<void>>;
  sendMarkdown(toUser: string, content: string): Promise<WeComResult<void>>;
  parseInboundMessage(encryptedXml: string): WeComInboundMessage | null;
};
```

### `src/channels/adapters/dingtalk.ts`

DingTalk (钉钉) adapter with HMAC-SHA256 webhook signing.

```ts
function generateDingTalkSignature(secret: string, timestamp?: number): { timestamp: number; sign: string }
function verifyDingTalkCallback(timestamp: string, sign: string, secret: string, maxAgeMs?: number): boolean
function createDingTalkClient(config: DingTalkConfig, http: DingTalkHttpClient): DingTalkClient

type DingTalkClient = {
  sendText(content: string, webhookUrl?: string): Promise<DingTalkResult<void>>;
  sendMarkdown(title: string, text: string, webhookUrl?: string): Promise<DingTalkResult<void>>;
  sendActionCard(title: string, text: string, webhookUrl?: string): Promise<DingTalkResult<void>>;
  parseInboundMessage(body: unknown): DingTalkInboundMessage | null;
};
```

### `src/channels/adapters/feishu.ts`

Feishu/Lark (飞书) adapter with tenant-access-token management and event callbacks.

```ts
function createFeishuTokenManager(config: FeishuConfig, http: FeishuHttpClient): FeishuTokenManager
function verifyFeishuCallback(params: {
  timestamp: string; nonce: string; encryptKey: string; body: string; signature: string;
}): boolean
function createFeishuClient(config: FeishuConfig, http: FeishuHttpClient, tokenManager: FeishuTokenManager): FeishuClient

type FeishuClient = {
  sendText(chatId: string, text: string): Promise<FeishuResult<string>>;
  sendMarkdown(chatId: string, title: string, content: string): Promise<FeishuResult<string>>;
  sendCard(chatId: string, card: Record<string, unknown>): Promise<FeishuResult<string>>;
  replyText(messageId: string, text: string): Promise<FeishuResult<string>>;
  parseInboundEvent(body: unknown): FeishuInboundEvent | null;
};
```

### `src/channels/gateway-mirroring.ts`

Cross-platform message mirroring (CLI ↔ gateway ↔ API session transcripts).

```ts
type GatewayMirror = {
  mirrorToSession(target: MirrorTarget, messageText: string, sourceLabel?: MirrorSourceLabel): Promise<MirrorResult>;
  mirrorToMultiple(targets: readonly MirrorTarget[], messageText: string, sourceLabel?: MirrorSourceLabel): Promise<readonly MirrorResult[]>;
  findSessionId(target: MirrorTarget): Promise<string | null>;
};

function createGatewayMirror(store: MirrorSessionStore): GatewayMirror
```

### `src/channels/multi-destination-delivery.ts`

Policy-based multi-target delivery (all, first-success, primary-with-fallback).

```ts
type DeliveryPolicy = "all" | "first-success" | "primary-with-fallback";

type MultiDestinationRouter = {
  deliver(targets: readonly DeliveryTarget[], content: string, policy?: DeliveryPolicy): Promise<DeliveryResult>;
};

function createMultiDestinationRouter(defaultPolicy?: DeliveryPolicy, sender?: PlatformSender): MultiDestinationRouter
```

---

## Track G — Training & Evaluation Pipeline

### `src/training/trajectory-format.ts`

Hermes-compatible trajectory serialisation (JSONL I/O).

```ts
type TurnRole = "system" | "human" | "gpt" | "tool";

type TrajectoryTurn = { from: TurnRole; value: string };

type TrajectoryRecord = {
  id: string; prompt: string;
  conversations: Array<{ turns: TrajectoryTurn[] }>;
  model: string;
  toolsets?: string[];
  toolStats?: Record<string, number>;
  reasoningStats?: Record<string, number>;
  meta?: Record<string, unknown>;
};

function messagesToTrajectoryTurns(messages: Array<{ role: string; content: string }>): TrajectoryTurn[]
function extractToolStats(turns: TrajectoryTurn[]): Record<string, number>
function extractReasoningStats(turns: TrajectoryTurn[]): Record<string, number>
async function* readTrajectoryJsonl(filePath: string): AsyncGenerator<TrajectoryRecord>
function createTrajectoryWriter(filePath: string): { write(record: TrajectoryRecord): void; close(): void }
function filterBadTrajectories(records: TrajectoryRecord[]): TrajectoryRecord[]
function validateTrajectoryRecord(record: unknown): boolean
```

### `src/training/toolset-distributions.ts`

Stochastic toolset sampling with independent Bernoulli inclusion.

```ts
type ToolsetDistribution = { name: string; toolsets: Record<string, number> };

// 18 built-in distributions:
// default, image_gen, research, science, development, safe, balanced, minimal,
// terminal_only, terminal_web, creative, reasoning, browser_use, browser_only,
// browser_tasks, terminal_tasks, mixed_tasks

const DISTRIBUTIONS: Record<string, ToolsetDistribution>

function sampleToolsetsFromDistribution(dist: ToolsetDistribution): string[]
function sampleFromDistribution(name: string): string[]
function validateDistribution(dist: ToolsetDistribution): boolean
function createCustomDistribution(name: string, toolsets: Record<string, number>): ToolsetDistribution
```

### `src/training/batch-runner.ts`

Multiprocess prompt execution with crash-resilient checkpointing.

```ts
type BatchRunnerConfig = {
  runName: string; datasetFile: string;
  batchSize: number; maxWorkers: number;
  distribution?: ToolsetDistribution; model: string;
  outputFile: string; resume: boolean;
};

type PromptExecutor = (prompt: string, toolsets: string[], model: string) => Promise<TrajectoryRecord | null>;

type BatchRunnerStats = {
  completed: number; total: number; failed: number; skipped: number;
};

function loadDataset(filePath: string): Promise<Array<{ prompt: string; [k: string]: unknown }>>
async function runBatch(
  config: BatchRunnerConfig, executor: PromptExecutor,
  onProgress?: (completed: number, total: number, stats: BatchRunnerStats) => void,
): Promise<BatchRunnerStats>
```

### `src/training/environments/index.ts`

Execution backend abstraction (local, Docker, SSH).

```ts
type CommandResult = { exitCode: number; stdout: string; stderr: string };

type ExecutionEnvironment = {
  execute(command: string): Promise<CommandResult>;
  cleanup(): Promise<void>;
  isReady(): Promise<boolean>;
  getCwd(): string;
  setCwd(cwd: string): void;
};

// Injectable — no dependency on child_process at import time
type ChildProcessSpawner = {
  spawn(command: string, args: string[], options: { cwd?: string }): Promise<CommandResult>;
};

function createLocalEnvironment(spawner: ChildProcessSpawner, cwd?: string): ExecutionEnvironment
function createDockerEnvironment(spawner: ChildProcessSpawner, options: { image: string; extraFlags?: string[] }): ExecutionEnvironment
function createSshEnvironment(spawner: ChildProcessSpawner, options: { host: string; user?: string; port?: number; keyPath?: string }): ExecutionEnvironment
function createEnvironment(backend: string, spawner: ChildProcessSpawner, options?: Record<string, unknown>): ExecutionEnvironment
```

### `src/training/tool-call-parsers/index.ts`

Model-specific tool call extraction from raw output text.

```ts
type ToolCallParsed = {
  id: string; type: "function";
  function: { name: string; arguments: string };
};

type ParseResult = {
  content: string | null;
  toolCalls: readonly ToolCallParsed[] | null;
};

type ToolCallParser = {
  readonly name: string;
  parse(text: string): ParseResult;
};

function registerParser(parser: ToolCallParser): void
function getParser(name: string): ToolCallParser | null
function listParsers(): readonly string[]

// 11 built-in parsers (auto-registered):
// hermes, deepseek_v3, deepseek_v3_1, qwen, llama,
// mistral, glm45, glm47, kimi_k2, longcat, qwen3_coder
```

### `src/training/benchmarks/index.ts`

Benchmark evaluation harness.

```ts
type BenchmarkEnvironment = {
  readonly name: string;
  loadTasks(): Promise<readonly BenchmarkTask[]>;
  runTask(task: BenchmarkTask, env: ExecutionEnvironment, agentRunner: TaskAgentRunner, options?: { timeoutMs?: number }): Promise<TaskResult>;
  evaluate(env: ExecutionEnvironment, agentRunner: TaskAgentRunner, options?: { concurrency?: number; timeoutMs?: number; filter?: readonly string[] }): Promise<BenchmarkSummary>;
};

function createTerminalBench2(config: TerminalBench2Config): BenchmarkEnvironment
function createJsonlBenchmark(config: JsonlBenchmarkConfig): BenchmarkEnvironment
```

### `src/training/rl-cli.ts`

RL training CLI interface.

```ts
function checkRequirements(env: Record<string, string | undefined>): readonly RequirementCheck[]
function allRequirementsMet(checks: readonly RequirementCheck[]): boolean
async function runTraining(
  config: RlCliConfig, args: TrainCommandArgs,
  executor: PromptExecutor, onProgress?: Function,
): Promise<RlTrainingResult>
async function runEvaluation(
  benchmark: BenchmarkEnvironment, env: ExecutionEnvironment,
  agentRunner: TaskAgentRunner, args: EvalCommandArgs,
): Promise<RlEvalResult>
function formatRequirementChecks(checks: readonly RequirementCheck[]): string
function formatTrainingResult(result: RlTrainingResult): string
function formatEvalResult(result: RlEvalResult): string
```

---

## Configuration Types

All config types are aggregated under `OpenClawConfig.trainingPipeline` (Track G) and existing top-level fields for Tracks A–F.

| Config field | Config type file | Track |
|---|---|---|
| `sessionIntelligence` | `types.session-intelligence.ts` | A |
| `supplyChainSecurity` | `types.supply-chain-security.ts` | B |
| `developerExperience` | `types.developer-experience.ts` | C |
| `pluginEnhancements` | `types.plugin-enhancements.ts` | D |
| `advancedTools` | `types.advanced-tools.ts` | E |
| `gatewayExpansion` | `types.gateway-expansion.ts` | F |
| `trainingPipeline` | `types.training-pipeline.ts` | G |

All are optional fields on `OpenClawConfig` (`src/config/types.openclaw.ts`), gated by `enabled?: boolean` sub-fields.

---

## Journal Integration

All tracks emit structured journal events via `src/agents/journal-integration.ts`.

| Recorder function | Event kind | Track |
|---|---|---|
| `recordClassifiedError` | `classified_error` | A |
| `recordCredentialRotation` | `credential_rotation` | A |
| `recordRateLimitState` | `rate_limit_state` | A |
| `recordSessionPersisted` | `session_persisted` | A |
| `recordTrajectoryCompressed` | `trajectory_compressed` | A |
| `recordModelRouted` | `model_routed` | A |
| `recordSkillScanResult` | `skill_scan_result` | B |
| `recordSkillSyncResult` | `skill_sync_result` | B |
| `recordUrlSafetyCheck` | `url_safety_check` | B |
| `recordPathSecurityCheck` | `path_security_check` | B |
| `recordWorktreeLifecycle` | `worktree_lifecycle` | C |
| `recordCacheApplication` | `cache_application` | C |
| `recordContextExpansion` | `context_expansion` | C |
| `recordBudgetCheck` | `budget_check` | C |
| `recordCheckpointCreated` | `checkpoint_created` | C |
| `recordHookInvocation` | `hook_invocation` | D |
| `recordContextEngineRetrieval` | `context_engine_retrieval` | D |
| `recordMessageInjection` | `message_injection` | D |
| `recordBrowserAction` | `browser_action` | E |
| `recordMoaExecution` | `moa_execution` | E |
| `recordTtsSynthesis` | `tts_synthesis` | E |
| `recordProcessLifecycle` | `process_lifecycle` | E |
| `recordHaServiceCall` | `ha_service_call` | E |
| `recordGatewayMessageSent` | `gateway_message_sent` | F |
| `recordGatewayMessageReceived` | `gateway_message_received` | F |
| `recordMirrorDelivery` | `mirror_delivery` | F |
| `recordMultiDestinationDelivery` | `multi_destination_delivery` | F |
| `recordBatchProgress` | `batch_progress` | G |
| `recordTrajectoryGenerated` | `trajectory_generated` | G |
| `recordEnvironmentLifecycle` | `environment_lifecycle` | G |
| `recordBenchmarkTaskResult` | `benchmark_task_result` | G |
| `recordBenchmarkSummary` | `benchmark_summary` | G |
| `recordToolCallParsed` | `tool_call_parsed` | G |

---

## Module Dependency Graph

```
Track A (session-intelligence)
  error-classifier ←── credential-pool, smart-model-routing
  rate-limit-tracker ←── credential-pool
  session-persistence (standalone, injectable SqliteDatabase)
  trajectory-compressor (standalone, injectable SummarizeFn)
  smart-model-routing ←── error-classifier (for fallback decisions)

Track B (supply-chain-security)
  skills-guard ←── path-security (for traversal checks)
  skills-sync ←── skills-guard (hash comparison)
  url-safety (standalone)
  path-security (standalone)

Track C (developer-experience)
  git-worktree (standalone)
  prompt-caching (standalone)
  context-references ←── url-safety, path-security
  budget-tracker (standalone)
  checkpoint-manager (standalone)

Track D (plugin-enhancements)
  plugin-hooks (standalone)
  plugin-context-engine (standalone)
  plugin-message-injection (standalone)

Track E (advanced-tools)
  browser-automation ←── url-safety (URL filtering)
  mixture-of-agents (standalone, injectable LlmCaller)
  voice-tts (standalone, injectable engines)
  process-monitor (standalone)
  homeassistant (standalone, injectable HaHttpClient)

Track F (gateway-platforms)
  wecom, dingtalk, feishu (standalone adapters, injectable HTTP)
  gateway-mirroring ←── session-persistence (session lookup)
  multi-destination-delivery (standalone, injectable PlatformSender)

Track G (training-pipeline)
  trajectory-format (standalone)
  toolset-distributions (standalone)
  batch-runner ←── trajectory-format, toolset-distributions
  environments (standalone, injectable ChildProcessSpawner)
  tool-call-parsers (standalone)
  benchmarks ←── environments
  rl-cli ←── batch-runner, benchmarks, environments
```

**Design principle:** All modules use injectable interfaces (not classes). External dependencies (SQLite, HTTP, child_process) are passed as parameters, enabling testability without mocking module internals.

---

## Git History

| Commit | Phase | Description |
|--------|-------|------------|
| `1b07f30` | P0 | Track A + Track B (14 files) |
| `f6c55ae` | P1 | Track C + Track D (12 files) |
| `4acff6e` | P2 | Track E + Track F (18 files) |
| `223ff02` | P3 | Track G (10 files) |
| `825cb46` | Tests | Acceptance test suites, all 7 tracks (24 files) |
