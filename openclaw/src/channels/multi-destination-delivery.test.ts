import { describe, expect, it, vi } from "vitest";
import {
  createMultiDestinationRouter,
  type DeliveryTarget,
  type PlatformSender,
} from "./multi-destination-delivery.js";

describe("createMultiDestinationRouter", () => {
  const targets: DeliveryTarget[] = [
    { id: "tg-1", platform: "telegram" },
    { id: "dc-1", platform: "discord" },
  ];

  function makeSenders(...entries: [string, PlatformSender][]): ReadonlyMap<string, PlatformSender> {
    return new Map(entries);
  }

  it("creates a router with deliver method", () => {
    const sender: PlatformSender = { send: vi.fn().mockResolvedValue({ ok: true }) };
    const router = createMultiDestinationRouter(
      makeSenders(["telegram", sender], ["discord", sender]),
    );
    expect(router).toHaveProperty("deliver");
  });

  it("delivers to all targets when policy is 'all'", async () => {
    const sender: PlatformSender = { send: vi.fn().mockResolvedValue({ ok: true }) };
    const router = createMultiDestinationRouter(
      makeSenders(["telegram", sender], ["discord", sender]),
    );
    const result = await router.deliver(targets, "Hello from all targets", "all");
    expect(sender.send).toHaveBeenCalledTimes(2);
    expect(result.allDelivered).toBe(true);
    expect(result.anyDelivered).toBe(true);
    expect(result.outcomes.filter((o) => o.status === "delivered").length).toBe(2);
    expect(result.outcomes.filter((o) => o.status === "failed").length).toBe(0);
  });

  it("handles partial failures", async () => {
    const tgSender: PlatformSender = { send: vi.fn().mockResolvedValue({ ok: true }) };
    const dcSender: PlatformSender = {
      send: vi.fn().mockRejectedValue(new Error("network error")),
    };
    const router = createMultiDestinationRouter(
      makeSenders(["telegram", tgSender], ["discord", dcSender]),
    );
    const result = await router.deliver(targets, "Test message", "all");
    expect(result.allDelivered).toBe(false);
    expect(result.anyDelivered).toBe(true);
    expect(result.outcomes.filter((o) => o.status === "delivered").length).toBe(1);
    expect(result.outcomes.filter((o) => o.status === "failed").length).toBe(1);
  });

  it("stops on first success when policy is 'first-success'", async () => {
    const sender: PlatformSender = { send: vi.fn().mockResolvedValue({ ok: true }) };
    const router = createMultiDestinationRouter(
      makeSenders(["telegram", sender], ["discord", sender]),
    );
    const result = await router.deliver(targets, "First-win message", "first-success");
    expect(result.anyDelivered).toBe(true);
    expect(result.outcomes.filter((o) => o.status === "delivered").length).toBe(1);
    expect(result.outcomes.filter((o) => o.status === "skipped").length).toBe(1);
    expect(sender.send).toHaveBeenCalledTimes(1);
  });
});
