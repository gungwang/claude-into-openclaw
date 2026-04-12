/**
 * SMS channel adapter (Track F — Gateway Platforms)
 *
 * Send and receive SMS via a configurable provider backend.
 * Default provider: Twilio. Easily extensible to other SMS gateways.
 *
 * Ported from hermes-agent `gateway/platforms/sms.py`.
 */

// ── Types ──

export type SmsProvider = "twilio" | "vonage" | "generic";

export type SmsConfig = {
  /** Enable SMS adapter. */
  enabled: boolean;
  /** SMS provider backend. */
  provider: SmsProvider;
  /** Provider account SID or API key. */
  accountSid: string;
  /** Provider auth token or API secret. */
  authToken: string;
  /** Sender phone number (E.164: +1234567890). */
  fromNumber: string;
  /** Provider API base URL (for generic provider). */
  apiBaseUrl: string;
  /** Request timeout (ms). */
  timeoutMs: number;
  /** Max message length (SMS standard: 160 for GSM-7, 70 for UCS-2). */
  maxLength: number;
};

export const DEFAULT_SMS_CONFIG: SmsConfig = {
  enabled: false,
  provider: "twilio",
  accountSid: process.env.SMS_ACCOUNT_SID ?? process.env.TWILIO_ACCOUNT_SID ?? "",
  authToken: process.env.SMS_AUTH_TOKEN ?? process.env.TWILIO_AUTH_TOKEN ?? "",
  fromNumber: process.env.SMS_FROM_NUMBER ?? process.env.TWILIO_FROM_NUMBER ?? "",
  apiBaseUrl: "",
  timeoutMs: 15_000,
  maxLength: 1600,
};

export type SmsMessage = {
  to: string;
  body: string;
};

export type SmsInboundMessage = {
  from: string;
  to: string;
  body: string;
  messageId: string;
};

export type SmsResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ── Phone number validation ──

const E164_RE = /^\+[1-9]\d{1,14}$/;

export function validatePhoneNumber(phone: string): string | undefined {
  if (!phone) return "Empty phone number";
  if (!E164_RE.test(phone)) return `Invalid E.164 format: ${phone}`;
  return undefined;
}

// ── HTTP client interface ──

export type SmsHttpClient = {
  post(
    url: string,
    body: string | Record<string, unknown>,
    headers: Record<string, string>,
    timeoutMs?: number,
  ): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
};

// ── Client ──

export type SmsClient = {
  send(to: string, body: string): Promise<SmsResult<string>>;
  parseInboundWebhook(body: unknown): SmsInboundMessage | null;
};

export function createSmsClient(config: SmsConfig, http: SmsHttpClient): SmsClient {
  return {
    async send(to: string, body: string): Promise<SmsResult<string>> {
      if (!config.enabled) return { ok: false, error: "SMS is disabled" };

      const phoneErr = validatePhoneNumber(to);
      if (phoneErr) return { ok: false, error: phoneErr };

      const fromErr = validatePhoneNumber(config.fromNumber);
      if (fromErr) return { ok: false, error: `Invalid from number: ${fromErr}` };

      // Truncate to max length
      const truncated = body.length > config.maxLength ? body.slice(0, config.maxLength) : body;

      if (config.provider === "twilio") {
        return sendViaTwilio(config, http, to, truncated);
      } else if (config.provider === "vonage") {
        return sendViaVonage(config, http, to, truncated);
      }
      return sendViaGeneric(config, http, to, truncated);
    },

    parseInboundWebhook(body: unknown): SmsInboundMessage | null {
      if (!body || typeof body !== "object") return null;

      const b = body as Record<string, unknown>;

      // Twilio inbound webhook format
      if (b.From && b.Body) {
        return {
          from: String(b.From),
          to: String(b.To ?? ""),
          body: String(b.Body),
          messageId: String(b.MessageSid ?? b.SmsSid ?? ""),
        };
      }

      // Vonage inbound webhook format
      if (b.msisdn && b.text) {
        return {
          from: String(b.msisdn),
          to: String(b.to ?? ""),
          body: String(b.text),
          messageId: String(b.messageId ?? b["message-id"] ?? ""),
        };
      }

      // Generic format
      if (b.from && b.body) {
        return {
          from: String(b.from),
          to: String(b.to ?? ""),
          body: String(b.body),
          messageId: String(b.messageId ?? b.id ?? ""),
        };
      }

      return null;
    },
  };
}

// ── Provider implementations ──

async function sendViaTwilio(
  config: SmsConfig,
  http: SmsHttpClient,
  to: string,
  body: string,
): Promise<SmsResult<string>> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
  const authHeader = `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`;

  const formData = new URLSearchParams({ From: config.fromNumber, To: to, Body: body });

  try {
    const resp = await http.post(
      url,
      formData.toString(),
      {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      config.timeoutMs,
    );

    if (!resp.ok) return { ok: false, error: `Twilio API returned ${resp.status}` };

    const data = (await resp.json()) as { sid?: string; error_message?: string };
    if (data.error_message) return { ok: false, error: data.error_message };
    return { ok: true, data: data.sid ?? "" };
  } catch (err) {
    return { ok: false, error: `Twilio error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function sendViaVonage(
  config: SmsConfig,
  http: SmsHttpClient,
  to: string,
  body: string,
): Promise<SmsResult<string>> {
  const url = "https://rest.nexmo.com/sms/json";

  try {
    const resp = await http.post(
      url,
      {
        api_key: config.accountSid,
        api_secret: config.authToken,
        from: config.fromNumber,
        to: to.replace(/^\+/, ""),
        text: body,
      },
      { "Content-Type": "application/json" },
      config.timeoutMs,
    );

    if (!resp.ok) return { ok: false, error: `Vonage API returned ${resp.status}` };

    const data = (await resp.json()) as { messages?: Array<{ status?: string; "message-id"?: string; "error-text"?: string }> };
    const msg = data.messages?.[0];
    if (msg?.status !== "0") return { ok: false, error: msg?.["error-text"] ?? "Unknown error" };
    return { ok: true, data: msg["message-id"] ?? "" };
  } catch (err) {
    return { ok: false, error: `Vonage error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function sendViaGeneric(
  config: SmsConfig,
  http: SmsHttpClient,
  to: string,
  body: string,
): Promise<SmsResult<string>> {
  if (!config.apiBaseUrl) return { ok: false, error: "No API base URL configured for generic SMS provider" };

  try {
    const resp = await http.post(
      `${config.apiBaseUrl}/send`,
      { from: config.fromNumber, to, body },
      {
        Authorization: `Bearer ${config.authToken}`,
        "Content-Type": "application/json",
      },
      config.timeoutMs,
    );

    if (!resp.ok) return { ok: false, error: `SMS API returned ${resp.status}` };

    const data = (await resp.json()) as { id?: string; error?: string };
    if (data.error) return { ok: false, error: data.error };
    return { ok: true, data: data.id ?? "" };
  } catch (err) {
    return { ok: false, error: `SMS error: ${err instanceof Error ? err.message : String(err)}` };
  }
}
