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
    resetSeconds: 60,
    capturedAt: Date.now(),
    ...overrides,
  };
}

describe("bucket helpers", () => {
  it("bucketUsed returns limit minus remaining", () => {
    expect(bucketUsed(makeBucket({ limit: 100, remaining: 60 }))).toBe(40);
  });

  it("bucketUsagePct returns percentage used", () => {
    expect(bucketUsagePct(makeBucket({ limit: 100, remaining: 0 }))).toBeCloseTo(100);
    expect(bucketUsagePct(makeBucket({ limit: 100, remaining: 100 }))).toBeCloseTo(0);
  });

  it("bucketRemainingSecondsNow returns positive for future reset", () => {
    const secs = bucketRemainingSecondsNow(makeBucket({ resetSeconds: 120, capturedAt: Date.now() }));
    expect(secs).toBeGreaterThan(0);
    expect(secs).toBeLessThanOrEqual(120);
  });

  it("bucketRemainingSecondsNow returns 0 for past reset", () => {
    expect(bucketRemainingSecondsNow(makeBucket({ resetSeconds: 5, capturedAt: Date.now() - 10_000 }))).toBe(0);
  });
});

describe("parseRateLimitHeaders", () => {
  it("parses standard OpenAI-style rate limit headers", () => {
    const headers: Record<string, string | undefined> = {
      "x-ratelimit-limit-requests": "100",
      "x-ratelimit-remaining-requests": "99",
      "x-ratelimit-reset-requests": "1",
      "x-ratelimit-limit-tokens": "10000",
      "x-ratelimit-remaining-tokens": "9500",
      "x-ratelimit-reset-tokens": "6",
    };
    const state = parseRateLimitHeaders(headers, "openai");
    expect(state).not.toBeUndefined();
    if (state) {
      expect(hasRateLimitData(state)).toBe(true);
    }
  });

  it("returns undefined when no rate limit headers present", () => {
    const state = parseRateLimitHeaders({}, "openai");
    expect(state).toBeUndefined();
  });
});

describe("rateLimitAgeSeconds", () => {
  it("returns positive age for past timestamp", () => {
    const state: RateLimitState = {
      provider: "openai",
      capturedAt: Date.now() - 5000,
      requestsPerMinute: makeBucket(),
    };
    expect(rateLimitAgeSeconds(state)).toBeGreaterThanOrEqual(4);
  });
});

describe("formatRateLimitDisplay", () => {
  it("formats a non-empty state", () => {
    const state: RateLimitState = {
      provider: "openai",
      capturedAt: Date.now(),
      requestsPerMinute: makeBucket({ limit: 100, remaining: 50 }),
      tokensPerMinute: makeBucket({ limit: 10000, remaining: 5000 }),
    };
    const text = formatRateLimitDisplay(state);
    expect(text).toContain("50");
  });
});

describe("formatRateLimitCompact", () => {
  it("returns a short string", () => {
    const state: RateLimitState = {
      provider: "openai",
      capturedAt: Date.now(),
      requestsPerMinute: makeBucket({ limit: 100, remaining: 90 }),
      tokensPerMinute: makeBucket({ limit: 10000, remaining: 9000 }),
    };
    const compact = formatRateLimitCompact(state);
    expect(typeof compact).toBe("string");
    expect(compact.length).toBeGreaterThan(0);
  });
});
