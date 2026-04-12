import { describe, expect, it } from "vitest";
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

  it("detects encoded traversal", () => {
    expect(hasTraversalComponent("..%2f..%2fetc/passwd")).toBe(true);
    expect(hasTraversalComponent("%2e%2e/secret")).toBe(true);
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
  it("accepts paths within the base directory", () => {
    const result = validateWithinDir("/home/user/project", "/home/user/project/src/main.ts");
    expect(result.safe).toBe(true);
  });

  it("rejects paths escaping the base directory", () => {
    const result = validateWithinDir("/home/user/project", "/home/user/other/secret.txt");
    expect(result.safe).toBe(false);
  });

  it("rejects symlink-style escapes via ..", () => {
    const result = validateWithinDir("/home/user/project", "/home/user/project/../other/secret");
    expect(result.safe).toBe(false);
  });
});

describe("validatePath", () => {
  it("rejects paths with null bytes", () => {
    const result = validatePath("foo\x00bar.ts");
    expect(result.safe).toBe(false);
  });

  it("accepts normal filenames", () => {
    const result = validatePath("src/components/Button.tsx");
    expect(result.safe).toBe(true);
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
    expect(isSensitiveFile(".npmrc")).toBe(true);
    expect(isSensitiveFile(".netrc")).toBe(true);
  });

  it("does not flag regular source files", () => {
    expect(isSensitiveFile("index.ts")).toBe(false);
    expect(isSensitiveFile("README.md")).toBe(false);
  });
});

describe("findSensitiveFiles", () => {
  it("returns sensitive files from a list", () => {
    const files = ["src/main.ts", ".env", "package.json", "id_rsa", "README.md"];
    const found = findSensitiveFiles(files);
    expect(found).toContain(".env");
    expect(found).toContain("id_rsa");
    expect(found).not.toContain("src/main.ts");
  });
});
