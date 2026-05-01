import { Type } from "typebox";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { listParsers } from "../../training/tool-call-parsers/index.js";
import { listDistributions } from "../../training/toolset-distributions.js";
import type { AnyAgentTool } from "./common.js";
import { asToolParamsRecord, jsonResult, readStringParam } from "./common.js";

type TrainingPipelineToolOptions = {
  config?: OpenClawConfig;
};

const TrainingPipelineSchema = Type.Object({
  action: Type.Optional(
    Type.Union([
      Type.Literal("status"),
      Type.Literal("list_distributions"),
      Type.Literal("list_parsers"),
    ]),
  ),
});

function resolveTrainingPipelineEnabled(config?: OpenClawConfig): boolean {
  return config?.trainingPipeline?.enabled === true;
}

function buildTrainingPipelineStatus(config?: OpenClawConfig) {
  const enabled = resolveTrainingPipelineEnabled(config);
  const pipeline = config?.trainingPipeline;
  return {
    enabled,
    trajectoryOutputDir: pipeline?.trajectory?.outputDir,
    defaultDistributionPreset: pipeline?.distribution?.preset,
    parsersConfigured: pipeline?.parsers?.defaultParser,
    benchmarkConfigured: Boolean(pipeline?.benchmark),
    environmentConfigured: pipeline?.environment?.defaultBackend,
  };
}

export function createTrainingPipelineTool(options?: TrainingPipelineToolOptions): AnyAgentTool {
  return {
    label: "Training Pipeline",
    name: "training_pipeline",
    displaySummary: "Inspect training/eval pipeline runtime configuration.",
    description:
      "Inspect Track G training pipeline status and list configured distributions/parsers.",
    parameters: TrainingPipelineSchema,
    execute: async (_toolCallId, args) => {
      const params = asToolParamsRecord(args);
      const action = readStringParam(params, "action") ?? "status";
      const enabled = resolveTrainingPipelineEnabled(options?.config);

      if (!enabled) {
        return jsonResult({
          ok: false,
          error: "trainingPipeline.enabled is false",
          action,
        });
      }

      if (action === "list_distributions") {
        const distributions = listDistributions();
        return jsonResult({
          ok: true,
          action,
          count: distributions.length,
          distributions,
        });
      }

      if (action === "list_parsers") {
        const parsers = listParsers();
        return jsonResult({
          ok: true,
          action,
          count: parsers.length,
          parsers,
        });
      }

      return jsonResult({
        ok: true,
        action: "status",
        status: buildTrainingPipelineStatus(options?.config),
      });
    },
  };
}

export const __testing = {
  resolveTrainingPipelineEnabled,
  buildTrainingPipelineStatus,
};
