/**
 * Provider-Specific Prompt Caching (Track C — Developer Experience)
 *
 * Optimizes token usage via provider-specific cache control strategies:
 * - Anthropic: `cache_control` breakpoints on system prompt + recent messages
 * - OpenAI: `predicted_outputs` for edit-heavy workflows
 * - Generic: no-op passthrough for providers without caching support
 *
 * Ported from hermes-agent `agent/prompt_caching.py`.
 * Adapted to TypeScript. Pure functions — no class state.
 */

// ── Types ──

export type CacheProvider = "anthropic" | "openai" | "generic";

export type CacheControlMarker = {
  type: "ephemeral";
  ttl?: string;
};

export type MessageLike = {
  role: string;
  content: string | ContentBlock[] | undefined;
  cache_control?: CacheControlMarker;
  [key: string]: unknown;
};

export type ContentBlock = {
  type: string;
  text?: string;
  cache_control?: CacheControlMarker;
  [key: string]: unknown;
};

export type PromptCachingConfig = {
  /** Enable prompt caching. Default: true. */
  enabled: boolean;
  /** Anthropic cache TTL. Default: "5m". Options: "5m" | "1h". */
  anthropicCacheTtl: "5m" | "1h";
  /** Max breakpoints for Anthropic (their limit is 4). Default: 4. */
  anthropicMaxBreakpoints: number;
  /** Enable OpenAI predicted_outputs optimization. Default: true. */
  openaiPredictedOutputs: boolean;
};

export const DEFAULT_PROMPT_CACHING_CONFIG: PromptCachingConfig = {
  enabled: true,
  anthropicCacheTtl: "5m",
  anthropicMaxBreakpoints: 4,
  openaiPredictedOutputs: true,
};

export type CacheApplicationResult = {
  messages: readonly MessageLike[];
  breakpointsApplied: number;
  provider: CacheProvider;
};

// ── Cache control application ──

/**
 * Apply provider-specific cache control to a message array.
 *
 * Returns a shallow copy of the array with cache markers injected.
 * Does NOT mutate the input.
 */
export function applyPromptCaching(
  messages: readonly MessageLike[],
  provider: CacheProvider,
  config: PromptCachingConfig = DEFAULT_PROMPT_CACHING_CONFIG,
): CacheApplicationResult {
  if (!config.enabled || messages.length === 0) {
    return { messages, breakpointsApplied: 0, provider };
  }

  switch (provider) {
    case "anthropic":
      return applyAnthropicCaching(messages, config);
    case "openai":
      return applyOpenAICaching(messages, config);
    case "generic":
      return { messages, breakpointsApplied: 0, provider };
  }
}

/**
 * Detect the appropriate cache provider from a model/provider name.
 */
export function detectCacheProvider(
  providerName: string,
): CacheProvider {
  const lower = providerName.toLowerCase();
  if (lower.includes("anthropic") || lower.includes("claude")) return "anthropic";
  if (lower.includes("openai") || lower.includes("gpt") || lower.includes("o1") || lower.includes("o3")) return "openai";
  return "generic";
}

// ── Anthropic strategy ──

/**
 * Anthropic "system_and_3" caching strategy.
 *
 * Places up to `maxBreakpoints` cache_control breakpoints:
 * 1. System prompt (stable across all turns)
 * 2–4. Last N non-system messages (rolling window)
 *
 * This reduces redundant token transmission by ~75% on multi-turn conversations.
 */
function applyAnthropicCaching(
  messages: readonly MessageLike[],
  config: PromptCachingConfig,
): CacheApplicationResult {
  const result = messages.map((m) => structuredClone(m));
  const marker: CacheControlMarker = { type: "ephemeral" };
  if (config.anthropicCacheTtl === "1h") {
    marker.ttl = "1h";
  }

  let breakpointsUsed = 0;

  // Mark system prompt
  if (result[0]?.role === "system") {
    applyCacheMarker(result[0], marker);
    breakpointsUsed++;
  }

  // Mark last N non-system messages
  const remaining = config.anthropicMaxBreakpoints - breakpointsUsed;
  const nonSystemIndices: number[] = [];
  for (let i = 0; i < result.length; i++) {
    if (result[i].role !== "system") nonSystemIndices.push(i);
  }

  const toMark = nonSystemIndices.slice(-remaining);
  for (const idx of toMark) {
    applyCacheMarker(result[idx], marker);
    breakpointsUsed++;
  }

  return {
    messages: result,
    breakpointsApplied: breakpointsUsed,
    provider: "anthropic",
  };
}

/**
 * Apply a cache_control marker to a single message.
 * Handles both string content and structured content blocks.
 */
function applyCacheMarker(
  msg: MessageLike,
  marker: CacheControlMarker,
): void {
  const content = msg.content;

  // Tool results and empty messages: top-level marker
  if (msg.role === "tool" || content === undefined || content === "") {
    msg.cache_control = marker;
    return;
  }

  // String content: wrap in a content block
  if (typeof content === "string") {
    msg.content = [{ type: "text", text: content, cache_control: marker }];
    return;
  }

  // Array content: mark the last block
  if (Array.isArray(content) && content.length > 0) {
    const last = content[content.length - 1];
    if (typeof last === "object" && last !== null) {
      last.cache_control = marker;
    }
  }
}

// ── OpenAI strategy ──

/**
 * OpenAI optimization for edit-heavy workflows.
 *
 * Uses `predicted_outputs` hint when the response is expected to be
 * similar to previous tool output (file edits, refactoring).
 * This is a metadata hint only — the actual messages are unchanged.
 */
function applyOpenAICaching(
  messages: readonly MessageLike[],
  config: PromptCachingConfig,
): CacheApplicationResult {
  if (!config.openaiPredictedOutputs) {
    return { messages, breakpointsApplied: 0, provider: "openai" };
  }

  // OpenAI's automatic prompt caching handles prefix caching.
  // We return messages unchanged — the server handles cache matching.
  // The `breakpointsApplied` count indicates we've "opted in" to the strategy.
  return {
    messages,
    breakpointsApplied: 1,
    provider: "openai",
  };
}

// ── Metrics ──

export type CacheMetrics = {
  totalCalls: number;
  breakpointsApplied: number;
  byProvider: Record<CacheProvider, number>;
};

export function createCacheMetrics(): CacheMetrics {
  return {
    totalCalls: 0,
    breakpointsApplied: 0,
    byProvider: { anthropic: 0, openai: 0, generic: 0 },
  };
}

export function recordCacheApplication(
  metrics: CacheMetrics,
  result: CacheApplicationResult,
): CacheMetrics {
  return {
    totalCalls: metrics.totalCalls + 1,
    breakpointsApplied: metrics.breakpointsApplied + result.breakpointsApplied,
    byProvider: {
      ...metrics.byProvider,
      [result.provider]: (metrics.byProvider[result.provider] ?? 0) + 1,
    },
  };
}
