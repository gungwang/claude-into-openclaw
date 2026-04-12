/**
 * Configuration types for Track D — Plugin Enhancements modules.
 *
 * Covers: plugin hook bus, context engine replacement,
 * message injection, and plugin toolset registration.
 */

import type { PluginHookBusConfig } from "../agents/plugin-hooks.js";
import type { MessageInjectorConfig } from "../agents/plugin-message-injection.js";

export type PluginEnhancementsConfig = {
  /** Fault-isolated hook bus for pre/post tool and LLM hooks. */
  hookBus?: Partial<PluginHookBusConfig>;
  /** Message injection into active sessions. */
  messageInjection?: Partial<MessageInjectorConfig>;
  /** Enable context engine replacement by plugins. Default: true. */
  contextEngineReplacement?: boolean;
  /** Enable plugin-registered toolsets. Default: true. */
  pluginToolsets?: boolean;
};
