import { describe, expect, it } from "vitest";
import {
  generateDingTalkSignature,
  verifyDingTalkCallback,
} from "./dingtalk.js";

describe("generateDingTalkSignature", () => {
  const secret = "test-secret-123";

  it("returns timestamp and sign", () => {
    const result = generateDingTalkSignature(secret);
    expect(result).toHaveProperty("timestamp");
    expect(result).toHaveProperty("sign");
    expect(typeof result.timestamp).toBe("number");
    expect(typeof result.sign).toBe("string");
    expect(result.sign.length).toBeGreaterThan(0);
  });

  it("uses provided timestamp", () => {
    const ts = 1700000000000;
    const result = generateDingTalkSignature(secret, ts);
    expect(result.timestamp).toBe(ts);
  });

  it("produces deterministic output for same inputs", () => {
    const ts = 1700000000000;
    const a = generateDingTalkSignature(secret, ts);
    const b = generateDingTalkSignature(secret, ts);
    expect(a.sign).toBe(b.sign);
  });
});

describe("verifyDingTalkCallback", () => {
  const secret = "test-secret-123";

  it("verifies a valid callback", () => {
    const ts = Date.now();
    const { sign } = generateDingTalkSignature(secret, ts);
    // Decode the URL-encoded sign for verification
    const decodedSign = decodeURIComponent(sign);
    const valid = verifyDingTalkCallback(String(ts), decodedSign, secret);
    expect(valid).toBe(true);
  });

  it("rejects wrong secret", () => {
    const ts = Date.now();
    const { sign } = generateDingTalkSignature(secret, ts);
    const decodedSign = decodeURIComponent(sign);
    expect(verifyDingTalkCallback(String(ts), decodedSign, "wrong-secret")).toBe(false);
  });

  it("rejects old timestamps", () => {
    const oldTs = Date.now() - 120_000; // 2 minutes ago
    const { sign } = generateDingTalkSignature(secret, oldTs);
    const decodedSign = decodeURIComponent(sign);
    expect(verifyDingTalkCallback(String(oldTs), decodedSign, secret, 60_000)).toBe(false);
  });

  it("rejects invalid timestamp", () => {
    expect(verifyDingTalkCallback("not-a-number", "sign", secret)).toBe(false);
  });
});
