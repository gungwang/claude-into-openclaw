/**
 * Skills Manifest Sync — Three-Way Reconciliation (Track B — Security & Supply Chain)
 *
 * Synchronizes bundled skills to user's skill directory using a manifest-based
 * three-way diff. Preserves user customizations, auto-updates unmodified skills,
 * and flags conflicts. Atomic manifest writes with v1→v2 migration.
 *
 * Ported from hermes-agent `tools/skills_sync.py`.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// ── Types ──

export type SyncResult = {
  copied: number;
  updated: number;
  skipped: number;
  userModified: number;
  cleaned: number;
  totalBundled: number;
  errors: string[];
};

export type ManifestEntry = {
  name: string;
  hash: string;
};

// ── Constants ──

const MANIFEST_FILENAME = ".bundled_manifest";
const MANIFEST_VERSION = "v2";

// ── Manifest I/O ──

/**
 * Read the bundled manifest file. Auto-migrates v1 format.
 * Returns a map of skill name → origin hash.
 */
export function readManifest(
  skillsDir: string,
): Map<string, string> {
  const manifestPath = path.join(skillsDir, MANIFEST_FILENAME);
  if (!fs.existsSync(manifestPath)) return new Map();

  const raw = fs.readFileSync(manifestPath, "utf-8").trim();
  if (!raw) return new Map();

  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const map = new Map<string, string>();

  // Detect format: v2 lines contain a colon separator
  const isV2 = lines.some((l) => l.includes(":"));

  for (const line of lines) {
    if (isV2) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const name = line.slice(0, colonIdx).trim();
      const hash = line.slice(colonIdx + 1).trim();
      if (name && hash) map.set(name, hash);
    } else {
      // v1 format: just names, no hashes → fill with empty string
      const name = line.trim();
      if (name) map.set(name, "");
    }
  }

  return map;
}

/**
 * Write manifest atomically via temp file + rename.
 */
export function writeManifest(
  skillsDir: string,
  entries: Map<string, string>,
): void {
  const manifestPath = path.join(skillsDir, MANIFEST_FILENAME);
  const tmpPath = manifestPath + ".tmp";
  const lines: string[] = [];
  const sorted = Array.from(entries.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  for (const [name, hash] of sorted) {
    lines.push(`${name}:${hash}`);
  }
  fs.writeFileSync(tmpPath, lines.join("\n") + "\n", "utf-8");
  fs.renameSync(tmpPath, manifestPath);
}

// ── Directory hashing ──

/**
 * Compute hash of all file contents in a directory (sorted by path).
 */
export function dirHash(directory: string): string {
  const hash = crypto.createHash("md5");
  const files = walkFiles(directory);
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update(fs.readFileSync(file.absolutePath));
  }
  return hash.digest("hex");
}

// ── Skill discovery ──

type SkillInfo = {
  name: string;
  sourcePath: string;
  relativeDest: string;
};

function discoverBundledSkills(bundledDir: string): SkillInfo[] {
  const skills: SkillInfo[] = [];
  if (!fs.existsSync(bundledDir)) return skills;

  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Check if this directory contains SKILL.md
        const skillMdPath = path.join(fullPath, "SKILL.md");
        if (fs.existsSync(skillMdPath)) {
          const name = extractSkillName(skillMdPath) ?? entry.name;
          const relDest = path.relative(bundledDir, fullPath);
          skills.push({
            name,
            sourcePath: fullPath,
            relativeDest: relDest,
          });
        } else {
          walk(fullPath);
        }
      }
    }
  };

  walk(bundledDir);
  return skills;
}

function extractSkillName(skillMdPath: string): string | undefined {
  try {
    const content = fs.readFileSync(skillMdPath, "utf-8");
    // Look for YAML frontmatter name field
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const nameMatch = fmMatch[1].match(/^name:\s*(.+)$/m);
      if (nameMatch) return nameMatch[1].trim().replace(/^["']|["']$/g, "");
    }
    // Fallback: first # heading
    const headingMatch = content.match(/^#\s+(.+)$/m);
    if (headingMatch) return headingMatch[1].trim();
  } catch {
    // Ignore read errors
  }
  return undefined;
}

// ── Sync engine ──

/**
 * Synchronize bundled skills to a user's skill directory.
 *
 * Three-way logic per skill:
 * 1. NEW (not in manifest) → copy, record hash
 * 2. EXISTING, user unmodified, bundled changed → update + backup
 * 3. EXISTING, user modified → skip (preserve user changes)
 * 4. DELETED by user (in manifest, absent on disk) → respect, skip
 * 5. REMOVED from bundled (in manifest, absent in bundled) → clean from manifest
 */
export function syncSkills(
  bundledDir: string,
  targetDir: string,
  quiet = false,
): SyncResult {
  const result: SyncResult = {
    copied: 0,
    updated: 0,
    skipped: 0,
    userModified: 0,
    cleaned: 0,
    totalBundled: 0,
    errors: [],
  };

  if (!fs.existsSync(bundledDir)) return result;

  // Ensure target directory exists
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const manifest = readManifest(targetDir);
  const bundledSkills = discoverBundledSkills(bundledDir);
  result.totalBundled = bundledSkills.length;

  const bundledNames = new Set<string>();

  for (const skill of bundledSkills) {
    bundledNames.add(skill.name);
    const destPath = path.join(targetDir, skill.relativeDest);
    const bundledHash = dirHash(skill.sourcePath);

    if (!manifest.has(skill.name)) {
      // NEW: not in manifest → copy
      if (!fs.existsSync(destPath)) {
        try {
          copyDirRecursive(skill.sourcePath, destPath);
          manifest.set(skill.name, bundledHash);
          result.copied++;
        } catch (err) {
          result.errors.push(`Failed to copy ${skill.name}: ${err}`);
        }
      } else {
        // Exists on disk but not in manifest (pre-existing)
        manifest.set(skill.name, bundledHash);
        result.skipped++;
      }
      continue;
    }

    const originHash = manifest.get(skill.name)!;

    // Check if destination exists
    if (!fs.existsSync(destPath)) {
      // User deleted the skill → respect deletion, skip
      result.skipped++;
      continue;
    }

    const currentHash = dirHash(destPath);

    if (currentHash !== originHash && originHash !== "") {
      // User modified → skip
      result.userModified++;
      continue;
    }

    if (bundledHash === originHash) {
      // No changes → skip
      result.skipped++;
      continue;
    }

    // Unmodified + bundled changed → update
    try {
      // Backup current version
      const backupPath = destPath + ".backup";
      if (fs.existsSync(backupPath)) {
        fs.rmSync(backupPath, { recursive: true });
      }
      fs.renameSync(destPath, backupPath);

      // Copy new version
      copyDirRecursive(skill.sourcePath, destPath);
      manifest.set(skill.name, bundledHash);
      result.updated++;

      // Clean up backup on success
      fs.rmSync(backupPath, { recursive: true });
    } catch (err) {
      // Restore from backup on failure
      const backupPath = destPath + ".backup";
      if (fs.existsSync(backupPath) && !fs.existsSync(destPath)) {
        try {
          fs.renameSync(backupPath, destPath);
        } catch {
          // Best effort restore
        }
      }
      result.errors.push(`Failed to update ${skill.name}: ${err}`);
    }
  }

  // Clean removed bundled skills from manifest
  for (const [name] of manifest) {
    if (!bundledNames.has(name)) {
      manifest.delete(name);
      result.cleaned++;
    }
  }

  // Write updated manifest
  writeManifest(targetDir, manifest);

  return result;
}

// ── Formatting ──

export function formatSyncReport(result: SyncResult): string {
  const lines = [
    `Skills sync: ${result.totalBundled} bundled`,
    `  Copied: ${result.copied}`,
    `  Updated: ${result.updated}`,
    `  User modified (preserved): ${result.userModified}`,
    `  Skipped: ${result.skipped}`,
    `  Cleaned from manifest: ${result.cleaned}`,
  ];
  if (result.errors.length > 0) {
    lines.push(`  Errors: ${result.errors.length}`);
    for (const err of result.errors) {
      lines.push(`    - ${err}`);
    }
  }
  return lines.join("\n");
}

// ── Helpers ──

type WalkFile = {
  absolutePath: string;
  relativePath: string;
};

function walkFiles(dirPath: string): WalkFile[] {
  const files: WalkFile[] = [];
  const walk = (dir: string, prefix: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        walk(abs, rel);
      } else if (entry.isFile()) {
        files.push({ absolutePath: abs, relativePath: rel });
      }
    }
  };
  walk(dirPath, "");
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
