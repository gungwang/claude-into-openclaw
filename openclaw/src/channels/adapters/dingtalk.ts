/**
 * DingTalk (钉钉) channel adapter (Track F — Gateway Platforms)
 *
 * Enterprise messaging integration for DingTalk.
 * Supports outgoing webhook (robot) mode with message signing and incoming webhook callbacks.
 *
 * Ported from hermes-agent `gateway/platforms/dingtalk.py`.
 */

import { createHmac } from "node:crypto";

// ── Types ──

export type DingTalkConfig = {
  /** Enable DingTalk adapter. */
  enabled: boolean;
  /** Robot webhook URL for outgoing messages. */
  webhookUrl: string;
  /** Signing secret for outgoing webhook security. */
  secret: string;
  /** App Key for DingTalk Open API (optional, for advanced features). */
  appKey: string;
  /** App Secret for DingTalk Open API. */
  appSecret: string;
  /** Configurable API base URL (region-specific). */
  apiBaseUrl: string;
  /** Request timeout (ms). */
  timeoutMs: number;
};

export const DEFAULT_DINGTALK_CONFIG: DingTalkConfig = {
  enabled: false,
  webhookUrl: process.env.DINGTALK_WEBHOOK_URL ?? "",
  secret: process.env.DINGTALK_SECRET ?? "",
  appKey: process.env.DINGTALK_APP_KEY ?? "",
  appSecret: process.env.DINGTALK_APP_SECRET ?? "",
  apiBaseUrl: "https://oapi.dingtalk.com",
  timeoutMs: 15_000,
};

export type DingTalkMessageType = "text" | "markdown" | "actionCard" | "link";

export type DingTalkInboundMessage = {
  senderId: string;
  senderNick: string;
  conversationId: string;
  conversationType: "1" | "2"; // 1=private, 2=group
  msgType: string;
  content: string;
  msgId: string;
  sessionWebhookUrl: string;
};

export type DingTalkResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; errCode?: number };

// ── HTTP client interface ──

export type DingTalkHttpClient = {
  post(
    url: string,
    body: unknown,
    headers?: Record<string, string>,
    timeoutMs?: number,
  ): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
};

// ── Webhook signing ──

/**
 * Generate DingTalk webhook signature.
 * DingTalk uses: Base64(HmacSHA256(timestamp + "\n" + secret, secret))
 */
export function generateDingTalkSignature(
  secret: string,
  timestamp: number = Date.now(),
): { timestamp: number; sign: string } {
  const stringToSign = `${timestamp}\n${secret}`;
  const hmac = createHmac("sha256", secret).update(stringToSign).digest("base64");
  return { timestamp, sign: encodeURIComponent(hmac) };
}

// ── Inbound webhook verification ──

export function verifyDingTalkCallback(
  timestamp: string,
  sign: string,
  secret: string,
  maxAgeMs: number = 60_000,
): boolean {
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;

  // Reject old timestamps
  if (Math.abs(Date.now() - ts) > maxAgeMs) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}\n${secret}`)
    .digest("base64");

  // Constant-time comparison
  if (expected.length !== sign.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sign.charCodeAt(i);
  }
  return diff === 0;
}

// ── Client ──

export type DingTalkClient = {
  sendText(content: string, webhookUrl?: string): Promise<DingTalkResult<void>>;
  sendMarkdown(title: string, text: string, webhookUrl?: string): Promise<DingTalkResult<void>>;
  sendActionCard(title: string, text: string, webhookUrl?: string): Promise<DingTalkResult<void>>;
  parseInboundMessage(body: unknown): DingTalkInboundMessage | null;
};

export function createDingTalkClient(
  config: DingTalkConfig,
  http: DingTalkHttpClient,
): DingTalkClient {
  function buildSignedUrl(baseUrl: string): string {
    if (!config.secret) return baseUrl;
    const { timestamp, sign } = generateDingTalkSignature(config.secret);
    const sep = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${sep}timestamp=${timestamp}&sign=${sign}`;
  }

  async function postToWebhook(
    payload: Record<string, unknown>,
    webhookUrl?: string,
  ): Promise<DingTalkResult<void>> {
    const url = buildSignedUrl(webhookUrl ?? config.webhookUrl);
    if (!url) return { ok: false, error: "No webhook URL configured" };

    try {
      const resp = await http.post(url, payload, { "Content-Type": "application/json" }, config.timeoutMs);
      if (!resp.ok) return { ok: false, error: `DingTalk API returned ${resp.status}` };

      const data = (await resp.json()) as { errcode?: number; errmsg?: string };
      if (data.errcode && data.errcode !== 0) {
        return { ok: false, error: data.errmsg ?? "Unknown error", errCode: data.errcode };
      }
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: `DingTalk send error: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  return {
    async sendText(content: string, webhookUrl?: string): Promise<DingTalkResult<void>> {
      return postToWebhook({ msgtype: "text", text: { content } }, webhookUrl);
    },

    async sendMarkdown(title: string, text: string, webhookUrl?: string): Promise<DingTalkResult<void>> {
      return postToWebhook({ msgtype: "markdown", markdown: { title, text } }, webhookUrl);
    },

    async sendActionCard(title: string, text: string, webhookUrl?: string): Promise<DingTalkResult<void>> {
      return postToWebhook(
        { msgtype: "actionCard", actionCard: { title, text, hideAvatar: "0", btnOrientation: "0" } },
        webhookUrl,
      );
    },

    parseInboundMessage(body: unknown): DingTalkInboundMessage | null {
      if (!body || typeof body !== "object") return null;

      const b = body as Record<string, unknown>;
      const text = b.text as Record<string, unknown> | undefined;

      return {
        senderId: String(b.senderId ?? b.senderStaffId ?? ""),
        senderNick: String(b.senderNick ?? ""),
        conversationId: String(b.conversationId ?? ""),
        conversationType: String(b.conversationType ?? "1") as "1" | "2",
        msgType: String(b.msgtype ?? "text"),
        content: String(text?.content ?? b.content ?? "").trim(),
        msgId: String(b.msgId ?? ""),
        sessionWebhookUrl: String(b.sessionWebhook ?? ""),
      };
    },
  };
}
