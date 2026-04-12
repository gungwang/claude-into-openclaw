/**
 * Mattermost channel adapter (Track F — Gateway Platforms)
 *
 * Open-source Slack alternative integration via REST API and WebSocket.
 * Supports personal access token and bot account authentication.
 *
 * Ported from hermes-agent `gateway/platforms/mattermost.py`.
 */

// ── Types ──

export type MattermostConfig = {
  /** Enable Mattermost adapter. */
  enabled: boolean;
  /** Mattermost server URL (e.g., https://mattermost.example.com). */
  serverUrl: string;
  /** Personal access token or bot token. */
  token: string;
  /** Default channel ID to post to (optional). */
  defaultChannelId: string;
  /** Request timeout (ms). */
  timeoutMs: number;
  /** WebSocket reconnect interval (ms). */
  wsReconnectMs: number;
};

export const DEFAULT_MATTERMOST_CONFIG: MattermostConfig = {
  enabled: false,
  serverUrl: process.env.MATTERMOST_URL ?? "",
  token: process.env.MATTERMOST_TOKEN ?? "",
  defaultChannelId: process.env.MATTERMOST_CHANNEL_ID ?? "",
  timeoutMs: 15_000,
  wsReconnectMs: 5_000,
};

export type MattermostPost = {
  id: string;
  channelId: string;
  userId: string;
  message: string;
  createAt: number;
  rootId?: string;
};

export type MattermostUser = {
  id: string;
  username: string;
  nickname: string;
  email: string;
};

export type MattermostResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; statusCode?: number };

// ── HTTP client interface ──

export type MattermostHttpClient = {
  get(url: string, headers: Record<string, string>, timeoutMs?: number): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
  post(url: string, body: unknown, headers: Record<string, string>, timeoutMs?: number): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
  put(url: string, body: unknown, headers: Record<string, string>, timeoutMs?: number): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
};

// ── Client ──

export type MattermostClient = {
  getMe(): Promise<MattermostResult<MattermostUser>>;
  createPost(channelId: string, message: string, rootId?: string): Promise<MattermostResult<MattermostPost>>;
  updatePost(postId: string, message: string): Promise<MattermostResult<MattermostPost>>;
  getPost(postId: string): Promise<MattermostResult<MattermostPost>>;
  getChannelPosts(channelId: string, limit?: number): Promise<MattermostResult<readonly MattermostPost[]>>;
  parseWebSocketEvent(data: unknown): MattermostPost | null;
};

export function createMattermostClient(
  config: MattermostConfig,
  http: MattermostHttpClient,
): MattermostClient {
  const baseUrl = config.serverUrl.replace(/\/$/, "");
  const apiUrl = `${baseUrl}/api/v4`;
  const headers = {
    Authorization: `Bearer ${config.token}`,
    "Content-Type": "application/json",
  };

  function parsePost(raw: Record<string, unknown>): MattermostPost {
    return {
      id: String(raw.id ?? ""),
      channelId: String(raw.channel_id ?? ""),
      userId: String(raw.user_id ?? ""),
      message: String(raw.message ?? ""),
      createAt: Number(raw.create_at ?? 0),
      ...(raw.root_id ? { rootId: String(raw.root_id) } : {}),
    };
  }

  return {
    async getMe(): Promise<MattermostResult<MattermostUser>> {
      try {
        const resp = await http.get(`${apiUrl}/users/me`, headers, config.timeoutMs);
        if (!resp.ok) return { ok: false, error: `API returned ${resp.status}`, statusCode: resp.status };

        const data = (await resp.json()) as Record<string, unknown>;
        return {
          ok: true,
          data: {
            id: String(data.id ?? ""),
            username: String(data.username ?? ""),
            nickname: String(data.nickname ?? ""),
            email: String(data.email ?? ""),
          },
        };
      } catch (err) {
        return { ok: false, error: `Mattermost error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },

    async createPost(channelId: string, message: string, rootId?: string): Promise<MattermostResult<MattermostPost>> {
      try {
        const body: Record<string, unknown> = { channel_id: channelId, message };
        if (rootId) body.root_id = rootId;

        const resp = await http.post(`${apiUrl}/posts`, body, headers, config.timeoutMs);
        if (!resp.ok) return { ok: false, error: `API returned ${resp.status}`, statusCode: resp.status };

        const data = (await resp.json()) as Record<string, unknown>;
        return { ok: true, data: parsePost(data) };
      } catch (err) {
        return { ok: false, error: `Mattermost error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },

    async updatePost(postId: string, message: string): Promise<MattermostResult<MattermostPost>> {
      try {
        const resp = await http.put(
          `${apiUrl}/posts/${postId}`,
          { id: postId, message },
          headers,
          config.timeoutMs,
        );
        if (!resp.ok) return { ok: false, error: `API returned ${resp.status}`, statusCode: resp.status };

        const data = (await resp.json()) as Record<string, unknown>;
        return { ok: true, data: parsePost(data) };
      } catch (err) {
        return { ok: false, error: `Mattermost error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },

    async getPost(postId: string): Promise<MattermostResult<MattermostPost>> {
      try {
        const resp = await http.get(`${apiUrl}/posts/${postId}`, headers, config.timeoutMs);
        if (!resp.ok) return { ok: false, error: `API returned ${resp.status}`, statusCode: resp.status };

        const data = (await resp.json()) as Record<string, unknown>;
        return { ok: true, data: parsePost(data) };
      } catch (err) {
        return { ok: false, error: `Mattermost error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },

    async getChannelPosts(
      channelId: string,
      limit: number = 30,
    ): Promise<MattermostResult<readonly MattermostPost[]>> {
      try {
        const resp = await http.get(
          `${apiUrl}/channels/${channelId}/posts?per_page=${limit}`,
          headers,
          config.timeoutMs,
        );
        if (!resp.ok) return { ok: false, error: `API returned ${resp.status}`, statusCode: resp.status };

        const data = (await resp.json()) as { order?: string[]; posts?: Record<string, Record<string, unknown>> };
        const posts = (data.order ?? []).map((id) => parsePost(data.posts?.[id] ?? { id }));
        return { ok: true, data: posts };
      } catch (err) {
        return { ok: false, error: `Mattermost error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },

    parseWebSocketEvent(data: unknown): MattermostPost | null {
      if (!data || typeof data !== "object") return null;
      const d = data as Record<string, unknown>;

      if (d.event !== "posted") return null;

      const rawData = d.data as Record<string, unknown> | undefined;
      if (!rawData?.post) return null;

      try {
        const post = typeof rawData.post === "string" ? JSON.parse(rawData.post) : rawData.post;
        return parsePost(post as Record<string, unknown>);
      } catch {
        return null;
      }
    },
  };
}

// ── WebSocket URL helper ──

export function buildMattermostWsUrl(config: MattermostConfig): string {
  const base = config.serverUrl.replace(/\/$/, "");
  const wsBase = base.replace(/^http/, "ws");
  return `${wsBase}/api/v4/websocket`;
}
