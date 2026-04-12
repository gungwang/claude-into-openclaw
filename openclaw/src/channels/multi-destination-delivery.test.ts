import { describe, expect, it, vi } from "vitest";
import {
  createMultiDestinationRouter,
  type DeliveryTarget,
  type PlatformSender,
} from "./multi-destination-delivery.js";

describe("createMultiDestinationRouter", () => {
  const mockSender: PlatformSender = {
    send: vi.fn().mockResolvedValue({ ok: true }),
  };

  const targets: DeliveryTarget[] = [
    { platform: "telegram", chatId: "tg-1" },
    { platform: "discord", chatId: "dc-1" },
  ];

  it("creates a router with deliver method", () => {
    const router = createMultiDestinationRouter({
      targets,
      sender: mockSender,
      policy: "all",
    });
    expect(router).toHaveProperty("deliver");
  });

  it("delivers to all targets when policy is 'all'", async () => {
    const sender: PlatformSender = {
      send: vi.fn().mockResolvedValue({ ok: true }),
    };
    const router = createMultiDestinationRouter({
      targets,
      sender,
      policy: "all",
    });
    const result = await router.deliver("Hello from all targets");
    expect(sender.send).toHaveBeenCalledTimes(2);
    expect(result.delivered).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("handles partial failures", async () => {
    const sender: PlatformSender = {
      send: vi.fn()
        .mockResolvedValueOnce({ ok: true })
        .mockRejectedValueOnce(new Error("network error")),
    };
    const router = createMultiDestinationRouter({
      targets,
      sender,
      policy: "all",
    });
    const result = await router.deliver("Test message");
    expect(result.delivered).toBe(1);
    expect(result.failed).toBe(1);
  });

  it("stops on first success when policy is 'first'", async () => {
    const sender: PlatformSender = {
      send: vi.fn().mockResolvedValue({ ok: true }),
    };
    const router = createMultiDestinationRouter({
      targets,
      sender,
      policy: "first",
    });
    const result = await router.deliver("First-win message");
    expect(result.delivered).toBe(1);
    expect(sender.send).toHaveBeenCalledTimes(1);
  });
});
