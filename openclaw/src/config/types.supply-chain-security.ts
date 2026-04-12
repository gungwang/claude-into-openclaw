/**
 * Security & Supply Chain Config Types (Track B)
 *
 * Configuration for skills security scanning, manifest sync,
 * URL safety validation, and path security hardening.
 */

import type { FindingSeverity, TrustLevel } from "../agents/skills-guard.js";

// ── Skills security guard ──

export type SkillsGuardConfig = {
  /** Enable pre-install security scanning. Default: true. */
  enabled?: boolean;
  /** Minimum severity to report. Default: "low". */
  minSeverity?: FindingSeverity;
  /** Trust level overrides by skill source. */
  trustOverrides?: Record<string, TrustLevel>;
  /** Allow forced install bypassing security checks. Default: false. */
  allowForce?: boolean;
};

// ── Skills manifest sync ──

export type SkillsSyncConfig = {
  /** Enable manifest-based skill synchronization. Default: true. */
  enabled?: boolean;
  /** Path to bundled skills directory. */
  bundledDir?: string;
  /** Run sync on startup. Default: true. */
  syncOnStart?: boolean;
};

// ── URL safety ──

export type UrlSafetyConfig = {
  /** Enable URL safety validation. Default: true. */
  enabled?: boolean;
  /** Additional blocked hostnames. */
  blockedHostnames?: string[];
  /** Allow private network access (DANGEROUS). Default: false. */
  allowPrivateNetworks?: boolean;
};

// ── Path security ──

export type PathSecurityConfig = {
  /** Enable path traversal prevention. Default: true. */
  enabled?: boolean;
  /** Detect and flag sensitive files. Default: true. */
  detectSensitiveFiles?: boolean;
  /** Maximum directory depth for sensitive file scan. Default: 3. */
  sensitiveFileScanDepth?: number;
};

// ── Aggregate supply chain security config ──

export type SupplyChainSecurityConfig = {
  skillsGuard?: SkillsGuardConfig;
  skillsSync?: SkillsSyncConfig;
  urlSafety?: UrlSafetyConfig;
  pathSecurity?: PathSecurityConfig;
};
