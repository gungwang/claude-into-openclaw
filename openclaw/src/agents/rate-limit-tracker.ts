/**
 * Rate Limit Tracker — Per-Provider Monitoring (Track A — Session Intelligence)
 *
 * Captures `x-ratelimit-*` response headers and provides structured
 * rate-limit state with time-adjusted remaining calculations. Pure
 * data capture and display — does NOT enforce limits (that's the
 * error classifier's job).
 *
 * Ported from hermes-agent `agent/rate_limit_tracker.py`.
 */

// ── Rate limit bucket ──

export type RateLimitBucket = {
  limit: number;
  remaining: number;
  resetSeconds: number;
  capturedAt: number;
};

export function bucketUsed(bucket: RateLimitBucket): number {
  return bucket.limit - bucket.remaining;
}

export function bucketUsagePct(bucket: RateLimitBucket): number {
  if (bucket.limit === 0) return 0;
  return (bucketUsed(bucket) / bucket.limit) * 100;
}

export function bucketRemainingSecondsNow(bucket: RateLimitBucket): number {
  const elapsed = (Date.now() - bucket.capturedAt) / 1000;
  return Math.max(0, bucket.resetSeconds - elapsed);
}

// ── Per-provider rate limit state ──

export type RateLimitState = {
  provider: string;
  requestsPerMinute?: RateLimitBucket;
  requestsPerHour?: RateLimitBucket;
  tokensPerMinute?: RateLimitBucket;
  tokensPerHour?: RateLimitBucket;
  capturedAt: number;
};

export function hasRateLimitData(state: RateLimitState): boolean {
  return !!(
    state.requestsPerMinute ||
    state.requestsPerHour ||
    state.tokensPerMinute ||
    state.tokensPerHour
  );
}

export function rateLimitAgeSeconds(state: RateLimitState): number {
  return (Date.now() - state.capturedAt) / 1000;
}

// ── Header parsing ──

function safeInt(value: string | undefined | null): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

function safeFloat(value: string | undefined | null): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

function getHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : undefined;
}

function parseBucket(
  headers: Record<string, string | string[] | undefined>,
  limitKey: string,
  remainingKey: string,
  resetKey: string,
  now: number,
): RateLimitBucket | undefined {
  const limit = safeInt(getHeader(headers, limitKey));
  const remaining = safeInt(getHeader(headers, remainingKey));
  const resetSeconds = safeFloat(getHeader(headers, resetKey));
  if (limit === undefined || remaining === undefined) return undefined;
  return {
    limit,
    remaining,
    resetSeconds: resetSeconds ?? 60,
    capturedAt: now,
  };
}

/**
 * Parse `x-ratelimit-*` headers from an API response into structured state.
 */
export function parseRateLimitHeaders(
  headers: Record<string, string | string[] | undefined>,
  provider: string,
): RateLimitState | undefined {
  const now = Date.now();

  const requestsPerMinute = parseBucket(
    headers,
    "x-ratelimit-limit-requests",
    "x-ratelimit-remaining-requests",
    "x-ratelimit-reset-requests",
    now,
  );
  const tokensPerMinute = parseBucket(
    headers,
    "x-ratelimit-limit-tokens",
    "x-ratelimit-remaining-tokens",
    "x-ratelimit-reset-tokens",
    now,
  );

  if (!requestsPerMinute && !tokensPerMinute) return undefined;

  return {
    provider,
    requestsPerMinute,
    tokensPerMinute,
    capturedAt: now,
  };
}

// ── Tracker (stateful per-provider store) ──

export class RateLimitTracker {
  private states = new Map<string, RateLimitState>();

  /**
   * Update rate-limit state for a provider from response headers.
   */
  update(
    headers: Record<string, string | string[] | undefined>,
    provider: string,
  ): RateLimitState | undefined {
    const state = parseRateLimitHeaders(headers, provider);
    if (state) {
      this.states.set(provider, state);
    }
    return state;
  }

  /**
   * Get current rate-limit state for a provider.
   */
  get(provider: string): RateLimitState | undefined {
    return this.states.get(provider);
  }

  /**
   * Check if a provider is approaching its rate limit (≥80% usage).
   */
  isNearLimit(provider: string, threshold = 80): boolean {
    const state = this.states.get(provider);
    if (!state) return false;
    for (const bucket of [
      state.requestsPerMinute,
      state.requestsPerHour,
      state.tokensPerMinute,
      state.tokensPerHour,
    ]) {
      if (bucket && bucketUsagePct(bucket) >= threshold) return true;
    }
    return false;
  }

  /**
   * Get all tracked providers.
   */
  providers(): string[] {
    return Array.from(this.states.keys());
  }

  /**
   * Clear state for a provider (e.g., after credential rotation).
   */
  clear(provider: string): void {
    this.states.delete(provider);
  }

  clearAll(): void {
    this.states.clear();
  }
}

// ── Formatting ──

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtSeconds(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return sec > 0 ? `${m}m ${sec}s` : `${m}m`;
}

function progressBar(pct: number, width = 20): string {
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  return `[${bar}]`;
}

function formatBucket(label: string, bucket: RateLimitBucket): string {
  const pct = bucketUsagePct(bucket);
  const remaining = bucketRemainingSecondsNow(bucket);
  const warn = pct >= 80 ? " ⚠" : "";
  return (
    `  ${label}: ${progressBar(pct)} ` +
    `${fmtCount(bucketUsed(bucket))}/${fmtCount(bucket.limit)} ` +
    `(${pct.toFixed(0)}%) resets in ${fmtSeconds(remaining)}${warn}`
  );
}

export function formatRateLimitDisplay(state: RateLimitState): string {
  const lines = [`Rate limits for ${state.provider}:`];
  if (state.requestsPerMinute) {
    lines.push(formatBucket("RPM", state.requestsPerMinute));
  }
  if (state.requestsPerHour) {
    lines.push(formatBucket("RPH", state.requestsPerHour));
  }
  if (state.tokensPerMinute) {
    lines.push(formatBucket("TPM", state.tokensPerMinute));
  }
  if (state.tokensPerHour) {
    lines.push(formatBucket("TPH", state.tokensPerHour));
  }
  return lines.join("\n");
}

export function formatRateLimitCompact(state: RateLimitState): string {
  const parts: string[] = [state.provider];
  for (const [label, bucket] of [
    ["RPM", state.requestsPerMinute],
    ["TPM", state.tokensPerMinute],
  ] as const) {
    if (bucket) {
      const pct = bucketUsagePct(bucket);
      parts.push(`${label}:${pct.toFixed(0)}%`);
    }
  }
  return parts.join(" ");
}
