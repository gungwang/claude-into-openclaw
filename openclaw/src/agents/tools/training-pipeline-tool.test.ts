import { describe, expect, it } from "vitest";
import { createTrainingPipelineTool } from "./training-pipeline-tool.js";

describe("training-pipeline-tool", () => {
  it("returns a disabled error by default", async () => {
    const tool = createTrainingPipelineTool({ config: {} as never });
    const result = await tool.execute("call-1", {});

    expect(result.details).toMatchObject({
      ok: false,
      error: "trainingPipeline.enabled is false",
      action: "status",
    });
  });

  it("returns status when enabled", async () => {
    const tool = createTrainingPipelineTool({
      config: {
        trainingPipeline: {
          enabled: true,
          trajectory: { outputDir: "./tmp/traj" },
          distribution: { preset: "default" },
          parsers: { defaultParser: "hermes" },
          benchmark: { concurrency: 2 },
          environment: { defaultBackend: "local" },
        },
      } as never,
    });

    const result = await tool.execute("call-2", { action: "status" });
    expect(result.details).toMatchObject({
      ok: true,
      action: "status",
      status: {
        enabled: true,
        trajectoryOutputDir: "./tmp/traj",
        defaultDistributionPreset: "default",
        parsersConfigured: "hermes",
        benchmarkConfigured: true,
        environmentConfigured: "local",
      },
    });
  });

  it("lists built-in training distributions and parsers", async () => {
    const tool = createTrainingPipelineTool({
      config: { trainingPipeline: { enabled: true } } as never,
    });

    const distributions = await tool.execute("call-3", { action: "list_distributions" });
    const parsers = await tool.execute("call-4", { action: "list_parsers" });

    expect(distributions.details).toMatchObject({ ok: true, action: "list_distributions" });
    expect((distributions.details as { distributions?: unknown[] }).distributions?.length).toBeGreaterThan(0);

    expect(parsers.details).toMatchObject({ ok: true, action: "list_parsers" });
    expect((parsers.details as { parsers?: unknown[] }).parsers?.length).toBeGreaterThan(0);
  });
});
