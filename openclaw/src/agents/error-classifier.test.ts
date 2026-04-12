import { describe, expect, it } from "vitest";
import {
  classifyApiError,
  formatClassifiedError,
  type ClassifiedError,
} from "./error-classifier.js";

describe("classifyApiError", () => {
  const base = { provider: "openai", model: "gpt-4" };

  describe("HTTP status code classification", () => {
    it("classifies 401 as auth with credential rotation", () => {
      const result = classifyApiError({
        ...base,
        error: { status: 401, message: "Unauthorized" },
      });
      expect(result.reason).toBe("auth");
      expect(result.shouldRotateCredential).toBe(true);
      expect(result.retryable).toBe(false);
    });

    it("classifies 429 as rate_limit", () => {
      const result = classifyApiError({
        ...base,
        error: { status: 429, message: "Too many requests" },
      });
      expect(result.reason).toBe("rate_limit");
      expect(result.retryable).toBe(true);
      expect(result.cooldownMs).toBeGreaterThan(0);
    });

    it("classifies 402 with billing language as billing", () => {
      const result = classifyApiError({
        ...base,
        error: { status: 402, message: "Insufficient credits" },
      });
      expect(result.reason).toBe("billing");
      expect(result.retryable).toBe(false);
    });

    it("classifies 402 with transient signals as rate_limit", () => {
      const result = classifyApiError({
        ...base,
        error: { status: 402, message: "Usage limit, try again later" },
      });
      expect(result.reason).toBe("rate_limit");
    });

    it("classifies 413 as payload_too_large", () => {
      const result = classifyApiError({
        ...base,
        error: { status: 413, message: "Payload too large" },
      });
      expect(result.reason).toBe("payload_too_large");
    });

    it("classifies 400 with context overflow message", () => {
      const result = classifyApiError({
        ...base,
        error: { status: 400, message: "This model's maximum context length is 8192" },
      });
      expect(result.reason).toBe("context_overflow");
      expect(result.shouldCompress).toBe(true);
    });

    it("classifies 404 as model_not_found with fallback", () => {
      const result = classifyApiError({
        ...base,
        error: { status: 404, message: "Model not found" },
      });
      expect(result.reason).toBe("model_not_found");
      expect(result.shouldFallback).toBe(true);
    });

    it("classifies 500/502/503 as server_error", () => {
      for (const status of [500, 502, 503]) {
        const result = classifyApiError({
          ...base,
          error: { status, message: "Internal server error" },
        });
        expect(result.reason).toBe("server_error");
        expect(result.retryable).toBe(true);
      }
    });

    it("classifies 504 as timeout", () => {
      const result = classifyApiError({
        ...base,
        error: { status: 504, message: "Gateway timeout" },
      });
      expect(result.reason).toBe("timeout");
      expect(result.retryable).toBe(true);
    });
  });

  describe("message pattern matching", () => {
    it("detects rate limit from message without status code", () => {
      const result = classifyApiError({
        ...base,
        error: "Rate limit exceeded, please wait",
      });
      expect(result.reason).toBe("rate_limit");
    });

    it("detects content filter", () => {
      const result = classifyApiError({
        ...base,
        error: { message: "Content blocked by safety system" },
      });
      expect(result.reason).toBe("content_filter");
    });

    it("detects billing from message", () => {
      const result = classifyApiError({
        ...base,
        error: "You exceeded your current quota",
      });
      expect(result.reason).toBe("billing");
    });
  });

  describe("transport errors", () => {
    it("classifies ECONNRESET as server_error", () => {
      const result = classifyApiError({
        ...base,
        error: { code: "ECONNRESET", message: "Connection reset" },
      });
      expect(result.reason).toBe("server_error");
    });

    it("classifies ECONNRESET near context limit as context_overflow", () => {
      const result = classifyApiError({
        ...base,
        error: { code: "ECONNRESET", message: "Connection reset" },
        approxTokens: 7500,
        contextLength: 8192,
      });
      expect(result.reason).toBe("context_overflow");
      expect(result.shouldCompress).toBe(true);
    });
  });

  describe("output shape", () => {
    it("always returns all required fields", () => {
      const result = classifyApiError({
        ...base,
        error: "something unknown",
      });
      expect(result).toEqual(
        expect.objectContaining({
          reason: expect.any(String),
          statusCode: undefined,
          provider: "openai",
          model: "gpt-4",
          message: expect.any(String),
          retryable: expect.any(Boolean),
          shouldCompress: expect.any(Boolean),
          shouldRotateCredential: expect.any(Boolean),
          shouldFallback: expect.any(Boolean),
          cooldownMs: expect.any(Number),
        }),
      );
    });
  });
});

describe("formatClassifiedError", () => {
  it("formats a classified error summary", () => {
    const classified: ClassifiedError = {
      reason: "rate_limit",
      statusCode: 429,
      provider: "openai",
      model: "gpt-4",
      message: "Too many requests",
      retryable: true,
      shouldCompress: false,
      shouldRotateCredential: true,
      shouldFallback: false,
      cooldownMs: 60_000,
    };
    const fmt = formatClassifiedError(classified);
    expect(fmt).toContain("rate_limit");
    expect(fmt).toContain("429");
    expect(fmt).toContain("openai");
  });
});
