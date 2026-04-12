import { describe, expect, it, vi } from "vitest";
import {
  createGatewayMirror,
  type MirrorEntry,
  type MirrorSessionStore,
  type SessionIndex,
} from "./gateway-mirroring.js";

function createMockSessionStore(): MirrorSessionStore {
  const sessions = new Map<string, SessionIndex>();
  return {
    getIndex: vi.fn((key: string) => sessions.get(key) ?? null),
    setIndex: vi.fn((key: string, index: SessionIndex) => { sessions.set(key, index); }),
    deleteIndex: vi.fn((key: string) => { sessions.delete(key); }),
  };
}

describe("createGatewayMirror", () => {
  const entries: MirrorEntry[] = [
    {
      source: { platform: "telegram", chatId: "tg-123" },
      targets: [
        { platform: "discord", chatId: "dc-456" },
        { platform: "slack", chatId: "sl-789" },
      ],
    },
  ];

  it("creates a mirror with lookup and deliver methods", () => {
    const store = createMockSessionStore();
    const mirror = createGatewayMirror(entries, store);
    expect(mirror).toHaveProperty("lookup");
    expect(mirror).toHaveProperty("deliver");
  });

  it("looks up mirror targets from source", () => {
    const store = createMockSessionStore();
    const mirror = createGatewayMirror(entries, store);
    const targets = mirror.lookup("telegram", "tg-123");
    expect(targets).toHaveLength(2);
    expect(targets[0].platform).toBe("discord");
    expect(targets[1].platform).toBe("slack");
  });

  it("returns empty for unknown source", () => {
    const store = createMockSessionStore();
    const mirror = createGatewayMirror(entries, store);
    expect(mirror.lookup("unknown", "xxx")).toEqual([]);
  });
});
