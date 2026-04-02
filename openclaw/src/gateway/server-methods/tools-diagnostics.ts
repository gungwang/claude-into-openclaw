/**
 * Gateway handlers: tools.explain and tools.maturityReport
 *
 * Exposes route explainability and maturity report data via gateway RPC.
 */

import { resolveDefaultAgentId, resolveSessionAgentId, listAgentIds } from "../../agents/agent-scope.js";
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
import { resolveEffectiveToolInventory } from "../../agents/tools-effective-inventory.js";
import type { PolicyDecisionRecord } from "../../agents/policy-reason-codes.js";
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

    // Build the effective inventory to get the "after" list.
    const inventory = resolveEffectiveToolInventory({
      cfg,
      agentId,
      senderIsOwner: true,
    });

    const allToolIds = inventory.groups.flatMap((g) =>
      g.tools.map((t) => ({
        name: t.id,
        label: t.label,
        pluginId: t.pluginId,
      })),
    );

    // We don't have a "before policy" list here without re-running the full
    // pipeline with a policyDecisions accumulator. Use the catalog as the
    // "before" set and the effective inventory as the "after" set.
    // Policy decisions are empty in this diagnostic path — wiring into the
    // full pipeline with accumulator is a future enhancement.
    const policyDecisions: PolicyDecisionRecord[] = [];

    const trace = buildToolResolutionTrace({
      query: toolName,
      toolsBefore: allToolIds,
      toolsAfter: allToolIds,
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
        profile: inventory.profile,
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
};
