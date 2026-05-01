import { beforeEach, describe, expect, it, vi } from "vitest";

const callGatewayMock = vi.hoisted(() => vi.fn());
const runAgentStepMock = vi.hoisted(() => vi.fn());

vi.mock("../../gateway/call.js", () => ({
  callGateway: callGatewayMock,
}));

vi.mock("./agent-step.js", () => ({
  runAgentStep: runAgentStepMock,
}));

describe("mixture-of-agents-tool", () => {
  beforeEach(() => {
    callGatewayMock.mockReset();
    runAgentStepMock.mockReset();
  });

  it("returns a config-disabled error by default", async () => {
    const { createMixtureOfAgentsTool } = await import("./mixture-of-agents-tool.js");
    const tool = createMixtureOfAgentsTool({ config: {} as never });

    const result = await tool.execute("call-1", { user_prompt: "hello" });
    expect(result.details).toMatchObject({
      ok: false,
      error: "advancedTools.mixtureOfAgents.enabled is false",
    });
    expect(callGatewayMock).not.toHaveBeenCalled();
    expect(runAgentStepMock).not.toHaveBeenCalled();
  });

  it("runs reference + aggregator turns when enabled", async () => {
    const { createMixtureOfAgentsTool } = await import("./mixture-of-agents-tool.js");

    let createCount = 0;
    callGatewayMock.mockImplementation(async (opts: { method: string }) => {
      if (opts.method === "sessions.create") {
        createCount += 1;
        return { key: `agent:main:dashboard:moa-${createCount}` };
      }
      if (opts.method === "sessions.delete") {
        return { ok: true };
      }
      throw new Error(`unexpected gateway method: ${opts.method}`);
    });

    runAgentStepMock
      .mockResolvedValueOnce("reference answer")
      .mockResolvedValueOnce("aggregated answer");

    const tool = createMixtureOfAgentsTool({
      config: {
        advancedTools: {
          mixtureOfAgents: {
            enabled: true,
            referenceModels: ["openai/gpt-4o"],
            aggregatorModel: "anthropic/claude-sonnet-4-20250514",
            minReferenceResponses: 1,
            referenceTimeoutMs: 15_000,
          },
        },
      } as never,
      agentSessionKey: "agent:main:main",
      agentId: "main",
    });

    const result = await tool.execute("call-2", { user_prompt: "hard prompt" });

    expect(result.details).toMatchObject({
      ok: true,
      aggregated: true,
      successfulReferences: 1,
      content: "aggregated answer",
    });
    expect(runAgentStepMock).toHaveBeenCalledTimes(2);
    expect(callGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({ method: "sessions.create" }),
    );
    expect(callGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({ method: "sessions.delete" }),
    );
  });

  it("parses and applies model refs from config", async () => {
    const { __testing } = await import("./mixture-of-agents-tool.js");
    const cfg = __testing.resolveMoaConfig({
      advancedTools: {
        mixtureOfAgents: {
          enabled: true,
          referenceModels: ["openai/gpt-4o-mini", "invalid-model-ref"],
          aggregatorModel: "anthropic/claude-sonnet-4-20250514",
          minReferenceResponses: 3,
          referenceTimeoutMs: 90_000,
        },
      },
    } as never);

    expect(cfg.enabled).toBe(true);
    expect(cfg.referenceModels.map((entry) => `${entry.provider}/${entry.id}`)).toEqual([
      "openai/gpt-4o-mini",
    ]);
    expect(`${cfg.aggregatorModel.provider}/${cfg.aggregatorModel.id}`).toBe(
      "anthropic/claude-sonnet-4-20250514",
    );
    expect(cfg.minSuccessfulReferences).toBe(3);
    expect(cfg.referenceTimeoutMs).toBe(90_000);
  });
});
