import { requiresExecApproval, type ExecAsk, type ExecSecurity } from "../infra/exec-approvals.js";
import {
  createPolicyDecision,
  type PolicyDecisionRecord,
} from "../agents/policy-reason-codes.js";

export type ExecApprovalDecision = "allow-once" | "allow-always" | null;

export type SystemRunPolicyDecision = {
  analysisOk: boolean;
  allowlistSatisfied: boolean;
  shellWrapperBlocked: boolean;
  windowsShellWrapperBlocked: boolean;
  requiresAsk: boolean;
  approvalDecision: ExecApprovalDecision;
  approvedByAsk: boolean;
  /** Structured reason when the decision is a deny. */
  policyDecisionRecord?: PolicyDecisionRecord;
} & (
  | {
      allowed: true;
    }
  | {
      allowed: false;
      eventReason: "security=deny" | "approval-required" | "allowlist-miss";
      errorMessage: string;
    }
);

export function resolveExecApprovalDecision(value: unknown): ExecApprovalDecision {
  if (value === "allow-once" || value === "allow-always") {
    return value;
  }
  return null;
}

export function formatSystemRunAllowlistMissMessage(params?: {
  shellWrapperBlocked?: boolean;
  windowsShellWrapperBlocked?: boolean;
}): string {
  if (params?.windowsShellWrapperBlocked) {
    return (
      "SYSTEM_RUN_DENIED: allowlist miss " +
      "(Windows shell wrappers like cmd.exe /c require approval; " +
      "approve once/always or run with --ask on-miss|always)"
    );
  }
  if (params?.shellWrapperBlocked) {
    return (
      "SYSTEM_RUN_DENIED: allowlist miss " +
      "(shell wrappers like sh/bash/zsh -c require approval; " +
      "approve once/always or run with --ask on-miss|always)"
    );
  }
  return "SYSTEM_RUN_DENIED: allowlist miss";
}

export function evaluateSystemRunPolicy(params: {
  security: ExecSecurity;
  ask: ExecAsk;
  analysisOk: boolean;
  allowlistSatisfied: boolean;
  durableApprovalSatisfied?: boolean;
  approvalDecision: ExecApprovalDecision;
  approved?: boolean;
  isWindows: boolean;
  cmdInvocation: boolean;
  shellWrapperInvocation: boolean;
}): SystemRunPolicyDecision {
  const shellWrapperBlocked = params.security === "allowlist" && params.shellWrapperInvocation;
  const windowsShellWrapperBlocked =
    shellWrapperBlocked && params.isWindows && params.cmdInvocation;
  const analysisOk = shellWrapperBlocked ? false : params.analysisOk;
  const allowlistSatisfied = shellWrapperBlocked ? false : params.allowlistSatisfied;
  const approvedByAsk = params.approvalDecision !== null || params.approved === true;

  if (params.security === "deny") {
    return {
      allowed: false,
      eventReason: "security=deny",
      errorMessage: "SYSTEM_RUN_DISABLED: security=deny",
      analysisOk,
      allowlistSatisfied,
      shellWrapperBlocked,
      windowsShellWrapperBlocked,
      requiresAsk: false,
      approvalDecision: params.approvalDecision,
      approvedByAsk,
      policyDecisionRecord: createPolicyDecision("exec:security_deny", "Execution disabled: security=deny", {
        policySource: "tools.exec.security",
      }),
    };
  }

  const requiresAsk = requiresExecApproval({
    ask: params.ask,
    security: params.security,
    analysisOk,
    allowlistSatisfied,
    durableApprovalSatisfied: params.durableApprovalSatisfied,
  });
  if (requiresAsk && !approvedByAsk) {
    return {
      allowed: false,
      eventReason: "approval-required",
      errorMessage: "SYSTEM_RUN_DENIED: approval required",
      analysisOk,
      allowlistSatisfied,
      shellWrapperBlocked,
      windowsShellWrapperBlocked,
      requiresAsk,
      approvalDecision: params.approvalDecision,
      approvedByAsk,
      policyDecisionRecord: createPolicyDecision("exec:approval_required", "Execution requires user approval", {
        policySource: "tools.exec.ask",
      }),
    };
  }

  if (params.security === "allowlist" && (!analysisOk || !allowlistSatisfied) && !approvedByAsk) {
    if (params.durableApprovalSatisfied) {
      return {
        allowed: true,
        analysisOk,
        allowlistSatisfied,
        shellWrapperBlocked,
        windowsShellWrapperBlocked,
        requiresAsk,
        approvalDecision: params.approvalDecision,
        approvedByAsk,
      };
    }
    return {
      allowed: false,
      eventReason: "allowlist-miss",
      errorMessage: formatSystemRunAllowlistMissMessage({
        shellWrapperBlocked,
        windowsShellWrapperBlocked,
      }),
      analysisOk,
      allowlistSatisfied,
      shellWrapperBlocked,
      windowsShellWrapperBlocked,
      requiresAsk,
      approvalDecision: params.approvalDecision,
      approvedByAsk,
      policyDecisionRecord: createPolicyDecision(
        shellWrapperBlocked ? "exec:shell_wrapper_blocked" : "exec:allowlist_miss",
        shellWrapperBlocked
          ? "Shell wrapper invocation blocked by allowlist policy"
          : "Command not in exec allowlist",
        {
          policySource: "tools.exec.security",
          details: shellWrapperBlocked
            ? { windowsShellWrapper: windowsShellWrapperBlocked }
            : undefined,
        },
      ),
    };
  }

  return {
    allowed: true,
    analysisOk,
    allowlistSatisfied,
    shellWrapperBlocked,
    windowsShellWrapperBlocked,
    requiresAsk,
    approvalDecision: params.approvalDecision,
    approvedByAsk,
  };
}
