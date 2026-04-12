import { describe, expect, it } from "vitest";
import {
  validateUrlStructure,
  isUrlSafe,
  filterSafeUrls,
} from "./url-safety.js";

describe("validateUrlStructure", () => {
  it("accepts valid HTTPS URLs", () => {
    expect(validateUrlStructure("https://example.com").safe).toBe(true);
  });

  it("accepts valid HTTP URLs", () => {
    expect(validateUrlStructure("http://example.com").safe).toBe(true);
  });

  it("rejects javascript: scheme", () => {
    expect(validateUrlStructure("javascript:alert(1)").safe).toBe(false);
  });

  it("rejects data: URIs", () => {
    expect(validateUrlStructure("data:text/html,<h1>hi</h1>").safe).toBe(false);
  });

  it("rejects file: URIs", () => {
    expect(validateUrlStructure("file:///etc/passwd").safe).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validateUrlStructure("").safe).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(validateUrlStructure("not a url").safe).toBe(false);
  });
});

describe("isUrlSafe", () => {
  it("returns true for normal HTTPS URL", () => {
    expect(isUrlSafe("https://github.com/repo")).toBe(true);
  });

  it("rejects private IP ranges", () => {
    expect(isUrlSafe("http://192.168.1.1")).toBe(false);
    expect(isUrlSafe("http://10.0.0.1")).toBe(false);
    expect(isUrlSafe("http://127.0.0.1")).toBe(false);
  });

  it("rejects localhost", () => {
    expect(isUrlSafe("http://localhost:3000")).toBe(false);
  });
});

describe("filterSafeUrls", () => {
  it("filters out unsafe URLs from a list", () => {
    const urls = [
      "https://example.com",
      "javascript:alert(1)",
      "https://github.com",
      "http://127.0.0.1",
    ];
    const safe = filterSafeUrls(urls);
    expect(safe).toContain("https://example.com");
    expect(safe).toContain("https://github.com");
    expect(safe).not.toContain("javascript:alert(1)");
    expect(safe).not.toContain("http://127.0.0.1");
  });

  it("returns empty array for all-unsafe input", () => {
    expect(filterSafeUrls(["javascript:x", "data:y"])).toEqual([]);
  });
});
