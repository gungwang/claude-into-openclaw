import { describe, expect, it, vi } from "vitest";
import {
  createHomeAssistantClient,
  getHomeAssistantToolDefinitions,
  type HomeAssistantConfig,
  type HaHttpClient,
} from "./homeassistant.js";

describe("getHomeAssistantToolDefinitions", () => {
  it("returns tool definitions array", () => {
    const defs = getHomeAssistantToolDefinitions();
    expect(Array.isArray(defs)).toBe(true);
    expect(defs.length).toBeGreaterThan(0);
    for (const def of defs) {
      expect(def).toHaveProperty("name");
      expect(def).toHaveProperty("description");
    }
  });
});

describe("createHomeAssistantClient", () => {
  const config: HomeAssistantConfig = {
    url: "http://homeassistant.local:8123",
    token: "test-token-123",
  };

  const mockHttp: HaHttpClient = {
    get: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    post: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  };

  it("creates client with expected interface", () => {
    const client = createHomeAssistantClient(config, mockHttp);
    expect(client).toHaveProperty("getStates");
    expect(client).toHaveProperty("callService");
    expect(client).toHaveProperty("getServices");
  });

  it("fetches entity states via HTTP", async () => {
    const client = createHomeAssistantClient(config, mockHttp);
    const states = await client.getStates();
    expect(mockHttp.get).toHaveBeenCalled();
    expect(Array.isArray(states)).toBe(true);
  });
});
