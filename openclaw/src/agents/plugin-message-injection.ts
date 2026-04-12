/**
 * Plugin Message Injection (Track D — Plugin Enhancements)
 *
 * Allows plugins to inject messages into an active session's conversation.
 * Enables real-time coordination, external event notification, bridge
 * integrations, and remote control.
 *
 * Ported from hermes-agent `hermes_cli/plugins.py` (inject_message).
 * Adapted to TypeScript with a queue-based approach and priority system.
 */

// ── Types ──

export type InjectedMessageRole = "user" | "system" | "assistant";

export type InjectedMessage = {
  /** Unique ID for dedup and tracking. */
  id: string;
  /** The plugin that injected this message. */
  pluginId: string;
  /** Message role. */
  role: InjectedMessageRole;
  /** Message content. */
  content: string;
  /** Priority (lower = higher priority). Default: 100. */
  priority: number;
  /** Timestamp of injection. */
  timestamp: number;
  /** Whether this message should interrupt the current turn. */
  interrupt: boolean;
  /** Optional metadata (e.g., source channel, external event type). */
  metadata?: Readonly<Record<string, unknown>>;
};

export type InjectionResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: string };

export type MessageInjectorConfig = {
  /** Enable message injection. Default: true. */
  enabled: boolean;
  /** Max queued messages before rejecting. Default: 100. */
  maxQueueSize: number;
  /** Max content length per message (chars). Default: 50_000. */
  maxContentLength: number;
  /** Allowed roles. Default: ["user", "system"]. */
  allowedRoles: readonly InjectedMessageRole[];
};

export const DEFAULT_MESSAGE_INJECTOR_CONFIG: MessageInjectorConfig = {
  enabled: true,
  maxQueueSize: 100,
  maxContentLength: 50_000,
  allowedRoles: ["user", "system"],
};

// ── Message injector ──

/**
 * Queue-based message injector for active sessions.
 *
 * Plugins call `inject()` to queue a message. The agent loop calls
 * `drain()` at appropriate points to consume queued messages.
 */
export type MessageInjector = {
  /** Inject a message from a plugin. */
  inject(params: {
    pluginId: string;
    role?: InjectedMessageRole;
    content: string;
    priority?: number;
    interrupt?: boolean;
    metadata?: Record<string, unknown>;
  }): InjectionResult;

  /** Drain all queued messages (sorted by priority). */
  drain(): readonly InjectedMessage[];

  /** Drain only interrupt messages. */
  drainInterrupts(): readonly InjectedMessage[];

  /** Peek at queued message count. */
  queueSize(): number;

  /** Check if there are pending interrupt messages. */
  hasInterrupts(): boolean;

  /** Clear all queued messages. */
  clear(): void;

  /** Get injection stats. */
  getStats(): MessageInjectorStats;
};

export type MessageInjectorStats = {
  totalInjected: number;
  totalDrained: number;
  totalRejected: number;
  byPlugin: Readonly<Record<string, number>>;
};

let nextId = 0;

export function createMessageInjector(
  config: MessageInjectorConfig = DEFAULT_MESSAGE_INJECTOR_CONFIG,
): MessageInjector {
  const queue: InjectedMessage[] = [];
  let totalInjected = 0;
  let totalDrained = 0;
  let totalRejected = 0;
  const byPlugin: Record<string, number> = {};

  return {
    inject(params): InjectionResult {
      if (!config.enabled) {
        totalRejected++;
        return { ok: false, reason: "Message injection is disabled" };
      }

      if (queue.length >= config.maxQueueSize) {
        totalRejected++;
        return { ok: false, reason: `Queue full (${config.maxQueueSize})` };
      }

      const role = params.role ?? "user";
      if (!config.allowedRoles.includes(role)) {
        totalRejected++;
        return { ok: false, reason: `Role "${role}" not allowed` };
      }

      if (params.content.length > config.maxContentLength) {
        totalRejected++;
        return {
          ok: false,
          reason: `Content too long (${params.content.length} > ${config.maxContentLength})`,
        };
      }

      const id = `inj-${++nextId}-${Date.now().toString(36)}`;

      const msg: InjectedMessage = {
        id,
        pluginId: params.pluginId,
        role,
        content: params.content,
        priority: params.priority ?? 100,
        timestamp: Date.now(),
        interrupt: params.interrupt ?? false,
        metadata: params.metadata,
      };

      // Insert sorted by priority (lower = higher priority)
      const insertIdx = queue.findIndex((m) => m.priority > msg.priority);
      if (insertIdx === -1) {
        queue.push(msg);
      } else {
        queue.splice(insertIdx, 0, msg);
      }

      totalInjected++;
      byPlugin[params.pluginId] = (byPlugin[params.pluginId] ?? 0) + 1;

      return { ok: true, messageId: id };
    },

    drain(): readonly InjectedMessage[] {
      const messages = [...queue];
      queue.length = 0;
      totalDrained += messages.length;
      return messages;
    },

    drainInterrupts(): readonly InjectedMessage[] {
      const interrupts: InjectedMessage[] = [];
      const remaining: InjectedMessage[] = [];

      for (const msg of queue) {
        if (msg.interrupt) {
          interrupts.push(msg);
        } else {
          remaining.push(msg);
        }
      }

      queue.length = 0;
      queue.push(...remaining);
      totalDrained += interrupts.length;
      return interrupts;
    },

    queueSize(): number {
      return queue.length;
    },

    hasInterrupts(): boolean {
      return queue.some((m) => m.interrupt);
    },

    clear(): void {
      queue.length = 0;
    },

    getStats(): MessageInjectorStats {
      return {
        totalInjected,
        totalDrained,
        totalRejected,
        byPlugin: { ...byPlugin },
      };
    },
  };
}
