import { describe, expect, it, vi } from "vitest";
import {
  createGatewayMirror,
  type MirrorEntry,
  type MirrorSessionStore,
  type SessionIndex,
} from "./gateway-mirroring.js";

function createMockSessionStore(index: SessionIndex | null = null): MirrorSessionStore {
  return {
    readIndex: vi.fn(async () => index),
    appendToTranscript: vi.fn(async () => {}),
  };
}

describe("createGatewayMirror", () => {
  const sampleIndex: SessionIndex = {
    "sess-1": {
      sessionId: "sess-1",
      origin: { platform: "telegram", chatId: "tg-123" },
      updatedAt: "2026-01-01T00:00:00Z",
    },
    "sess-2": {
      sessionId: "sess-2",
      origin: { platform: "discord", chatId: "dc-456" },
      updatedAt: "2026-01-02T00:00:00Z",
    },
    "sess-3": {
      sessionId: "sess-3",
      origin: { platform: "slack", chatId: "sl-789" },
      updatedAt: "2026-01-03T00:00:00Z",
    },
  };

  it("creates a mirror with mirrorToSession, mirrorToMultiple, and findSessionId methods", () => {
    const store = createMockSessionStore(sampleIndex);
    const mirror = createGatewayMirror(store);
    expect(mirror).toHaveProperty("mirrorToSession");
    expect(mirror).toHaveProperty("mirrorToMultiple");
    expect(mirror).toHaveProperty("findSessionId");
  });

  it("finds a session by platform and chatId", async () => {
    const store = createMockSessionStore(sampleIndex);
    const mirror = createGatewayMirror(store);
    const sessionId = await mirror.findSessionId({ platform: "telegram", chatId: "tg-123" });
    expect(sessionId).toBe("sess-1");
  });

  it("returns null for unknown target", async () => {
    const store = createMockSessionStore(sampleIndex);
    const mirror = createGatewayMirror(store);
    const sessionId = await mirror.findSessionId({ platform: "unknown", chatId: "xxx" });
    expect(sessionId).toBeNull();
  });

  it("mirrors a message to a session successfully", async () => {
    const store = createMockSessionStore(sampleIndex);
    const mirror = createGatewayMirror(store);
    const result = await mirror.mirrorToSession(
      { platform: "discord", chatId: "dc-456" },
      "Hello from CLI",
      "cli",
    );
    expect(result).toEqual({ ok: true, sessionId: "sess-2" });
    expect(store.appendToTranscript).toHaveBeenCalledOnce();
    const entry = (store.appendToTranscript as ReturnType<typeof vi.fn>).mock.calls[0][1] as MirrorEntry;
    expect(entry.role).toBe("assistant");
    expect(entry.content).toBe("Hello from CLI");
    expect(entry.mirror).toBe(true);
    expect(entry.mirrorSource).toBe("cli");
    expect(entry.originPlatform).toBe("discord");
    expect(entry.originChatId).toBe("dc-456");
  });

  it("returns error when no session is found for target", async () => {
    const store = createMockSessionStore(sampleIndex);
    const mirror = createGatewayMirror(store);
    const result = await mirror.mirrorToSession(
      { platform: "unknown", chatId: "xxx" },
      "Hello",
    );
    expect(result).toEqual({ ok: false, error: "No session found for unknown:xxx" });
  });

  it("mirrors a message to multiple targets", async () => {
    const store = createMockSessionStore(sampleIndex);
    const mirror = createGatewayMirror(store);
    const results = await mirror.mirrorToMultiple(
      [
        { platform: "discord", chatId: "dc-456" },
        { platform: "slack", chatId: "sl-789" },
      ],
      "Broadcast message",
      "gateway",
    );
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ ok: true, sessionId: "sess-2" });
    expect(results[1]).toEqual({ ok: true, sessionId: "sess-3" });
  });

  it("returns null when index is empty", async () => {
    const store = createMockSessionStore(null);
    const mirror = createGatewayMirror(store);
    const sessionId = await mirror.findSessionId({ platform: "telegram", chatId: "tg-123" });
    expect(sessionId).toBeNull();
  });
});
