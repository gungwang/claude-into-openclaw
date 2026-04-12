/**
 * Generic HTTP Webhook channel adapter (Track F — Gateway Platforms)
 *
 * Accepts and responds to arbitrary HTTP POST payloads.
 * Supports HMAC signature verification, configurable payload transformation,
 * and both push and pull delivery modes.
 *
 * Ported from hermes-agent `gateway/platforms/webhook.py`.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

// ── Types ──

export type WebhookSignatureAlgo = "sha256" | "sha1" | "sha512";

export type WebhookConfig = {
  /** Enable webhook adapter. */
  enabled: boolean;
  /** Secret for HMAC signature verification. */
  secret: string;
  /** Signature algorithm. */
  signatureAlgo: WebhookSignatureAlgo;
  /** Header name containing the signature. */
  signatureHeader: string;
  /** Signature prefix (e.g., "sha256=" for GitHub-style). */
  signaturePrefix: string;
  /** Max request body size (bytes). Default: 1MB. */
  maxBodySize: number;
  /** Request timeout (ms) for outbound webhooks. */
  timeoutMs: number;
  /** Rate limit: max requests per window. 0 = unlimited. */
  rateLimitMax: number;
  /** Rate limit window (ms). Default: 60_000. */
  rateLimitWindowMs: number;
};

export const DEFAULT_WEBHOOK_CONFIG: WebhookConfig = {
  enabled: false,
  secret: process.env.WEBHOOK_SECRET ?? "",
  signatureAlgo: "sha256",
  signatureHeader: "x-signature-256",
  signaturePrefix: "sha256=",
  maxBodySize: 1_048_576, // 1MB
  timeoutMs: 15_000,
  rateLimitMax: 0,
  rateLimitWindowMs: 60_000,
};

export type WebhookInboundPayload = {
  /** Raw request body (string). */
  body: string;
  /** Parsed JSON body (if applicable). */
  json: unknown;
  /** Request headers (lowercase keys). */
  headers: Record<string, string>;
  /** HTTP method. */
  method: string;
  /** Request path (after base). */
  path: string;
  /** Query parameters. */
  query: Record<string, string>;
  /** Source IP address. */
  sourceIp: string;
  /** Timestamp of receipt. */
  receivedAt: number;
};

export type WebhookOutboundPayload = {
  /** Target URL. */
  url: string;
  /** HTTP method (default: POST). */
  method?: string;
  /** Request body. */
  body: unknown;
  /** Additional headers. */
  headers?: Record<string, string>;
};

export type WebhookResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ── HTTP client interface ──

export type WebhookHttpClient = {
  request(
    url: string,
    method: string,
    body: unknown,
    headers: Record<string, string>,
    timeoutMs?: number,
  ): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
    text(): Promise<string>;
  }>;
};

// ── Signature verification ──

export function verifyWebhookSignature(params: {
  body: string;
  secret: string;
  signature: string;
  algo: WebhookSignatureAlgo;
  prefix: string;
}): boolean {
  const { body, secret, signature, algo, prefix } = params;

  if (!secret || !signature) return false;

  const rawSig = signature.startsWith(prefix) ? signature.slice(prefix.length) : signature;
  const expected = createHmac(algo, secret).update(body).digest("hex");

  // Constant-time comparison
  try {
    return timingSafeEqual(Buffer.from(rawSig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export function generateWebhookSignature(params: {
  body: string;
  secret: string;
  algo: WebhookSignatureAlgo;
  prefix: string;
}): string {
  const hmac = createHmac(params.algo, params.secret).update(params.body).digest("hex");
  return `${params.prefix}${hmac}`;
}

// ── Rate limiter ──

export type RateLimiter = {
  check(key: string): boolean;
  reset(): void;
};

export function createRateLimiter(maxRequests: number, windowMs: number): RateLimiter {
  const counts = new Map<string, { count: number; windowStart: number }>();

  return {
    check(key: string): boolean {
      if (maxRequests <= 0) return true; // unlimited

      const now = Date.now();
      const entry = counts.get(key);

      if (!entry || now - entry.windowStart >= windowMs) {
        counts.set(key, { count: 1, windowStart: now });
        return true;
      }

      if (entry.count >= maxRequests) return false;
      entry.count++;
      return true;
    },

    reset() {
      counts.clear();
    },
  };
}

// ── Client ──

export type WebhookClient = {
  verifyInbound(payload: WebhookInboundPayload): WebhookResult<void>;
  parseInboundPayload(rawBody: string, headers: Record<string, string>, meta: {
    method: string;
    path: string;
    query: Record<string, string>;
    sourceIp: string;
  }): WebhookInboundPayload;
  sendOutbound(payload: WebhookOutboundPayload): Promise<WebhookResult<unknown>>;
};

export function createWebhookClient(
  config: WebhookConfig,
  http: WebhookHttpClient,
): WebhookClient {
  const rateLimiter = createRateLimiter(config.rateLimitMax, config.rateLimitWindowMs);

  return {
    verifyInbound(payload: WebhookInboundPayload): WebhookResult<void> {
      // Body size check
      if (payload.body.length > config.maxBodySize) {
        return { ok: false, error: `Body exceeds max size: ${payload.body.length} > ${config.maxBodySize}` };
      }

      // Rate limit check
      if (!rateLimiter.check(payload.sourceIp)) {
        return { ok: false, error: "Rate limit exceeded" };
      }

      // Signature verification (skip if no secret configured)
      if (config.secret) {
        const signature = payload.headers[config.signatureHeader.toLowerCase()] ?? "";
        if (!signature) {
          return { ok: false, error: "Missing webhook signature" };
        }

        const valid = verifyWebhookSignature({
          body: payload.body,
          secret: config.secret,
          signature,
          algo: config.signatureAlgo,
          prefix: config.signaturePrefix,
        });

        if (!valid) {
          return { ok: false, error: "Invalid webhook signature" };
        }
      }

      return { ok: true, data: undefined };
    },

    parseInboundPayload(rawBody: string, headers: Record<string, string>, meta: {
      method: string;
      path: string;
      query: Record<string, string>;
      sourceIp: string;
    }): WebhookInboundPayload {
      let json: unknown = null;
      try {
        json = JSON.parse(rawBody);
      } catch {
        // Not JSON — that's fine for webhook payloads
      }

      // Normalize header keys to lowercase
      const normalizedHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(headers)) {
        normalizedHeaders[key.toLowerCase()] = value;
      }

      return {
        body: rawBody,
        json,
        headers: normalizedHeaders,
        method: meta.method,
        path: meta.path,
        query: meta.query,
        sourceIp: meta.sourceIp,
        receivedAt: Date.now(),
      };
    },

    async sendOutbound(payload: WebhookOutboundPayload): Promise<WebhookResult<unknown>> {
      if (!config.enabled) return { ok: false, error: "Webhook is disabled" };

      const method = payload.method ?? "POST";
      const bodyStr = typeof payload.body === "string" ? payload.body : JSON.stringify(payload.body);

      const outHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        ...payload.headers,
      };

      // Sign outbound payload if secret is configured
      if (config.secret) {
        outHeaders[config.signatureHeader] = generateWebhookSignature({
          body: bodyStr,
          secret: config.secret,
          algo: config.signatureAlgo,
          prefix: config.signaturePrefix,
        });
      }

      try {
        const resp = await http.request(
          payload.url,
          method,
          payload.body,
          outHeaders,
          config.timeoutMs,
        );

        if (!resp.ok) {
          const text = await resp.text();
          return { ok: false, error: `Webhook returned ${resp.status}: ${text}` };
        }

        const data = await resp.json().catch(() => null);
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: `Webhook error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
}
