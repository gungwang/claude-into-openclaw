import { Type } from "typebox";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import {
  DEFAULT_HA_CONFIG,
  createHomeAssistantClient,
  type HomeAssistantClient,
  type HomeAssistantConfig,
} from "../../tools/homeassistant.js";
import type { AnyAgentTool } from "./common.js";
import {
  ToolInputError,
  asToolParamsRecord,
  jsonResult,
  readStringParam,
} from "./common.js";

type HomeAssistantToolOptions = {
  config?: OpenClawConfig;
};

const ListEntitiesSchema = Type.Object({
  domain: Type.Optional(Type.String({ description: "Optional entity domain filter." })),
  area: Type.Optional(Type.String({ description: "Optional area name filter." })),
});

const GetStateSchema = Type.Object({
  entityId: Type.Optional(Type.String({ description: "Entity id (domain.name)." })),
  entity_id: Type.Optional(Type.String({ description: "Entity id (domain.name)." })),
});

const ListServicesSchema = Type.Object({
  domain: Type.Optional(Type.String({ description: "Optional service domain filter." })),
});

const CallServiceSchema = Type.Object({
  domain: Type.String({ description: "Service domain (e.g. light)." }),
  service: Type.String({ description: "Service name (e.g. turn_on)." }),
  entityId: Type.Optional(Type.String({ description: "Optional target entity id." })),
  entity_id: Type.Optional(Type.String({ description: "Optional target entity id." })),
  data: Type.Optional(Type.Object({}, { additionalProperties: true })),
});

let homeAssistantClientSingleton: HomeAssistantClient | undefined;
let homeAssistantClientKey = "";

function resolveHomeAssistantConfig(config?: OpenClawConfig): HomeAssistantConfig {
  const advanced = config?.advancedTools?.homeAssistant;
  return {
    ...DEFAULT_HA_CONFIG,
    ...(advanced?.enabled !== undefined ? { enabled: advanced.enabled } : {}),
    ...(advanced?.url ? { url: advanced.url } : {}),
    ...(advanced?.token ? { token: advanced.token } : {}),
    ...(advanced?.timeoutMs !== undefined ? { timeoutMs: advanced.timeoutMs } : {}),
  };
}

function createFetchHttpClient() {
  return {
    async get(url: string, headers: Record<string, string>, timeoutMs: number) {
      const response = await fetch(url, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      return {
        ok: response.ok,
        status: response.status,
        json: async () => await response.json(),
      };
    },
    async post(url: string, body: unknown, headers: Record<string, string>, timeoutMs: number) {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body ?? {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
      return {
        ok: response.ok,
        status: response.status,
        json: async () => await response.json(),
      };
    },
  };
}

function getOrCreateHomeAssistantClient(config?: OpenClawConfig): HomeAssistantClient {
  const resolved = resolveHomeAssistantConfig(config);
  const key = JSON.stringify({
    enabled: resolved.enabled,
    url: resolved.url,
    token: Boolean(resolved.token),
    timeoutMs: resolved.timeoutMs,
  });

  if (!homeAssistantClientSingleton || homeAssistantClientKey !== key) {
    homeAssistantClientSingleton = createHomeAssistantClient(resolved, createFetchHttpClient());
    homeAssistantClientKey = key;
  }

  return homeAssistantClientSingleton;
}

function readObjectParam(
  params: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const raw = params[key];
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ToolInputError(`${key} must be an object when provided.`);
  }
  return raw as Record<string, unknown>;
}

export function createHomeAssistantTools(options?: HomeAssistantToolOptions): AnyAgentTool[] {
  const listEntitiesTool: AnyAgentTool = {
    label: "Home Assistant List Entities",
    name: "ha_list_entities",
    displaySummary: "List Home Assistant entities with optional filters.",
    description: "List Home Assistant entities, optionally filtered by domain or area.",
    parameters: ListEntitiesSchema,
    execute: async (_toolCallId, args) => {
      const params = asToolParamsRecord(args);
      const domain = readStringParam(params, "domain");
      const area = readStringParam(params, "area");
      const client = getOrCreateHomeAssistantClient(options?.config);
      return jsonResult(await client.listEntities(domain, area));
    },
  };

  const getStateTool: AnyAgentTool = {
    label: "Home Assistant Get State",
    name: "ha_get_state",
    displaySummary: "Get detailed state for a Home Assistant entity.",
    description: "Get current state and attributes for a single Home Assistant entity id.",
    parameters: GetStateSchema,
    execute: async (_toolCallId, args) => {
      const params = asToolParamsRecord(args);
      const entityId =
        readStringParam(params, "entityId") ??
        readStringParam(params, "entity_id", { required: true, label: "entity_id" });
      const client = getOrCreateHomeAssistantClient(options?.config);
      return jsonResult(await client.getState(entityId));
    },
  };

  const listServicesTool: AnyAgentTool = {
    label: "Home Assistant List Services",
    name: "ha_list_services",
    displaySummary: "List available Home Assistant services.",
    description: "List Home Assistant services, optionally filtered by domain.",
    parameters: ListServicesSchema,
    execute: async (_toolCallId, args) => {
      const params = asToolParamsRecord(args);
      const domain = readStringParam(params, "domain");
      const client = getOrCreateHomeAssistantClient(options?.config);
      return jsonResult(await client.listServices(domain));
    },
  };

  const callServiceTool: AnyAgentTool = {
    label: "Home Assistant Call Service",
    name: "ha_call_service",
    displaySummary: "Call a Home Assistant service.",
    description: "Invoke a Home Assistant service, with optional entity id and service data.",
    parameters: CallServiceSchema,
    execute: async (_toolCallId, args) => {
      const params = asToolParamsRecord(args);
      const domain = readStringParam(params, "domain", { required: true, label: "domain" });
      const service = readStringParam(params, "service", { required: true, label: "service" });
      const entityId = readStringParam(params, "entityId") ?? readStringParam(params, "entity_id");
      const data = readObjectParam(params, "data");
      const client = getOrCreateHomeAssistantClient(options?.config);
      return jsonResult(await client.callService(domain, service, entityId, data));
    },
  };

  return [listEntitiesTool, getStateTool, listServicesTool, callServiceTool];
}

export const __testing = {
  resetHomeAssistantClientSingleton() {
    homeAssistantClientSingleton = undefined;
    homeAssistantClientKey = "";
  },
};
