import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  hasTraversalComponent,
  validateWithinDir,
  validatePath,
  isSensitiveFile,
  findSensitiveFiles,
  type PathSecurityResult,
} from "./path-security.js";

describe("hasTraversalComponent", () => {
  it("detects ../ traversal", () => {
    expect(hasTraversalComponent("../etc/passwd")).toBe(true);
    expect(hasTraversalComponent("foo/../../bar")).toBe(true);
  });

  it("does not decode URL-encoded sequences", () => {
    // The function checks raw path components, not URL-decoded strings
    expect(hasTraversalComponent("..%2f..%2fetc/passwd")).toBe(false);
    expect(hasTraversalComponent("%2e%2e/secret")).toBe(false);
  });

  it("allows normal relative paths", () => {
    expect(hasTraversalComponent("src/index.ts")).toBe(false);
    expect(hasTraversalComponent("./src/index.ts")).toBe(false);
  });

  it("allows names containing dots", () => {
    expect(hasTraversalComponent("my.component.ts")).toBe(false);
    expect(hasTraversalComponent(".gitignore")).toBe(false);
  });
});

describe("validateWithinDir", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "path-sec-test-"));
    fs.mkdirSync(path.join(tmpRoot, "src"), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, "src", "main.ts"), "");
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("accepts paths within the base directory", () => {
    const result = validateWithinDir(
      path.join(tmpRoot, "src", "main.ts"),
      tmpRoot,
    );
    expect(result).toBeUndefined();
  });

  it("rejects paths escaping the base directory", () => {
    const result = validateWithinDir("/etc/passwd", tmpRoot);
    expect(result).toBeDefined();
    expect(typeof result).toBe("string");
    expect(result).toContain("escapes allowed directory");
  });

  it("rejects symlink-style escapes via ..", () => {
    const result = validateWithinDir(
      path.join(tmpRoot, "..", "other", "secret"),
      tmpRoot,
    );
    expect(result).toBeDefined();
    expect(result).toContain("escapes allowed directory");
  });

  it("returns error when root directory does not exist", () => {
    const result = validateWithinDir("/tmp/test.txt", "/nonexistent/root/dir");
    expect(result).toBeDefined();
    expect(result).toContain("Root directory does not exist");
  });
});

describe("validatePath", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "path-sec-val-"));
    fs.mkdirSync(path.join(tmpRoot, "src", "components"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("rejects paths with traversal components", () => {
    const result = validatePath("../../etc/passwd", tmpRoot);
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("traversal component");
  });

  it("accepts normal filenames", () => {
    const result = validatePath("src/components/Button.tsx", tmpRoot);
    expect(result.safe).toBe(true);
    expect(result.reason).toBeUndefined();
  });
});

describe("isSensitiveFile", () => {
  it("flags .env files", () => {
    expect(isSensitiveFile(".env")).toBe(true);
    expect(isSensitiveFile(".env.local")).toBe(true);
  });

  it("flags private keys", () => {
    expect(isSensitiveFile("id_rsa")).toBe(true);
    expect(isSensitiveFile("server.key")).toBe(true);
  });

  it("flags credentials files", () => {
    expect(isSensitiveFile(".netrc")).toBe(true);
    expect(isSensitiveFile("credentials.json")).toBe(true);
  });

  it("does not flag regular source files", () => {
    expect(isSensitiveFile("index.ts")).toBe(false);
    expect(isSensitiveFile("README.md")).toBe(false);
  });
});

describe("findSensitiveFiles", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "path-sec-sens-"));
    fs.mkdirSync(path.join(tmpRoot, "src"), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, "src", "main.ts"), "");
    fs.writeFileSync(path.join(tmpRoot, ".env"), "SECRET=foo");
    fs.writeFileSync(path.join(tmpRoot, "package.json"), "{}");
    fs.writeFileSync(path.join(tmpRoot, "id_rsa"), "");
    fs.writeFileSync(path.join(tmpRoot, "README.md"), "");
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("returns sensitive files from a directory", () => {
    const found = findSensitiveFiles(tmpRoot);
    expect(found).toContain(".env");
    expect(found).toContain("id_rsa");
    expect(found).not.toContain(path.join("src", "main.ts"));
    expect(found).not.toContain("package.json");
  });
});
