/**
 * Git Worktree Isolation Manager (Track C — Developer Experience)
 *
 * Creates isolated git worktrees for concurrent agent editing sessions.
 * Each session gets its own branch/worktree, preventing conflicts between
 * parallel sessions. Automatic cleanup on session end.
 *
 * Ported from hermes-agent `cli.py` (worktree setup/cleanup functions).
 * Adapted to TypeScript, pure-function style, with security hardening.
 */

import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

// ── Types ──

export type WorktreeInfo = {
  path: string;
  branch: string;
  repoRoot: string;
  sessionId: string;
};

export type WorktreeConfig = {
  /** Enable worktree isolation. Default: false. */
  enabled: boolean;
  /** Directory name under repo root for worktrees. Default: ".worktrees" */
  worktreeDir: string;
  /** Branch prefix. Default: "openclaw/" */
  branchPrefix: string;
  /** Timeout for git commands (ms). Default: 30_000 */
  gitTimeoutMs: number;
  /** Maximum concurrent worktrees. Default: 10 */
  maxConcurrent: number;
};

export const DEFAULT_WORKTREE_CONFIG: WorktreeConfig = {
  enabled: false,
  worktreeDir: ".worktrees",
  branchPrefix: "openclaw/",
  gitTimeoutMs: 30_000,
  maxConcurrent: 10,
};

export type WorktreeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

// ── Git helpers ──

function execGit(
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args as string[],
      { cwd, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) reject(err);
        else resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      },
    );
  });
}

/** Discover the git repo root from a given directory. */
export async function findRepoRoot(
  cwd: string,
  timeoutMs = 5_000,
): Promise<string | undefined> {
  try {
    const { stdout } = await execGit(
      ["rev-parse", "--show-toplevel"],
      cwd,
      timeoutMs,
    );
    return stdout || undefined;
  } catch {
    return undefined;
  }
}

/** Check whether a resolved path stays within an expected root. */
function isWithinRoot(child: string, root: string): boolean {
  const resolved = resolve(child);
  const rootResolved = resolve(root);
  return resolved === rootResolved || resolved.startsWith(rootResolved + "/");
}

// ── Worktree lifecycle ──

/**
 * Create an isolated git worktree for a session.
 *
 * 1. Ensures `.worktrees/` exists and is gitignored.
 * 2. Creates a new branch from HEAD in a subfolder.
 * 3. Copies files listed in `.worktreeinclude` (gitignored files the agent needs).
 */
export async function setupWorktree(
  repoRoot: string,
  config: WorktreeConfig = DEFAULT_WORKTREE_CONFIG,
): Promise<WorktreeResult<WorktreeInfo>> {
  const sessionId = randomUUID().slice(0, 8);
  const wtName = `openclaw-${sessionId}`;
  const branchName = `${config.branchPrefix}${wtName}`;

  const worktreesDir = join(repoRoot, config.worktreeDir);
  const wtPath = join(worktreesDir, wtName);

  try {
    // Create worktrees directory
    await mkdir(worktreesDir, { recursive: true });

    // Ensure worktree dir is gitignored
    await ensureGitignored(repoRoot, config.worktreeDir + "/");

    // Check concurrent worktree count
    const countCheck = await countActiveWorktrees(
      repoRoot,
      config.gitTimeoutMs,
    );
    if (countCheck >= config.maxConcurrent) {
      return {
        ok: false,
        error: `Too many active worktrees (${countCheck}/${config.maxConcurrent}). Clean up stale ones first.`,
      };
    }

    // Create the worktree
    await execGit(
      ["worktree", "add", wtPath, "-b", branchName, "HEAD"],
      repoRoot,
      config.gitTimeoutMs,
    );

    // Copy .worktreeinclude entries
    await copyWorktreeIncludes(repoRoot, wtPath);

    return {
      ok: true,
      value: { path: wtPath, branch: branchName, repoRoot, sessionId },
    };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to create worktree: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Clean up a worktree on session end.
 *
 * Preserves the worktree if it has unpushed commits (real work).
 * Returns whether the worktree was removed.
 */
export async function cleanupWorktree(
  info: WorktreeInfo,
  config: WorktreeConfig = DEFAULT_WORKTREE_CONFIG,
): Promise<WorktreeResult<{ removed: boolean; reason: string }>> {
  try {
    // Check for unpushed commits
    const hasUnpushed = await hasUnpushedCommits(
      info.path,
      config.gitTimeoutMs,
    );

    if (hasUnpushed) {
      return {
        ok: true,
        value: {
          removed: false,
          reason: `Worktree has unpushed commits, keeping: ${info.path}`,
        },
      };
    }

    // Remove worktree
    await execGit(
      ["worktree", "remove", "--force", info.path],
      info.repoRoot,
      config.gitTimeoutMs,
    );

    // Delete the branch
    try {
      await execGit(
        ["branch", "-D", info.branch],
        info.repoRoot,
        config.gitTimeoutMs,
      );
    } catch {
      // Branch may already be gone — non-fatal
    }

    return { ok: true, value: { removed: true, reason: "Cleaned up successfully" } };
  } catch (err) {
    return {
      ok: false,
      error: `Cleanup failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Helpers ──

async function hasUnpushedCommits(
  wtPath: string,
  timeoutMs: number,
): Promise<boolean> {
  try {
    const { stdout } = await execGit(
      ["log", "--oneline", "HEAD", "--not", "--remotes"],
      wtPath,
      timeoutMs,
    );
    return stdout.length > 0;
  } catch {
    // Assume unpushed on error — don't accidentally delete work
    return true;
  }
}

async function countActiveWorktrees(
  repoRoot: string,
  timeoutMs: number,
): Promise<number> {
  try {
    const { stdout } = await execGit(
      ["worktree", "list", "--porcelain"],
      repoRoot,
      timeoutMs,
    );
    // Each worktree entry starts with "worktree " line
    return stdout.split("\n").filter((l) => l.startsWith("worktree ")).length;
  } catch {
    return 0;
  }
}

async function ensureGitignored(
  repoRoot: string,
  entry: string,
): Promise<void> {
  const gitignorePath = join(repoRoot, ".gitignore");
  try {
    let content = "";
    try {
      content = await readFile(gitignorePath, "utf-8");
    } catch {
      // File doesn't exist yet — that's fine
    }

    if (!content.split("\n").includes(entry)) {
      const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
      await writeFile(gitignorePath, `${content}${separator}${entry}\n`, "utf-8");
    }
  } catch {
    // Non-fatal — the gitignore update is a convenience
  }
}

async function copyWorktreeIncludes(
  repoRoot: string,
  wtPath: string,
): Promise<void> {
  const includeFile = join(repoRoot, ".worktreeinclude");
  let content: string;

  try {
    content = await readFile(includeFile, "utf-8");
  } catch {
    return; // No include file — nothing to copy
  }

  const repoRootResolved = resolve(repoRoot);
  const wtPathResolved = resolve(wtPath);

  for (const line of content.split("\n")) {
    const entry = line.trim();
    if (!entry || entry.startsWith("#")) continue;

    const src = resolve(repoRoot, entry);
    const dst = resolve(wtPath, entry);

    // Security: both source and destination must stay within their roots
    if (!isWithinRoot(src, repoRootResolved)) continue;
    if (!isWithinRoot(dst, wtPathResolved)) continue;

    try {
      const srcStat = await stat(src);
      if (srcStat.isFile()) {
        await mkdir(dirname(dst), { recursive: true });
        await copyFile(src, dst);
      } else if (srcStat.isDirectory()) {
        // Symlink directories for efficiency
        await mkdir(dirname(dst), { recursive: true });
        await symlink(src, dst);
      }
    } catch {
      // Non-fatal — skip entries that can't be copied
    }
  }
}

/**
 * List all active OpenClaw worktrees for a repo.
 * Useful for cleanup/status display.
 */
export async function listWorktrees(
  repoRoot: string,
  config: WorktreeConfig = DEFAULT_WORKTREE_CONFIG,
): Promise<WorktreeInfo[]> {
  try {
    const { stdout } = await execGit(
      ["worktree", "list", "--porcelain"],
      repoRoot,
      config.gitTimeoutMs,
    );

    const entries: WorktreeInfo[] = [];
    let currentPath = "";
    let currentBranch = "";

    for (const line of stdout.split("\n")) {
      if (line.startsWith("worktree ")) {
        currentPath = line.slice("worktree ".length);
      } else if (line.startsWith("branch ")) {
        currentBranch = line.slice("branch ".length).replace("refs/heads/", "");
      } else if (line === "") {
        if (
          currentPath &&
          currentBranch.startsWith(config.branchPrefix) &&
          currentPath.includes(config.worktreeDir)
        ) {
          const sessionId =
            currentPath.split("/").pop()?.replace("openclaw-", "") ?? "";
          entries.push({
            path: currentPath,
            branch: currentBranch,
            repoRoot,
            sessionId,
          });
        }
        currentPath = "";
        currentBranch = "";
      }
    }

    return entries;
  } catch {
    return [];
  }
}
