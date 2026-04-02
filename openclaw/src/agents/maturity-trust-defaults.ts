/**
 * Default maturity + trust entries for OpenClaw core tools.
 *
 * This is the machine-readable artifact from which docs capability tables
 * are generated. Keep this in sync with tool-catalog.ts.
 */

import type { ToolMaturityEntry } from "./maturity-trust.js";

export const CORE_TOOL_MATURITY_ENTRIES: ToolMaturityEntry[] = [
  // ── Files ──
  { toolId: "read", displayName: "Read", maturityLevel: 4, trust: { source: "core", vetting: "verified" }, capabilities: ["read"] },
  { toolId: "write", displayName: "Write", maturityLevel: 4, trust: { source: "core", vetting: "verified" }, capabilities: ["write"] },
  { toolId: "edit", displayName: "Edit", maturityLevel: 4, trust: { source: "core", vetting: "verified" }, capabilities: ["write"] },
  { toolId: "apply_patch", displayName: "Apply Patch", maturityLevel: 3, trust: { source: "core", vetting: "verified" }, capabilities: ["write"], notes: "OpenAI provider only" },

  // ── Runtime ──
  { toolId: "exec", displayName: "Exec", maturityLevel: 4, trust: { source: "core", vetting: "verified" }, capabilities: ["execute"] },
  { toolId: "process", displayName: "Process", maturityLevel: 4, trust: { source: "core", vetting: "verified" }, capabilities: ["execute"] },
  { toolId: "code_execution", displayName: "Code Execution", maturityLevel: 2, trust: { source: "core", vetting: "reviewed" }, capabilities: ["execute"], notes: "Sandboxed remote analysis" },

  // ── Web ──
  { toolId: "web_search", displayName: "Web Search", maturityLevel: 4, trust: { source: "core", vetting: "verified" }, capabilities: ["network"] },
  { toolId: "web_fetch", displayName: "Web Fetch", maturityLevel: 4, trust: { source: "core", vetting: "verified" }, capabilities: ["network"] },
  { toolId: "x_search", displayName: "X Search", maturityLevel: 2, trust: { source: "core", vetting: "reviewed" }, capabilities: ["network"] },

  // ── Memory ──
  { toolId: "memory_search", displayName: "Memory Search", maturityLevel: 3, trust: { source: "core", vetting: "verified" }, capabilities: ["read"] },
  { toolId: "memory_get", displayName: "Memory Get", maturityLevel: 3, trust: { source: "core", vetting: "verified" }, capabilities: ["read"] },

  // ── Sessions ──
  { toolId: "sessions_list", displayName: "Sessions List", maturityLevel: 4, trust: { source: "core", vetting: "verified" }, capabilities: ["read"] },
  { toolId: "sessions_history", displayName: "Sessions History", maturityLevel: 4, trust: { source: "core", vetting: "verified" }, capabilities: ["read"] },
  { toolId: "sessions_send", displayName: "Sessions Send", maturityLevel: 4, trust: { source: "core", vetting: "verified" }, capabilities: ["messaging"] },
  { toolId: "sessions_spawn", displayName: "Sessions Spawn", maturityLevel: 4, trust: { source: "core", vetting: "verified" }, capabilities: ["execute"] },
  { toolId: "sessions_yield", displayName: "Sessions Yield", maturityLevel: 3, trust: { source: "core", vetting: "verified" }, capabilities: ["scheduling"] },
  { toolId: "subagents", displayName: "Sub-agents", maturityLevel: 3, trust: { source: "core", vetting: "verified" }, capabilities: ["execute"] },
  { toolId: "session_status", displayName: "Session Status", maturityLevel: 4, trust: { source: "core", vetting: "verified" }, capabilities: ["read"] },

  // ── UI ──
  { toolId: "browser", displayName: "Browser", maturityLevel: 2, trust: { source: "core", vetting: "reviewed" }, capabilities: ["network"], notes: "Requires plugin" },
  { toolId: "canvas", displayName: "Canvas", maturityLevel: 3, trust: { source: "core", vetting: "verified" }, capabilities: ["other"] },

  // ── Messaging ──
  { toolId: "message", displayName: "Message", maturityLevel: 4, trust: { source: "core", vetting: "verified" }, capabilities: ["messaging"] },

  // ── Automation ──
  { toolId: "cron", displayName: "Cron", maturityLevel: 4, trust: { source: "core", vetting: "verified" }, capabilities: ["scheduling"] },
  { toolId: "gateway", displayName: "Gateway", maturityLevel: 3, trust: { source: "core", vetting: "verified" }, capabilities: ["execute"] },

  // ── Nodes ──
  { toolId: "nodes", displayName: "Nodes", maturityLevel: 3, trust: { source: "core", vetting: "verified" }, capabilities: ["network", "execute"] },

  // ── Agents ──
  { toolId: "agents_list", displayName: "Agents List", maturityLevel: 3, trust: { source: "core", vetting: "verified" }, capabilities: ["read"] },

  // ── Media ──
  { toolId: "image", displayName: "Image", maturityLevel: 3, trust: { source: "core", vetting: "verified" }, capabilities: ["read"] },
  { toolId: "image_generate", displayName: "Image Generate", maturityLevel: 3, trust: { source: "core", vetting: "verified" }, capabilities: ["network"] },
  { toolId: "tts", displayName: "TTS", maturityLevel: 3, trust: { source: "core", vetting: "verified" }, capabilities: ["messaging"] },
];
