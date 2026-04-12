/**
 * Git Checkpoint Manager (Track C — Developer Experience)
 *
 * Transparent filesystem snapshots via shadow git repos.
 * Creates automatic snapshots before file-mutating operations,
 * triggered once per conversation turn. Provides rollback to any
 * previous checkpoint.
 *
 * Ported from hermes-agent `tools/checkpoint_manager.py`.
 * Adapted to TypeScript. Security-hardened path/commit validation.
 *
 * Architecture:
 *   ~/.openclaw/checkpoints/{sha256(abs_dir)[:16]}/  — shadow git repo
 *     HEAD, refs/, objects/                           — standard git internals
 *     OPENCLAW_WORKDIR                                — original dir path
 *     info/exclude                                    — default excludes
 *
 * The shadow repo uses GIT_DIR + GIT_WORK_TREE so no git state leaks
 * into the user's project directory.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";

// ── Types ──

export type CheckpointConfig = {
  /** Enable checkpoint system. Default: false. */
  enabled: boolean;
  /** Max checkpoints to retain per directory. Default: 50. */
  maxSnapshots: number;
  /** Git command timeout (ms). Default: 30_000. */
  gitTimeoutMs: number;
  /** Max files to snapshot — skip huge directories. Default: 50_000. */
  maxFiles: number;
  /** Base directory for shadow repos. Default: ~/.openclaw/checkpoints. */
  baseDir: string;
};

export const DEFAULT_CHECKPOINT_CONFIG: CheckpointConfig = {
  enabled: false,
  maxSnapshots: 50,
  gitTimeoutMs: 30_000,
  maxFiles: 50_000,
  baseDir: join(homedir(), ".openclaw", "checkpoints"),
};

export type CheckpointEntry = {
  hash: string;
  shortHash: string;
  timestamp: string;
  reason: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
};

export type CheckpointResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

// ── Default excludes for shadow repos ──

const DEFAULT_EXCLUDES = [
  "node_modules/",
  "dist/",
  "build/",
  ".env",
  ".env.*",
  ".env.local",
  ".env.*.local",
  "__pycache__/",
  "*.pyc",
  "*.pyo",
  ".DS_Store",
  "*.log",
  ".cache/",
  ".next/",
  ".nuxt/",
  "coverage/",
  ".pytest_cache/",
  ".venv/",
  "venv/",
  ".git/",
];

// ── Validation ──

const COMMIT_HASH_RE = /^[0-9a-fA-F]{4,64}$/;

function validateCommitHash(hash: string): string | undefined {
  if (!hash || !hash.trim()) return "Empty commit hash";
  if (hash.startsWith("-")) return `Invalid commit hash (must not start with '-'): ${hash}`;
  if (!COMMIT_HASH_RE.test(hash)) return `Invalid commit hash (expected 4-64 hex chars): ${hash}`;
  return undefined;
}

function validateFilePath(
  filePath: string,
  workingDir: string,
): string | undefined {
  if (!filePath || !filePath.trim()) return "Empty file path";
  if (filePath.startsWith("/")) return `File path must be relative, got absolute: ${filePath}`;

  const resolved = resolve(workingDir, filePath);
  const root = resolve(workingDir);
  if (!resolved.startsWith(root + "/") && resolved !== root) {
    return `File path escapes working directory via traversal: ${filePath}`;
  }
  return undefined;
}

// ── Shadow repo helpers ──

function normalizePath(path: string): string {
  return resolve(path);
}

function shadowRepoPath(workingDir: string, baseDir: string): string {
  const absPath = normalizePath(workingDir);
  const dirHash = createHash("sha256").update(absPath).digest("hex").slice(0, 16);
  return join(baseDir, dirHash);
}

function gitEnv(shadowRepo: string, workingDir: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  env.GIT_DIR = shadowRepo;
  env.GIT_WORK_TREE = normalizePath(workingDir);
  delete env.GIT_INDEX_FILE;
  delete env.GIT_NAMESPACE;
  delete env.GIT_ALTERNATE_OBJECT_DIRECTORIES;
  return env;
}

function runGit(
  args: readonly string[],
  shadowRepo: string,
  workingDir: string,
  timeoutMs: number,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolveP) => {
    const cwd = normalizePath(workingDir);
    execFile(
      "git",
      args as string[],
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
        env: gitEnv(shadowRepo, workingDir),
      },
      (err, stdout, stderr) => {
        resolveP({
          ok: !err,
          stdout: (stdout ?? "").trim(),
          stderr: (stderr ?? "").trim(),
        });
      },
    );
  });
}

async function initShadowRepo(
  shadowRepo: string,
  workingDir: string,
  timeoutMs: number,
): Promise<string | undefined> {
  if (existsSync(join(shadowRepo, "HEAD"))) return undefined;

  await mkdir(shadowRepo, { recursive: true });

  const init = await runGit(["init"], shadowRepo, workingDir, timeoutMs);
  if (!init.ok) return `Shadow repo init failed: ${init.stderr}`;

  await runGit(["config", "user.email", "openclaw@local"], shadowRepo, workingDir, timeoutMs);
  await runGit(["config", "user.name", "OpenClaw Checkpoint"], shadowRepo, workingDir, timeoutMs);

  const infoDir = join(shadowRepo, "info");
  await mkdir(infoDir, { recursive: true });
  await writeFile(
    join(infoDir, "exclude"),
    DEFAULT_EXCLUDES.join("\n") + "\n",
    "utf-8",
  );

  await writeFile(
    join(shadowRepo, "OPENCLAW_WORKDIR"),
    normalizePath(workingDir) + "\n",
    "utf-8",
  );

  return undefined;
}

// ── Checkpoint manager ──

/**
 * Manages automatic filesystem checkpoints.
 *
 * Call `newTurn()` at the start of each conversation turn and
 * `ensureCheckpoint(dir, reason)` before any file-mutating tool call.
 * Deduplicates so at most one snapshot per directory per turn.
 */
export type CheckpointManager = {
  /** Reset per-turn dedup. Call at start of each agent iteration. */
  newTurn(): void;
  /** Take a checkpoint if not already done this turn. Never throws. */
  ensureCheckpoint(workingDir: string, reason?: string): Promise<boolean>;
  /** List available checkpoints for a directory. */
  listCheckpoints(workingDir: string): Promise<readonly CheckpointEntry[]>;
  /** Rollback working directory to a specific checkpoint. */
  rollback(workingDir: string, commitHash: string): Promise<CheckpointResult<string>>;
  /** Rollback a specific file to a checkpoint state. */
  rollbackFile(
    workingDir: string,
    commitHash: string,
    filePath: string,
  ): Promise<CheckpointResult<string>>;
  /** Get the diff between current state and a checkpoint. */
  diffFromCheckpoint(
    workingDir: string,
    commitHash: string,
  ): Promise<CheckpointResult<string>>;
};

export function createCheckpointManager(
  config: CheckpointConfig = DEFAULT_CHECKPOINT_CONFIG,
): CheckpointManager {
  const checkpointedDirs = new Set<string>();
  let gitAvailable: boolean | undefined;

  async function isGitAvailable(): Promise<boolean> {
    if (gitAvailable !== undefined) return gitAvailable;
    try {
      await new Promise<void>((resolveP, reject) => {
        execFile("git", ["--version"], { timeout: 5_000 }, (err) => {
          if (err) reject(err);
          else resolveP();
        });
      });
      gitAvailable = true;
    } catch {
      gitAvailable = false;
    }
    return gitAvailable;
  }

  async function takeSnapshot(
    absDir: string,
    reason: string,
  ): Promise<boolean> {
    const shadow = shadowRepoPath(absDir, config.baseDir);
    const initErr = await initShadowRepo(shadow, absDir, config.gitTimeoutMs);
    if (initErr) return false;

    // Check if directory is too large
    const fileCount = await quickFileCount(absDir, config.maxFiles);
    if (fileCount > config.maxFiles) return false;

    // Stage all changes
    const add = await runGit(["add", "-A"], shadow, absDir, config.gitTimeoutMs);
    if (!add.ok) return false;

    // Check if there are staged changes
    const diff = await runGit(
      ["diff", "--cached", "--quiet"],
      shadow,
      absDir,
      config.gitTimeoutMs,
    );
    if (diff.ok) return false; // no changes

    // Commit
    const commit = await runGit(
      ["commit", "-m", reason, "--allow-empty-message"],
      shadow,
      absDir,
      config.gitTimeoutMs,
    );
    if (!commit.ok) return false;

    // Prune old checkpoints
    await pruneOldCheckpoints(shadow, absDir, config);

    return true;
  }

  return {
    newTurn() {
      checkpointedDirs.clear();
    },

    async ensureCheckpoint(workingDir: string, reason = "auto"): Promise<boolean> {
      if (!config.enabled) return false;
      if (!(await isGitAvailable())) return false;

      const absDir = normalizePath(workingDir);

      // Skip overly broad directories
      if (absDir === "/" || absDir === homedir()) return false;

      // Already checkpointed this turn
      if (checkpointedDirs.has(absDir)) return false;
      checkpointedDirs.add(absDir);

      try {
        return await takeSnapshot(absDir, reason);
      } catch {
        return false;
      }
    },

    async listCheckpoints(workingDir: string): Promise<readonly CheckpointEntry[]> {
      const absDir = normalizePath(workingDir);
      const shadow = shadowRepoPath(absDir, config.baseDir);

      if (!existsSync(join(shadow, "HEAD"))) return [];

      const log = await runGit(
        ["log", "--format=%H|%h|%aI|%s", "-n", String(config.maxSnapshots)],
        shadow,
        absDir,
        config.gitTimeoutMs,
      );

      if (!log.ok || !log.stdout) return [];

      const entries: CheckpointEntry[] = [];
      for (const line of log.stdout.split("\n")) {
        const parts = line.split("|", 4);
        if (parts.length === 4) {
          const entry: CheckpointEntry = {
            hash: parts[0],
            shortHash: parts[1],
            timestamp: parts[2],
            reason: parts[3],
            filesChanged: 0,
            insertions: 0,
            deletions: 0,
          };

          // Best-effort diffstat
          const stat = await runGit(
            ["diff", "--shortstat", `${parts[0]}~1`, parts[0]],
            shadow,
            absDir,
            config.gitTimeoutMs,
          );
          if (stat.ok && stat.stdout) {
            parseShortstat(stat.stdout, entry);
          }

          entries.push(entry);
        }
      }

      return entries;
    },

    async rollback(
      workingDir: string,
      commitHash: string,
    ): Promise<CheckpointResult<string>> {
      const hashErr = validateCommitHash(commitHash);
      if (hashErr) return { ok: false, error: hashErr };

      const absDir = normalizePath(workingDir);
      const shadow = shadowRepoPath(absDir, config.baseDir);

      const result = await runGit(
        ["checkout", commitHash, "--", "."],
        shadow,
        absDir,
        config.gitTimeoutMs,
      );

      return result.ok
        ? { ok: true, value: `Rolled back to ${commitHash}` }
        : { ok: false, error: `Rollback failed: ${result.stderr}` };
    },

    async rollbackFile(
      workingDir: string,
      commitHash: string,
      filePath: string,
    ): Promise<CheckpointResult<string>> {
      const hashErr = validateCommitHash(commitHash);
      if (hashErr) return { ok: false, error: hashErr };

      const pathErr = validateFilePath(filePath, workingDir);
      if (pathErr) return { ok: false, error: pathErr };

      const absDir = normalizePath(workingDir);
      const shadow = shadowRepoPath(absDir, config.baseDir);

      const result = await runGit(
        ["checkout", commitHash, "--", filePath],
        shadow,
        absDir,
        config.gitTimeoutMs,
      );

      return result.ok
        ? { ok: true, value: `Restored ${filePath} from ${commitHash}` }
        : { ok: false, error: `File rollback failed: ${result.stderr}` };
    },

    async diffFromCheckpoint(
      workingDir: string,
      commitHash: string,
    ): Promise<CheckpointResult<string>> {
      const hashErr = validateCommitHash(commitHash);
      if (hashErr) return { ok: false, error: hashErr };

      const absDir = normalizePath(workingDir);
      const shadow = shadowRepoPath(absDir, config.baseDir);

      const result = await runGit(
        ["diff", commitHash],
        shadow,
        absDir,
        config.gitTimeoutMs,
      );

      return result.ok
        ? { ok: true, value: result.stdout || "(no differences)" }
        : { ok: false, error: `Diff failed: ${result.stderr}` };
    },
  };
}

// ── Helpers ──

async function quickFileCount(dir: string, max: number): Promise<number> {
  let count = 0;
  try {
    const entries = await readdir(dir, { withFileTypes: true, recursive: true });
    for (const _ of entries) {
      count++;
      if (count > max) return count;
    }
  } catch {
    // Permission denied or similar
  }
  return count;
}

async function pruneOldCheckpoints(
  shadow: string,
  workingDir: string,
  config: CheckpointConfig,
): Promise<void> {
  // Count commits
  const log = await runGit(
    ["rev-list", "--count", "HEAD"],
    shadow,
    workingDir,
    config.gitTimeoutMs,
  );

  if (!log.ok) return;

  const count = parseInt(log.stdout, 10);
  if (isNaN(count) || count <= config.maxSnapshots) return;

  // Get the hash at the cutoff point
  const cutoff = await runGit(
    ["rev-list", "--reverse", "HEAD", "--skip", String(config.maxSnapshots)],
    shadow,
    workingDir,
    config.gitTimeoutMs,
  );

  if (cutoff.ok && cutoff.stdout) {
    const firstOld = cutoff.stdout.split("\n")[0];
    if (firstOld && COMMIT_HASH_RE.test(firstOld)) {
      // Rewrite history to remove old checkpoints
      await runGit(
        ["rebase", "--onto", firstOld, "HEAD~" + String(count - config.maxSnapshots)],
        shadow,
        workingDir,
        config.gitTimeoutMs,
      );
    }
  }
}

function parseShortstat(line: string, entry: CheckpointEntry): void {
  const filesMatch = line.match(/(\d+)\s+file/);
  const insertMatch = line.match(/(\d+)\s+insertion/);
  const deleteMatch = line.match(/(\d+)\s+deletion/);
  if (filesMatch) entry.filesChanged = parseInt(filesMatch[1], 10);
  if (insertMatch) entry.insertions = parseInt(insertMatch[1], 10);
  if (deleteMatch) entry.deletions = parseInt(deleteMatch[1], 10);
}
