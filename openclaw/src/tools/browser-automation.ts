/**
 * Browser Automation Suite (Track E — Advanced Tools)
 *
 * Provides 10 browser automation tools with a pluggable provider backend.
 * Supports Browserbase (cloud), Firecrawl (extraction), and local Chromium
 * via an accessibility-tree-based page representation ideal for LLM agents.
 *
 * Ported from hermes-agent `tools/browser_tool.py` and `tools/browser_providers/`.
 * Adapted to TypeScript with provider abstraction and lazy initialization.
 */

// ── Provider abstraction ──

export type BrowserProviderKind = "local" | "browserbase" | "firecrawl" | "browser-use";

export type BrowserProviderConfig = {
  kind: BrowserProviderKind;
  /** API key for cloud providers. */
  apiKey?: string;
  /** Project ID (Browserbase). */
  projectId?: string;
  /** Base URL override for cloud APIs. */
  baseUrl?: string;
  /** Enable residential proxies (Browserbase). */
  proxies?: boolean;
  /** Enable advanced stealth mode (Browserbase). */
  advancedStealth?: boolean;
  /** Session timeout (ms). Default: 600_000. */
  sessionTimeoutMs?: number;
};

export type BrowserSession = {
  id: string;
  provider: BrowserProviderKind;
  taskId: string;
  createdAt: number;
  lastAccessedAt: number;
};

export type PageSnapshot = {
  /** Accessibility tree text representation. */
  accessibilityTree: string;
  /** Page title. */
  title: string;
  /** Current URL. */
  url: string;
  /** Approximate token count for the snapshot. */
  tokens: number;
};

export type BrowserActionResult = {
  ok: boolean;
  content: string;
  snapshot?: PageSnapshot;
  error?: string;
};

/**
 * Abstract browser provider interface.
 * Implementations handle the actual browser interaction.
 */
export type BrowserProvider = {
  readonly kind: BrowserProviderKind;
  /** Initialize a session for a task. */
  createSession(taskId: string): Promise<BrowserSession>;
  /** Close and clean up a session. */
  closeSession(sessionId: string): Promise<void>;
  /** Navigate to a URL. */
  navigate(sessionId: string, url: string): Promise<BrowserActionResult>;
  /** Get current page snapshot (accessibility tree). */
  snapshot(sessionId: string): Promise<PageSnapshot>;
  /** Click an element by ref selector (e.g., "@e5"). */
  click(sessionId: string, selector: string): Promise<BrowserActionResult>;
  /** Type text into the focused element or a selector. */
  type(sessionId: string, text: string, selector?: string): Promise<BrowserActionResult>;
  /** Scroll the page. */
  scroll(sessionId: string, direction: "up" | "down", amount?: number): Promise<BrowserActionResult>;
  /** Go back in browser history. */
  back(sessionId: string): Promise<BrowserActionResult>;
  /** Press a keyboard key. */
  pressKey(sessionId: string, key: string): Promise<BrowserActionResult>;
  /** Get all images on the page with alt text and URLs. */
  getImages(sessionId: string): Promise<BrowserActionResult>;
  /** Describe the page visually using vision model (if available). */
  describeVisual(sessionId: string, question?: string): Promise<BrowserActionResult>;
  /** Get console logs from the page. */
  getConsole(sessionId: string): Promise<BrowserActionResult>;
};

// ── Browser automation config ──

export type BrowserAutomationConfig = {
  /** Enable browser tools. Default: false (opt-in). */
  enabled: boolean;
  /** Default provider. Default: "local". */
  defaultProvider: BrowserProviderKind;
  /** Provider-specific configs. */
  providers: Partial<Record<BrowserProviderKind, BrowserProviderConfig>>;
  /** Max concurrent sessions. Default: 3. */
  maxConcurrentSessions: number;
  /** Session idle timeout (ms). Default: 300_000. */
  sessionIdleTimeoutMs: number;
  /** URL allowlist patterns (glob). Empty = all allowed. */
  urlAllowPatterns: readonly string[];
  /** URL blocklist patterns (glob). */
  urlBlockPatterns: readonly string[];
};

export const DEFAULT_BROWSER_CONFIG: BrowserAutomationConfig = {
  enabled: false,
  defaultProvider: "local",
  providers: {},
  maxConcurrentSessions: 3,
  sessionIdleTimeoutMs: 300_000,
  urlAllowPatterns: [],
  urlBlockPatterns: [
    "*.internal.*",
    "localhost:*",
    "127.0.0.1:*",
    "*.local:*",
  ],
};

// ── Tool names ──

export const BROWSER_TOOL_NAMES = [
  "browser_navigate",
  "browser_snapshot",
  "browser_click",
  "browser_type",
  "browser_scroll",
  "browser_back",
  "browser_press",
  "browser_get_images",
  "browser_vision",
  "browser_console",
] as const;

export type BrowserToolName = (typeof BROWSER_TOOL_NAMES)[number];

// ── Tool definitions (JSON Schema for LLM tool calling) ──

export type ToolDefinition = {
  name: BrowserToolName;
  description: string;
  parameters: Record<string, unknown>;
};

export function getBrowserToolDefinitions(): readonly ToolDefinition[] {
  return [
    {
      name: "browser_navigate",
      description: "Navigate the browser to a URL. Returns a page snapshot.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to navigate to." },
        },
        required: ["url"],
      },
    },
    {
      name: "browser_snapshot",
      description: "Get the current page content as an accessibility tree snapshot.",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "browser_click",
      description: "Click an element on the page using its ref selector (e.g., @e5).",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "Element ref selector (e.g., @e5)." },
        },
        required: ["selector"],
      },
    },
    {
      name: "browser_type",
      description: "Type text into an input field, optionally targeting a specific selector.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Text to type." },
          selector: { type: "string", description: "Optional element ref selector." },
        },
        required: ["text"],
      },
    },
    {
      name: "browser_scroll",
      description: "Scroll the page up or down.",
      parameters: {
        type: "object",
        properties: {
          direction: { type: "string", enum: ["up", "down"], description: "Scroll direction." },
          amount: { type: "number", description: "Scroll amount in pixels." },
        },
        required: ["direction"],
      },
    },
    {
      name: "browser_back",
      description: "Navigate back in browser history.",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "browser_press",
      description: "Press a keyboard key (e.g., Enter, Tab, Escape).",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Key to press (e.g., Enter, Tab)." },
        },
        required: ["key"],
      },
    },
    {
      name: "browser_get_images",
      description: "List all images on the page with alt text and URLs.",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "browser_vision",
      description: "Describe the current page visually using a vision model.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "Optional question about the page." },
        },
      },
    },
    {
      name: "browser_console",
      description: "Get console logs from the current browser page.",
      parameters: { type: "object", properties: {} },
    },
  ];
}

// ── Session manager ──

export type BrowserSessionManager = {
  /** Get or create a session for a task. */
  getSession(taskId: string): Promise<BrowserSession>;
  /** Execute a browser tool by name. */
  executeTool(
    toolName: BrowserToolName,
    taskId: string,
    params: Record<string, unknown>,
  ): Promise<BrowserActionResult>;
  /** Close all sessions and clean up. */
  closeAll(): Promise<void>;
  /** Get active session count. */
  activeCount(): number;
};

/**
 * Create a browser session manager.
 *
 * The manager lazily initializes browser sessions per task and routes
 * tool calls to the configured provider. Sessions are cleaned up on idle
 * timeout or explicit close.
 */
export function createBrowserSessionManager(
  config: BrowserAutomationConfig,
  providerFactory: (kind: BrowserProviderKind) => BrowserProvider,
): BrowserSessionManager {
  const sessions = new Map<string, BrowserSession>();
  let provider: BrowserProvider | undefined;

  function getProvider(): BrowserProvider {
    if (!provider) {
      provider = providerFactory(config.defaultProvider);
    }
    return provider;
  }

  function isUrlAllowed(url: string): boolean {
    // Block patterns take precedence
    for (const pattern of config.urlBlockPatterns) {
      if (matchGlob(pattern, url)) return false;
    }
    // If allow patterns defined, URL must match at least one
    if (config.urlAllowPatterns.length > 0) {
      return config.urlAllowPatterns.some((p) => matchGlob(p, url));
    }
    return true;
  }

  return {
    async getSession(taskId: string): Promise<BrowserSession> {
      let session = sessions.get(taskId);
      if (session) {
        session.lastAccessedAt = Date.now();
        return session;
      }

      if (sessions.size >= config.maxConcurrentSessions) {
        // Evict oldest idle session
        let oldest: BrowserSession | undefined;
        for (const s of sessions.values()) {
          if (!oldest || s.lastAccessedAt < oldest.lastAccessedAt) {
            oldest = s;
          }
        }
        if (oldest) {
          await getProvider().closeSession(oldest.id);
          sessions.delete(oldest.taskId);
        }
      }

      session = await getProvider().createSession(taskId);
      sessions.set(taskId, session);
      return session;
    },

    async executeTool(
      toolName: BrowserToolName,
      taskId: string,
      params: Record<string, unknown>,
    ): Promise<BrowserActionResult> {
      if (!config.enabled) {
        return { ok: false, content: "", error: "Browser tools are disabled" };
      }

      const session = await this.getSession(taskId);
      const p = getProvider();

      switch (toolName) {
        case "browser_navigate": {
          const url = String(params.url ?? "");
          if (!isUrlAllowed(url)) {
            return { ok: false, content: "", error: `URL blocked by policy: ${url}` };
          }
          return p.navigate(session.id, url);
        }
        case "browser_snapshot":
          return { ok: true, content: "", snapshot: await p.snapshot(session.id) };
        case "browser_click":
          return p.click(session.id, String(params.selector ?? ""));
        case "browser_type":
          return p.type(
            session.id,
            String(params.text ?? ""),
            params.selector ? String(params.selector) : undefined,
          );
        case "browser_scroll":
          return p.scroll(
            session.id,
            (params.direction as "up" | "down") ?? "down",
            params.amount as number | undefined,
          );
        case "browser_back":
          return p.back(session.id);
        case "browser_press":
          return p.pressKey(session.id, String(params.key ?? ""));
        case "browser_get_images":
          return p.getImages(session.id);
        case "browser_vision":
          return p.describeVisual(
            session.id,
            params.question ? String(params.question) : undefined,
          );
        case "browser_console":
          return p.getConsole(session.id);
      }
    },

    async closeAll(): Promise<void> {
      const p = getProvider();
      for (const session of sessions.values()) {
        try {
          await p.closeSession(session.id);
        } catch {
          // Non-fatal — best-effort cleanup
        }
      }
      sessions.clear();
    },

    activeCount(): number {
      return sessions.size;
    },
  };
}

// ── Helpers ──

/** Simple glob matching for URL patterns. */
function matchGlob(pattern: string, url: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  try {
    return new RegExp(`^${escaped}$`, "i").test(url);
  } catch {
    return false;
  }
}
