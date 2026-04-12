/**
 * Feishu / Lark (飞书) channel adapter (Track F — Gateway Platforms)
 *
 * Enterprise messaging integration for ByteDance Feishu (international: Lark).
 * Supports bot messaging, event callbacks with signature verification,
 * and card (interactive message) rendering.
 *
 * Ported from hermes-agent `gateway/platforms/feishu.py`.
 */

import { createHmac } from "node:crypto";

// ── Types ──

export type FeishuConfig = {
  /** Enable Feishu adapter. */
  enabled: boolean;
  /** Feishu App ID. */
  appId: string;
  /** Feishu App Secret. */
  appSecret: string;
  /** Verification token for event callbacks. */
  verificationToken: string;
  /** Encrypt key for event callback decryption (optional). */
  encryptKey: string;
  /** API base URL. Use https://open.feishu.cn for China, https://open.larksuite.com for international. */
  apiBaseUrl: string;
  /** Tenant access token TTL (ms). Default: 7000_000 (~1h56m, expires in 2h). */
  tokenTtlMs: number;
  /** Request timeout (ms). */
  timeoutMs: number;
};

export const DEFAULT_FEISHU_CONFIG: FeishuConfig = {
  enabled: false,
  appId: process.env.FEISHU_APP_ID ?? "",
  appSecret: process.env.FEISHU_APP_SECRET ?? "",
  verificationToken: process.env.FEISHU_VERIFICATION_TOKEN ?? "",
  encryptKey: process.env.FEISHU_ENCRYPT_KEY ?? "",
  apiBaseUrl: process.env.FEISHU_API_BASE ?? "https://open.feishu.cn",
  tokenTtlMs: 7_000_000,
  timeoutMs: 15_000,
};

export type FeishuMessageType = "text" | "post" | "interactive" | "image" | "file";

export type FeishuInboundEvent = {
  eventType: string;
  messageId: string;
  chatId: string;
  chatType: "p2p" | "group";
  senderId: string;
  messageType: string;
  content: string;
  createTime: string;
};

export type FeishuResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: number };

// ── HTTP client interface ──

export type FeishuHttpClient = {
  post(
    url: string,
    body: unknown,
    headers?: Record<string, string>,
    timeoutMs?: number,
  ): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
};

// ── Token manager ──

type TokenState = {
  token: string;
  expiresAt: number;
};

export type FeishuTokenManager = {
  getTenantAccessToken(): Promise<FeishuResult<string>>;
  invalidate(): void;
};

export function createFeishuTokenManager(
  config: FeishuConfig,
  http: FeishuHttpClient,
): FeishuTokenManager {
  let cached: TokenState | null = null;

  return {
    async getTenantAccessToken(): Promise<FeishuResult<string>> {
      const now = Date.now();
      if (cached && cached.expiresAt > now) {
        return { ok: true, data: cached.token };
      }

      try {
        const url = `${config.apiBaseUrl}/open-apis/auth/v3/tenant_access_token/internal`;
        const resp = await http.post(url, {
          app_id: config.appId,
          app_secret: config.appSecret,
        }, { "Content-Type": "application/json" }, config.timeoutMs);

        if (!resp.ok) return { ok: false, error: `Token request failed: ${resp.status}` };

        const data = (await resp.json()) as {
          code?: number;
          msg?: string;
          tenant_access_token?: string;
          expire?: number;
        };
        if (data.code && data.code !== 0) {
          return { ok: false, error: data.msg ?? "Unknown error", code: data.code };
        }

        cached = {
          token: data.tenant_access_token ?? "",
          expiresAt: now + config.tokenTtlMs,
        };
        return { ok: true, data: cached.token };
      } catch (err) {
        return { ok: false, error: `Token fetch error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },

    invalidate() {
      cached = null;
    },
  };
}

// ── Event callback verification ──

/**
 * Verify Feishu event callback signature.
 * Signature = SHA256(timestamp + nonce + encryptKey + body)
 */
export function verifyFeishuCallback(params: {
  timestamp: string;
  nonce: string;
  encryptKey: string;
  body: string;
  signature: string;
}): boolean {
  const { timestamp, nonce, encryptKey, body, signature } = params;
  const content = timestamp + nonce + encryptKey + body;
  const expected = createHmac("sha256", "")
    .update(content)
    .digest("hex");

  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

// ── Client ──

export type FeishuClient = {
  sendText(chatId: string, text: string): Promise<FeishuResult<string>>;
  sendMarkdown(chatId: string, title: string, content: string): Promise<FeishuResult<string>>;
  sendCard(chatId: string, card: Record<string, unknown>): Promise<FeishuResult<string>>;
  replyText(messageId: string, text: string): Promise<FeishuResult<string>>;
  parseInboundEvent(body: unknown): FeishuInboundEvent | null;
};

export function createFeishuClient(
  config: FeishuConfig,
  http: FeishuHttpClient,
  tokenManager: FeishuTokenManager,
): FeishuClient {
  async function sendMessage(
    receiveIdType: "chat_id" | "open_id" | "user_id",
    receiveId: string,
    msgType: string,
    content: string,
  ): Promise<FeishuResult<string>> {
    const tokenResult = await tokenManager.getTenantAccessToken();
    if (!tokenResult.ok) return tokenResult;

    try {
      const url = `${config.apiBaseUrl}/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`;
      const resp = await http.post(
        url,
        { receive_id: receiveId, msg_type: msgType, content },
        {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenResult.data}`,
        },
        config.timeoutMs,
      );

      if (!resp.ok) return { ok: false, error: `Feishu API returned ${resp.status}` };

      const data = (await resp.json()) as {
        code?: number;
        msg?: string;
        data?: { message_id?: string };
      };
      if (data.code && data.code !== 0) {
        if (data.code === 99991663 || data.code === 99991664) {
          tokenManager.invalidate();
        }
        return { ok: false, error: data.msg ?? "Unknown error", code: data.code };
      }
      return { ok: true, data: data.data?.message_id ?? "" };
    } catch (err) {
      return { ok: false, error: `Feishu send error: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  async function replyMessage(
    messageId: string,
    msgType: string,
    content: string,
  ): Promise<FeishuResult<string>> {
    const tokenResult = await tokenManager.getTenantAccessToken();
    if (!tokenResult.ok) return tokenResult;

    try {
      const url = `${config.apiBaseUrl}/open-apis/im/v1/messages/${messageId}/reply`;
      const resp = await http.post(
        url,
        { msg_type: msgType, content },
        {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenResult.data}`,
        },
        config.timeoutMs,
      );

      if (!resp.ok) return { ok: false, error: `Feishu reply failed: ${resp.status}` };

      const data = (await resp.json()) as {
        code?: number;
        msg?: string;
        data?: { message_id?: string };
      };
      if (data.code && data.code !== 0) {
        return { ok: false, error: data.msg ?? "Unknown error", code: data.code };
      }
      return { ok: true, data: data.data?.message_id ?? "" };
    } catch (err) {
      return { ok: false, error: `Feishu reply error: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  return {
    async sendText(chatId: string, text: string): Promise<FeishuResult<string>> {
      return sendMessage("chat_id", chatId, "text", JSON.stringify({ text }));
    },

    async sendMarkdown(chatId: string, title: string, content: string): Promise<FeishuResult<string>> {
      // Feishu "post" message type supports rich text (similar to markdown)
      const postContent = {
        zh_cn: {
          title,
          content: [[{ tag: "text", text: content }]],
        },
      };
      return sendMessage("chat_id", chatId, "post", JSON.stringify(postContent));
    },

    async sendCard(chatId: string, card: Record<string, unknown>): Promise<FeishuResult<string>> {
      return sendMessage("chat_id", chatId, "interactive", JSON.stringify(card));
    },

    async replyText(messageId: string, text: string): Promise<FeishuResult<string>> {
      return replyMessage(messageId, "text", JSON.stringify({ text }));
    },

    parseInboundEvent(body: unknown): FeishuInboundEvent | null {
      if (!body || typeof body !== "object") return null;

      const b = body as Record<string, unknown>;
      const header = b.header as Record<string, unknown> | undefined;
      const event = b.event as Record<string, unknown> | undefined;

      if (!event) return null;

      const message = event.message as Record<string, unknown> | undefined;
      const sender = event.sender as Record<string, unknown> | undefined;
      const senderId = sender?.sender_id as Record<string, unknown> | undefined;

      return {
        eventType: String(header?.event_type ?? ""),
        messageId: String(message?.message_id ?? ""),
        chatId: String(message?.chat_id ?? ""),
        chatType: String(message?.chat_type ?? "p2p") as "p2p" | "group",
        senderId: String(senderId?.open_id ?? senderId?.user_id ?? ""),
        messageType: String(message?.message_type ?? "text"),
        content: String(message?.content ?? ""),
        createTime: String(message?.create_time ?? ""),
      };
    },
  };
}
