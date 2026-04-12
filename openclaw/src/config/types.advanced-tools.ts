/**
 * Advanced Tools Config Types (Track E)
 *
 * Configuration for browser automation, mixture-of-agents,
 * voice/TTS, process monitoring, and Home Assistant integration.
 */

// ── Browser automation ──

export type BrowserAutomationConfig = {
  /** Enable browser automation tools. Default: false. */
  enabled?: boolean;
  /** Browser provider backend. Default: "playwright". */
  provider?: "playwright" | "puppeteer" | "external";
  /** Maximum concurrent browser sessions. Default: 3. */
  maxSessions?: number;
  /** Session idle timeout (ms). Default: 300_000 (5 min). */
  sessionTimeoutMs?: number;
  /** Default navigation timeout (ms). Default: 30_000. */
  navigationTimeoutMs?: number;
  /** URL allow-list patterns (glob). Empty = allow all. */
  urlAllowPatterns?: string[];
  /** URL block-list patterns (glob). Takes priority over allow. */
  urlBlockPatterns?: string[];
  /** Run browser in headless mode. Default: true. */
  headless?: boolean;
};

// ── Mixture of Agents ──

export type MixtureOfAgentsConfig = {
  /** Enable MoA tool. Default: false. */
  enabled?: boolean;
  /** Reference model IDs for parallel consultation. */
  referenceModels?: string[];
  /** Aggregator model ID (synthesizes final response). */
  aggregatorModel?: string;
  /** Timeout for individual reference model calls (ms). Default: 30_000. */
  referenceTimeoutMs?: number;
  /** Minimum reference responses required before aggregation. Default: 2. */
  minReferenceResponses?: number;
  /** Maximum tokens per reference response. Default: 2048. */
  maxReferenceTokens?: number;
};

// ── Voice / TTS ──

export type TtsProvider = "edge" | "elevenlabs" | "openai" | "minimax" | "generic";

export type VoiceTtsConfig = {
  /** Enable TTS tools. Default: false. */
  enabled?: boolean;
  /** TTS provider. Default: "edge". */
  provider?: TtsProvider;
  /** Default voice name. Default: "en-US-AriaNeural" (edge). */
  defaultVoice?: string;
  /** Output format. Default: "mp3". */
  outputFormat?: "mp3" | "wav" | "opus" | "flac";
  /** Sample rate (Hz). Default: 24000. */
  sampleRate?: number;
  /** Provider API key (for non-edge providers). */
  apiKey?: string;
  /** Custom API base URL (for generic provider). */
  apiBaseUrl?: string;
};

// ── Process monitor ──

export type ProcessMonitorConfig = {
  /** Enable background process monitoring. Default: true. */
  enabled?: boolean;
  /** Maximum concurrent managed processes. Default: 10. */
  maxProcesses?: number;
  /** Output buffer size per process (bytes). Default: 204_800 (200KB). */
  outputBufferSize?: number;
  /** Grace period before SIGKILL (ms). Default: 5_000. */
  killGracePeriodMs?: number;
  /** Watch pattern rate-limit interval (ms). Default: 1_000. */
  watchRateLimitMs?: number;
};

// ── Home Assistant ──

export type HomeAssistantToolsConfig = {
  /** Enable Home Assistant tools. Default: false. */
  enabled?: boolean;
  /** HA instance URL. Default from HASS_URL env. */
  url?: string;
  /** Long-lived access token. Default from HASS_TOKEN env. */
  token?: string;
  /** Request timeout (ms). Default: 15_000. */
  timeoutMs?: number;
};

// ── Aggregate advanced tools config ──

export type AdvancedToolsConfig = {
  browserAutomation?: BrowserAutomationConfig;
  mixtureOfAgents?: MixtureOfAgentsConfig;
  voiceTts?: VoiceTtsConfig;
  processMonitor?: ProcessMonitorConfig;
  homeAssistant?: HomeAssistantToolsConfig;
};
