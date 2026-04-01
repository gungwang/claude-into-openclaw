/**
 * Route Resolution Benchmark Corpus
 *
 * Deterministic test cases for tool resolution quality regression testing.
 * Each case describes a tool name, session context, and expected outcome.
 *
 * Run against `buildToolResolutionTrace` + `evaluateBenchmarkCase` to verify
 * that policy changes don't silently break expected tool availability.
 */

import type { ToolResolutionBenchmarkCase } from "../agents/route-explainability.js";

export const ROUTE_BENCHMARK_CORPUS: ToolResolutionBenchmarkCase[] = [
  // ── Core tools: always available for owners ──
  {
    id: "core-read-owner",
    description: "read tool is available for owner sessions",
    query: "read",
    context: { senderIsOwner: true },
    expected: { available: true },
  },
  {
    id: "core-write-owner",
    description: "write tool is available for owner sessions",
    query: "write",
    context: { senderIsOwner: true },
    expected: { available: true },
  },
  {
    id: "core-exec-owner",
    description: "exec tool is available for owner sessions",
    query: "exec",
    context: { senderIsOwner: true },
    expected: { available: true },
  },
  {
    id: "core-message-owner",
    description: "message tool is available for owner sessions",
    query: "message",
    context: { senderIsOwner: true },
    expected: { available: true },
  },

  // ── Owner-only tools: denied for non-owners ──
  {
    id: "cron-non-owner",
    description: "cron is owner-only and denied for non-owners",
    query: "cron",
    context: { senderIsOwner: false },
    expected: { available: false },
  },
  {
    id: "gateway-non-owner",
    description: "gateway is owner-only and denied for non-owners",
    query: "gateway",
    context: { senderIsOwner: false },
    expected: { available: false },
  },
  {
    id: "nodes-non-owner",
    description: "nodes is owner-only and denied for non-owners",
    query: "nodes",
    context: { senderIsOwner: false },
    expected: { available: false },
  },

  // ── Message provider filtering ──
  {
    id: "tts-voice-provider",
    description: "tts is denied when message provider is voice",
    query: "tts",
    context: { messageProvider: "voice", senderIsOwner: true },
    expected: { available: false },
  },
  {
    id: "tts-discord-provider",
    description: "tts is available when message provider is discord",
    query: "tts",
    context: { messageProvider: "discord", senderIsOwner: true },
    expected: { available: true },
  },

  // ── Node message provider: only a subset of tools ──
  {
    id: "node-provider-canvas",
    description: "canvas is available for node message provider",
    query: "canvas",
    context: { messageProvider: "node", senderIsOwner: true },
    expected: { available: true },
  },
  {
    id: "node-provider-exec-denied",
    description: "exec is not available for node message provider",
    query: "exec",
    context: { messageProvider: "node", senderIsOwner: true },
    expected: { available: false },
  },

  // ── Session tools ──
  {
    id: "session-status-owner",
    description: "session_status is available for owners",
    query: "session_status",
    context: { senderIsOwner: true },
    expected: { available: true },
  },
  {
    id: "sessions-spawn-owner",
    description: "sessions_spawn is available for owners",
    query: "sessions_spawn",
    context: { senderIsOwner: true },
    expected: { available: true },
  },
];
