/**
 * Plugin Hook Bus (Track D — Plugin Enhancements)
 *
 * Provides a fault-isolated hook bus for plugin pre/post tool and LLM hooks.
 * Wraps OpenClaw's existing typed hook system with per-callback fault isolation
 * so one plugin crashing does not bring down others.
 *
 * Ported from hermes-agent `hermes_cli/plugins.py` (invoke_hook, PluginContext).
 * Adapted to TypeScript, leveraging OpenClaw's existing PluginHookName taxonomy.
 *
 * This module does NOT modify the existing hook taxonomy — it provides a
 * higher-level bus that can be used alongside the existing hook runner.
 */

// ── Types ──

/**
 * Hook names supported by the plugin hook bus.
 * These map 1:1 to existing OpenClaw PluginHookName values.
 */
export type PluginBusHookName =
  | "pre_tool_call"
  | "post_tool_call"
  | "pre_llm_call"
  | "post_llm_call"
  | "session_start"
  | "session_end"
  | "session_finalize"
  | "session_reset";

/**
 * Maps plugin bus hook names to OpenClaw PluginHookName equivalents.
 */
export const HOOK_NAME_MAP: Readonly<Record<PluginBusHookName, string>> = {
  pre_tool_call: "before_tool_call",
  post_tool_call: "after_tool_call",
  pre_llm_call: "llm_input",
  post_llm_call: "llm_output",
  session_start: "session_start",
  session_end: "session_end",
  session_finalize: "agent_end",
  session_reset: "before_reset",
};

export type HookCallback<T = unknown> = (payload: T) => void | Promise<void>;

export type HookRegistration = {
  pluginId: string;
  hookName: PluginBusHookName;
  callback: HookCallback;
  priority: number;
};

export type HookInvocationResult = {
  hookName: PluginBusHookName;
  totalCallbacks: number;
  succeeded: number;
  failed: number;
  errors: readonly HookError[];
  durationMs: number;
};

export type HookError = {
  pluginId: string;
  hookName: PluginBusHookName;
  error: string;
};

export type PluginHookBusConfig = {
  /** Enable the hook bus. Default: true. */
  enabled: boolean;
  /** Per-callback timeout (ms). Default: 5_000. */
  callbackTimeoutMs: number;
  /** Continue invoking remaining callbacks after one fails. Default: true. */
  faultIsolated: boolean;
  /** Maximum callbacks per hook. Default: 50. */
  maxCallbacksPerHook: number;
};

export const DEFAULT_PLUGIN_HOOK_BUS_CONFIG: PluginHookBusConfig = {
  enabled: true,
  callbackTimeoutMs: 5_000,
  faultIsolated: true,
  maxCallbacksPerHook: 50,
};

// ── Hook bus ──

export type PluginHookBus = {
  /** Register a hook callback. */
  register(registration: HookRegistration): boolean;
  /** Unregister all hooks for a plugin. */
  unregisterPlugin(pluginId: string): number;
  /** Invoke all callbacks for a hook, with fault isolation. */
  invoke<T = unknown>(hookName: PluginBusHookName, payload: T): Promise<HookInvocationResult>;
  /** Check if any callbacks are registered for a hook. */
  hasCallbacks(hookName: PluginBusHookName): boolean;
  /** Get registration count by hook name. */
  getStats(): Readonly<Record<PluginBusHookName, number>>;
};

export function createPluginHookBus(
  config: PluginHookBusConfig = DEFAULT_PLUGIN_HOOK_BUS_CONFIG,
): PluginHookBus {
  const hooks = new Map<PluginBusHookName, HookRegistration[]>();

  // Initialize all hook buckets
  for (const name of Object.keys(HOOK_NAME_MAP) as PluginBusHookName[]) {
    hooks.set(name, []);
  }

  return {
    register(reg: HookRegistration): boolean {
      if (!config.enabled) return false;

      const bucket = hooks.get(reg.hookName);
      if (!bucket) return false;

      if (bucket.length >= config.maxCallbacksPerHook) return false;

      // Insert sorted by priority (lower = earlier)
      const insertIdx = bucket.findIndex((r) => r.priority > reg.priority);
      if (insertIdx === -1) {
        bucket.push(reg);
      } else {
        bucket.splice(insertIdx, 0, reg);
      }

      return true;
    },

    unregisterPlugin(pluginId: string): number {
      let removed = 0;
      for (const [, bucket] of hooks) {
        const before = bucket.length;
        const filtered = bucket.filter((r) => r.pluginId !== pluginId);
        removed += before - filtered.length;
        bucket.length = 0;
        bucket.push(...filtered);
      }
      return removed;
    },

    async invoke<T = unknown>(
      hookName: PluginBusHookName,
      payload: T,
    ): Promise<HookInvocationResult> {
      const start = performance.now();
      const bucket = hooks.get(hookName);

      if (!config.enabled || !bucket || bucket.length === 0) {
        return {
          hookName,
          totalCallbacks: 0,
          succeeded: 0,
          failed: 0,
          errors: [],
          durationMs: performance.now() - start,
        };
      }

      const errors: HookError[] = [];
      let succeeded = 0;

      for (const reg of bucket) {
        try {
          const result = reg.callback(payload);
          if (result instanceof Promise) {
            await Promise.race([
              result,
              timeout(config.callbackTimeoutMs, reg.pluginId, hookName),
            ]);
          }
          succeeded++;
        } catch (err) {
          errors.push({
            pluginId: reg.pluginId,
            hookName,
            error: err instanceof Error ? err.message : String(err),
          });

          if (!config.faultIsolated) break;
        }
      }

      return {
        hookName,
        totalCallbacks: bucket.length,
        succeeded,
        failed: errors.length,
        errors,
        durationMs: performance.now() - start,
      };
    },

    hasCallbacks(hookName: PluginBusHookName): boolean {
      return (hooks.get(hookName)?.length ?? 0) > 0;
    },

    getStats(): Readonly<Record<PluginBusHookName, number>> {
      const stats = {} as Record<PluginBusHookName, number>;
      for (const [name, bucket] of hooks) {
        stats[name] = bucket.length;
      }
      return stats;
    },
  };
}

// ── Helpers ──

function timeout(
  ms: number,
  pluginId: string,
  hookName: PluginBusHookName,
): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(
      () => reject(new Error(`Plugin "${pluginId}" timed out on hook "${hookName}" after ${ms}ms`)),
      ms,
    );
  });
}

// ── Toolset registration ──

/**
 * A plugin-registered toolset that becomes a first-class citizen
 * in the toolset graph, composable with built-in toolsets.
 */
export type PluginToolset = {
  /** Unique toolset name (e.g., "my-plugin/browser-tools"). */
  name: string;
  /** Human-readable description. */
  description: string;
  /** Plugin that registered this toolset. */
  pluginId: string;
  /** Tool names included in this toolset. */
  tools: readonly string[];
  /** Dependencies on other toolsets. */
  dependencies: readonly string[];
};

export type PluginToolsetRegistry = {
  register(toolset: PluginToolset): boolean;
  get(name: string): PluginToolset | undefined;
  list(): readonly PluginToolset[];
  getToolsForToolset(name: string): readonly string[];
  unregisterPlugin(pluginId: string): number;
};

export function createPluginToolsetRegistry(): PluginToolsetRegistry {
  const toolsets = new Map<string, PluginToolset>();

  return {
    register(toolset: PluginToolset): boolean {
      if (toolsets.has(toolset.name)) return false;
      toolsets.set(toolset.name, toolset);
      return true;
    },

    get(name: string): PluginToolset | undefined {
      return toolsets.get(name);
    },

    list(): readonly PluginToolset[] {
      return [...toolsets.values()];
    },

    getToolsForToolset(name: string): readonly string[] {
      const ts = toolsets.get(name);
      if (!ts) return [];

      // Resolve dependencies recursively (with cycle detection)
      const visited = new Set<string>();
      const tools: string[] = [];

      const resolve = (tsName: string): void => {
        if (visited.has(tsName)) return;
        visited.add(tsName);

        const entry = toolsets.get(tsName);
        if (!entry) return;

        tools.push(...entry.tools);
        for (const dep of entry.dependencies) {
          resolve(dep);
        }
      };

      resolve(name);
      return [...new Set(tools)];
    },

    unregisterPlugin(pluginId: string): number {
      let removed = 0;
      for (const [name, ts] of toolsets) {
        if (ts.pluginId === pluginId) {
          toolsets.delete(name);
          removed++;
        }
      }
      return removed;
    },
  };
}
