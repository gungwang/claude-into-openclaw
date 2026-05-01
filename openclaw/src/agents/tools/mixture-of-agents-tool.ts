import { Type } from "typebox";
import { callGateway } from "../../gateway/call.js";
import {
  DEFAULT_MOA_CONFIG,
  executeMoaQuery,
  type MoaConfig,
  type MoaModel,
} from "../../tools/mixture-of-agents.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { runAgentStep } from "./agent-step.js";
import type { AnyAgentTool } from "./common.js";
import {
  ToolInputError,
  asToolParamsRecord,
  jsonResult,
  readStringParam,
} from "./common.js";

type MoaToolOptions = {
  config?: OpenClawConfig;
  agentSessionKey?: string;
  agentId?: string;
};

const MoaToolSchema = Type.Object({
  userPrompt: Type.Optional(Type.String({ description: "Prompt to evaluate via mixture-of-agents." })),
  user_prompt: Type.Optional(Type.String({ description: "Prompt to evaluate via mixture-of-agents." })),
});

function parseModelRef(value: string): MoaModel | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const slash = trimmed.indexOf("/");
  if (slash <= 0 || slash >= trimmed.length - 1) {
    return null;
  }
  const provider = trimmed.slice(0, slash).trim();
  const id = trimmed.slice(slash + 1).trim();
  if (!provider || !id) {
    return null;
  }
  return {
    provider,
    id,
    name: trimmed,
  };
}

function resolveMoaConfig(config?: OpenClawConfig): MoaConfig {
  const advanced = config?.advancedTools?.mixtureOfAgents;
  const referenceModelsFromConfig = (advanced?.referenceModels ?? [])
    .map((entry) => parseModelRef(entry))
    .filter((entry): entry is MoaModel => Boolean(entry));
  const aggregatorModelFromConfig =
    typeof advanced?.aggregatorModel === "string"
      ? parseModelRef(advanced.aggregatorModel)
      : null;

  return {
    ...DEFAULT_MOA_CONFIG,
    ...(advanced?.enabled !== undefined ? { enabled: advanced.enabled } : {}),
    ...(advanced?.referenceTimeoutMs !== undefined
      ? { referenceTimeoutMs: Math.max(1, Math.trunc(advanced.referenceTimeoutMs)) }
      : {}),
    ...(advanced?.minReferenceResponses !== undefined
      ? { minSuccessfulReferences: Math.max(1, Math.trunc(advanced.minReferenceResponses)) }
      : {}),
    ...(advanced?.maxReferenceTokens !== undefined
      ? { maxReferenceTokens: Math.max(1, Math.trunc(advanced.maxReferenceTokens)) }
      : {}),
    ...(referenceModelsFromConfig.length > 0 ? { referenceModels: referenceModelsFromConfig } : {}),
    ...(aggregatorModelFromConfig ? { aggregatorModel: aggregatorModelFromConfig } : {}),
  };
}

async function runSingleMoaModelStep(params: {
  modelRef: string;
  prompt: string;
  timeoutMs: number;
  requesterSessionKey?: string;
  requesterAgentId?: string;
}): Promise<string> {
  const created = await callGateway({
    method: "sessions.create",
    params: {
      agentId: params.requesterAgentId,
      model: params.modelRef,
      label: `MoA ${params.modelRef}`,
    },
    timeoutMs: 10_000,
  });
  const key =
    created && typeof created === "object" && typeof (created as { key?: unknown }).key === "string"
      ? ((created as { key: string }).key as string)
      : undefined;
  if (!key) {
    throw new Error(`failed to create session for ${params.modelRef}`);
  }

  try {
    const reply = await runAgentStep({
      sessionKey: key,
      message: params.prompt,
      extraSystemPrompt:
        "You are participating in a mixture-of-agents ensemble. Answer directly and concisely. Do not call tools.",
      timeoutMs: params.timeoutMs,
      sourceSessionKey: params.requesterSessionKey,
      sourceTool: "mixture_of_agents",
    });
    if (!reply?.trim()) {
      throw new Error(`empty model reply for ${params.modelRef}`);
    }
    return reply;
  } finally {
    await callGateway({
      method: "sessions.delete",
      params: {
        key,
        deleteTranscript: true,
        emitLifecycleHooks: false,
      },
      timeoutMs: 10_000,
    }).catch(() => undefined);
  }
}

export function createMixtureOfAgentsTool(options?: MoaToolOptions): AnyAgentTool {
  return {
    label: "Mixture of Agents",
    name: "mixture_of_agents",
    displaySummary: "Query multiple models and synthesize one answer.",
    description:
      "Run a prompt through multiple reference models and synthesize a consolidated final response.",
    parameters: MoaToolSchema,
    execute: async (_toolCallId, args) => {
      const params = asToolParamsRecord(args);
      const userPrompt =
        readStringParam(params, "userPrompt") ??
        readStringParam(params, "user_prompt", {
          required: true,
          label: "user_prompt",
        });

      if (!userPrompt?.trim()) {
        throw new ToolInputError("user_prompt is required.");
      }

      const moaConfig = resolveMoaConfig(options?.config);
      if (!moaConfig.enabled) {
        return jsonResult({
          ok: false,
          error: "advancedTools.mixtureOfAgents.enabled is false",
        });
      }

      const result = await executeMoaQuery(
        userPrompt,
        async (modelCall) => {
          const prompt = modelCall.messages
            .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
            .join("\n\n");
          const text = await runSingleMoaModelStep({
            modelRef: `${modelCall.provider}/${modelCall.model}`,
            prompt,
            timeoutMs: moaConfig.referenceTimeoutMs,
            requesterSessionKey: options?.agentSessionKey,
            requesterAgentId: options?.agentId,
          });
          return { content: text };
        },
        moaConfig,
      );

      return jsonResult({
        ok: true,
        aggregated: result.aggregated,
        successfulReferences: result.successfulReferences,
        totalDurationMs: result.totalDurationMs,
        references: result.references,
        content: result.content,
      });
    },
  };
}

export const __testing = {
  resolveMoaConfig,
  parseModelRef,
};
