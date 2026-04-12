/**
 * WeCom (WeChat Work) channel adapter (Track F — Gateway Platforms)
 *
 * Enterprise messaging integration for WeCom (企业微信).
 * Handles message encryption/decryption, token management, and media upload.
 *
 * Ported from hermes-agent `gateway/platforms/wecom.py` + `wecom_crypto.py`.
 */

import { createHmac, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// ── Types ──

export type WeComConfig = {
  /** Enable WeCom adapter. */
  enabled: boolean;
  /** WeCom Corp ID. */
  corpId: string;
  /** WeCom App Secret. */
  corpSecret: string;
  /** WeCom Agent ID. */
  agentId: string;
  /** Callback verification token (for webhook mode). */
  callbackToken: string;
  /** AES encoding key (43 chars Base64, for message encryption). */
  encodingAesKey: string;
  /** Configurable API base URL (for region-specific endpoints). */
  apiBaseUrl: string;
  /** Access token TTL (ms). Default: 7000_000 (~1h56m, token expires in 2h). */
  tokenTtlMs: number;
};

export const DEFAULT_WECOM_CONFIG: WeComConfig = {
  enabled: false,
  corpId: process.env.WECOM_CORP_ID ?? "",
  corpSecret: process.env.WECOM_CORP_SECRET ?? "",
  agentId: process.env.WECOM_AGENT_ID ?? "",
  callbackToken: process.env.WECOM_CALLBACK_TOKEN ?? "",
  encodingAesKey: process.env.WECOM_ENCODING_AES_KEY ?? "",
  apiBaseUrl: "https://qyapi.weixin.qq.com",
  tokenTtlMs: 7_000_000,
};

export type WeComMessage = {
  toUser: string;
  msgType: "text" | "markdown" | "image" | "file";
  content: string;
  mediaId?: string;
};

export type WeComInboundMessage = {
  fromUser: string;
  createTime: number;
  msgType: string;
  content: string;
  msgId: string;
};

export type WeComResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; errCode?: number };

// ── HTTP client interface ──

export type WeComHttpClient = {
  get(url: string, timeoutMs?: number): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  post(url: string, body: unknown, headers?: Record<string, string>, timeoutMs?: number): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
};

// ── Token manager ──

type TokenState = {
  token: string;
  expiresAt: number;
};

export type WeComTokenManager = {
  getAccessToken(): Promise<WeComResult<string>>;
  invalidate(): void;
};

export function createWeComTokenManager(
  config: WeComConfig,
  http: WeComHttpClient,
): WeComTokenManager {
  let cached: TokenState | null = null;

  return {
    async getAccessToken(): Promise<WeComResult<string>> {
      const now = Date.now();
      if (cached && cached.expiresAt > now) {
        return { ok: true, data: cached.token };
      }

      try {
        const url =
          `${config.apiBaseUrl}/cgi-bin/gettoken` +
          `?corpid=${encodeURIComponent(config.corpId)}` +
          `&corpsecret=${encodeURIComponent(config.corpSecret)}`;

        const resp = await http.get(url, 10_000);
        if (!resp.ok) return { ok: false, error: `Token request failed: ${resp.status}` };

        const data = (await resp.json()) as { errcode?: number; errmsg?: string; access_token?: string; expires_in?: number };
        if (data.errcode && data.errcode !== 0) {
          return { ok: false, error: data.errmsg ?? "Unknown error", errCode: data.errcode };
        }

        cached = {
          token: data.access_token ?? "",
          expiresAt: now + (config.tokenTtlMs),
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

// ── Message encryption/decryption (WeCom callback mode) ──

export type WeComCrypto = {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
  verifySignature(timestamp: string, nonce: string, encrypted: string, signature: string): boolean;
  generateSignature(timestamp: string, nonce: string, encrypted: string): string;
};

export function createWeComCrypto(config: WeComConfig): WeComCrypto {
  // Decode AES key from base64 (43 chars → 32 bytes)
  const aesKey = Buffer.from(config.encodingAesKey + "=", "base64");
  const iv = aesKey.subarray(0, 16);

  return {
    encrypt(plaintext: string): string {
      const randomPrefix = randomBytes(16);
      const textBuf = Buffer.from(plaintext, "utf-8");
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32BE(textBuf.length, 0);
      const corpIdBuf = Buffer.from(config.corpId, "utf-8");

      const unpadded = Buffer.concat([randomPrefix, lenBuf, textBuf, corpIdBuf]);
      // PKCS#7 padding
      const blockSize = 32;
      const padLen = blockSize - (unpadded.length % blockSize);
      const padded = Buffer.concat([unpadded, Buffer.alloc(padLen, padLen)]);

      const cipher = createCipheriv("aes-256-cbc", aesKey, iv);
      cipher.setAutoPadding(false);
      const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
      return encrypted.toString("base64");
    },

    decrypt(ciphertext: string): string {
      const encBuf = Buffer.from(ciphertext, "base64");
      const decipher = createDecipheriv("aes-256-cbc", aesKey, iv);
      decipher.setAutoPadding(false);
      const decrypted = Buffer.concat([decipher.update(encBuf), decipher.final()]);

      // Remove PKCS#7 padding
      const padLen = decrypted[decrypted.length - 1];
      const unpadded = decrypted.subarray(0, decrypted.length - padLen);

      // Skip 16 random bytes, read 4-byte length, extract content
      const contentLen = unpadded.readUInt32BE(16);
      const content = unpadded.subarray(20, 20 + contentLen);
      return content.toString("utf-8");
    },

    verifySignature(timestamp: string, nonce: string, encrypted: string, signature: string): boolean {
      const expected = this.generateSignature(timestamp, nonce, encrypted);
      // Constant-time comparison
      if (expected.length !== signature.length) return false;
      let diff = 0;
      for (let i = 0; i < expected.length; i++) {
        diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
      }
      return diff === 0;
    },

    generateSignature(timestamp: string, nonce: string, encrypted: string): string {
      const parts = [config.callbackToken, timestamp, nonce, encrypted].sort();
      const hash = createHmac("sha1", "").update(parts.join("")).digest("hex");
      return hash;
    },
  };
}

// ── Client ──

export type WeComClient = {
  sendText(toUser: string, content: string): Promise<WeComResult<void>>;
  sendMarkdown(toUser: string, content: string): Promise<WeComResult<void>>;
  parseInboundMessage(encryptedXml: string): WeComInboundMessage | null;
};

export function createWeComClient(
  config: WeComConfig,
  http: WeComHttpClient,
  tokenManager: WeComTokenManager,
  crypto: WeComCrypto,
): WeComClient {
  async function sendMessage(msg: {
    touser: string;
    msgtype: string;
    agentid: string;
    [key: string]: unknown;
  }): Promise<WeComResult<void>> {
    const tokenResult = await tokenManager.getAccessToken();
    if (!tokenResult.ok) return tokenResult;

    try {
      const url = `${config.apiBaseUrl}/cgi-bin/message/send?access_token=${tokenResult.data}`;
      const resp = await http.post(url, msg, { "Content-Type": "application/json" });
      if (!resp.ok) return { ok: false, error: `Send failed: ${resp.status}` };

      const data = (await resp.json()) as { errcode?: number; errmsg?: string };
      if (data.errcode && data.errcode !== 0) {
        // Token may have expired
        if (data.errcode === 40014 || data.errcode === 42001) {
          tokenManager.invalidate();
        }
        return { ok: false, error: data.errmsg ?? "Unknown error", errCode: data.errcode };
      }
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: `Send error: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  return {
    async sendText(toUser: string, content: string): Promise<WeComResult<void>> {
      return sendMessage({
        touser: toUser,
        msgtype: "text",
        agentid: config.agentId,
        text: { content },
      });
    },

    async sendMarkdown(toUser: string, content: string): Promise<WeComResult<void>> {
      return sendMessage({
        touser: toUser,
        msgtype: "markdown",
        agentid: config.agentId,
        markdown: { content },
      });
    },

    parseInboundMessage(encryptedXml: string): WeComInboundMessage | null {
      try {
        const decrypted = crypto.decrypt(encryptedXml);
        // Simple XML extraction (WeCom uses XML format)
        const extract = (tag: string): string => {
          const match = decrypted.match(new RegExp(`<${tag}><!\\[CDATA\\[(.+?)\\]\\]></${tag}>`));
          return match?.[1] ?? "";
        };
        const extractNum = (tag: string): string => {
          const match = decrypted.match(new RegExp(`<${tag}>(\\d+)</${tag}>`));
          return match?.[1] ?? "0";
        };

        return {
          fromUser: extract("FromUserName"),
          createTime: parseInt(extractNum("CreateTime"), 10),
          msgType: extract("MsgType"),
          content: extract("Content"),
          msgId: extractNum("MsgId"),
        };
      } catch {
        return null;
      }
    },
  };
}
