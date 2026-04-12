/**
 * Path Security — Traversal Prevention (Track B — Security & Supply Chain)
 *
 * Two-layer path traversal defense:
 * 1. Quick reject — checks for `..` components (cheap pre-filter)
 * 2. Full validation — resolves symlinks + normalizes, then confirms
 *    the resolved path is within the allowed root
 *
 * Ported from hermes-agent `tools/path_security.py`.
 */

import fs from "node:fs";
import path from "node:path";

// ── Quick check ──

/**
 * Quick check for `..` traversal components in a path string.
 * Does NOT follow symlinks — use `validateWithinDir` for full validation.
 */
export function hasTraversalComponent(pathStr: string): boolean {
  const parts = path.normalize(pathStr).split(path.sep);
  return parts.includes("..");
}

// ── Full validation ──

/**
 * Validate that a resolved path is within an allowed root directory.
 * Follows symlinks and normalizes `..` before checking containment.
 *
 * Returns an error message string if the path escapes the root,
 * or `undefined` if the path is safe.
 */
export function validateWithinDir(
  targetPath: string,
  rootDir: string,
): string | undefined {
  let resolvedTarget: string;
  let resolvedRoot: string;

  try {
    resolvedRoot = fs.realpathSync(rootDir);
  } catch {
    return `Root directory does not exist: ${rootDir}`;
  }

  try {
    // Try resolving the full path first (follows symlinks)
    resolvedTarget = fs.realpathSync(targetPath);
  } catch {
    // If the target doesn't exist yet (e.g., creating a new file),
    // resolve what we can: resolve the parent, then append the filename
    const dir = path.dirname(targetPath);
    const base = path.basename(targetPath);
    try {
      const resolvedDir = fs.realpathSync(dir);
      resolvedTarget = path.join(resolvedDir, base);
    } catch {
      // Parent doesn't exist either — normalize without symlink resolution
      resolvedTarget = path.resolve(targetPath);
    }
  }

  // Ensure resolved root ends with separator for prefix check
  const rootPrefix = resolvedRoot.endsWith(path.sep)
    ? resolvedRoot
    : resolvedRoot + path.sep;

  // Check containment: target must be root itself or start with root + sep
  if (
    resolvedTarget !== resolvedRoot &&
    !resolvedTarget.startsWith(rootPrefix)
  ) {
    return `Path escapes allowed directory: ${resolvedTarget} is outside ${resolvedRoot}`;
  }

  return undefined;
}

// ── Combined check ──

export type PathSecurityResult = {
  safe: boolean;
  reason?: string;
};

/**
 * Combined path security check:
 * 1. Quick reject for obvious traversal
 * 2. Full symlink-aware validation against root
 */
export function validatePath(
  targetPath: string,
  rootDir: string,
): PathSecurityResult {
  // Quick reject
  if (hasTraversalComponent(targetPath)) {
    return {
      safe: false,
      reason: `Path contains traversal component: ${targetPath}`,
    };
  }

  // Full validation
  const error = validateWithinDir(
    path.resolve(rootDir, targetPath),
    rootDir,
  );
  if (error) {
    return { safe: false, reason: error };
  }

  return { safe: true };
}

// ── Batch validation ──

/**
 * Validate multiple paths against a root directory.
 */
export function validatePaths(
  paths: string[],
  rootDir: string,
): Array<{ path: string; result: PathSecurityResult }> {
  return paths.map((p) => ({
    path: p,
    result: validatePath(p, rootDir),
  }));
}

// ── Sensitive file detection ──

const SENSITIVE_PATTERNS: readonly RegExp[] = [
  /\.env$/i,
  /\.env\.[a-z]+$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.jks$/i,
  /id_rsa$/,
  /id_ed25519$/,
  /id_ecdsa$/,
  /id_dsa$/,
  /\.credentials$/i,
  /\.htpasswd$/i,
  /\.netrc$/i,
  /\.pgpass$/i,
  /\.my\.cnf$/i,
  /credentials\.json$/i,
  /service[_-]?account.*\.json$/i,
  /token\.json$/i,
];

/**
 * Check if a filename matches common secret/credential file patterns.
 */
export function isSensitiveFile(filePath: string): boolean {
  const base = path.basename(filePath);
  return SENSITIVE_PATTERNS.some((p) => p.test(base));
}

/**
 * Scan a directory for sensitive files.
 */
export function findSensitiveFiles(
  dirPath: string,
  options?: { maxDepth?: number },
): string[] {
  const maxDepth = options?.maxDepth ?? 3;
  const results: string[] = [];

  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") && entry.name !== ".env") continue;
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        if (isSensitiveFile(entry.name)) {
          results.push(path.relative(dirPath, fullPath));
        }
      }
    }
  };

  walk(dirPath, 0);
  return results;
}
