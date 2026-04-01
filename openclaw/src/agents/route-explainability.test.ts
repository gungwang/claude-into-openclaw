import { describe, expect, it } from "vitest";
import type { PolicyDecisionRecord } from "./policy-reason-codes.js";
import {
  buildToolResolutionTrace,
  evaluateBenchmarkCase,
  explainToolResolution,
  formatToolResolutionTrace,
  type ToolResolutionBenchmarkCase,
} from "./route-explainability.js";

const toolsBefore = [
  { name: "read" },
  { name: "write" },
  { name: "exec" },
  { name: "message" },
  { name: "cron" },
  { name: "voice_call", pluginId: "voice-call" },
];

const toolsAfter = [
  { name: "read" },
  { name: "write" },
  { name: "message" },
];

const policyDecisions: PolicyDecisionRecord[] = [
  {
    code: "tool_policy:agent_deny",
    message: 'Tool "exec" denied by agents.helper.tools.deny',
    policySource: "agents.helper.tools.deny",
    toolName: "exec",
  },
  {
    code: "auth:owner_only",
    message: "Tool restricted to owner senders.",
    toolName: "cron",
  },
  {
    code: "tool_policy:sandbox_deny",
    message: 'Tool "voice_call" denied by sandbox tools.allow',
    policySource: "sandbox tools.allow",
    toolName: "voice_call",
  },
];

describe("route explainability", () => {
  it("builds a resolution trace from before/after tool lists", () => {
    const trace = buildToolResolutionTrace({
      query: "exec",
      toolsBefore,
      toolsAfter,
      policyDecisions,
      sessionKey: "agent:main:main",
      agentId: "helper",
    });

    expect(trace.totalBeforePolicy).toBe(6);
    expect(trace.totalAfterPolicy).toBe(3);
    expect(trace.candidates).toHaveLength(6);
    expect(trace.query).toBe("exec");
  });

  it("marks available tools with policy_allowed signal", () => {
    const trace = buildToolResolutionTrace({
      query: "read",
      toolsBefore,
      toolsAfter,
      policyDecisions,
    });

    const read = explainToolResolution(trace, "read");
    expect(read).not.toBeNull();
    expect(read!.available).toBe(true);
    expect(read!.signals.some((s) => s.kind === "policy_allowed")).toBe(true);
  });

  it("marks filtered tools with policy_filtered signal and reason source", () => {
    const trace = buildToolResolutionTrace({
      query: "exec",
      toolsBefore,
      toolsAfter,
      policyDecisions,
    });

    const exec = explainToolResolution(trace, "exec");
    expect(exec).not.toBeNull();
    expect(exec!.available).toBe(false);
    expect(exec!.signals.some((s) => s.kind === "policy_filtered")).toBe(true);
    expect(exec!.signals.find((s) => s.kind === "policy_filtered")?.source).toBe(
      "agents.helper.tools.deny",
    );
  });

  it("adds exact_match signal when query matches tool name", () => {
    const trace = buildToolResolutionTrace({
      query: "exec",
      toolsBefore,
      toolsAfter,
      policyDecisions,
    });

    const exec = explainToolResolution(trace, "exec");
    expect(exec!.signals[0]?.kind).toBe("exact_match");
  });

  it("derives canonical IDs for core and plugin tools", () => {
    const trace = buildToolResolutionTrace({
      query: "",
      toolsBefore,
      toolsAfter,
      policyDecisions,
    });

    const read = explainToolResolution(trace, "read");
    expect(read!.canonicalId).toBe("core:read");
    expect(read!.namespace).toBe("core");

    const voiceCall = explainToolResolution(trace, "voice_call");
    expect(voiceCall!.canonicalId).toBe("plugin:voice-call:voice_call");
    expect(voiceCall!.namespace).toBe("plugin");
  });

  it("returns null for unknown tool names", () => {
    const trace = buildToolResolutionTrace({
      query: "unknown",
      toolsBefore,
      toolsAfter,
      policyDecisions,
    });

    expect(explainToolResolution(trace, "unknown")).toBeNull();
  });

  it("formats a human-readable trace", () => {
    const trace = buildToolResolutionTrace({
      query: "exec",
      toolsBefore,
      toolsAfter,
      policyDecisions,
      agentId: "helper",
    });

    const formatted = formatToolResolutionTrace(trace);
    expect(formatted).toContain('Tool Resolution Trace: "exec"');
    expect(formatted).toContain("Agent: helper");
    expect(formatted).toContain("6 before → 3 after policy");
    expect(formatted).toContain("✗ exec");
    expect(formatted).toContain("✓ read");
  });

  describe("benchmark evaluation", () => {
    it("passes when availability matches expected", () => {
      const trace = buildToolResolutionTrace({
        query: "read",
        toolsBefore,
        toolsAfter,
        policyDecisions,
      });

      const benchmarkCase: ToolResolutionBenchmarkCase = {
        id: "read-available",
        description: "read should be available",
        query: "read",
        context: {},
        expected: { available: true },
      };

      const result = evaluateBenchmarkCase(benchmarkCase, trace);
      expect(result.passed).toBe(true);
      expect(result.actual.available).toBe(true);
    });

    it("passes when deny reason code matches expected", () => {
      const trace = buildToolResolutionTrace({
        query: "exec",
        toolsBefore,
        toolsAfter,
        policyDecisions,
      });

      const benchmarkCase: ToolResolutionBenchmarkCase = {
        id: "exec-denied",
        description: "exec should be denied by agent policy",
        query: "exec",
        context: { agentId: "helper" },
        expected: { available: false, reasonCodeIfDenied: "agents.helper" },
      };

      const result = evaluateBenchmarkCase(benchmarkCase, trace);
      expect(result.passed).toBe(true);
      expect(result.actual.available).toBe(false);
    });

    it("fails when availability does not match", () => {
      const trace = buildToolResolutionTrace({
        query: "exec",
        toolsBefore,
        toolsAfter,
        policyDecisions,
      });

      const benchmarkCase: ToolResolutionBenchmarkCase = {
        id: "exec-should-be-available",
        description: "wrong expectation",
        query: "exec",
        context: {},
        expected: { available: true },
      };

      const result = evaluateBenchmarkCase(benchmarkCase, trace);
      expect(result.passed).toBe(false);
    });
  });
});
