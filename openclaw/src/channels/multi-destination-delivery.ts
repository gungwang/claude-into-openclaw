/**
 * Multi-Destination Delivery — Route messages to multiple platforms (Track F — Gateway Platforms)
 *
 * Orchestrates message delivery across multiple channel adapters simultaneously.
 * Supports delivery policies (all, any, primary+fallback) and tracks delivery outcomes.
 *
 * Ported from hermes-agent `gateway/delivery.py` concepts.
 */

// ── Types ──

export type DeliveryPolicy =
  /** Deliver to all targets; report individual results. */
  | "all"
  /** Deliver to first available target that succeeds. */
  | "first-success"
  /** Deliver to primary; use fallbacks only if primary fails. */
  | "primary-with-fallback";

export type DeliveryTarget = {
  /** Unique target identifier (e.g., "wecom:group1", "slack:#general"). */
  id: string;
  /** Platform identifier. */
  platform: string;
  /** Whether this is the primary target (for primary-with-fallback policy). */
  primary?: boolean;
  /** Platform-specific delivery metadata. */
  meta?: Record<string, unknown>;
};

export type DeliveryOutcome = {
  targetId: string;
  platform: string;
  status: "delivered" | "failed" | "skipped";
  error?: string;
  durationMs: number;
};

export type DeliveryResult = {
  policy: DeliveryPolicy;
  outcomes: readonly DeliveryOutcome[];
  allDelivered: boolean;
  anyDelivered: boolean;
  totalMs: number;
};

// ── Platform sender interface (injectable) ──

export type PlatformSender = {
  send(target: DeliveryTarget, content: string): Promise<{ ok: boolean; error?: string }>;
};

// ── Delivery router ──

export type MultiDestinationRouter = {
  deliver(
    targets: readonly DeliveryTarget[],
    content: string,
    policy?: DeliveryPolicy,
  ): Promise<DeliveryResult>;
};

export function createMultiDestinationRouter(
  senders: ReadonlyMap<string, PlatformSender>,
): MultiDestinationRouter {
  return {
    async deliver(
      targets: readonly DeliveryTarget[],
      content: string,
      policy: DeliveryPolicy = "all",
    ): Promise<DeliveryResult> {
      const startTime = Date.now();

      if (targets.length === 0) {
        return {
          policy,
          outcomes: [],
          allDelivered: false,
          anyDelivered: false,
          totalMs: 0,
        };
      }

      let outcomes: DeliveryOutcome[];

      switch (policy) {
        case "all":
          outcomes = await deliverToAll(senders, targets, content);
          break;
        case "first-success":
          outcomes = await deliverFirstSuccess(senders, targets, content);
          break;
        case "primary-with-fallback":
          outcomes = await deliverPrimaryWithFallback(senders, targets, content);
          break;
        default:
          outcomes = await deliverToAll(senders, targets, content);
      }

      const totalMs = Date.now() - startTime;
      const deliveredOnes = outcomes.filter((o) => o.status === "delivered");

      return {
        policy,
        outcomes,
        allDelivered: deliveredOnes.length === targets.length,
        anyDelivered: deliveredOnes.length > 0,
        totalMs,
      };
    },
  };
}

// ── Strategy implementations ──

async function deliverToAll(
  senders: ReadonlyMap<string, PlatformSender>,
  targets: readonly DeliveryTarget[],
  content: string,
): Promise<DeliveryOutcome[]> {
  const results = await Promise.allSettled(
    targets.map((target) => deliverToTarget(senders, target, content)),
  );

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      targetId: targets[i].id,
      platform: targets[i].platform,
      status: "failed" as const,
      error: String(r.reason),
      durationMs: 0,
    };
  });
}

async function deliverFirstSuccess(
  senders: ReadonlyMap<string, PlatformSender>,
  targets: readonly DeliveryTarget[],
  content: string,
): Promise<DeliveryOutcome[]> {
  const outcomes: DeliveryOutcome[] = [];

  for (const target of targets) {
    const outcome = await deliverToTarget(senders, target, content);
    outcomes.push(outcome);

    if (outcome.status === "delivered") {
      // Mark remaining targets as skipped
      for (let i = outcomes.length; i < targets.length; i++) {
        outcomes.push({
          targetId: targets[i].id,
          platform: targets[i].platform,
          status: "skipped",
          durationMs: 0,
        });
      }
      break;
    }
  }

  return outcomes;
}

async function deliverPrimaryWithFallback(
  senders: ReadonlyMap<string, PlatformSender>,
  targets: readonly DeliveryTarget[],
  content: string,
): Promise<DeliveryOutcome[]> {
  const primary = targets.find((t) => t.primary) ?? targets[0];
  const fallbacks = targets.filter((t) => t !== primary);

  const outcomes: DeliveryOutcome[] = [];

  // Try primary first
  const primaryOutcome = await deliverToTarget(senders, primary, content);
  outcomes.push(primaryOutcome);

  if (primaryOutcome.status === "delivered") {
    // Mark fallbacks as skipped
    for (const fb of fallbacks) {
      outcomes.push({
        targetId: fb.id,
        platform: fb.platform,
        status: "skipped",
        durationMs: 0,
      });
    }
    return outcomes;
  }

  // Primary failed — try fallbacks sequentially
  for (const fb of fallbacks) {
    const fbOutcome = await deliverToTarget(senders, fb, content);
    outcomes.push(fbOutcome);

    if (fbOutcome.status === "delivered") {
      // Mark remaining fallbacks as skipped
      const remaining = fallbacks.slice(fallbacks.indexOf(fb) + 1);
      for (const r of remaining) {
        outcomes.push({
          targetId: r.id,
          platform: r.platform,
          status: "skipped",
          durationMs: 0,
        });
      }
      break;
    }
  }

  return outcomes;
}

// ── Single target delivery ──

async function deliverToTarget(
  senders: ReadonlyMap<string, PlatformSender>,
  target: DeliveryTarget,
  content: string,
): Promise<DeliveryOutcome> {
  const sender = senders.get(target.platform);
  if (!sender) {
    return {
      targetId: target.id,
      platform: target.platform,
      status: "failed",
      error: `No sender registered for platform "${target.platform}"`,
      durationMs: 0,
    };
  }

  const start = Date.now();
  try {
    const result = await sender.send(target, content);
    const durationMs = Date.now() - start;

    return {
      targetId: target.id,
      platform: target.platform,
      status: result.ok ? "delivered" : "failed",
      error: result.error,
      durationMs,
    };
  } catch (err) {
    return {
      targetId: target.id,
      platform: target.platform,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}
