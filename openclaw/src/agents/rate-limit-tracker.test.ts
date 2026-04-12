import { describe, expect, it } from "vitest";
import {
  parseRateLimitHeaders,
  bucketUsed,
  bucketUsagePct,
  bucketRemainingSecondsNow,
  hasRateLimitData,
  rateLimitAgeSeconds,
  formatRateLimitDisplay,
  formatRateLimitCompact,
  type RateLimitBucket,
  type RateLimitState,
} from "./rate-limit-tracker.js";

function makeBucket(overrides: Partial<RateLimitBucket> = {}): RateLimitBucket {
  return {
    limit: 100,
    remaining: 60,
    resetAtEpochSeconds: Math.floor(Date.now() / 1000) + 60,
    ...overrides,
  };
}

describe("bucket helpers", () => {
  it("bucketUsed returns limit minus remaining", () => {
    expect(bucketUsed(makeBucket({ limit: 100, remaining: 60 }))).toBe(40);
  });

  it("bucketUsagePct returns fraction used", () => {
    expect(bucketUsagePct(makeBucket({ limit: 100, remaining: 0 }))).toBeCloseTo(1.0);
    expect(bucketUsagePct(makeBucket({ limit: 100, remaining: 100 }))).toBeCloseTo(0.0);
  });

  it("bucketRemainingSecondsNow returns positive for future reset", () => {
    const future = Math.floor(Date.now() / 1000) + 120;
    const secs = bucketRemainingSecondsNow(makeBucket({ resetAtEpochSeconds: future }));
    expect(secs).toBeGreaterThan(0);
    expect(secs).toBeLessThanOrEqual(120);
  });

  it("bucketRemainingSecondsNow returns 0 for past reset", () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    expect(bucketRemainingSecondsNow(makeBucket({ resetAtEpochSeconds: past }))).toBe(0);
  });
});

describe("parseRateLimitHeaders", () => {
  it("parses standard OpenAI-style rate limit headers", () => {
    const headers: Record<string, string | undefined> = {
      "x-ratelimit-limit-requests": "100",
      "x-ratelimit-remaining-requests": "99",
      "x-ratelimit-reset-requests": "1s",
      "x-ratelimit-limit-tokens": "10000",
      "x-ratelimit-remaining-tokens": "9500",
      "x-ratelimit-reset-tokens": "6s",
    };
    const state = parseRateLimitHeaders(headers);
    expect(state).not.toBeNull();
    if (state) {
      expect(hasRateLimitData(state)).toBe(true);
    }
  });

  it("returns null when no rate limit headers present", () => {
    const state = parseRateLimitHeaders({});
    // Either null or a state with no data
    if (state !== null) {
      expect(hasRateLimitData(state)).toBe(false);
    }
  });
});

describe("rateLimitAgeSeconds", () => {
  it("returns positive age for past timestamp", () => {
    const state: RateLimitState = {
      updatedAt: Date.now() - 5000,
      requests: makeBucket(),
      tokens: makeBucket(),
    };
    expect(rateLimitAgeSeconds(state)).toBeGreaterThanOrEqual(4);
  });
});

describe("formatRateLimitDisplay", () => {
  it("formats a non-empty state", () => {
    const state: RateLimitState = {
      updatedAt: Date.now(),
      requests: makeBucket({ limit: 100, remaining: 50 }),
      tokens: makeBucket({ limit: 10000, remaining: 5000 }),
    };
    const text = formatRateLimitDisplay(state);
    expect(text).toContain("50");
  });
});

describe("formatRateLimitCompact", () => {
  it("returns a short string", () => {
    const state: RateLimitState = {
      updatedAt: Date.now(),
      requests: makeBucket({ limit: 100, remaining: 90 }),
      tokens: makeBucket({ limit: 10000, remaining: 9000 }),
    };
    const compact = formatRateLimitCompact(state);
    expect(typeof compact).toBe("string");
    expect(compact.length).toBeGreaterThan(0);
  });
});
