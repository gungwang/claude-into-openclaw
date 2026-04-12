/**
 * Journal integration helpers for the agent run loop.
 *
 * These wrap the session-event-journal convenience creators with the
 * specific context shapes used by pi-embedded-runner and hooks.
 * They're designed to be called from existing lifecycle points
 * without changing the run loop's control flow.
 */

import type { PolicyDecisionRecord } from "./policy-reason-codes.js";
import type { ClassifiedError } from "./error-classifier.js";
import type { ScanResult } from "./skills-guard.js";
import type { HookInvocationResult } from "./plugin-hooks.js";
import type { BudgetState } from "./budget-tracker.js";
import type { CacheApplicationResult } from "./prompt-caching.js";
import {
  appendJournalEvent,
  createSessionEventJournal,
  journalCompactionEnd,
  journalCompactionStart,
  journalError,
  journalMemoryFlush,
  journalMessageIn,
  journalMessageOut,
  journalPolicyDecision,
  journalToolCallEnd,
  journalToolCallStart,
  type SessionEventJournal,
} from "./session-event-journal.js";

// ── Per-run journal factory ──

export type RunJournalContext = {
  sessionKey: string;
  agentId?: string;
  runId?: string;
};

/**
 * Create a journal for a single agent run.
 * Call this at the start of runEmbeddedPiAgent or equivalent entry.
 */
export function createRunJournal(ctx: RunJournalContext): SessionEventJournal {
  return createSessionEventJournal(ctx);
}

// ── Inbound message ──

export function recordInboundMessage(
  journal: SessionEventJournal | undefined,
  params: { prompt: string; correlationId?: string },
): void {
  if (!journal) return;
  const preview = params.prompt.length > 100
    ? params.prompt.slice(0, 100) + "…"
    : params.prompt;
  journalMessageIn(journal, {
    summary: `User: ${preview}`,
    correlationId: params.correlationId,
  });
}

// ── Outbound message ──

export function recordOutboundMessage(
  journal: SessionEventJournal | undefined,
  params: { text: string; correlationId?: string },
): void {
  if (!journal) return;
  const preview = params.text.length > 100
    ? params.text.slice(0, 100) + "…"
    : params.text;
  journalMessageOut(journal, {
    summary: `Assistant: ${preview}`,
    correlationId: params.correlationId,
  });
}

// ── Tool call lifecycle ──

export function recordToolCallStart(
  journal: SessionEventJournal | undefined,
  params: { toolName: string; toolCallId: string },
): void {
  if (!journal) return;
  journalToolCallStart(journal, params);
}

export function recordToolCallEnd(
  journal: SessionEventJournal | undefined,
  params: {
    toolName: string;
    toolCallId: string;
    startedAt: number;
    success: boolean;
    error?: string;
  },
): void {
  if (!journal) return;
  journalToolCallEnd(journal, {
    toolName: params.toolName,
    toolCallId: params.toolCallId,
    durationMs: Date.now() - params.startedAt,
    success: params.success,
    payload: params.error ? { error: params.error } : undefined,
  });
}

// ── Policy decisions ──

export function recordPolicyDecision(
  journal: SessionEventJournal | undefined,
  record: PolicyDecisionRecord,
): void {
  if (!journal) return;
  journalPolicyDecision(journal, {
    code: record.code,
    message: record.message,
    toolName: record.toolName,
    correlationId: record.toolName,
  });
}

export function recordPolicyDecisions(
  journal: SessionEventJournal | undefined,
  records: PolicyDecisionRecord[],
): void {
  if (!journal) return;
  for (const record of records) {
    recordPolicyDecision(journal, record);
  }
}

// ── Compaction lifecycle ──

export function recordCompactionStart(
  journal: SessionEventJournal | undefined,
  params: { reason: string; correlationId?: string },
): void {
  if (!journal) return;
  journalCompactionStart(journal, params);
}

export function recordCompactionEnd(
  journal: SessionEventJournal | undefined,
  params: {
    reason: string;
    startedAt: number;
    success: boolean;
    correlationId?: string;
  },
): void {
  if (!journal) return;
  journalCompactionEnd(journal, {
    reason: params.reason,
    durationMs: Date.now() - params.startedAt,
    success: params.success,
    correlationId: params.correlationId,
  });
}

// ── Memory flush ──

export function recordMemoryFlush(
  journal: SessionEventJournal | undefined,
  params: { path?: string },
): void {
  if (!journal) return;
  journalMemoryFlush(journal, {
    summary: params.path
      ? `Memory flushed to ${params.path}`
      : "Session memory flushed",
  });
}

// ── Errors ──

export function recordRunError(
  journal: SessionEventJournal | undefined,
  params: { message: string; provider?: string; model?: string; correlationId?: string },
): void {
  if (!journal) return;
  journalError(journal, {
    summary: params.message,
    correlationId: params.correlationId,
    payload: {
      ...(params.provider && { provider: params.provider }),
      ...(params.model && { model: params.model }),
    },
  });
}

// ── Error classification events (Track A) ──

export function recordClassifiedError(
  journal: SessionEventJournal | undefined,
  classified: ClassifiedError,
): void {
  if (!journal) return;
  journalError(journal, {
    summary: `[${classified.reason}] ${classified.provider}/${classified.model}: ${classified.message.slice(0, 100)}`,
    payload: {
      reason: classified.reason,
      statusCode: classified.statusCode,
      provider: classified.provider,
      model: classified.model,
      retryable: classified.retryable,
      shouldCompress: classified.shouldCompress,
      shouldRotateCredential: classified.shouldRotateCredential,
      shouldFallback: classified.shouldFallback,
      cooldownMs: classified.cooldownMs,
    },
  });
}

// ── Credential rotation events (Track A) ──

export function recordCredentialRotation(
  journal: SessionEventJournal | undefined,
  params: {
    provider: string;
    fromCredentialId: string;
    toCredentialId?: string;
    reason: string;
  },
): void {
  if (!journal) return;
  appendJournalEvent(journal, {
    type: "custom",
    severity: "warn",
    summary: `Credential rotation: ${params.provider} — ${params.reason}`,
    payload: {
      eventKind: "credential_rotation",
      provider: params.provider,
      fromCredentialId: params.fromCredentialId,
      toCredentialId: params.toCredentialId,
      reason: params.reason,
    },
  });
}

// ── Rate limit events (Track A) ──

export function recordRateLimitWarning(
  journal: SessionEventJournal | undefined,
  params: {
    provider: string;
    bucketType: string;
    usagePct: number;
  },
): void {
  if (!journal) return;
  appendJournalEvent(journal, {
    type: "custom",
    severity: "warn",
    summary: `Rate limit warning: ${params.provider} ${params.bucketType} at ${params.usagePct.toFixed(0)}%`,
    payload: {
      eventKind: "rate_limit_warning",
      provider: params.provider,
      bucketType: params.bucketType,
      usagePct: params.usagePct,
    },
  });
}

// ── Trajectory compression events (Track A) ──

export function recordTrajectoryCompression(
  journal: SessionEventJournal | undefined,
  params: {
    originalTokens: number;
    compressedTokens: number;
    reductionPct: number;
    turnsRemoved: number;
  },
): void {
  if (!journal) return;
  appendJournalEvent(journal, {
    type: "compaction_end",
    severity: "info",
    summary: `Trajectory compressed: ${params.originalTokens}→${params.compressedTokens} tokens (${params.reductionPct.toFixed(1)}% reduction, ${params.turnsRemoved} turns removed)`,
    payload: {
      eventKind: "trajectory_compression",
      ...params,
    },
  });
}

// ── Skills security scan events (Track B) ──

export function recordSkillsScan(
  journal: SessionEventJournal | undefined,
  result: ScanResult,
): void {
  if (!journal) return;
  appendJournalEvent(journal, {
    type: "policy_decision",
    severity: result.verdict === "safe" ? "info" : result.verdict === "caution" ? "warn" : "error",
    summary: `Skills scan [${result.verdict}]: ${result.skillName} — ${result.summary}`,
    payload: {
      eventKind: "skills_scan",
      skillName: result.skillName,
      trustLevel: result.trustLevel,
      verdict: result.verdict,
      findingCount: result.findings.length,
      source: result.source,
    },
  });
}

// ── Session persistence events (Track A) ──

export function recordSessionPersisted(
  journal: SessionEventJournal | undefined,
  params: { sessionId: string; messageCount: number },
): void {
  if (!journal) return;
  appendJournalEvent(journal, {
    type: "custom",
    severity: "debug",
    summary: `Session persisted: ${params.sessionId} (${params.messageCount} messages)`,
    payload: {
      eventKind: "session_persisted",
      sessionId: params.sessionId,
      messageCount: params.messageCount,
    },
  });
}

// ── Smart model routing events (Track A) ──

export function recordModelRouting(
  journal: SessionEventJournal | undefined,
  params: {
    selectedModel: string;
    tier: string;
    complexityScore: string;
    reason: string;
    estimatedCost: number;
  },
): void {
  if (!journal) return;
  appendJournalEvent(journal, {
    type: "route_selected",
    severity: "info",
    summary: `Smart routing: ${params.selectedModel} (${params.tier}, complexity=${params.complexityScore})`,
    payload: {
      eventKind: "smart_model_routing",
      ...params,
    },
  });
}

// ── Worktree events (Track C) ──

export function recordWorktreeCreated(
  journal: SessionEventJournal | undefined,
  params: { path: string; branch: string; sessionId: string },
): void {
  if (!journal) return;
  appendJournalEvent(journal, {
    type: "custom",
    severity: "info",
    summary: `Worktree created: ${params.branch} at ${params.path}`,
    payload: {
      eventKind: "worktree_created",
      ...params,
    },
  });
}

export function recordWorktreeCleanup(
  journal: SessionEventJournal | undefined,
  params: { path: string; removed: boolean; reason: string },
): void {
  if (!journal) return;
  appendJournalEvent(journal, {
    type: "custom",
    severity: params.removed ? "debug" : "warn",
    summary: `Worktree cleanup: ${params.reason}`,
    payload: {
      eventKind: "worktree_cleanup",
      ...params,
    },
  });
}

// ── Prompt caching events (Track C) ──

export function recordPromptCaching(
  journal: SessionEventJournal | undefined,
  result: CacheApplicationResult,
): void {
  if (!journal) return;
  appendJournalEvent(journal, {
    type: "custom",
    severity: "debug",
    summary: `Prompt caching [${result.provider}]: ${result.breakpointsApplied} breakpoints applied`,
    payload: {
      eventKind: "prompt_caching",
      provider: result.provider,
      breakpointsApplied: result.breakpointsApplied,
    },
  });
}

// ── Budget events (Track C) ──

export function recordBudgetExceeded(
  journal: SessionEventJournal | undefined,
  state: BudgetState,
): void {
  if (!journal) return;
  appendJournalEvent(journal, {
    type: "custom",
    severity: "warn",
    summary: `Budget exceeded: ${state.exceedReason ?? "unknown"}`,
    payload: {
      eventKind: "budget_exceeded",
      sessionCostUsd: state.sessionCostUsd,
      turnCostUsd: state.turnCostUsd,
      turnCount: state.turnCount,
      exceedReason: state.exceedReason,
    },
  });
}

// ── Checkpoint events (Track C) ──

export function recordCheckpointCreated(
  journal: SessionEventJournal | undefined,
  params: { workingDir: string; reason: string },
): void {
  if (!journal) return;
  appendJournalEvent(journal, {
    type: "custom",
    severity: "debug",
    summary: `Checkpoint created: ${params.reason} in ${params.workingDir}`,
    payload: {
      eventKind: "checkpoint_created",
      ...params,
    },
  });
}

export function recordCheckpointRollback(
  journal: SessionEventJournal | undefined,
  params: { workingDir: string; commitHash: string; success: boolean },
): void {
  if (!journal) return;
  appendJournalEvent(journal, {
    type: "custom",
    severity: params.success ? "info" : "warn",
    summary: `Checkpoint rollback ${params.success ? "succeeded" : "failed"}: ${params.commitHash}`,
    payload: {
      eventKind: "checkpoint_rollback",
      ...params,
    },
  });
}

// ── Plugin hook bus events (Track D) ──

export function recordHookInvocation(
  journal: SessionEventJournal | undefined,
  result: HookInvocationResult,
): void {
  if (!journal || result.totalCallbacks === 0) return;
  appendJournalEvent(journal, {
    type: "custom",
    severity: result.failed > 0 ? "warn" : "debug",
    summary: `Hook ${result.hookName}: ${result.succeeded}/${result.totalCallbacks} ok, ${result.failed} failed (${result.durationMs.toFixed(1)}ms)`,
    payload: {
      eventKind: "plugin_hook_invocation",
      hookName: result.hookName,
      totalCallbacks: result.totalCallbacks,
      succeeded: result.succeeded,
      failed: result.failed,
      durationMs: result.durationMs,
      ...(result.errors.length > 0 ? { errors: result.errors } : {}),
    },
  });
}

// ── Message injection events (Track D) ──

export function recordMessageInjected(
  journal: SessionEventJournal | undefined,
  params: { pluginId: string; role: string; contentLength: number; interrupt: boolean },
): void {
  if (!journal) return;
  appendJournalEvent(journal, {
    type: "custom",
    severity: "info",
    summary: `Message injected by plugin "${params.pluginId}" (${params.role}, ${params.contentLength} chars${params.interrupt ? ", interrupt" : ""})`,
    payload: {
      eventKind: "message_injected",
      ...params,
    },
  });
}

// ── Browser automation events (Track E) ──

export function recordBrowserSessionCreated(
  journal: SessionEventJournal | undefined,
  params: { sessionId: string; provider: string; url?: string },
): void {
  if (!journal) return;
  appendJournalEvent(journal, {
    type: "custom",
    severity: "info",
    summary: `Browser session ${params.sessionId} created (${params.provider})${params.url ? `: ${params.url}` : ""}`,
    payload: { eventKind: "browser_session_created", ...params },
  });
}

export function recordBrowserSessionClosed(
  journal: SessionEventJournal | undefined,
  params: { sessionId: string; reason: string },
): void {
  if (!journal) return;
  appendJournalEvent(journal, {
    type: "custom",
    severity: "debug",
    summary: `Browser session ${params.sessionId} closed: ${params.reason}`,
    payload: { eventKind: "browser_session_closed", ...params },
  });
}

// ── Mixture of Agents events (Track E) ──

export function recordMoaQuery(
  journal: SessionEventJournal | undefined,
  params: { referenceCount: number; respondedCount: number; aggregatorModel: string; durationMs: number },
): void {
  if (!journal) return;
  appendJournalEvent(journal, {
    type: "custom",
    severity: "info",
    summary: `MoA query: ${params.respondedCount}/${params.referenceCount} refs responded, aggregated by ${params.aggregatorModel} (${params.durationMs.toFixed(0)}ms)`,
    payload: { eventKind: "moa_query", ...params },
  });
}

// ── Process monitor events (Track E) ──

export function recordProcessSpawned(
  journal: SessionEventJournal | undefined,
  params: { pid: string; command: string },
): void {
  if (!journal) return;
  appendJournalEvent(journal, {
    type: "custom",
    severity: "info",
    summary: `Process spawned: ${params.command} (pid=${params.pid})`,
    payload: { eventKind: "process_spawned", ...params },
  });
}

export function recordProcessKilled(
  journal: SessionEventJournal | undefined,
  params: { pid: string; signal: string; exitCode?: number },
): void {
  if (!journal) return;
  appendJournalEvent(journal, {
    type: "custom",
    severity: "info",
    summary: `Process killed: pid=${params.pid} signal=${params.signal}${params.exitCode != null ? ` exit=${params.exitCode}` : ""}`,
    payload: { eventKind: "process_killed", ...params },
  });
}

// ── Home Assistant events (Track E) ──

export function recordHaServiceCall(
  journal: SessionEventJournal | undefined,
  params: { domain: string; service: string; entityId?: string; success: boolean },
): void {
  if (!journal) return;
  appendJournalEvent(journal, {
    type: "custom",
    severity: params.success ? "info" : "warn",
    summary: `HA service ${params.domain}.${params.service}${params.entityId ? ` on ${params.entityId}` : ""}: ${params.success ? "ok" : "failed"}`,
    payload: { eventKind: "ha_service_call", ...params },
  });
}

// ── Gateway platform events (Track F) ──

export function recordGatewayMessageSent(
  journal: SessionEventJournal | undefined,
  params: { platform: string; targetId: string; success: boolean; durationMs: number; error?: string },
): void {
  if (!journal) return;
  appendJournalEvent(journal, {
    type: "custom",
    severity: params.success ? "debug" : "warn",
    summary: `Gateway send to ${params.platform}:${params.targetId}: ${params.success ? "ok" : "failed"} (${params.durationMs.toFixed(0)}ms)${params.error ? ` — ${params.error}` : ""}`,
    payload: { eventKind: "gateway_message_sent", ...params },
  });
}

export function recordGatewayMessageReceived(
  journal: SessionEventJournal | undefined,
  params: { platform: string; senderId: string; messageType: string },
): void {
  if (!journal) return;
  appendJournalEvent(journal, {
    type: "custom",
    severity: "debug",
    summary: `Gateway inbound from ${params.platform}:${params.senderId} (${params.messageType})`,
    payload: { eventKind: "gateway_message_received", ...params },
  });
}

// ── Gateway mirroring events (Track F) ──

export function recordMirrorDelivery(
  journal: SessionEventJournal | undefined,
  params: { targetPlatform: string; targetChatId: string; sessionId: string; success: boolean },
): void {
  if (!journal) return;
  appendJournalEvent(journal, {
    type: "custom",
    severity: params.success ? "debug" : "warn",
    summary: `Mirror to ${params.targetPlatform}:${params.targetChatId} → session ${params.sessionId}: ${params.success ? "ok" : "failed"}`,
    payload: { eventKind: "mirror_delivery", ...params },
  });
}

// ── Multi-destination delivery events (Track F) ──

export function recordMultiDestinationDelivery(
  journal: SessionEventJournal | undefined,
  params: { policy: string; totalTargets: number; delivered: number; failed: number; totalMs: number },
): void {
  if (!journal) return;
  appendJournalEvent(journal, {
    type: "custom",
    severity: params.failed > 0 ? "warn" : "info",
    summary: `Multi-destination (${params.policy}): ${params.delivered}/${params.totalTargets} delivered, ${params.failed} failed (${params.totalMs.toFixed(0)}ms)`,
    payload: { eventKind: "multi_destination_delivery", ...params },
  });
}
