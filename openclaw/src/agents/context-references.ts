/**
 * Automatic Context Reference Injection (Track C — Developer Experience)
 *
 * Detects @-references in user messages and expands them into file content,
 * git diffs, folder listings, and URL fetches. Provides the agent with
 * project awareness without manual specification.
 *
 * Ported from hermes-agent `agent/context_references.py`.
 * Adapted to TypeScript, pure-function style, with security hardening.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

// ── Types ──

export type ReferenceKind = "file" | "folder" | "git" | "url" | "diff" | "staged";

export type ContextReference = {
  raw: string;
  kind: ReferenceKind;
  target: string;
  start: number;
  end: number;
  lineStart?: number;
  lineEnd?: number;
};

export type ContextReferenceResult = {
  /** Message with references expanded inline. */
  message: string;
  /** Original unmodified message. */
  originalMessage: string;
  /** Parsed references found. */
  references: readonly ContextReference[];
  /** Non-fatal warnings (e.g., file not found). */
  warnings: readonly string[];
  /** Approximate token count of injected content. */
  injectedTokens: number;
  /** Whether any references were expanded. */
  expanded: boolean;
  /** Whether expansion was blocked (e.g., security). */
  blocked: boolean;
};

export type ContextReferencesConfig = {
  /** Enable @-reference expansion. Default: true. */
  enabled: boolean;
  /** Max tokens to inject per reference. Default: 50_000. */
  maxTokensPerRef: number;
  /** Max total injected tokens. Default: 200_000. */
  maxTotalTokens: number;
  /** Timeout for git commands (ms). Default: 10_000. */
  gitTimeoutMs: number;
  /** Timeout for URL fetches (ms). Default: 15_000. */
  urlTimeoutMs: number;
};

export const DEFAULT_CONTEXT_REFERENCES_CONFIG: ContextReferencesConfig = {
  enabled: true,
  maxTokensPerRef: 50_000,
  maxTotalTokens: 200_000,
  gitTimeoutMs: 10_000,
  urlTimeoutMs: 15_000,
};

// ── Sensitive paths (block list) ──

const SENSITIVE_HOME_DIRS = new Set([
  ".ssh", ".aws", ".gnupg", ".kube", ".docker", ".azure", ".config/gh",
]);

const SENSITIVE_HOME_FILES = new Set([
  ".ssh/authorized_keys", ".ssh/id_rsa", ".ssh/id_ed25519", ".ssh/config",
  ".bashrc", ".zshrc", ".profile", ".bash_profile", ".zprofile",
  ".netrc", ".pgpass", ".npmrc", ".pypirc",
]);

// ── Reference parsing ──

const QUOTED_VALUE = String.raw`(?:\x60[^\x60\n]+\x60|"[^"\n]+"|'[^'\n]+')`;
const REFERENCE_RE = new RegExp(
  `(?<![\\/\\w])@(?:(?<simple>diff|staged)\\b|(?<kind>file|folder|git|url):(?<value>${QUOTED_VALUE}(?::\\d+(?:-\\d+)?)?|\\S+))`,
  "g",
);

const TRAILING_PUNCTUATION = /[,.;!?]+$/;

function stripQuotes(value: string): string {
  if (
    (value.startsWith("`") && value.endsWith("`")) ||
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Parse @-references from a message string.
 * Supports: @diff, @staged, @file:path, @folder:path, @git:ref, @url:href
 */
export function parseContextReferences(message: string): ContextReference[] {
  if (!message) return [];

  const refs: ContextReference[] = [];
  REFERENCE_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = REFERENCE_RE.exec(message)) !== null) {
    const simple = match.groups?.simple;
    if (simple) {
      refs.push({
        raw: match[0],
        kind: simple as ReferenceKind,
        target: "",
        start: match.index,
        end: match.index + match[0].length,
      });
      continue;
    }

    const kind = match.groups?.kind as ReferenceKind;
    const rawValue = (match.groups?.value ?? "").replace(TRAILING_PUNCTUATION, "");
    let target = stripQuotes(rawValue);
    let lineStart: number | undefined;
    let lineEnd: number | undefined;

    if (kind === "file") {
      const lineMatch = target.match(/:(\d+)(?:-(\d+))?$/);
      if (lineMatch) {
        target = target.slice(0, -(lineMatch[0].length));
        lineStart = parseInt(lineMatch[1], 10);
        lineEnd = lineMatch[2] ? parseInt(lineMatch[2], 10) : undefined;
      }
    }

    refs.push({
      raw: match[0],
      kind,
      target,
      start: match.index,
      end: match.index + match[0].length,
      lineStart,
      lineEnd,
    });
  }

  return refs;
}

// ── Security checks ──

function isSensitivePath(filePath: string, allowedRoot: string): boolean {
  const home = process.env.HOME ?? "";
  if (!home) return false;

  const rel = relative(home, resolve(allowedRoot, filePath));
  if (rel.startsWith("..")) return false; // not under home

  for (const dir of SENSITIVE_HOME_DIRS) {
    if (rel === dir || rel.startsWith(dir + "/")) return true;
  }

  return SENSITIVE_HOME_FILES.has(rel);
}

function isWithinRoot(child: string, root: string): boolean {
  const resolvedChild = resolve(child);
  const resolvedRoot = resolve(root);
  return resolvedChild === resolvedRoot || resolvedChild.startsWith(resolvedRoot + "/");
}

// ── Reference expansion ──

/**
 * Expand all @-references in a message.
 *
 * Security: paths must stay within `cwd`, sensitive dotfiles are blocked.
 */
export async function expandContextReferences(
  message: string,
  cwd: string,
  config: ContextReferencesConfig = DEFAULT_CONTEXT_REFERENCES_CONFIG,
): Promise<ContextReferenceResult> {
  const original = message;

  if (!config.enabled) {
    return {
      message,
      originalMessage: original,
      references: [],
      warnings: [],
      injectedTokens: 0,
      expanded: false,
      blocked: false,
    };
  }

  const refs = parseContextReferences(message);
  if (refs.length === 0) {
    return {
      message,
      originalMessage: original,
      references: refs,
      warnings: [],
      injectedTokens: 0,
      expanded: false,
      blocked: false,
    };
  }

  const warnings: string[] = [];
  const expansions: Array<{ ref: ContextReference; content: string }> = [];
  let totalTokens = 0;

  for (const ref of refs) {
    if (totalTokens >= config.maxTotalTokens) {
      warnings.push(`Token budget exhausted, skipping remaining references`);
      break;
    }

    const result = await expandSingleReference(ref, cwd, config);
    if (result.warning) warnings.push(result.warning);

    if (result.content) {
      const tokens = estimateTokens(result.content);
      const cappedTokens = Math.min(tokens, config.maxTokensPerRef);
      totalTokens += cappedTokens;
      const content =
        tokens > config.maxTokensPerRef
          ? result.content.slice(0, config.maxTokensPerRef * 4) + "\n[...truncated]"
          : result.content;
      expansions.push({ ref, content });
    }
  }

  // Replace references with expanded content (back to front to preserve indices)
  let expanded = message;
  for (const { ref, content } of [...expansions].reverse()) {
    const label = `\n<context ref="${ref.raw}">\n${content}\n</context>\n`;
    expanded = expanded.slice(0, ref.start) + label + expanded.slice(ref.end);
  }

  return {
    message: expanded,
    originalMessage: original,
    references: refs,
    warnings,
    injectedTokens: totalTokens,
    expanded: expansions.length > 0,
    blocked: false,
  };
}

// ── Single reference expansion ──

async function expandSingleReference(
  ref: ContextReference,
  cwd: string,
  config: ContextReferencesConfig,
): Promise<{ content: string | undefined; warning: string | undefined }> {
  switch (ref.kind) {
    case "file":
      return expandFileReference(ref, cwd);
    case "folder":
      return expandFolderReference(ref, cwd);
    case "diff":
      return expandGitDiff(cwd, false, config.gitTimeoutMs);
    case "staged":
      return expandGitDiff(cwd, true, config.gitTimeoutMs);
    case "git":
      return expandGitRef(ref, cwd, config.gitTimeoutMs);
    case "url":
      return { content: undefined, warning: "URL expansion not yet implemented" };
  }
}

async function expandFileReference(
  ref: ContextReference,
  cwd: string,
): Promise<{ content: string | undefined; warning: string | undefined }> {
  const filePath = resolve(cwd, ref.target);

  if (!isWithinRoot(filePath, cwd)) {
    return { content: undefined, warning: `@file:${ref.target} escapes working directory` };
  }

  if (isSensitivePath(ref.target, cwd)) {
    return { content: undefined, warning: `@file:${ref.target} blocked (sensitive path)` };
  }

  try {
    const content = await readFile(filePath, "utf-8");
    if (ref.lineStart !== undefined) {
      const lines = content.split("\n");
      const start = Math.max(0, ref.lineStart - 1);
      const end = ref.lineEnd ?? ref.lineStart;
      return { content: lines.slice(start, end).join("\n"), warning: undefined };
    }
    return { content, warning: undefined };
  } catch {
    return { content: undefined, warning: `@file:${ref.target} not found` };
  }
}

async function expandFolderReference(
  ref: ContextReference,
  cwd: string,
): Promise<{ content: string | undefined; warning: string | undefined }> {
  const folderPath = resolve(cwd, ref.target);

  if (!isWithinRoot(folderPath, cwd)) {
    return { content: undefined, warning: `@folder:${ref.target} escapes working directory` };
  }

  try {
    const entries = await readdir(folderPath, { withFileTypes: true });
    const listing = entries
      .slice(0, 200) // cap at 200 entries
      .map((e) => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`)
      .join("\n");
    return { content: listing, warning: undefined };
  } catch {
    return { content: undefined, warning: `@folder:${ref.target} not found` };
  }
}

async function expandGitDiff(
  cwd: string,
  staged: boolean,
  timeoutMs: number,
): Promise<{ content: string | undefined; warning: string | undefined }> {
  const args = staged ? ["diff", "--cached"] : ["diff"];
  try {
    const stdout = await execGitSimple(args, cwd, timeoutMs);
    return { content: stdout || "(no changes)", warning: undefined };
  } catch {
    return { content: undefined, warning: "Git diff failed" };
  }
}

async function expandGitRef(
  ref: ContextReference,
  cwd: string,
  timeoutMs: number,
): Promise<{ content: string | undefined; warning: string | undefined }> {
  // Validate: only allow safe git ref characters
  if (!/^[\w./-]+$/.test(ref.target)) {
    return { content: undefined, warning: `@git:${ref.target} — invalid ref format` };
  }

  try {
    const stdout = await execGitSimple(["show", ref.target], cwd, timeoutMs);
    return { content: stdout, warning: undefined };
  } catch {
    return { content: undefined, warning: `@git:${ref.target} not found` };
  }
}

// ── Helpers ──

function execGitSimple(
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout.trim());
      },
    );
  });
}

/** Rough token estimate: ~4 chars per token. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Subdirectory hints ──

export type SubdirectoryHint = {
  path: string;
  description: string;
  fileCount: number;
};

/**
 * Generate subdirectory hints for project structure awareness.
 * Provides the agent with a high-level map of the project layout.
 */
export async function generateSubdirectoryHints(
  cwd: string,
  maxDepth = 2,
): Promise<SubdirectoryHint[]> {
  const hints: SubdirectoryHint[] = [];
  await walkForHints(cwd, cwd, 0, maxDepth, hints);
  return hints;
}

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", ".nuxt", "dist", "build",
  "__pycache__", ".venv", "venv", "coverage", ".cache",
  ".worktrees",
]);

async function walkForHints(
  root: string,
  current: string,
  depth: number,
  maxDepth: number,
  hints: SubdirectoryHint[],
): Promise<void> {
  if (depth >= maxDepth) return;

  try {
    const entries = await readdir(current, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith("."));
    const files = entries.filter((e) => e.isFile());

    for (const dir of dirs) {
      const dirPath = join(current, dir.name);
      const relPath = relative(root, dirPath);

      hints.push({
        path: relPath,
        description: inferDirectoryPurpose(dir.name),
        fileCount: files.length,
      });

      await walkForHints(root, dirPath, depth + 1, maxDepth, hints);
    }
  } catch {
    // Permission denied or similar — skip silently
  }
}

function inferDirectoryPurpose(name: string): string {
  const purposes: Record<string, string> = {
    src: "Source code",
    lib: "Library code",
    test: "Tests",
    tests: "Tests",
    spec: "Test specifications",
    docs: "Documentation",
    scripts: "Build/utility scripts",
    config: "Configuration",
    public: "Static public assets",
    assets: "Assets (images, fonts, etc.)",
    styles: "Stylesheets",
    components: "UI components",
    pages: "Page routes",
    api: "API endpoints",
    hooks: "React/framework hooks",
    utils: "Utility functions",
    helpers: "Helper functions",
    types: "Type definitions",
    models: "Data models",
    services: "Service layer",
    middleware: "Middleware",
    plugins: "Plugins",
    tools: "Agent tools",
    agents: "Agent implementations",
  };
  return purposes[name.toLowerCase()] ?? "";
}
