/**
 * Structured reason codes for tool/command policy decisions.
 *
 * Every deny/block decision in OpenClaw's policy enforcement layer attaches
 * a machine-readable reason code so diagnostics, debugging, and compliance
 * reviews can trace *why* a call was denied.
 *
 * This module is the single source of truth for reason codes.
 */

export type PolicyReasonCategory =
  | "exec"
  | "tool_policy"
  | "hook"
  | "approval"
  | "auth"
  | "loop";

export type PolicyReasonCode =
  // exec-policy reasons
  | "exec:security_deny"
  | "exec:approval_required"
  | "exec:allowlist_miss"
  | "exec:shell_wrapper_blocked"
  // tool-policy-pipeline reasons
  | "tool_policy:profile_deny"
  | "tool_policy:global_deny"
  | "tool_policy:global_provider_deny"
  | "tool_policy:agent_deny"
  | "tool_policy:agent_provider_deny"
  | "tool_policy:group_deny"
  | "tool_policy:sandbox_deny"
  | "tool_policy:subagent_deny"
  | "tool_policy:namespace_deny"
  // hook / approval reasons
  | "hook:plugin_blocked"
  | "approval:denied_by_user"
  | "approval:timeout"
  | "approval:cancelled"
  | "approval:gateway_unavailable"
  // auth reasons
  | "auth:owner_only"
  | "auth:sender_unauthorized"
  // loop detection
  | "loop:critical"
  | "loop:warning";

export type PolicyDecisionRecord = {
  /** Machine-readable reason code. */
  code: PolicyReasonCode;
  /** Human-readable explanation. */
  message: string;
  /** Which policy source produced this decision. */
  policySource?: string;
  /** Tool or command name that was denied. */
  toolName?: string;
  /** Additional structured context (e.g. shell wrapper type, plugin id). */
  details?: Record<string, unknown>;
};

export function createPolicyDecision(
  code: PolicyReasonCode,
  message: string,
  options?: {
    policySource?: string;
    toolName?: string;
    details?: Record<string, unknown>;
  },
): PolicyDecisionRecord {
  return {
    code,
    message,
    ...(options?.policySource && { policySource: options.policySource }),
    ...(options?.toolName && { toolName: options.toolName }),
    ...(options?.details && Object.keys(options.details).length > 0 && { details: options.details }),
  };
}

/**
 * Resolve a reason category from a reason code.
 */
export function reasonCategory(code: PolicyReasonCode): PolicyReasonCategory {
  const prefix = code.split(":")[0] as string;
  const valid: PolicyReasonCategory[] = ["exec", "tool_policy", "hook", "approval", "auth", "loop"];
  return valid.includes(prefix as PolicyReasonCategory)
    ? (prefix as PolicyReasonCategory)
    : "tool_policy";
}

/**
 * Format a PolicyDecisionRecord into a single diagnostic line.
 */
export function formatPolicyDecision(record: PolicyDecisionRecord): string {
  const source = record.policySource ? ` [source: ${record.policySource}]` : "";
  const tool = record.toolName ? ` tool=${record.toolName}` : "";
  return `${record.code}: ${record.message}${tool}${source}`;
}
