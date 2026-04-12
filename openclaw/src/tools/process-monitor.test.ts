import { describe, expect, it, vi } from "vitest";
import {
  createProcessMonitor,
  getProcessMonitorToolDefinitions,
  type ProcessMonitorConfig,
} from "./process-monitor.js";

describe("getProcessMonitorToolDefinitions", () => {
  it("returns tool definitions array", () => {
    const defs = getProcessMonitorToolDefinitions();
    expect(Array.isArray(defs)).toBe(true);
    expect(defs.length).toBeGreaterThan(0);
    for (const def of defs) {
      expect(def).toHaveProperty("name");
      expect(def).toHaveProperty("description");
    }
  });
});

describe("createProcessMonitor", () => {
  const config: ProcessMonitorConfig = {
    maxProcesses: 5,
    defaultTimeoutMs: 30_000,
    watchPatterns: [],
  };

  it("creates a monitor with expected interface", () => {
    const monitor = createProcessMonitor(config);
    expect(monitor).toHaveProperty("spawn");
    expect(monitor).toHaveProperty("poll");
    expect(monitor).toHaveProperty("kill");
    expect(monitor).toHaveProperty("list");
  });

  it("lists no processes initially", () => {
    const monitor = createProcessMonitor(config);
    expect(monitor.list()).toEqual([]);
  });
});
