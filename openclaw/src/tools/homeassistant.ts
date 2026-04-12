/**
 * Home Assistant IoT Integration (Track E — Advanced Tools)
 *
 * Provides 4 tools for smart home control via the Home Assistant REST API:
 * - ha_list_entities: list/filter entities by domain or area
 * - ha_get_state: get detailed state of a single entity
 * - ha_list_services: list available services per domain
 * - ha_call_service: call a HA service (turn_on, set_temperature, etc.)
 *
 * Ported from hermes-agent `tools/homeassistant_tool.py`.
 * Adapted to TypeScript with security hardening (blocked domains, input validation).
 */

// ── Types ──

export type HomeAssistantConfig = {
  /** Enable Home Assistant tools. Default: false. */
  enabled: boolean;
  /** HA instance URL. Default from HASS_URL env. */
  url: string;
  /** Long-lived access token. Default from HASS_TOKEN env. */
  token: string;
  /** Request timeout (ms). Default: 15_000. */
  timeoutMs: number;
};

export const DEFAULT_HA_CONFIG: HomeAssistantConfig = {
  enabled: false,
  url: process.env.HASS_URL ?? "http://homeassistant.local:8123",
  token: process.env.HASS_TOKEN ?? "",
  timeoutMs: 15_000,
};

export type HaEntity = {
  entityId: string;
  state: string;
  friendlyName: string;
  domain: string;
};

export type HaEntityState = {
  entityId: string;
  state: string;
  attributes: Record<string, unknown>;
  lastChanged: string;
  lastUpdated: string;
};

export type HaService = {
  domain: string;
  service: string;
  description: string;
};

export type HaResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ── Security ──

/** Entity ID format: domain.name (lowercase alphanumeric + underscore). */
const ENTITY_ID_RE = /^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/;

/**
 * Service domains blocked for security — these allow arbitrary code/command
 * execution on the HA host or enable SSRF attacks.
 */
const BLOCKED_DOMAINS = new Set([
  "shell_command",
  "command_line",
  "python_script",
  "pyscript",
  "hassio",
  "rest_command",
]);

function validateEntityId(entityId: string): string | undefined {
  if (!entityId) return "Empty entity ID";
  if (!ENTITY_ID_RE.test(entityId)) return `Invalid entity ID format: ${entityId}`;
  return undefined;
}

function validateServiceDomain(domain: string): string | undefined {
  if (BLOCKED_DOMAINS.has(domain)) {
    return `Service domain "${domain}" is blocked for security`;
  }
  return undefined;
}

// ── HTTP client interface (injectable) ──

export type HaHttpClient = {
  get(url: string, headers: Record<string, string>, timeoutMs: number): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
  post(
    url: string,
    body: unknown,
    headers: Record<string, string>,
    timeoutMs: number,
  ): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
};

// ── Home Assistant client ──

export type HomeAssistantClient = {
  listEntities(domain?: string, area?: string): Promise<HaResult<readonly HaEntity[]>>;
  getState(entityId: string): Promise<HaResult<HaEntityState>>;
  listServices(domain?: string): Promise<HaResult<readonly HaService[]>>;
  callService(
    domain: string,
    service: string,
    entityId?: string,
    data?: Record<string, unknown>,
  ): Promise<HaResult<string>>;
};

export function createHomeAssistantClient(
  config: HomeAssistantConfig,
  httpClient: HaHttpClient,
): HomeAssistantClient {
  const baseUrl = config.url.replace(/\/$/, "");
  const headers = {
    Authorization: `Bearer ${config.token}`,
    "Content-Type": "application/json",
  };

  return {
    async listEntities(domain?: string, area?: string): Promise<HaResult<readonly HaEntity[]>> {
      if (!config.enabled) return { ok: false, error: "Home Assistant is disabled" };
      if (!config.token) return { ok: false, error: "HASS_TOKEN not configured" };

      try {
        const resp = await httpClient.get(
          `${baseUrl}/api/states`,
          headers,
          config.timeoutMs,
        );
        if (!resp.ok) return { ok: false, error: `HA API returned ${resp.status}` };

        const states = (await resp.json()) as Array<{
          entity_id: string;
          state: string;
          attributes?: { friendly_name?: string; area?: string };
        }>;

        let filtered = states;
        if (domain) {
          filtered = filtered.filter((s) => s.entity_id.startsWith(`${domain}.`));
        }
        if (area) {
          const areaLower = area.toLowerCase();
          filtered = filtered.filter(
            (s) =>
              (s.attributes?.friendly_name ?? "").toLowerCase().includes(areaLower) ||
              (s.attributes?.area ?? "").toLowerCase().includes(areaLower),
          );
        }

        const entities: HaEntity[] = filtered.map((s) => ({
          entityId: s.entity_id,
          state: s.state,
          friendlyName: s.attributes?.friendly_name ?? "",
          domain: s.entity_id.split(".")[0],
        }));

        return { ok: true, data: entities };
      } catch (err) {
        return { ok: false, error: `HA API error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },

    async getState(entityId: string): Promise<HaResult<HaEntityState>> {
      if (!config.enabled) return { ok: false, error: "Home Assistant is disabled" };

      const validationErr = validateEntityId(entityId);
      if (validationErr) return { ok: false, error: validationErr };

      try {
        const resp = await httpClient.get(
          `${baseUrl}/api/states/${entityId}`,
          headers,
          config.timeoutMs,
        );
        if (!resp.ok) return { ok: false, error: `HA API returned ${resp.status}` };

        const state = (await resp.json()) as {
          entity_id: string;
          state: string;
          attributes: Record<string, unknown>;
          last_changed: string;
          last_updated: string;
        };

        return {
          ok: true,
          data: {
            entityId: state.entity_id,
            state: state.state,
            attributes: state.attributes,
            lastChanged: state.last_changed,
            lastUpdated: state.last_updated,
          },
        };
      } catch (err) {
        return { ok: false, error: `HA API error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },

    async listServices(domain?: string): Promise<HaResult<readonly HaService[]>> {
      if (!config.enabled) return { ok: false, error: "Home Assistant is disabled" };

      try {
        const resp = await httpClient.get(
          `${baseUrl}/api/services`,
          headers,
          config.timeoutMs,
        );
        if (!resp.ok) return { ok: false, error: `HA API returned ${resp.status}` };

        const raw = (await resp.json()) as Array<{
          domain: string;
          services: Record<string, { description?: string }>;
        }>;

        const services: HaService[] = [];
        for (const entry of raw) {
          if (domain && entry.domain !== domain) continue;
          if (BLOCKED_DOMAINS.has(entry.domain)) continue;

          for (const [name, info] of Object.entries(entry.services)) {
            services.push({
              domain: entry.domain,
              service: name,
              description: info.description ?? "",
            });
          }
        }

        return { ok: true, data: services };
      } catch (err) {
        return { ok: false, error: `HA API error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },

    async callService(
      domain: string,
      service: string,
      entityId?: string,
      data?: Record<string, unknown>,
    ): Promise<HaResult<string>> {
      if (!config.enabled) return { ok: false, error: "Home Assistant is disabled" };

      const domainErr = validateServiceDomain(domain);
      if (domainErr) return { ok: false, error: domainErr };

      if (entityId) {
        const entityErr = validateEntityId(entityId);
        if (entityErr) return { ok: false, error: entityErr };
      }

      try {
        const body: Record<string, unknown> = { ...data };
        if (entityId) body.entity_id = entityId;

        const resp = await httpClient.post(
          `${baseUrl}/api/services/${domain}/${service}`,
          body,
          headers,
          config.timeoutMs,
        );

        if (!resp.ok) return { ok: false, error: `HA API returned ${resp.status}` };

        return { ok: true, data: `Service ${domain}.${service} called successfully` };
      } catch (err) {
        return { ok: false, error: `HA API error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
}

// ── Tool definitions ──

export function getHomeAssistantToolDefinitions(): readonly {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}[] {
  return [
    {
      name: "ha_list_entities",
      description: "List Home Assistant entities, optionally filtered by domain or area.",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Entity domain filter (e.g., 'light', 'sensor')." },
          area: { type: "string", description: "Area name filter (e.g., 'kitchen', 'bedroom')." },
        },
      },
    },
    {
      name: "ha_get_state",
      description: "Get the detailed state of a single Home Assistant entity.",
      parameters: {
        type: "object",
        properties: {
          entity_id: { type: "string", description: "Entity ID (e.g., 'light.living_room')." },
        },
        required: ["entity_id"],
      },
    },
    {
      name: "ha_list_services",
      description: "List available Home Assistant services, optionally filtered by domain.",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Service domain filter (e.g., 'light', 'climate')." },
        },
      },
    },
    {
      name: "ha_call_service",
      description: "Call a Home Assistant service to control a device.",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Service domain (e.g., 'light', 'climate')." },
          service: { type: "string", description: "Service name (e.g., 'turn_on', 'set_temperature')." },
          entity_id: { type: "string", description: "Target entity ID." },
          data: {
            type: "object",
            description: "Additional service data (e.g., brightness, temperature).",
          },
        },
        required: ["domain", "service"],
      },
    },
  ];
}
