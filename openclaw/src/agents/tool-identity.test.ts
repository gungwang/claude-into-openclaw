import { describe, expect, it } from "vitest";
import {
  deriveFallbackCanonicalToolId,
  findAmbiguousDisplayNames,
  findDuplicateCanonicalIds,
  inferCapabilityClassFromToolName,
  normalizeCanonicalToolId,
  validateCanonicalToolIdentity,
} from "./tool-identity.js";

describe("tool identity", () => {
  it("normalizes canonical ids", () => {
    expect(normalizeCanonicalToolId(" Core : Read Tool ")).toBe("core:read-tool");
  });

  it("derives fallback canonical ids for core and plugin tools", () => {
    expect(
      deriveFallbackCanonicalToolId({
        namespace: "core",
        toolName: "read",
      }),
    ).toBe("core:read");

    expect(
      deriveFallbackCanonicalToolId({
        namespace: "plugin",
        pluginId: "voice-call",
        toolName: "Start Call",
      }),
    ).toBe("plugin:voice-call:start-call");
  });

  it("detects duplicate canonical ids", () => {
    const duplicates = findDuplicateCanonicalIds([
      {
        id: "core:message",
        displayName: "message",
        namespace: "core",
        capabilityClass: "messaging",
      },
      {
        id: "core:message",
        displayName: "message-v2",
        namespace: "core",
        capabilityClass: "messaging",
      },
    ]);

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.id).toBe("core:message");
    expect(duplicates[0]?.entries).toHaveLength(2);
  });

  it("detects ambiguous display names mapped to different ids", () => {
    const ambiguous = findAmbiguousDisplayNames([
      {
        id: "core:message",
        displayName: "Message",
        namespace: "core",
        capabilityClass: "messaging",
      },
      {
        id: "plugin:matrix:message",
        displayName: "Message",
        namespace: "plugin",
        capabilityClass: "messaging",
      },
    ]);

    expect(ambiguous).toHaveLength(1);
    expect(ambiguous[0]?.displayName).toBe("Message");
    expect(ambiguous[0]?.ids).toEqual(["core:message", "plugin:matrix:message"]);
  });

  it("infers capability classes from tool names", () => {
    expect(inferCapabilityClassFromToolName("read")).toBe("read");
    expect(inferCapabilityClassFromToolName("exec")).toBe("execute");
    expect(inferCapabilityClassFromToolName("cron")).toBe("scheduling");
    expect(inferCapabilityClassFromToolName("canvas")).toBe("other");
  });

  it("validates malformed identities", () => {
    const issues = validateCanonicalToolIdentity({
      id: "bad id",
      displayName: "",
      namespace: "core",
      capabilityClass: "other",
    });

    expect(issues.map((issue) => issue.code)).toEqual(["invalid_id", "missing_display_name"]);
  });
});
