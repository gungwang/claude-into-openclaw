/**
 * Email channel adapter (Track F — Gateway Platforms)
 *
 * Send and receive emails via SMTP/IMAP or provider APIs.
 * Supports plain text and HTML bodies, attachments, and inbound webhook parsing.
 *
 * Ported from hermes-agent `gateway/platforms/email.py`.
 */

// ── Types ──

export type EmailProvider = "smtp" | "sendgrid" | "ses" | "generic";

export type EmailConfig = {
  /** Enable email adapter. */
  enabled: boolean;
  /** Email provider backend. */
  provider: EmailProvider;
  /** SMTP host (for smtp provider). */
  smtpHost: string;
  /** SMTP port (for smtp provider). */
  smtpPort: number;
  /** SMTP username. */
  smtpUser: string;
  /** SMTP password. */
  smtpPass: string;
  /** Use TLS for SMTP. */
  smtpTls: boolean;
  /** API key (for sendgrid/ses/generic). */
  apiKey: string;
  /** Default from address. */
  fromAddress: string;
  /** Default from display name. */
  fromName: string;
  /** API base URL (for generic provider). */
  apiBaseUrl: string;
  /** Request timeout (ms). */
  timeoutMs: number;
};

export const DEFAULT_EMAIL_CONFIG: EmailConfig = {
  enabled: false,
  provider: "smtp",
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: parseInt(process.env.SMTP_PORT ?? "587", 10),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpTls: true,
  apiKey: process.env.EMAIL_API_KEY ?? process.env.SENDGRID_API_KEY ?? "",
  fromAddress: process.env.EMAIL_FROM ?? "",
  fromName: process.env.EMAIL_FROM_NAME ?? "OpenClaw",
  apiBaseUrl: "",
  timeoutMs: 30_000,
};

export type EmailMessage = {
  to: string | readonly string[];
  subject: string;
  textBody?: string;
  htmlBody?: string;
  cc?: string | readonly string[];
  bcc?: string | readonly string[];
  replyTo?: string;
  headers?: Record<string, string>;
};

export type EmailInboundMessage = {
  from: string;
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  messageId: string;
  date: string;
};

export type EmailResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ── Email address validation ──

/** Lightweight email format check (RFC 5322 simplified). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmailAddress(email: string): string | undefined {
  if (!email) return "Empty email address";
  if (!EMAIL_RE.test(email)) return `Invalid email format: ${email}`;
  return undefined;
}

function normalizeRecipients(input: string | readonly string[]): string[] {
  return (typeof input === "string" ? [input] : [...input]).filter(Boolean);
}

// ── HTTP client interface (for API-based providers) ──

export type EmailHttpClient = {
  post(
    url: string,
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

// ── SMTP transport interface (injectable) ──

export type SmtpTransport = {
  sendMail(options: {
    from: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string;
    headers?: Record<string, string>;
  }): Promise<{ messageId: string }>;
};

// ── Client ──

export type EmailClient = {
  send(message: EmailMessage): Promise<EmailResult<string>>;
  parseInboundWebhook(body: unknown): EmailInboundMessage | null;
};

export function createEmailClient(
  config: EmailConfig,
  deps: {
    http?: EmailHttpClient;
    smtp?: SmtpTransport;
  },
): EmailClient {
  return {
    async send(message: EmailMessage): Promise<EmailResult<string>> {
      if (!config.enabled) return { ok: false, error: "Email is disabled" };

      const toList = normalizeRecipients(message.to);
      if (toList.length === 0) return { ok: false, error: "No recipients specified" };

      for (const addr of toList) {
        const err = validateEmailAddress(addr);
        if (err) return { ok: false, error: err };
      }

      if (!message.textBody && !message.htmlBody) {
        return { ok: false, error: "Email must have text or HTML body" };
      }

      if (config.provider === "smtp") {
        return sendViaSmtp(config, deps.smtp, toList, message);
      } else if (config.provider === "sendgrid" && deps.http) {
        return sendViaSendGrid(config, deps.http, toList, message);
      } else if (deps.http) {
        return sendViaGenericApi(config, deps.http, toList, message);
      }
      return { ok: false, error: `No transport available for provider "${config.provider}"` };
    },

    parseInboundWebhook(body: unknown): EmailInboundMessage | null {
      if (!body || typeof body !== "object") return null;

      const b = body as Record<string, unknown>;

      // SendGrid inbound parse format
      if (b.from && b.subject && (b.text || b.html)) {
        return {
          from: String(b.from),
          to: String(b.to ?? b.envelope_to ?? ""),
          subject: String(b.subject),
          textBody: String(b.text ?? ""),
          htmlBody: String(b.html ?? ""),
          messageId: String(b.message_id ?? b["Message-Id"] ?? ""),
          date: String(b.date ?? b.Date ?? ""),
        };
      }

      // Generic format
      if (b.sender && b.body) {
        return {
          from: String(b.sender ?? b.from ?? ""),
          to: String(b.recipient ?? b.to ?? ""),
          subject: String(b.subject ?? ""),
          textBody: String(b.body ?? b.text ?? ""),
          htmlBody: String(b.htmlBody ?? b.html ?? ""),
          messageId: String(b.messageId ?? b.id ?? ""),
          date: String(b.date ?? ""),
        };
      }

      return null;
    },
  };
}

// ── Provider implementations ──

async function sendViaSmtp(
  config: EmailConfig,
  smtp: SmtpTransport | undefined,
  toList: string[],
  message: EmailMessage,
): Promise<EmailResult<string>> {
  if (!smtp) return { ok: false, error: "SMTP transport not provided" };

  try {
    const fromField = config.fromName
      ? `"${config.fromName}" <${config.fromAddress}>`
      : config.fromAddress;

    const result = await smtp.sendMail({
      from: fromField,
      to: toList,
      cc: message.cc ? normalizeRecipients(message.cc) : undefined,
      bcc: message.bcc ? normalizeRecipients(message.bcc) : undefined,
      subject: message.subject,
      text: message.textBody,
      html: message.htmlBody,
      replyTo: message.replyTo,
      headers: message.headers,
    });

    return { ok: true, data: result.messageId };
  } catch (err) {
    return { ok: false, error: `SMTP error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function sendViaSendGrid(
  config: EmailConfig,
  http: EmailHttpClient,
  toList: string[],
  message: EmailMessage,
): Promise<EmailResult<string>> {
  const url = "https://api.sendgrid.com/v3/mail/send";

  const personalizations = [{ to: toList.map((email) => ({ email })) }];
  const content: Array<{ type: string; value: string }> = [];
  if (message.textBody) content.push({ type: "text/plain", value: message.textBody });
  if (message.htmlBody) content.push({ type: "text/html", value: message.htmlBody });

  const body = {
    personalizations,
    from: { email: config.fromAddress, name: config.fromName },
    subject: message.subject,
    content,
    ...(message.replyTo ? { reply_to: { email: message.replyTo } } : {}),
  };

  try {
    const resp = await http.post(
      url,
      body,
      {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      config.timeoutMs,
    );

    // SendGrid returns 202 for accepted
    if (!resp.ok && resp.status !== 202) {
      const text = await resp.text();
      return { ok: false, error: `SendGrid returned ${resp.status}: ${text}` };
    }

    return { ok: true, data: "accepted" };
  } catch (err) {
    return { ok: false, error: `SendGrid error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function sendViaGenericApi(
  config: EmailConfig,
  http: EmailHttpClient,
  toList: string[],
  message: EmailMessage,
): Promise<EmailResult<string>> {
  if (!config.apiBaseUrl) return { ok: false, error: "No API base URL configured for generic email provider" };

  try {
    const resp = await http.post(
      `${config.apiBaseUrl}/send`,
      {
        from: config.fromAddress,
        to: toList,
        subject: message.subject,
        text: message.textBody,
        html: message.htmlBody,
      },
      {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      config.timeoutMs,
    );

    if (!resp.ok) return { ok: false, error: `Email API returned ${resp.status}` };

    const data = (await resp.json()) as { id?: string; error?: string };
    if (data.error) return { ok: false, error: data.error };
    return { ok: true, data: data.id ?? "" };
  } catch (err) {
    return { ok: false, error: `Email error: ${err instanceof Error ? err.message : String(err)}` };
  }
}
