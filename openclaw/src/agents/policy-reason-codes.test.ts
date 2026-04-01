import { describe, expect, it } from "vitest";
import {
  createPolicyDecision,
  formatPolicyDecision,
  reasonCategory,
  type PolicyReasonCode,
} from "./policy-reason-codes.js";

describe("policy reason codes", () => {
  it("creates a minimal policy decision record", () => {
    const decision = createPolicyDecision("exec:security_deny", "Execution disabled");
    expect(decision).toEqual({
      code: "exec:security_deny",
      message: "Execution disabled",
    });
  });

  it("creates a policy decision with all optional fields", () => {
    const decision = createPolicyDecision("tool_policy:agent_deny", "Tool denied by agent config", {
      policySource: "agents.helper.tools.deny",
      toolName: "exec",
      details: { agentId: "helper" },
    });
    expect(decision).toEqual({
      code: "tool_policy:agent_deny",
      message: "Tool denied by agent config",
      policySource: "agents.helper.tools.deny",
      toolName: "exec",
      details: { agentId: "helper" },
    });
  });

  it("omits empty details object", () => {
    const decision = createPolicyDecision("auth:owner_only", "Owner only", {
      details: {},
    });
    expect(decision).not.toHaveProperty("details");
  });

  it("resolves reason categories", () => {
    const cases: Array<[PolicyReasonCode, string]> = [
      ["exec:security_deny", "exec"],
      ["tool_policy:global_deny", "tool_policy"],
      ["hook:plugin_blocked", "hook"],
      ["approval:denied_by_user", "approval"],
      ["auth:owner_only", "auth"],
      ["loop:critical", "loop"],
    ];
    for (const [code, expected] of cases) {
      expect(reasonCategory(code)).toBe(expected);
    }
  });

  it("formats a decision into a diagnostic line", () => {
    const decision = createPolicyDecision("exec:allowlist_miss", "allowlist miss", {
      policySource: "tools.exec.security",
      toolName: "exec",
    });
    expect(formatPolicyDecision(decision)).toBe(
      "exec:allowlist_miss: allowlist miss tool=exec [source: tools.exec.security]",
    );
  });

  it("formats a decision without optional fields", () => {
    const decision = createPolicyDecision("auth:owner_only", "restricted");
    expect(formatPolicyDecision(decision)).toBe("auth:owner_only: restricted");
  });
});
