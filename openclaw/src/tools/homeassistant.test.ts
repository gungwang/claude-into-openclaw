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
      expect(def).toHaveProperty("parameters");
    }
  });
});

describe("createHomeAssistantClient", () => {
  const config: HomeAssistantConfig = {
    enabled: true,
    url: "http://homeassistant.local:8123",
    token: "test-token-123",
    timeoutMs: 15_000,
  };

  function makeMockHttp(getResponse: unknown = [], postResponse: unknown = {}): HaHttpClient {
    return {
      get: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(getResponse),
      }),
      post: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(postResponse),
      }),
    };
  }

  it("creates client with expected interface", () => {
    const mockHttp = makeMockHttp();
    const client = createHomeAssistantClient(config, mockHttp);
    expect(client).toHaveProperty("listEntities");
    expect(client).toHaveProperty("getState");
    expect(client).toHaveProperty("listServices");
    expect(client).toHaveProperty("callService");
  });

  it("listEntities returns entities via HTTP", async () => {
    const mockHttp = makeMockHttp([
      { entity_id: "light.kitchen", state: "on", attributes: { friendly_name: "Kitchen Light" } },
    ]);
    const client = createHomeAssistantClient(config, mockHttp);
    const result = await client.listEntities();
    expect(mockHttp.get).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].entityId).toBe("light.kitchen");
      expect(result.data[0].domain).toBe("light");
      expect(result.data[0].friendlyName).toBe("Kitchen Light");
    }
  });

  it("listEntities filters by domain", async () => {
    const mockHttp = makeMockHttp([
      { entity_id: "light.kitchen", state: "on", attributes: {} },
      { entity_id: "sensor.temperature", state: "22", attributes: {} },
    ]);
    const client = createHomeAssistantClient(config, mockHttp);
    const result = await client.listEntities("light");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].entityId).toBe("light.kitchen");
    }
  });

  it("getState validates entity ID format", async () => {
    const mockHttp = makeMockHttp();
    const client = createHomeAssistantClient(config, mockHttp);
    const result = await client.getState("INVALID ID!");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Invalid entity ID format");
    }
  });

  it("getState returns entity state", async () => {
    const mockHttp = makeMockHttp({
      entity_id: "light.kitchen",
      state: "on",
      attributes: { brightness: 255 },
      last_changed: "2026-01-01T00:00:00Z",
      last_updated: "2026-01-01T00:00:00Z",
    });
    const client = createHomeAssistantClient(config, mockHttp);
    const result = await client.getState("light.kitchen");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.entityId).toBe("light.kitchen");
      expect(result.data.state).toBe("on");
      expect(result.data.attributes).toEqual({ brightness: 255 });
      expect(result.data.lastChanged).toBe("2026-01-01T00:00:00Z");
    }
  });

  it("callService blocks dangerous domains", async () => {
    const mockHttp = makeMockHttp();
    const client = createHomeAssistantClient(config, mockHttp);
    const result = await client.callService("shell_command", "run");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("blocked for security");
    }
  });

  it("callService invokes service via POST", async () => {
    const mockHttp = makeMockHttp([], []);
    const client = createHomeAssistantClient(config, mockHttp);
    const result = await client.callService("light", "turn_on", "light.kitchen", { brightness: 128 });
    expect(mockHttp.post).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toContain("called successfully");
    }
  });

  it("returns error when disabled", async () => {
    const disabledConfig: HomeAssistantConfig = { ...config, enabled: false };
    const mockHttp = makeMockHttp();
    const client = createHomeAssistantClient(disabledConfig, mockHttp);
    const result = await client.listEntities();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("disabled");
    }
  });
});
