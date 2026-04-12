/**
 * Structured Error Classifier (Track A — Session Intelligence)
 *
 * Classifies API errors into a structured taxonomy that drives retry
 * decisions, credential rotation, model fallback, and context compression.
 *
 * Ported from hermes-agent `agent/error_classifier.py`.
 * Adapted to TypeScript and OpenClaw's provider landscape.
 */

// ── Failover reasons ──

export type FailoverReason =
  | "auth"
  | "auth_permanent"
  | "billing"
  | "rate_limit"
  | "overloaded"
  | "server_error"
  | "timeout"
  | "context_overflow"
  | "payload_too_large"
  | "model_not_found"
  | "format_error"
  | "content_filter"
  | "unknown";

// ── Classified error ──

export type ClassifiedError = {
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

// ── Pattern tables ──

const BILLING_PATTERNS: readonly string[] = [
  "insufficient credits",
  "insufficient_quota",
  "payment required",
  "billing",
  "quota exceeded",
  "exceeded your current quota",
  "spending limit",
  "insufficient balance",
  "account deactivated",
  "plan limit",
];

const RATE_LIMIT_PATTERNS: readonly string[] = [
  "rate limit",
  "rate_limit",
  "too many requests",
  "throttl",
  "request limit",
  "tokens per minute",
  "requests per minute",
  "requests per day",
  "capacity",
  "concurrency limit",
  "resource_exhausted",
];

const USAGE_LIMIT_PATTERNS: readonly string[] = [
  "usage limit",
  "daily limit",
  "monthly limit",
  "hourly limit",
];

const USAGE_LIMIT_TRANSIENT_SIGNALS: readonly string[] = [
  "try again",
  "resets at",
  "reset in",
  "please wait",
  "retry after",
  "will reset",
  "cooldown",
  "temporarily",
];

const CONTEXT_OVERFLOW_PATTERNS: readonly string[] = [
  "context length",
  "context_length",
  "token limit",
  "maximum context",
  "max tokens",
  "too many tokens",
  "context window",
  "input too long",
  "prompt is too long",
  "maximum allowed",
  "exceeds.*limit",
  "string too long",
  "超过最大长度",
];

const MODEL_NOT_FOUND_PATTERNS: readonly string[] = [
  "model not found",
  "model_not_found",
  "does not exist",
  "no such model",
  "unknown model",
  "invalid model",
  "not available",
  "decommissioned",
];

const AUTH_PATTERNS: readonly string[] = [
  "invalid.*key",
  "invalid.*token",
  "unauthorized",
  "authentication",
  "permission denied",
  "access denied",
  "forbidden",
  "invalid api key",
  "api key.*invalid",
  "not authorized",
];

const PAYLOAD_TOO_LARGE_PATTERNS: readonly string[] = [
  "payload too large",
  "request entity too large",
  "content too large",
];

const SERVER_DISCONNECT_PATTERNS: readonly string[] = [
  "connection reset",
  "connection closed",
  "connection refused",
  "socket hang up",
  "econnreset",
  "epipe",
  "network error",
];

const CONTENT_FILTER_PATTERNS: readonly string[] = [
  "content filter",
  "content_filter",
  "content policy",
  "safety system",
  "blocked by",
  "moderation",
  "flagged",
];

const TRANSPORT_ERROR_TYPES: ReadonlySet<string> = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
  "ABORT_ERR",
  "FETCH_ERROR",
  "TypeError",
  "AbortError",
]);

// ── Helpers ──

function matchesAnyPattern(text: string, patterns: readonly string[]): boolean {
  const lower = text.toLowerCase();
  for (const p of patterns) {
    if (p.includes(".*")) {
      if (new RegExp(p, "i").test(lower)) return true;
    } else {
      if (lower.includes(p)) return true;
    }
  }
  return false;
}

function extractStatusCode(error: unknown): number | undefined {
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    if (typeof e.status === "number") return e.status;
    if (typeof e.statusCode === "number") return e.statusCode;
    if (e.response && typeof e.response === "object") {
      const resp = e.response as Record<string, unknown>;
      if (typeof resp.status === "number") return resp.status;
    }
  }
  return undefined;
}

function extractErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    if (typeof e.code === "string") return e.code;
    if (typeof e.errno === "string") return e.errno;
  }
  return undefined;
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    if (typeof e.message === "string") return e.message;
    if (typeof e.error === "string") return e.error;
    if (e.error && typeof e.error === "object") {
      const inner = e.error as Record<string, unknown>;
      if (typeof inner.message === "string") return inner.message;
    }
  }
  return String(error);
}

// ── Default cooldowns per reason ──

const COOLDOWN_MS: Record<FailoverReason, number> = {
  auth: 0,
  auth_permanent: 0,
  billing: 0,
  rate_limit: 60_000,
  overloaded: 30_000,
  server_error: 10_000,
  timeout: 5_000,
  context_overflow: 0,
  payload_too_large: 0,
  model_not_found: 0,
  format_error: 0,
  content_filter: 0,
  unknown: 5_000,
};

const RETRYABLE_REASONS: ReadonlySet<FailoverReason> = new Set([
  "rate_limit",
  "overloaded",
  "server_error",
  "timeout",
]);

// ── Main classifier ──

export type ClassifyErrorParams = {
  error: unknown;
  provider: string;
  model: string;
  approxTokens?: number;
  contextLength?: number;
};

/**
 * Classify an API error into a structured taxonomy.
 *
 * Uses a priority-ordered pipeline:
 * 1. HTTP status code + message refinement
 * 2. Structured error code from body
 * 3. Message pattern matching
 * 4. Transport/timeout heuristics
 * 5. Server disconnect + large session → context overflow
 * 6. Fallback: unknown
 */
export function classifyApiError(params: ClassifyErrorParams): ClassifiedError {
  const { error, provider, model, approxTokens, contextLength } = params;
  const message = extractMessage(error);
  const statusCode = extractStatusCode(error);
  const errorCode = extractErrorCode(error);

  let reason: FailoverReason = "unknown";
  let shouldCompress = false;
  let shouldRotateCredential = false;
  let shouldFallback = false;

  // ─ Step 1: HTTP status code ─
  if (statusCode !== undefined) {
    switch (statusCode) {
      case 401:
        reason = "auth";
        shouldRotateCredential = true;
        break;
      case 403:
        if (matchesAnyPattern(message, AUTH_PATTERNS)) {
          reason = "auth";
          shouldRotateCredential = true;
        } else {
          reason = "auth_permanent";
        }
        break;
      case 402:
        // Disambiguate billing exhaustion from transient usage limits
        if (matchesAnyPattern(message, USAGE_LIMIT_TRANSIENT_SIGNALS)) {
          reason = "rate_limit";
        } else {
          reason = "billing";
        }
        break;
      case 429:
        reason = "rate_limit";
        shouldRotateCredential = true;
        break;
      case 413:
        reason = "payload_too_large";
        break;
      case 422:
        if (matchesAnyPattern(message, CONTEXT_OVERFLOW_PATTERNS)) {
          reason = "context_overflow";
          shouldCompress = true;
        } else {
          reason = "format_error";
        }
        break;
      case 400:
        if (matchesAnyPattern(message, CONTEXT_OVERFLOW_PATTERNS)) {
          reason = "context_overflow";
          shouldCompress = true;
        } else if (matchesAnyPattern(message, MODEL_NOT_FOUND_PATTERNS)) {
          reason = "model_not_found";
          shouldFallback = true;
        } else if (matchesAnyPattern(message, CONTENT_FILTER_PATTERNS)) {
          reason = "content_filter";
        } else {
          reason = "format_error";
        }
        break;
      case 404:
        reason = "model_not_found";
        shouldFallback = true;
        break;
      case 500:
      case 502:
      case 503:
        reason = matchesAnyPattern(message, RATE_LIMIT_PATTERNS)
          ? "rate_limit"
          : "server_error";
        break;
      case 504:
        reason = "timeout";
        break;
      default:
        if (statusCode >= 500) {
          reason = "server_error";
        }
    }
  }

  // ─ Step 2: Transport error code ─
  if (reason === "unknown" && errorCode) {
    if (TRANSPORT_ERROR_TYPES.has(errorCode)) {
      // Server disconnect + large session → probable context overflow
      if (
        matchesAnyPattern(errorCode, ["econnreset", "epipe"]) &&
        approxTokens !== undefined &&
        contextLength !== undefined &&
        approxTokens > contextLength * 0.8
      ) {
        reason = "context_overflow";
        shouldCompress = true;
      } else if (errorCode.includes("TIMEOUT")) {
        reason = "timeout";
      } else {
        reason = "server_error";
      }
    }
  }

  // ─ Step 3: Message pattern matching (if status didn't resolve) ─
  if (reason === "unknown") {
    if (matchesAnyPattern(message, CONTEXT_OVERFLOW_PATTERNS)) {
      reason = "context_overflow";
      shouldCompress = true;
    } else if (matchesAnyPattern(message, RATE_LIMIT_PATTERNS)) {
      reason = "rate_limit";
      shouldRotateCredential = true;
    } else if (matchesAnyPattern(message, BILLING_PATTERNS)) {
      reason = "billing";
    } else if (matchesAnyPattern(message, AUTH_PATTERNS)) {
      reason = "auth";
      shouldRotateCredential = true;
    } else if (matchesAnyPattern(message, MODEL_NOT_FOUND_PATTERNS)) {
      reason = "model_not_found";
      shouldFallback = true;
    } else if (matchesAnyPattern(message, CONTENT_FILTER_PATTERNS)) {
      reason = "content_filter";
    } else if (matchesAnyPattern(message, PAYLOAD_TOO_LARGE_PATTERNS)) {
      reason = "payload_too_large";
    } else if (matchesAnyPattern(message, SERVER_DISCONNECT_PATTERNS)) {
      reason = "server_error";
    }
  }

  return {
    reason,
    statusCode,
    provider,
    model,
    message,
    retryable: RETRYABLE_REASONS.has(reason),
    shouldCompress,
    shouldRotateCredential,
    shouldFallback,
    cooldownMs: COOLDOWN_MS[reason],
  };
}

// ── Formatting ──

export function formatClassifiedError(classified: ClassifiedError): string {
  const parts = [
    `[${classified.reason}]`,
    classified.statusCode !== undefined ? `HTTP ${classified.statusCode}` : undefined,
    `${classified.provider}/${classified.model}`,
    classified.message.length > 120
      ? classified.message.slice(0, 120) + "…"
      : classified.message,
  ].filter(Boolean);
  return parts.join(" — ");
}

/**
 * Summary for diagnostics/journal entries.
 */
export function classifiedErrorSummary(classified: ClassifiedError): Record<string, unknown> {
  return {
    reason: classified.reason,
    statusCode: classified.statusCode,
    provider: classified.provider,
    model: classified.model,
    retryable: classified.retryable,
    shouldCompress: classified.shouldCompress,
    shouldRotateCredential: classified.shouldRotateCredential,
    shouldFallback: classified.shouldFallback,
    cooldownMs: classified.cooldownMs,
  };
}
