/**
 * Session Persistence Config Types (Track A — Session Intelligence)
 *
 * Configuration for persistent session storage, error classification,
 * credential pooling, rate-limit tracking, trajectory compression,
 * and smart model routing.
 */

import type { SelectionStrategy } from "../agents/credential-pool.js";
import type { ModelTier } from "../agents/smart-model-routing.js";

// ── Session persistence ──

export type SessionPersistenceConfig = {
  /** Enable persistent session storage. Default: false. */
  enabled?: boolean;
  /** Path to SQLite database file. Default: <stateDir>/sessions.db. */
  dbPath?: string;
  /** Enable WAL mode. Default: true. */
  walMode?: boolean;
  /** Enable FTS5 full-text search. Default: true. */
  ftsEnabled?: boolean;
  /** Default search result limit. */
  searchLimit?: number;
};

// ── Error classification ──

export type ErrorClassificationConfig = {
  /** Enable structured error classification. Default: true. */
  enabled?: boolean;
  /** Maximum retries for transient errors. Default: 3. */
  maxRetries?: number;
  /** Base backoff multiplier (ms). Default: 1000. */
  backoffBaseMs?: number;
  /** Maximum backoff duration (ms). Default: 60000. */
  backoffMaxMs?: number;
};

// ── Credential pool ──

export type CredentialPoolConfig = {
  /** Enable multi-key credential rotation. Default: false. */
  enabled?: boolean;
  /** Selection strategy. Default: "round_robin". */
  strategy?: SelectionStrategy;
  /** Default cooldown for exhausted credentials (ms). Default: 3600000. */
  exhaustedTtlMs?: number;
};

// ── Rate limit tracking ──

export type RateLimitTrackingConfig = {
  /** Enable rate-limit header tracking. Default: true. */
  enabled?: boolean;
  /** Warning threshold (usage percentage). Default: 80. */
  warningThreshold?: number;
};

// ── Trajectory compression ──

export type TrajectoryCompressionConfig = {
  /** Enable trajectory compression. Default: false. */
  enabled?: boolean;
  /** Target maximum tokens. Default: 15250. */
  targetMaxTokens?: number;
  /** Summary target tokens. Default: 750. */
  summaryTargetTokens?: number;
  /** Trailing turns to protect. Default: 4. */
  protectLastNTurns?: number;
  /** Maximum concurrent summarization requests. Default: 10. */
  maxConcurrentRequests?: number;
};

// ── Smart model routing ──

export type ModelRoutingEntry = {
  modelId: string;
  provider: string;
  tier: ModelTier;
  contextWindow: number;
  costPer1kInput: number;
  costPer1kOutput: number;
  supportsTools?: boolean;
  supportsVision?: boolean;
  supportsReasoning?: boolean;
};

export type SmartModelRoutingConfig = {
  /** Enable smart model routing. Default: false. */
  enabled?: boolean;
  /** Maximum cost per request (USD). 0 = no limit. */
  maxCostPerRequest?: number;
  /** Force a specific model (bypass routing). */
  forceModel?: string;
  /** Model capability entries for routing decisions. */
  models?: ModelRoutingEntry[];
};

// ── Aggregate session intelligence config ──

export type SessionIntelligenceConfig = {
  persistence?: SessionPersistenceConfig;
  errorClassification?: ErrorClassificationConfig;
  credentialPool?: CredentialPoolConfig;
  rateLimitTracking?: RateLimitTrackingConfig;
  trajectoryCompression?: TrajectoryCompressionConfig;
  smartRouting?: SmartModelRoutingConfig;
};
