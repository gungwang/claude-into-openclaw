/**
 * Plugin Context Engine Replacement API (Track D — Plugin Enhancements)
 *
 * Allows plugins to register a custom context engine that replaces (or
 * augments) the default retrieval strategy. Enables specialized RAG,
 * vector search, or domain-specific context assembly.
 *
 * Ported from hermes-agent `hermes_cli/plugins.py` (register_context_engine).
 * Adapted to TypeScript with the single-engine constraint and type safety.
 */

// ── Types ──

/**
 * A context retrieval request from the agent.
 */
export type ContextQuery = {
  /** The user or system text that triggered retrieval. */
  query: string;
  /** Current working directory for file-based retrieval. */
  cwd: string;
  /** Maximum tokens to return. */
  maxTokens: number;
  /** Optional file path filter (glob patterns). */
  filePatterns?: readonly string[];
  /** Optional metadata hints from the agent. */
  hints?: Readonly<Record<string, string>>;
};

/**
 * A single context item returned by the engine.
 */
export type ContextItem = {
  /** Source identifier (file path, URL, etc.). */
  source: string;
  /** The content to inject into the prompt. */
  content: string;
  /** Approximate token count. */
  tokens: number;
  /** Relevance score (0–1, higher = more relevant). */
  relevance: number;
  /** Optional metadata. */
  metadata?: Readonly<Record<string, unknown>>;
};

/**
 * Result from a context retrieval call.
 */
export type ContextRetrievalResult = {
  items: readonly ContextItem[];
  totalTokens: number;
  truncated: boolean;
  engineName: string;
  durationMs: number;
};

/**
 * A context engine implementation.
 * Plugins provide this to replace the default retrieval.
 */
export type ContextEngine = {
  /** Unique name for this engine. */
  readonly name: string;
  /** Human-readable description. */
  readonly description: string;
  /** Retrieve context items for a query. */
  retrieve(query: ContextQuery): Promise<ContextRetrievalResult>;
  /** Optional: warm up / initialize the engine. */
  initialize?(): Promise<void>;
  /** Optional: clean up resources. */
  dispose?(): Promise<void>;
};

/**
 * Registry that manages context engine replacement.
 * Only one engine can be active at a time.
 */
export type ContextEngineRegistry = {
  /** Register a context engine from a plugin. Returns false if one is already registered. */
  register(pluginId: string, engine: ContextEngine): boolean;
  /** Unregister the engine from a specific plugin. */
  unregister(pluginId: string): boolean;
  /** Get the active engine (or undefined if using default). */
  getActive(): ContextEngine | undefined;
  /** Get the plugin ID that registered the active engine. */
  getActivePluginId(): string | undefined;
  /** Whether a custom engine is registered. */
  hasCustomEngine(): boolean;
  /** Retrieve context via the active engine (or return empty if none). */
  retrieve(query: ContextQuery): Promise<ContextRetrievalResult>;
};

export function createContextEngineRegistry(): ContextEngineRegistry {
  let activeEngine: ContextEngine | undefined;
  let activePluginId: string | undefined;

  return {
    register(pluginId: string, engine: ContextEngine): boolean {
      if (activeEngine !== undefined) {
        // Only one context engine allowed
        return false;
      }

      // Validate engine has required methods
      if (typeof engine.retrieve !== "function" || !engine.name) {
        return false;
      }

      activeEngine = engine;
      activePluginId = pluginId;
      return true;
    },

    unregister(pluginId: string): boolean {
      if (activePluginId !== pluginId) return false;

      // Best-effort dispose
      if (activeEngine?.dispose) {
        activeEngine.dispose().catch(() => {});
      }

      activeEngine = undefined;
      activePluginId = undefined;
      return true;
    },

    getActive(): ContextEngine | undefined {
      return activeEngine;
    },

    getActivePluginId(): string | undefined {
      return activePluginId;
    },

    hasCustomEngine(): boolean {
      return activeEngine !== undefined;
    },

    async retrieve(query: ContextQuery): Promise<ContextRetrievalResult> {
      if (!activeEngine) {
        return {
          items: [],
          totalTokens: 0,
          truncated: false,
          engineName: "none",
          durationMs: 0,
        };
      }

      const start = performance.now();
      try {
        const result = await activeEngine.retrieve(query);
        return {
          ...result,
          durationMs: performance.now() - start,
        };
      } catch (err) {
        return {
          items: [],
          totalTokens: 0,
          truncated: false,
          engineName: activeEngine.name,
          durationMs: performance.now() - start,
        };
      }
    },
  };
}

// ── Fallback context engine (default behavior) ──

/**
 * Creates a simple file-based context engine as a fallback.
 * This demonstrates the ContextEngine interface and provides
 * basic file content retrieval.
 */
export function createFileContextEngine(
  readFileFn: (path: string) => Promise<string>,
): ContextEngine {
  return {
    name: "file-context",
    description: "Default file-based context retrieval using direct file reads",

    async retrieve(query: ContextQuery): Promise<ContextRetrievalResult> {
      const start = performance.now();
      const items: ContextItem[] = [];
      let totalTokens = 0;

      // If file patterns are provided, attempt to read those files
      if (query.filePatterns && query.filePatterns.length > 0) {
        for (const pattern of query.filePatterns) {
          if (totalTokens >= query.maxTokens) break;

          try {
            const content = await readFileFn(pattern);
            const tokens = Math.ceil(content.length / 4);
            const cappedTokens = Math.min(tokens, query.maxTokens - totalTokens);

            items.push({
              source: pattern,
              content: tokens > cappedTokens
                ? content.slice(0, cappedTokens * 4) + "\n[...truncated]"
                : content,
              tokens: cappedTokens,
              relevance: 0.5,
            });

            totalTokens += cappedTokens;
          } catch {
            // File not readable — skip
          }
        }
      }

      return {
        items,
        totalTokens,
        truncated: totalTokens >= query.maxTokens,
        engineName: "file-context",
        durationMs: performance.now() - start,
      };
    },
  };
}
