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
  it("accepts a public IP URL", async () => {
    const result = await isUrlSafe("https://8.8.8.8/path");
    expect(result.safe).toBe(true);
  });

  it("rejects private IP ranges", async () => {
    expect((await isUrlSafe("http://192.168.1.1")).safe).toBe(false);
    expect((await isUrlSafe("http://10.0.0.1")).safe).toBe(false);
    expect((await isUrlSafe("http://127.0.0.1")).safe).toBe(false);
  });

  it("rejects cloud metadata IP", async () => {
    const result = await isUrlSafe("http://169.254.169.254/latest/meta-data");
    expect(result.safe).toBe(false);
  });

  it("includes reason when URL is blocked", async () => {
    const result = await isUrlSafe("http://10.0.0.1");
    expect(result.safe).toBe(false);
    expect(result.reason).toBeDefined();
  });
});

describe("filterSafeUrls", () => {
  it("returns results for all input URLs", async () => {
    const urls = [
      "https://8.8.8.8",
      "javascript:alert(1)",
      "https://1.1.1.1",
      "http://127.0.0.1",
    ];
    const results = await filterSafeUrls(urls);
    expect(results).toHaveLength(4);

    const safeUrls = results.filter((r) => r.result.safe).map((r) => r.url);
    const unsafeUrls = results.filter((r) => !r.result.safe).map((r) => r.url);

    expect(safeUrls).toContain("https://8.8.8.8");
    expect(safeUrls).toContain("https://1.1.1.1");
    expect(unsafeUrls).toContain("javascript:alert(1)");
    expect(unsafeUrls).toContain("http://127.0.0.1");
  });

  it("marks all entries unsafe for all-unsafe input", async () => {
    const results = await filterSafeUrls(["javascript:x", "data:y"]);
    expect(results).toHaveLength(2);
    expect(results.every((r) => !r.result.safe)).toBe(true);
  });
});
