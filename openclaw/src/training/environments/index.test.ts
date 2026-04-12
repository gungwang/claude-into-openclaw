import { describe, expect, it, vi } from "vitest";
import {
  createLocalEnvironment,
  createEnvironment,
  DEFAULT_ENV_CONFIG,
  type ChildProcessSpawner,
  type EnvironmentConfig,
} from "./index.js";

function createMockSpawner(exitCode = 0, stdout = "", stderr = ""): ChildProcessSpawner {
  return {
    exec: vi.fn().mockResolvedValue({
      exitCode,
      stdout,
      stderr,
    }),
  };
}

function localConfig(overrides?: Partial<EnvironmentConfig>): EnvironmentConfig {
  return { ...DEFAULT_ENV_CONFIG, type: "local", ...overrides };
}

describe("createLocalEnvironment", () => {
  it("creates an environment with expected interface", () => {
    const spawner = createMockSpawner();
    const env = createLocalEnvironment(localConfig(), spawner);
    expect(env).toHaveProperty("execute");
    expect(env).toHaveProperty("cleanup");
    expect(env).toHaveProperty("isReady");
    expect(env).toHaveProperty("getCwd");
    expect(env).toHaveProperty("setCwd");
  });

  it("executes commands via the spawner", async () => {
    const spawner = createMockSpawner(0, "hello\n");
    const env = createLocalEnvironment(localConfig(), spawner);
    const result = await env.execute("echo hello");
    expect(spawner.exec).toHaveBeenCalled();
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("hello");
  });

  it("reports ready when echo ok succeeds", async () => {
    const spawner = createMockSpawner(0, "ok");
    const env = createLocalEnvironment(localConfig(), spawner);
    expect(await env.isReady()).toBe(true);
  });

  it("tracks working directory", () => {
    const spawner = createMockSpawner();
    const env = createLocalEnvironment(localConfig({ cwd: "/home/user" }), spawner);
    expect(env.getCwd()).toBe("/home/user");
    env.setCwd("/tmp");
    expect(env.getCwd()).toBe("/tmp");
  });
});

describe("createEnvironment factory", () => {
  const spawner = createMockSpawner();

  it("creates local environment", () => {
    const env = createEnvironment({ ...DEFAULT_ENV_CONFIG, type: "local" }, spawner);
    expect(env).toBeDefined();
    expect(env.type).toBe("local");
  });

  it("creates docker environment", () => {
    const env = createEnvironment(
      { ...DEFAULT_ENV_CONFIG, type: "docker", dockerImage: "ubuntu:latest" },
      spawner,
    );
    expect(env).toBeDefined();
    expect(env.type).toBe("docker");
  });

  it("creates ssh environment", () => {
    const env = createEnvironment(
      { ...DEFAULT_ENV_CONFIG, type: "ssh", sshHost: "remote.server", sshUser: "root" },
      spawner,
    );
    expect(env).toBeDefined();
    expect(env.type).toBe("ssh");
  });
});
