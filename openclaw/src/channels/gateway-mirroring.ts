/**
 * Gateway Mirroring — Cross-platform message relay (Track F — Gateway Platforms)
 *
 * Relays messages between platforms by appending "delivery-mirror" records
 * to target session transcripts. Works from CLI, cron, and gateway contexts
 * without requiring the full SessionStore machinery.
 *
 * Ported from hermes-agent `gateway/mirror.py`.
 */

// ── Types ──

export type MirrorSourceLabel = "cli" | "cron" | "gateway" | "api" | (string & {});

export type MirrorEntry = {
  role: "assistant" | "user";
  content: string;
  timestamp: string;
  mirror: true;
  mirrorSource: MirrorSourceLabel;
  originPlatform?: string;
  originChatId?: string;
};

export type MirrorTarget = {
  platform: string;
  chatId: string;
  threadId?: string;
};

export type MirrorResult =
  | { ok: true; sessionId: string }
  | { ok: false; error: string };

export type SessionIndex = Record<
  string,
  {
    session_id?: string;
    sessionId?: string;
    platform?: string;
    origin?: {
      platform?: string;
      chat_id?: string;
      chatId?: string;
      thread_id?: string;
      threadId?: string;
    };
    updated_at?: string;
    updatedAt?: string;
  }
>;

// ── Session store interface (injectable for testing) ──

export type MirrorSessionStore = {
  readIndex(): Promise<SessionIndex | null>;
  appendToTranscript(sessionId: string, entry: MirrorEntry): Promise<void>;
};

// ── Mirror client ──

export type GatewayMirror = {
  mirrorToSession(
    target: MirrorTarget,
    messageText: string,
    sourceLabel?: MirrorSourceLabel,
  ): Promise<MirrorResult>;
  mirrorToMultiple(
    targets: readonly MirrorTarget[],
    messageText: string,
    sourceLabel?: MirrorSourceLabel,
  ): Promise<readonly MirrorResult[]>;
  findSessionId(target: MirrorTarget): Promise<string | null>;
};

export function createGatewayMirror(store: MirrorSessionStore): GatewayMirror {
  return {
    async mirrorToSession(
      target: MirrorTarget,
      messageText: string,
      sourceLabel: MirrorSourceLabel = "cli",
    ): Promise<MirrorResult> {
      try {
        const sessionId = await findSessionForTarget(store, target);
        if (!sessionId) {
          return { ok: false, error: `No session found for ${target.platform}:${target.chatId}` };
        }

        const entry: MirrorEntry = {
          role: "assistant",
          content: messageText,
          timestamp: new Date().toISOString(),
          mirror: true,
          mirrorSource: sourceLabel,
          originPlatform: target.platform,
          originChatId: target.chatId,
        };

        await store.appendToTranscript(sessionId, entry);
        return { ok: true, sessionId };
      } catch (err) {
        return {
          ok: false,
          error: `Mirror failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },

    async mirrorToMultiple(
      targets: readonly MirrorTarget[],
      messageText: string,
      sourceLabel: MirrorSourceLabel = "cli",
    ): Promise<readonly MirrorResult[]> {
      const results = await Promise.allSettled(
        targets.map((target) => this.mirrorToSession(target, messageText, sourceLabel)),
      );

      return results.map((r) =>
        r.status === "fulfilled"
          ? r.value
          : { ok: false as const, error: `Mirror error: ${r.reason}` },
      );
    },

    async findSessionId(target: MirrorTarget): Promise<string | null> {
      return findSessionForTarget(store, target);
    },
  };
}

// ── Internal helper ──

async function findSessionForTarget(
  store: MirrorSessionStore,
  target: MirrorTarget,
): Promise<string | null> {
  const index = await store.readIndex();
  if (!index) return null;

  const platformLower = target.platform.toLowerCase();
  let bestMatch: string | null = null;
  let bestUpdated = "";

  for (const entry of Object.values(index)) {
    const origin = entry.origin;
    const entryPlatform = (
      origin?.platform ?? entry.platform ?? ""
    ).toLowerCase();

    if (entryPlatform !== platformLower) continue;

    const entryChatId = String(origin?.chat_id ?? origin?.chatId ?? "");
    if (entryChatId !== String(target.chatId)) continue;

    if (target.threadId) {
      const entryThreadId = String(origin?.thread_id ?? origin?.threadId ?? "");
      if (entryThreadId && entryThreadId !== String(target.threadId)) continue;
    }

    const updated = entry.updated_at ?? entry.updatedAt ?? "";
    if (updated > bestUpdated) {
      bestUpdated = updated;
      bestMatch = entry.session_id ?? entry.sessionId ?? null;
    }
  }

  return bestMatch;
}
