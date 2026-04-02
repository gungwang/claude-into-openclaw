/**
 * Gateway handlers: tools.explain, tools.maturityReport, session.journal
 *
 * Exposes route explainability, maturity report data, and journal export
 * via gateway RPC.
 */

import { resolveDefaultAgentId, resolveSessionAgentId, resolveAgentDir, resolveAgentWorkspaceDir, listAgentIds } from "../../agents/agent-scope.js";
import {
  buildToolResolutionTrace,
  explainToolResolution,
  formatToolResolutionTrace,
} from "../../agents/route-explainability.js";
import {
  buildMaturityReportArtifact,
  formatMaturityReportMarkdown,
} from "../../agents/maturity-trust.js";
import { CORE_TOOL_MATURITY_ENTRIES } from "../../agents/maturity-trust-defaults.js";
import { buildToolsCatalogResult } from "./tools-catalog.js";
import { createOpenClawTools } from "../../agents/openclaw-tools.js";
import {
  applyToolPolicyPipeline,
  buildDefaultToolPolicyPipelineSteps,
} from "../../agents/tool-policy-pipeline.js";
import {
  resolveEffectiveToolPolicy,
  resolveGroupToolPolicy,
} from "../../agents/pi-tools.policy.js";
import {
  applyOwnerOnlyToolPolicy,
  collectExplicitAllowlist,
  mergeAlsoAllowPolicy,
  resolveToolProfilePolicy,
} from "../../agents/tool-policy.js";
import type { PolicyDecisionRecord } from "../../agents/policy-reason-codes.js";
import { getPluginToolMeta } from "../../plugins/tools.js";
import {
  formatJournalTimeline,
  exportJournalAsJson,
  filterJournalEvents,
  type SessionEventJournal,
  type JournalEventType,
  type JournalEventSeverity,
} from "../../agents/session-event-journal.js";
import { loadConfig } from "../../config/config.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers, RespondFn } from "./types.js";

function resolveAgentIdOrError(rawAgentId: unknown, respond: RespondFn) {
  const cfg = loadConfig();
  const knownAgents = listAgentIds(cfg);
  const requestedAgentId = typeof rawAgentId === "string" ? rawAgentId.trim() : "";
  const agentId = requestedAgentId || resolveDefaultAgentId(cfg);
  if (requestedAgentId && !knownAgents.includes(agentId)) {
    respond(
      false,
      undefined,
      errorShape(ErrorCodes.INVALID_REQUEST, `unknown agent id "${requestedAgentId}"`),
    );
    return null;
  }
  return { cfg, agentId };
}

export const toolsDiagnosticHandlers: GatewayRequestHandlers = {
  /**
   * tools.explain — Explain why a tool is or isn't available for a given session.
   *
   * Params:
   *   toolName: string (required)
   *   sessionKey?: string
   *   agentId?: string
   *   format?: "json" | "text" (default: "json")
   */
  "tools.explain": ({ params, respond }) => {
    const toolName = typeof params.toolName === "string" ? params.toolName.trim() : "";
    if (!toolName) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "tools.explain requires params.toolName"),
      );
      return;
    }

    const resolved = resolveAgentIdOrError(params.agentId, respond);
    if (!resolved) {
      return;
    }
    const { cfg, agentId } = resolved;
    const format = params.format === "text" ? "text" : "json";
    const senderIsOwner = params.senderIsOwner !== false;

    // Build the "before" tool list from catalog.
    const catalog = buildToolsCatalogResult({ cfg, agentId });
    const toolsBefore = catalog.groups.flatMap((g) =>
      g.tools.map((t) => ({
        name: t.id,
        label: t.label,
        pluginId: (t as { pluginId?: string }).pluginId,
      })),
    );

    // Build the "after" tool list using the real policy pipeline with accumulator.
    const {
      globalPolicy,
      globalProviderPolicy,
      agentPolicy,
      agentProviderPolicy,
      profile,
      providerProfile,
      profileAlsoAllow,
      providerProfileAlsoAllow,
    } = resolveEffectiveToolPolicy({ config: cfg, agentId });
    const profilePolicy = resolveToolProfilePolicy(profile);
    const providerProfilePolicy = resolveToolProfilePolicy(providerProfile);
    const profilePolicyWithAlsoAllow = mergeAlsoAllowPolicy(profilePolicy, profileAlsoAllow);
    const providerProfilePolicyWithAlsoAllow = mergeAlsoAllowPolicy(
      providerProfilePolicy,
      providerProfileAlsoAllow,
    );

    const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    const allTools = createOpenClawTools({
      config: cfg,
      workspaceDir,
      allowGatewaySubagentBinding: true,
      pluginToolAllowlist: collectExplicitAllowlist([
        profilePolicy,
        providerProfilePolicy,
        globalPolicy,
        globalProviderPolicy,
        agentPolicy,
        agentProviderPolicy,
      ]),
    });

    const policyDecisions: PolicyDecisionRecord[] = [];
    const afterPolicy = applyToolPolicyPipeline({
      tools: allTools as any,
      toolMeta: (tool) => getPluginToolMeta(tool as any),
      warn: () => {},
      policyDecisions,
      steps: [
        ...buildDefaultToolPolicyPipelineSteps({
          profilePolicy: profilePolicyWithAlsoAllow,
          profile,
          profileAlsoAllow,
          providerProfilePolicy: providerProfilePolicyWithAlsoAllow,
          providerProfile,
          providerProfileAlsoAllow,
          globalPolicy,
          globalProviderPolicy,
          agentPolicy,
          agentProviderPolicy,
          agentId,
        }),
      ],
    });

    const ownerFiltered = applyOwnerOnlyToolPolicy(afterPolicy, senderIsOwner);
    // Record owner-only filtering
    if (!senderIsOwner) {
      const afterNames = new Set(ownerFiltered.map((t) => t.name));
      for (const tool of afterPolicy) {
        if (!afterNames.has(tool.name)) {
          policyDecisions.push({
            code: "auth:owner_only",
            message: `Tool "${tool.name}" restricted to owner senders.`,
            toolName: tool.name,
          });
        }
      }
    }

    const toolsAfter = ownerFiltered.map((t) => ({
      name: t.name,
      label: (t as any).label,
      pluginId: getPluginToolMeta(t as any)?.pluginId,
    }));

    const trace = buildToolResolutionTrace({
      query: toolName,
      toolsBefore,
      toolsAfter,
      policyDecisions,
      agentId,
    });

    const candidate = explainToolResolution(trace, toolName);

    if (format === "text") {
      respond(true, { text: formatToolResolutionTrace(trace) }, undefined);
      return;
    }

    respond(
      true,
      {
        query: toolName,
        agentId,
        profile: profile ?? "full",
        candidate,
        trace: {
          totalBeforePolicy: trace.totalBeforePolicy,
          totalAfterPolicy: trace.totalAfterPolicy,
          policyDecisions: trace.policyDecisions,
        },
      },
      undefined,
    );
  },

  /**
   * tools.maturityReport — Generate the tool maturity report artifact.
   *
   * Params:
   *   format?: "json" | "markdown" (default: "json")
   *   version?: string (default: "3.31")
   */
  "tools.maturityReport": ({ params, respond }) => {
    const format = params.format === "markdown" ? "markdown" : "json";
    const version = typeof params.version === "string" ? params.version.trim() : "3.31";

    const report = buildMaturityReportArtifact(CORE_TOOL_MATURITY_ENTRIES, version);

    if (format === "markdown") {
      respond(true, { markdown: formatMaturityReportMarkdown(report) }, undefined);
      return;
    }

    respond(true, report, undefined);
  },

  /**
   * session.journal — Export or query a session's event journal.
   *
   * Params:
   *   sessionKey: string (required)
   *   format?: "json" | "timeline" (default: "json")
   *   types?: string[] (filter by event type)
   *   severity?: string[] (filter by severity)
   *   correlationId?: string (filter by correlation ID)
   */
  "session.journal": ({ params, respond }) => {
    const sessionKey = typeof params.sessionKey === "string" ? params.sessionKey.trim() : "";
    if (!sessionKey) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "session.journal requires params.sessionKey"),
      );
      return;
    }

    const journal = getSessionJournal(sessionKey);
    if (!journal) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `No journal found for session "${sessionKey}"`),
      );
      return;
    }

    const format = params.format === "timeline" ? "timeline" : "json";
    const types = Array.isArray(params.types) ? params.types as JournalEventType[] : undefined;
    const severity = Array.isArray(params.severity) ? params.severity as JournalEventSeverity[] : undefined;
    const correlationId = typeof params.correlationId === "string" ? params.correlationId : undefined;

    const hasFilters = types || severity || correlationId;
    const events = hasFilters
      ? filterJournalEvents(journal, { types, severity, correlationId })
      : journal.events;

    if (format === "timeline") {
      const filteredJournal = hasFilters ? { ...journal, events } : journal;
      respond(true, { text: formatJournalTimeline(filteredJournal) }, undefined);
      return;
    }

    respond(true, {
      sessionKey: journal.sessionKey,
      agentId: journal.agentId,
      runId: journal.runId,
      createdAt: journal.createdAt,
      eventCount: events.length,
      events,
    }, undefined);
  },
};

// ── Session journal registry ──
// In-memory registry for active session journals.
// Journals are registered by the run loop and cleaned up on session end.

const activeJournals = new Map<string, SessionEventJournal>();
const MAX_JOURNAL_ENTRIES = 100;

export function registerSessionJournal(sessionKey: string, journal: SessionEventJournal): void {
  if (activeJournals.size >= MAX_JOURNAL_ENTRIES) {
    const oldest = activeJournals.keys().next().value;
    if (oldest) {
      activeJournals.delete(oldest);
    }
  }
  activeJournals.set(sessionKey, journal);
}

export function getSessionJournal(sessionKey: string): SessionEventJournal | undefined {
  return activeJournals.get(sessionKey);
}

export function removeSessionJournal(sessionKey: string): boolean {
  return activeJournals.delete(sessionKey);
}

export function clearAllSessionJournals(): void {
  activeJournals.clear();
}
