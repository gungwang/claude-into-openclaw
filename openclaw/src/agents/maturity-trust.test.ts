import { describe, expect, it } from "vitest";
import {
  buildMaturityReportArtifact,
  buildMaturityReportSummary,
  describeMaturityLevel,
  describeTrustSource,
  describeTrustVetting,
  formatMaturityBadge,
  formatMaturityReportMarkdown,
  MATURITY_LEVELS,
  TRUST_SOURCE_DESCRIPTORS,
  TRUST_VETTING_DESCRIPTORS,
  type MaturityLevel,
  type ToolMaturityEntry,
  type TrustSource,
  type TrustVetting,
} from "./maturity-trust.js";
import { CORE_TOOL_MATURITY_ENTRIES } from "./maturity-trust-defaults.js";

const sampleEntries: ToolMaturityEntry[] = [
  {
    toolId: "read",
    displayName: "Read",
    maturityLevel: 4,
    trust: { source: "core", vetting: "verified" },
    capabilities: ["read"],
  },
  {
    toolId: "voice_call",
    displayName: "Voice Call",
    maturityLevel: 1,
    trust: { source: "community", vetting: "unreviewed" },
    capabilities: ["network"],
  },
  {
    toolId: "my_tool",
    displayName: "My Tool",
    maturityLevel: 0,
    trust: { source: "local", vetting: "unreviewed" },
  },
];

describe("maturity and trust labels", () => {
  it("describes all maturity levels", () => {
    for (const level of [0, 1, 2, 3, 4] as MaturityLevel[]) {
      const descriptor = describeMaturityLevel(level);
      expect(descriptor.level).toBe(level);
      expect(descriptor.label).toBeTruthy();
      expect(descriptor.shortLabel).toBe(`L${level}`);
      expect(descriptor.criteria.length).toBeGreaterThan(0);
    }
  });

  it("describes all trust sources", () => {
    for (const source of ["core", "first-party", "community", "local"] as TrustSource[]) {
      const descriptor = describeTrustSource(source);
      expect(descriptor.source).toBe(source);
      expect(descriptor.label).toBeTruthy();
    }
  });

  it("describes all trust vetting states", () => {
    for (const vetting of ["unreviewed", "reviewed", "verified"] as TrustVetting[]) {
      const descriptor = describeTrustVetting(vetting);
      expect(descriptor.vetting).toBe(vetting);
      expect(descriptor.label).toBeTruthy();
    }
  });

  it("formats a maturity badge", () => {
    const badge = formatMaturityBadge(4, { source: "core", vetting: "verified" });
    expect(badge).toBe("L4 Production-hardened · Core · Verified");
  });

  it("builds a report summary with correct counts", () => {
    const summary = buildMaturityReportSummary(sampleEntries);
    expect(summary.total).toBe(3);
    expect(summary.byLevel).toEqual({ L0: 1, L1: 1, L4: 1 });
    expect(summary.bySource).toEqual({ core: 1, community: 1, local: 1 });
    expect(summary.byVetting).toEqual({ verified: 1, unreviewed: 2 });
  });

  it("builds a full report artifact sorted by toolId", () => {
    const report = buildMaturityReportArtifact(sampleEntries, "3.31");
    expect(report.version).toBe("3.31");
    expect(report.entries[0]?.toolId).toBe("my_tool");
    expect(report.entries[1]?.toolId).toBe("read");
    expect(report.entries[2]?.toolId).toBe("voice_call");
    expect(report.summary.total).toBe(3);
  });

  it("formats a markdown report with table", () => {
    const report = buildMaturityReportArtifact(sampleEntries, "3.31");
    const md = formatMaturityReportMarkdown(report);
    expect(md).toContain("# Tool Maturity Report");
    expect(md).toContain("| Read | L4 Production-hardened | Core | Verified | read |");
    expect(md).toContain("| Voice Call | L1 Schema-validated | Community | Unreviewed | network |");
    expect(md).toContain("Total tools: 3");
  });
});

describe("core tool maturity defaults", () => {
  it("has entries for all expected core tools", () => {
    const ids = CORE_TOOL_MATURITY_ENTRIES.map((e) => e.toolId);
    expect(ids).toContain("read");
    expect(ids).toContain("write");
    expect(ids).toContain("exec");
    expect(ids).toContain("message");
    expect(ids).toContain("cron");
    expect(ids).toContain("sessions_spawn");
    expect(ids).toContain("web_search");
    expect(ids).toContain("tts");
  });

  it("all core tools are source=core", () => {
    for (const entry of CORE_TOOL_MATURITY_ENTRIES) {
      expect(entry.trust.source).toBe("core");
    }
  });

  it("all core tools have at least L2 maturity or higher", () => {
    for (const entry of CORE_TOOL_MATURITY_ENTRIES) {
      expect(entry.maturityLevel).toBeGreaterThanOrEqual(2);
    }
  });

  it("all core tools have at least reviewed vetting", () => {
    for (const entry of CORE_TOOL_MATURITY_ENTRIES) {
      expect(["reviewed", "verified"]).toContain(entry.trust.vetting);
    }
  });

  it("has unique tool IDs", () => {
    const ids = CORE_TOOL_MATURITY_ENTRIES.map((e) => e.toolId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("generates a valid report from defaults", () => {
    const report = buildMaturityReportArtifact(CORE_TOOL_MATURITY_ENTRIES, "3.31");
    expect(report.summary.total).toBe(CORE_TOOL_MATURITY_ENTRIES.length);
    expect(report.summary.total).toBeGreaterThan(20);
  });
});
