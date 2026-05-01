import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setPluginToolMeta } from "../plugins/tools.js";

const mocks = vi.hoisted(() => ({
  logWarn: vi.fn(),
}));

vi.mock("../logger.js", () => ({
  logWarn: mocks.logWarn,
}));

let piToolsTesting: typeof import("./pi-tools.js").__testing;

describe("pi-tools identity diagnostics", () => {
  beforeAll(async () => {
    ({ __testing: piToolsTesting } = await import("./pi-tools.js"));
  });

  beforeEach(() => {
    mocks.logWarn.mockReset();
  });

  it("builds canonical identities using plugin metadata hints", () => {
    const pluginTool = {
      name: "search",
      label: "Search",
    } as any;
    setPluginToolMeta(pluginTool, {
      pluginId: "acme",
      optional: false,
      namespace: "plugin",
      canonicalIdHint: "PLUGIN:Acme:Search",
    });

    const [identity] = piToolsTesting.buildCanonicalIdentities([pluginTool]);

    expect(identity).toMatchObject({
      id: "plugin:acme:search",
      displayName: "Search",
      namespace: "plugin",
    });
  });

  it("warns once for duplicate canonical ids across repeated diagnostics", () => {
    const ids = [
      {
        id: "core:dup-tool",
        displayName: "Dup Tool A",
        namespace: "core",
        capabilityClass: "other",
      },
      {
        id: "core:dup-tool",
        displayName: "Dup Tool B",
        namespace: "core",
        capabilityClass: "other",
      },
    ] as const;

    piToolsTesting.emitCanonicalIdentityDiagnostics([...ids]);
    piToolsTesting.emitCanonicalIdentityDiagnostics([...ids]);

    expect(mocks.logWarn).toHaveBeenCalledTimes(1);
    expect(mocks.logWarn).toHaveBeenCalledWith(
      expect.stringContaining('tools.identity duplicate canonical id "core:dup-tool"'),
    );
  });

  it("warns for ambiguous display names mapped to different ids", () => {
    const display = `Ambiguous-${Date.now()}`;
    const ids = [
      {
        id: "core:first-tool",
        displayName: display,
        namespace: "core",
        capabilityClass: "other",
      },
      {
        id: "plugin:acme:second-tool",
        displayName: display,
        namespace: "plugin",
        capabilityClass: "other",
      },
    ] as const;

    piToolsTesting.emitCanonicalIdentityDiagnostics([...ids]);

    expect(mocks.logWarn).toHaveBeenCalledTimes(1);
    expect(mocks.logWarn).toHaveBeenCalledWith(
      expect.stringContaining(`tools.identity ambiguous display name "${display}"`),
    );
  });
});
