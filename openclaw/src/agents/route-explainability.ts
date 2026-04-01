/**
 * Route Explainability — diagnostic surface for tool resolution.
 *
 * In OpenClaw, "routing" is tool resolution: given a tool name + session context,
 * which tools survived policy filtering, and why were others removed?
 *
 * This module provides:
 * - A structured explain format for tool resolution decisions
 * - A resolution trace that captures each pipeline step's effect
 * - A benchmark-friendly result shape for regression testing
 */

import type { PolicyDecisionRecord } from "./policy-reason-codes.js";
import {
  deriveFallbackCanonicalToolId,
  inferCapabilityClassFromToolName,
  normalizeCanonicalToolId,
  type CanonicalToolIdentity,
  type ToolNamespace,
} from "./tool-identity.js";

export type RouteSignalKind =
  | "exact_match"
  | "alias_match"
  | "policy_filtered"
  | "policy_allowed"
  | "owner_only_filtered"
  | "provider_filtered"
  | "message_provider_filtered";

export type RouteSignal = {
  kind: RouteSignalKind;
  source: string;
  detail?: string;
};

export type ToolResolutionCandidate = {
  toolName: string;
  canonicalId: string;
  namespace: ToolNamespace;
  available: boolean;
  signals: RouteSignal[];
};

export type ToolResolutionTrace = {
  /** The tool name that was queried. */
  query: string;
  /** Timestamp of the resolution. */
  timestamp: string;
  /** Session context key. */
  sessionKey?: string;
  /** Agent ID used for resolution. */
  agentId?: string;
  /** Total tools before policy filtering. */
  totalBeforePolicy: number;
  /** Total tools after policy filtering. */
  totalAfterPolicy: number;
  /** Per-tool resolution candidates. */
  candidates: ToolResolutionCandidate[];
  /** Policy decisions that removed tools. */
  policyDecisions: PolicyDecisionRecord[];
};

/**
 * Build a resolution trace from before/after tool lists + policy decisions.
 */
export function buildToolResolutionTrace(params: {
  query: string;
  toolsBefore: Array<{ name: string; label?: string; pluginId?: string }>;
  toolsAfter: Array<{ name: string; label?: string }>;
  policyDecisions: PolicyDecisionRecord[];
  sessionKey?: string;
  agentId?: string;
}): ToolResolutionTrace {
  const afterNames = new Set(params.toolsAfter.map((t) => t.name));
  const deniedByPolicy = new Map<string, PolicyDecisionRecord[]>();
  for (const decision of params.policyDecisions) {
    if (decision.toolName) {
      const list = deniedByPolicy.get(decision.toolName) ?? [];
      list.push(decision);
      deniedByPolicy.set(decision.toolName, list);
    }
  }

  const candidates: ToolResolutionCandidate[] = params.toolsBefore.map((tool) => {
    const namespace: ToolNamespace = tool.pluginId ? "plugin" : "core";
    const canonicalId = normalizeCanonicalToolId(
      deriveFallbackCanonicalToolId({
        namespace,
        toolName: tool.name,
        pluginId: tool.pluginId,
      }),
    );
    const available = afterNames.has(tool.name);
    const signals: RouteSignal[] = [];

    if (available) {
      signals.push({
        kind: "policy_allowed",
        source: "tool-policy-pipeline",
        detail: "Tool passed all policy filters",
      });
    } else {
      const decisions = deniedByPolicy.get(tool.name);
      if (decisions && decisions.length > 0) {
        for (const decision of decisions) {
          signals.push({
            kind: "policy_filtered",
            source: decision.policySource ?? "unknown",
            detail: decision.message,
          });
        }
      } else {
        signals.push({
          kind: "policy_filtered",
          source: "unknown",
          detail: "Removed during filtering (no structured reason recorded)",
        });
      }
    }

    if (params.query && tool.name === params.query) {
      signals.unshift({
        kind: "exact_match",
        source: "query",
        detail: `Exact name match for "${params.query}"`,
      });
    }

    return {
      toolName: tool.name,
      canonicalId,
      namespace,
      available,
      signals,
    };
  });

  return {
    query: params.query,
    timestamp: new Date().toISOString(),
    sessionKey: params.sessionKey,
    agentId: params.agentId,
    totalBeforePolicy: params.toolsBefore.length,
    totalAfterPolicy: params.toolsAfter.length,
    candidates,
    policyDecisions: params.policyDecisions,
  };
}

/**
 * Extract a single-tool explain result from a full trace.
 */
export function explainToolResolution(
  trace: ToolResolutionTrace,
  toolName: string,
): ToolResolutionCandidate | null {
  return trace.candidates.find((c) => c.toolName === toolName) ?? null;
}

/**
 * Format an explain trace into a human-readable diagnostic string.
 */
export function formatToolResolutionTrace(trace: ToolResolutionTrace): string {
  const lines: string[] = [];
  lines.push(`Tool Resolution Trace: "${trace.query}"`);
  lines.push(`  Time: ${trace.timestamp}`);
  if (trace.sessionKey) {
    lines.push(`  Session: ${trace.sessionKey}`);
  }
  if (trace.agentId) {
    lines.push(`  Agent: ${trace.agentId}`);
  }
  lines.push(`  Tools: ${trace.totalBeforePolicy} before → ${trace.totalAfterPolicy} after policy`);
  lines.push("");

  const available = trace.candidates.filter((c) => c.available);
  const filtered = trace.candidates.filter((c) => !c.available);

  if (filtered.length > 0) {
    lines.push(`  Filtered (${filtered.length}):`);
    for (const candidate of filtered) {
      const reasons = candidate.signals
        .filter((s) => s.kind === "policy_filtered")
        .map((s) => `${s.source}: ${s.detail ?? "no detail"}`)
        .join("; ");
      lines.push(`    ✗ ${candidate.toolName} (${candidate.canonicalId}) — ${reasons}`);
    }
    lines.push("");
  }

  if (available.length > 0) {
    lines.push(`  Available (${available.length}):`);
    for (const candidate of available) {
      lines.push(`    ✓ ${candidate.toolName} (${candidate.canonicalId})`);
    }
  }

  return lines.join("\n");
}

// ── Benchmark helpers ──

export type ToolResolutionBenchmarkCase = {
  id: string;
  description: string;
  query: string;
  context: {
    agentId?: string;
    sessionKey?: string;
    modelProvider?: string;
    messageProvider?: string;
    senderIsOwner?: boolean;
  };
  expected: {
    available: boolean;
    reasonCodeIfDenied?: string;
  };
};

export type ToolResolutionBenchmarkResult = {
  caseId: string;
  passed: boolean;
  expected: { available: boolean; reasonCodeIfDenied?: string };
  actual: { available: boolean; reasonCodes: string[] };
};

/**
 * Evaluate a single benchmark case against a resolution trace.
 */
export function evaluateBenchmarkCase(
  benchmarkCase: ToolResolutionBenchmarkCase,
  trace: ToolResolutionTrace,
): ToolResolutionBenchmarkResult {
  const candidate = explainToolResolution(trace, benchmarkCase.query);
  const actualAvailable = candidate?.available ?? false;
  const actualReasonCodes = candidate
    ? candidate.signals
        .filter((s) => s.kind === "policy_filtered")
        .map((s) => s.source)
    : [];

  const availabilityMatch = actualAvailable === benchmarkCase.expected.available;
  const reasonMatch =
    !benchmarkCase.expected.reasonCodeIfDenied ||
    actualReasonCodes.some((r) => r.includes(benchmarkCase.expected.reasonCodeIfDenied!));

  return {
    caseId: benchmarkCase.id,
    passed: availabilityMatch && reasonMatch,
    expected: benchmarkCase.expected,
    actual: {
      available: actualAvailable,
      reasonCodes: actualReasonCodes,
    },
  };
}
