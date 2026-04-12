/**
 * Credential Pool — Multi-Key Rotation (Track A — Session Intelligence)
 *
 * Manages multiple API credentials per provider with automatic rotation
 * on auth failure (401) or rate-limit exhaustion (429). Supports round-robin,
 * priority-based, and least-used selection strategies.
 *
 * Ported from hermes-agent `agent/credential_pool.py`.
 * Adapted to TypeScript with OpenClaw's auth-profiles as underlying store.
 */

// ── Constants ──

export const STATUS_OK = "ok" as const;
export const STATUS_EXHAUSTED = "exhausted" as const;

export type CredentialStatus = typeof STATUS_OK | typeof STATUS_EXHAUSTED;

export type SelectionStrategy =
  | "fill_first"
  | "round_robin"
  | "random"
  | "least_used";

/** Default cooldown for 429 (rate-limited) credentials. */
const EXHAUSTED_TTL_429_MS = 3_600_000; // 1 hour
/** Default cooldown for other exhaustion reasons. */
const EXHAUSTED_TTL_DEFAULT_MS = 3_600_000; // 1 hour

// ── Credential entry ──

export type PooledCredential = {
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

// ── Pool ──

export type CredentialPoolOptions = {
  provider: string;
  strategy?: SelectionStrategy;
};

export class CredentialPool {
  readonly provider: string;
  private strategy: SelectionStrategy;
  private entries: PooledCredential[];
  private roundRobinIndex = 0;

  constructor(options: CredentialPoolOptions, entries: PooledCredential[] = []) {
    this.provider = options.provider;
    this.strategy = options.strategy ?? "round_robin";
    this.entries = entries
      .slice()
      .sort((a, b) => a.priority - b.priority);
  }

  // ── Queries ──

  hasCredentials(): boolean {
    return this.entries.length > 0;
  }

  hasAvailable(): boolean {
    return this.entries.some((e) => this.isAvailable(e));
  }

  allEntries(): readonly PooledCredential[] {
    return this.entries;
  }

  availableCount(): number {
    return this.entries.filter((e) => this.isAvailable(e)).length;
  }

  // ── Selection ──

  /**
   * Select the next available credential. Returns undefined if all
   * credentials are exhausted.
   */
  current(): PooledCredential | undefined {
    const available = this.entries.filter((e) => this.isAvailable(e));
    if (available.length === 0) return undefined;

    switch (this.strategy) {
      case "fill_first":
        return available[0];

      case "round_robin": {
        const idx = this.roundRobinIndex % available.length;
        this.roundRobinIndex++;
        return available[idx];
      }

      case "random":
        return available[Math.floor(Math.random() * available.length)];

      case "least_used":
        return available.reduce((min, e) =>
          e.requestCount < min.requestCount ? e : min,
        );
    }
  }

  // ── Lifecycle ──

  /**
   * Record a successful request against a credential.
   */
  recordSuccess(credentialId: string): void {
    const entry = this.findById(credentialId);
    if (!entry) return;
    entry.requestCount++;
    entry.lastUsedAt = Date.now();
    if (entry.status === STATUS_EXHAUSTED) {
      entry.status = STATUS_OK;
      entry.exhaustedUntil = undefined;
      entry.lastErrorCode = undefined;
      entry.lastErrorMessage = undefined;
      entry.lastErrorAt = undefined;
    }
  }

  /**
   * Mark a credential as exhausted after an auth/rate-limit failure.
   */
  markExhausted(
    credentialId: string,
    statusCode: number | undefined,
    errorMessage: string,
    resetAtMs?: number,
  ): void {
    const entry = this.findById(credentialId);
    if (!entry) return;

    entry.status = STATUS_EXHAUSTED;
    entry.lastErrorCode = statusCode;
    entry.lastErrorMessage =
      errorMessage.length > 200 ? errorMessage.slice(0, 200) : errorMessage;
    entry.lastErrorAt = Date.now();

    if (resetAtMs !== undefined && resetAtMs > Date.now()) {
      entry.exhaustedUntil = resetAtMs;
    } else {
      const ttl =
        statusCode === 429 ? EXHAUSTED_TTL_429_MS : EXHAUSTED_TTL_DEFAULT_MS;
      entry.exhaustedUntil = Date.now() + ttl;
    }
  }

  /**
   * Manually recover a credential (e.g., after token refresh).
   */
  recover(credentialId: string): void {
    const entry = this.findById(credentialId);
    if (!entry) return;
    entry.status = STATUS_OK;
    entry.exhaustedUntil = undefined;
    entry.lastErrorCode = undefined;
    entry.lastErrorMessage = undefined;
    entry.lastErrorAt = undefined;
  }

  /**
   * Get the soonest time any exhausted credential will recover,
   * or undefined if none are exhausted.
   */
  soonestRecovery(): number | undefined {
    let soonest: number | undefined;
    for (const entry of this.entries) {
      if (
        entry.status === STATUS_EXHAUSTED &&
        entry.exhaustedUntil !== undefined
      ) {
        if (soonest === undefined || entry.exhaustedUntil < soonest) {
          soonest = entry.exhaustedUntil;
        }
      }
    }
    return soonest;
  }

  // ── Serialization ──

  toJSON(): PooledCredential[] {
    return this.entries.map((e) => ({ ...e }));
  }

  static fromJSON(
    options: CredentialPoolOptions,
    entries: PooledCredential[],
  ): CredentialPool {
    return new CredentialPool(options, entries);
  }

  // ── Internals ──

  private isAvailable(entry: PooledCredential): boolean {
    if (entry.status === STATUS_OK) return true;
    // Check if exhaustion has expired
    if (
      entry.status === STATUS_EXHAUSTED &&
      entry.exhaustedUntil !== undefined &&
      Date.now() >= entry.exhaustedUntil
    ) {
      entry.status = STATUS_OK;
      entry.exhaustedUntil = undefined;
      return true;
    }
    return false;
  }

  private findById(id: string): PooledCredential | undefined {
    return this.entries.find((e) => e.id === id);
  }
}

// ── Formatting ──

export function formatCredentialPoolStatus(pool: CredentialPool): string {
  const entries = pool.allEntries();
  if (entries.length === 0) return `${pool.provider}: no credentials`;
  const available = pool.availableCount();
  const lines = [
    `${pool.provider}: ${available}/${entries.length} available`,
  ];
  for (const entry of entries) {
    const status = entry.status === STATUS_OK ? "✓" : "✗";
    const label = entry.label ?? entry.id;
    const extra =
      entry.status === STATUS_EXHAUSTED && entry.exhaustedUntil
        ? ` (recovers in ${Math.max(0, Math.ceil((entry.exhaustedUntil - Date.now()) / 1000))}s)`
        : "";
    lines.push(`  ${status} ${label} [${entry.source}]${extra}`);
  }
  return lines.join("\n");
}
