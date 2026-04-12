import { describe, expect, it, vi } from "vitest";
import {
  createLocalEnvironment,
  createEnvironment,
  type ChildProcessSpawner,
  type ExecutionEnvironment,
} from "./index.js";

function createMockSpawner(exitCode = 0, stdout = "", stderr = ""): ChildProcessSpawner {
  return {
    spawn: vi.fn().mockResolvedValue({
      exitCode,
      stdout,
      stderr,
    }),
  };
}

describe("createLocalEnvironment", () => {
  it("creates an environment with expected interface", () => {
    const spawner = createMockSpawner();
    const env = createLocalEnvironment(spawner);
    expect(env).toHaveProperty("execute");
    expect(env).toHaveProperty("cleanup");
    expect(env).toHaveProperty("isReady");
    expect(env).toHaveProperty("getCwd");
    expect(env).toHaveProperty("setCwd");
  });

  it("executes commands via the spawner", async () => {
    const spawner = createMockSpawner(0, "hello\n");
    const env = createLocalEnvironment(spawner);
    const result = await env.execute("echo hello");
    expect(spawner.spawn).toHaveBeenCalled();
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("hello");
  });

  it("reports ready by default", async () => {
    const spawner = createMockSpawner();
    const env = createLocalEnvironment(spawner);
    expect(await env.isReady()).toBe(true);
  });

  it("tracks working directory", () => {
    const spawner = createMockSpawner();
    const env = createLocalEnvironment(spawner, "/home/user");
    expect(env.getCwd()).toBe("/home/user");
    env.setCwd("/tmp");
    expect(env.getCwd()).toBe("/tmp");
  });
});

describe("createEnvironment factory", () => {
  const spawner = createMockSpawner();

  it("creates local environment", () => {
    const env = createEnvironment("local", spawner);
    expect(env).toBeDefined();
  });

  it("creates docker environment", () => {
    const env = createEnvironment("docker", spawner, { image: "ubuntu:latest" });
    expect(env).toBeDefined();
  });

  it("creates ssh environment", () => {
    const env = createEnvironment("ssh", spawner, { host: "remote.server", user: "root" });
    expect(env).toBeDefined();
  });
});
