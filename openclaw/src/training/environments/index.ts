/**
 * Environment Backends — Execution backend abstraction (Track G — Training Pipeline)
 *
 * Provides a unified interface for executing commands across different
 * compute environments: local, Docker, and SSH.
 * Each backend implements spawn-per-call semantics with CWD persistence.
 *
 * Ported from hermes-agent `tools/environments/base.py`, `local.py`, `docker.py`, `ssh.py`.
 */

// ── Types ──

export type EnvironmentType = "local" | "docker" | "ssh";

export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
};

export type EnvironmentConfig = {
  type: EnvironmentType;
  /** Default command timeout (ms). Default: 60_000. */
  timeoutMs: number;
  /** Working directory. Default: /tmp. */
  cwd: string;
  /** Docker image (for docker type). */
  dockerImage?: string;
  /** Container name prefix (for docker type). */
  dockerContainerPrefix?: string;
  /** SSH host (for ssh type). */
  sshHost?: string;
  /** SSH port (for ssh type). Default: 22. */
  sshPort?: number;
  /** SSH user (for ssh type). */
  sshUser?: string;
  /** SSH identity file path (for ssh type). */
  sshKeyPath?: string;
  /** Environment variables to inject. */
  env?: Record<string, string>;
};

export const DEFAULT_ENV_CONFIG: EnvironmentConfig = {
  type: "local",
  timeoutMs: 60_000,
  cwd: "/tmp",
};

// ── Environment interface ──

export type ExecutionEnvironment = {
  readonly type: EnvironmentType;
  /** Execute a command in this environment. */
  execute(command: string, timeoutMs?: number): Promise<CommandResult>;
  /** Clean up environment resources. */
  cleanup(): Promise<void>;
  /** Check if environment is ready. */
  isReady(): Promise<boolean>;
  /** Get current working directory. */
  getCwd(): string;
  /** Set working directory for subsequent commands. */
  setCwd(cwd: string): void;
};

// ── Child process interface (injectable) ──

export type ChildProcessSpawner = {
  exec(
    command: string,
    options: { cwd?: string; timeout?: number; env?: Record<string, string>; maxBuffer?: number },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
};

// ── Local environment ──

export function createLocalEnvironment(
  config: EnvironmentConfig,
  spawner: ChildProcessSpawner,
): ExecutionEnvironment {
  let cwd = config.cwd;

  return {
    type: "local",

    async execute(command: string, timeoutMs?: number): Promise<CommandResult> {
      const timeout = timeoutMs ?? config.timeoutMs;
      const start = Date.now();

      try {
        const result = await spawner.exec(`bash -c ${escapeShellArg(command)}`, {
          cwd,
          timeout,
          env: { ...process.env, ...config.env },
          maxBuffer: 10 * 1024 * 1024, // 10MB
        });

        return {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          durationMs: Date.now() - start,
          timedOut: false,
        };
      } catch (err) {
        const isTimeout =
          err instanceof Error && err.message.includes("TIMEOUT");
        return {
          stdout: "",
          stderr: err instanceof Error ? err.message : String(err),
          exitCode: isTimeout ? 124 : 1,
          durationMs: Date.now() - start,
          timedOut: isTimeout,
        };
      }
    },

    async cleanup(): Promise<void> {
      // Local env has nothing to clean up
    },

    async isReady(): Promise<boolean> {
      try {
        const result = await this.execute("echo ok", 5000);
        return result.exitCode === 0 && result.stdout.trim() === "ok";
      } catch {
        return false;
      }
    },

    getCwd(): string {
      return cwd;
    },

    setCwd(newCwd: string): void {
      cwd = newCwd;
    },
  };
}

// ── Docker environment ──

export function createDockerEnvironment(
  config: EnvironmentConfig,
  spawner: ChildProcessSpawner,
): ExecutionEnvironment {
  let cwd = config.cwd;
  const image = config.dockerImage ?? "python:3.11-slim";
  const containerName = `${config.dockerContainerPrefix ?? "openclaw"}-${Date.now()}`;
  let containerStarted = false;

  async function ensureContainer(): Promise<void> {
    if (containerStarted) return;

    const envFlags = Object.entries(config.env ?? {})
      .map(([k, v]) => `-e ${escapeShellArg(`${k}=${v}`)}`)
      .join(" ");

    await spawner.exec(
      `docker run -d --name ${containerName} ${envFlags} -w ${escapeShellArg(cwd)} ${image} tail -f /dev/null`,
      { timeout: 30_000 },
    );
    containerStarted = true;
  }

  return {
    type: "docker",

    async execute(command: string, timeoutMs?: number): Promise<CommandResult> {
      await ensureContainer();
      const timeout = timeoutMs ?? config.timeoutMs;
      const start = Date.now();

      try {
        const result = await spawner.exec(
          `docker exec -w ${escapeShellArg(cwd)} ${containerName} bash -c ${escapeShellArg(command)}`,
          { timeout, maxBuffer: 10 * 1024 * 1024 },
        );

        return {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          durationMs: Date.now() - start,
          timedOut: false,
        };
      } catch (err) {
        const isTimeout =
          err instanceof Error && err.message.includes("TIMEOUT");
        return {
          stdout: "",
          stderr: err instanceof Error ? err.message : String(err),
          exitCode: isTimeout ? 124 : 1,
          durationMs: Date.now() - start,
          timedOut: isTimeout,
        };
      }
    },

    async cleanup(): Promise<void> {
      if (!containerStarted) return;
      try {
        await spawner.exec(`docker rm -f ${containerName}`, { timeout: 10_000 });
      } catch {
        // Best effort cleanup
      }
      containerStarted = false;
    },

    async isReady(): Promise<boolean> {
      try {
        await ensureContainer();
        const result = await this.execute("echo ok", 5000);
        return result.exitCode === 0 && result.stdout.trim() === "ok";
      } catch {
        return false;
      }
    },

    getCwd(): string {
      return cwd;
    },

    setCwd(newCwd: string): void {
      cwd = newCwd;
    },
  };
}

// ── SSH environment ──

export function createSshEnvironment(
  config: EnvironmentConfig,
  spawner: ChildProcessSpawner,
): ExecutionEnvironment {
  let cwd = config.cwd;
  const host = config.sshHost ?? "localhost";
  const port = config.sshPort ?? 22;
  const user = config.sshUser ?? "root";
  const keyFlag = config.sshKeyPath ? `-i ${escapeShellArg(config.sshKeyPath)}` : "";

  function sshCommand(cmd: string): string {
    return `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${keyFlag} -p ${port} ${user}@${host} ${escapeShellArg(`cd ${cwd} && ${cmd}`)}`;
  }

  return {
    type: "ssh",

    async execute(command: string, timeoutMs?: number): Promise<CommandResult> {
      const timeout = timeoutMs ?? config.timeoutMs;
      const start = Date.now();

      try {
        const result = await spawner.exec(sshCommand(command), {
          timeout,
          env: config.env,
          maxBuffer: 10 * 1024 * 1024,
        });

        return {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          durationMs: Date.now() - start,
          timedOut: false,
        };
      } catch (err) {
        const isTimeout =
          err instanceof Error && err.message.includes("TIMEOUT");
        return {
          stdout: "",
          stderr: err instanceof Error ? err.message : String(err),
          exitCode: isTimeout ? 124 : 1,
          durationMs: Date.now() - start,
          timedOut: isTimeout,
        };
      }
    },

    async cleanup(): Promise<void> {
      // SSH sessions are stateless per-command; nothing to clean up
    },

    async isReady(): Promise<boolean> {
      try {
        const result = await this.execute("echo ok", 10_000);
        return result.exitCode === 0 && result.stdout.trim() === "ok";
      } catch {
        return false;
      }
    },

    getCwd(): string {
      return cwd;
    },

    setCwd(newCwd: string): void {
      cwd = newCwd;
    },
  };
}

// ── Factory ──

/**
 * Create an execution environment from config.
 */
export function createEnvironment(
  config: EnvironmentConfig,
  spawner: ChildProcessSpawner,
): ExecutionEnvironment {
  switch (config.type) {
    case "local":
      return createLocalEnvironment(config, spawner);
    case "docker":
      return createDockerEnvironment(config, spawner);
    case "ssh":
      return createSshEnvironment(config, spawner);
    default:
      throw new Error(`Unknown environment type: ${config.type}`);
  }
}

// ── Utility ──

function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}
