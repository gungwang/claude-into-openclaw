/**
 * Tool/Skill Maturity Levels and Trust Labels
 *
 * Maturity levels (L0–L4) indicate how production-ready a tool or skill is.
 * Trust labels indicate provenance and vetting status.
 *
 * These are additive metadata — they don't gate execution (that's policy's job).
 * They provide honest capability reporting and a clear roadmap for contributors.
 */

// ── Maturity levels ──

export type MaturityLevel = 0 | 1 | 2 | 3 | 4;

export type MaturityLevelDescriptor = {
  level: MaturityLevel;
  label: string;
  shortLabel: string;
  description: string;
  criteria: string[];
};

export const MATURITY_LEVELS: Record<MaturityLevel, MaturityLevelDescriptor> = {
  0: {
    level: 0,
    label: "Discoverable",
    shortLabel: "L0",
    description: "Metadata exists; tool is listed but not validated.",
    criteria: [
      "Tool has a name and description",
      "Listed in catalog or plugin registry",
    ],
  },
  1: {
    level: 1,
    label: "Schema-validated",
    shortLabel: "L1",
    description: "Schema is validated and tool is listed with typed parameters.",
    criteria: [
      "JSON Schema for parameters is defined",
      "Tool appears in effective inventory",
      "No schema validation errors",
    ],
  },
  2: {
    level: 2,
    label: "Dry-run capable",
    shortLabel: "L2",
    description: "Supports dry-run semantics and policy checks without side effects.",
    criteria: [
      "Policy checks pass before execution",
      "Tool can be invoked with dryRun flag (where supported)",
      "Error taxonomy defined for failure cases",
    ],
  },
  3: {
    level: 3,
    label: "Production-active",
    shortLabel: "L3",
    description: "Active runtime support in controlled scope with real execution.",
    criteria: [
      "Tool executes successfully in real sessions",
      "Error handling covers known failure modes",
      "Timeout and retry behavior defined",
      "Used in production by at least one agent configuration",
    ],
  },
  4: {
    level: 4,
    label: "Production-hardened",
    shortLabel: "L4",
    description: "Telemetry, replay confidence, and regression coverage.",
    criteria: [
      "Telemetry/logging covers execution path",
      "Replay or benchmark tests verify behavior",
      "Contract tests exist for error scenarios",
      "Has been stable across multiple releases",
    ],
  },
};

// ── Trust labels ──

export type TrustSource = "core" | "first-party" | "community" | "local";
export type TrustVetting = "unreviewed" | "reviewed" | "verified";

export type TrustLabel = {
  source: TrustSource;
  vetting: TrustVetting;
};

export type TrustLabelDescriptor = {
  source: TrustSource;
  label: string;
  description: string;
};

export const TRUST_SOURCE_DESCRIPTORS: Record<TrustSource, TrustLabelDescriptor> = {
  core: {
    source: "core",
    label: "Core",
    description: "Shipped with OpenClaw. Maintained by the core team.",
  },
  "first-party": {
    source: "first-party",
    label: "First-party",
    description: "Published by the OpenClaw organization or verified partners.",
  },
  community: {
    source: "community",
    label: "Community",
    description: "Published by the community. Review recommended before use.",
  },
  local: {
    source: "local",
    label: "Local",
    description: "User-defined or workspace-local. Not distributed.",
  },
};

export type TrustVettingDescriptor = {
  vetting: TrustVetting;
  label: string;
  description: string;
};

export const TRUST_VETTING_DESCRIPTORS: Record<TrustVetting, TrustVettingDescriptor> = {
  unreviewed: {
    vetting: "unreviewed",
    label: "Unreviewed",
    description: "No formal review has been performed.",
  },
  reviewed: {
    vetting: "reviewed",
    label: "Reviewed",
    description: "Code review or security scan has been performed.",
  },
  verified: {
    vetting: "verified",
    label: "Verified",
    description: "Thoroughly reviewed, tested, and approved for production use.",
  },
};

// ── Tool maturity entry ──

export type ToolMaturityEntry = {
  toolId: string;
  displayName: string;
  maturityLevel: MaturityLevel;
  trust: TrustLabel;
  /** Capabilities this tool requests (from tool-identity capabilityClass). */
  capabilities?: string[];
  /** Notes for contributors or operators. */
  notes?: string;
};

// ── Maturity report artifact ──

export type MaturityReportArtifact = {
  generatedAt: string;
  version: string;
  entries: ToolMaturityEntry[];
  summary: MaturityReportSummary;
};

export type MaturityReportSummary = {
  total: number;
  byLevel: Record<string, number>;
  bySource: Record<string, number>;
  byVetting: Record<string, number>;
};

// ── Helpers ──

export function describeMaturityLevel(level: MaturityLevel): MaturityLevelDescriptor {
  return MATURITY_LEVELS[level];
}

export function describeTrustSource(source: TrustSource): TrustLabelDescriptor {
  return TRUST_SOURCE_DESCRIPTORS[source];
}

export function describeTrustVetting(vetting: TrustVetting): TrustVettingDescriptor {
  return TRUST_VETTING_DESCRIPTORS[vetting];
}

export function formatMaturityBadge(level: MaturityLevel, trust: TrustLabel): string {
  const maturity = MATURITY_LEVELS[level];
  return `${maturity.shortLabel} ${maturity.label} · ${TRUST_SOURCE_DESCRIPTORS[trust.source].label} · ${TRUST_VETTING_DESCRIPTORS[trust.vetting].label}`;
}

export function buildMaturityReportSummary(entries: ToolMaturityEntry[]): MaturityReportSummary {
  const byLevel: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const byVetting: Record<string, number> = {};

  for (const entry of entries) {
    const levelKey = `L${entry.maturityLevel}`;
    byLevel[levelKey] = (byLevel[levelKey] ?? 0) + 1;
    bySource[entry.trust.source] = (bySource[entry.trust.source] ?? 0) + 1;
    byVetting[entry.trust.vetting] = (byVetting[entry.trust.vetting] ?? 0) + 1;
  }

  return { total: entries.length, byLevel, bySource, byVetting };
}

export function buildMaturityReportArtifact(
  entries: ToolMaturityEntry[],
  version: string,
): MaturityReportArtifact {
  return {
    generatedAt: new Date().toISOString(),
    version,
    entries: entries.toSorted((a, b) => a.toolId.localeCompare(b.toolId)),
    summary: buildMaturityReportSummary(entries),
  };
}

/**
 * Format a maturity report as a markdown capability table.
 */
export function formatMaturityReportMarkdown(report: MaturityReportArtifact): string {
  const lines: string[] = [];
  lines.push(`# Tool Maturity Report`);
  lines.push(`Generated: ${report.generatedAt} · Version: ${report.version}`);
  lines.push("");
  lines.push(`## Summary`);
  lines.push(`Total tools: ${report.summary.total}`);
  lines.push("");
  lines.push("### By Maturity Level");
  for (const [key, count] of Object.entries(report.summary.byLevel).sort()) {
    const level = Number(key.replace("L", "")) as MaturityLevel;
    lines.push(`- **${key}** ${MATURITY_LEVELS[level]?.label ?? key}: ${count}`);
  }
  lines.push("");
  lines.push("### By Source");
  for (const [source, count] of Object.entries(report.summary.bySource).sort()) {
    lines.push(`- **${TRUST_SOURCE_DESCRIPTORS[source as TrustSource]?.label ?? source}**: ${count}`);
  }
  lines.push("");
  lines.push("### By Vetting");
  for (const [vetting, count] of Object.entries(report.summary.byVetting).sort()) {
    lines.push(`- **${TRUST_VETTING_DESCRIPTORS[vetting as TrustVetting]?.label ?? vetting}**: ${count}`);
  }
  lines.push("");
  lines.push("## Tools");
  lines.push("");
  lines.push("| Tool | Maturity | Source | Vetting | Capabilities |");
  lines.push("|------|----------|--------|---------|-------------|");
  for (const entry of report.entries) {
    const maturity = `${MATURITY_LEVELS[entry.maturityLevel].shortLabel} ${MATURITY_LEVELS[entry.maturityLevel].label}`;
    const source = TRUST_SOURCE_DESCRIPTORS[entry.trust.source].label;
    const vetting = TRUST_VETTING_DESCRIPTORS[entry.trust.vetting].label;
    const capabilities = entry.capabilities?.join(", ") ?? "";
    lines.push(`| ${entry.displayName} | ${maturity} | ${source} | ${vetting} | ${capabilities} |`);
  }
  return lines.join("\n");
}
