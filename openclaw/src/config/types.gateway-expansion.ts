/**
 * Gateway Expansion Config Types (Track F)
 *
 * Configuration for enterprise platform adapters (WeCom, DingTalk, Feishu,
 * Mattermost), communication adapters (SMS, Email, Webhook),
 * gateway mirroring, and multi-destination delivery.
 */

// ── WeCom ──

export type WeComAdapterConfig = {
  /** Enable WeCom adapter. Default: false. */
  enabled?: boolean;
  /** WeCom Corp ID. */
  corpId?: string;
  /** WeCom App Secret. */
  corpSecret?: string;
  /** WeCom Agent ID. */
  agentId?: string;
  /** Callback verification token. */
  callbackToken?: string;
  /** AES encoding key (43 chars Base64). */
  encodingAesKey?: string;
  /** API base URL. Default: "https://qyapi.weixin.qq.com". */
  apiBaseUrl?: string;
};

// ── DingTalk ──

export type DingTalkAdapterConfig = {
  /** Enable DingTalk adapter. Default: false. */
  enabled?: boolean;
  /** Robot webhook URL. */
  webhookUrl?: string;
  /** Signing secret. */
  secret?: string;
  /** App Key (for Open API). */
  appKey?: string;
  /** App Secret. */
  appSecret?: string;
  /** API base URL. Default: "https://oapi.dingtalk.com". */
  apiBaseUrl?: string;
};

// ── Feishu ──

export type FeishuAdapterConfig = {
  /** Enable Feishu adapter. Default: false. */
  enabled?: boolean;
  /** Feishu App ID. */
  appId?: string;
  /** Feishu App Secret. */
  appSecret?: string;
  /** Verification token. */
  verificationToken?: string;
  /** Encrypt key. */
  encryptKey?: string;
  /** API base URL. "https://open.feishu.cn" (China) or "https://open.larksuite.com" (international). */
  apiBaseUrl?: string;
};

// ── Mattermost ──

export type MattermostAdapterConfig = {
  /** Enable Mattermost adapter. Default: false. */
  enabled?: boolean;
  /** Server URL. */
  serverUrl?: string;
  /** Personal access token or bot token. */
  token?: string;
  /** Default channel ID. */
  defaultChannelId?: string;
};

// ── SMS ──

export type SmsAdapterConfig = {
  /** Enable SMS adapter. Default: false. */
  enabled?: boolean;
  /** SMS provider. Default: "twilio". */
  provider?: "twilio" | "vonage" | "generic";
  /** Account SID or API key. */
  accountSid?: string;
  /** Auth token or API secret. */
  authToken?: string;
  /** Sender phone number (E.164). */
  fromNumber?: string;
  /** API base URL (generic provider). */
  apiBaseUrl?: string;
};

// ── Email ──

export type EmailAdapterConfig = {
  /** Enable email adapter. Default: false. */
  enabled?: boolean;
  /** Provider. Default: "smtp". */
  provider?: "smtp" | "sendgrid" | "ses" | "generic";
  /** SMTP host. */
  smtpHost?: string;
  /** SMTP port. Default: 587. */
  smtpPort?: number;
  /** SMTP username. */
  smtpUser?: string;
  /** SMTP password. */
  smtpPass?: string;
  /** Use TLS. Default: true. */
  smtpTls?: boolean;
  /** API key (for API providers). */
  apiKey?: string;
  /** Default from address. */
  fromAddress?: string;
  /** Default from name. Default: "OpenClaw". */
  fromName?: string;
};

// ── Webhook ──

export type WebhookAdapterConfig = {
  /** Enable webhook adapter. Default: false. */
  enabled?: boolean;
  /** HMAC secret for signature verification. */
  secret?: string;
  /** Signature algorithm. Default: "sha256". */
  signatureAlgo?: "sha256" | "sha1" | "sha512";
  /** Signature header name. Default: "x-signature-256". */
  signatureHeader?: string;
  /** Max body size (bytes). Default: 1MB. */
  maxBodySize?: number;
  /** Rate limit max requests per window. 0 = unlimited. */
  rateLimitMax?: number;
  /** Rate limit window (ms). Default: 60_000. */
  rateLimitWindowMs?: number;
};

// ── Gateway mirroring ──

export type GatewayMirroringConfig = {
  /** Enable gateway mirroring. Default: false. */
  enabled?: boolean;
  /** Session index path. Default: <stateDir>/sessions/sessions.json. */
  indexPath?: string;
};

// ── Multi-destination delivery ──

export type MultiDestinationConfig = {
  /** Enable multi-destination delivery. Default: false. */
  enabled?: boolean;
  /** Default delivery policy. Default: "all". */
  defaultPolicy?: "all" | "first-success" | "primary-with-fallback";
};

// ── Aggregate gateway expansion config ──

export type GatewayExpansionConfig = {
  wecom?: WeComAdapterConfig;
  dingtalk?: DingTalkAdapterConfig;
  feishu?: FeishuAdapterConfig;
  mattermost?: MattermostAdapterConfig;
  sms?: SmsAdapterConfig;
  email?: EmailAdapterConfig;
  webhook?: WebhookAdapterConfig;
  mirroring?: GatewayMirroringConfig;
  multiDestination?: MultiDestinationConfig;
};
