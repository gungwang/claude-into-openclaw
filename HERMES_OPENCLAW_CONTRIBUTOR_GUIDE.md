# Hermes → OpenClaw Contributor Guide

> How to add new tools, adapters, security patterns, and training components to the Hermes-ported modules.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Adding a New Tool (Track E)](#adding-a-new-tool-track-e)
3. [Adding a Gateway Adapter (Track F)](#adding-a-gateway-adapter-track-f)
4. [Adding a Security Pattern (Track B)](#adding-a-security-pattern-track-b)
5. [Adding a Plugin Hook (Track D)](#adding-a-plugin-hook-track-d)
6. [Adding a Tool-Call Parser (Track G)](#adding-a-tool-call-parser-track-g)
7. [Adding a Benchmark Environment (Track G)](#adding-a-benchmark-environment-track-g)
8. [Adding a Journal Recorder](#adding-a-journal-recorder)
9. [Coding Conventions](#coding-conventions)
10. [Testing Patterns](#testing-patterns)

---

## Architecture Overview

All Hermes-ported modules follow three invariants:

1. **Injectable dependencies** — External I/O (HTTP, filesystem, SQLite, child_process, crypto) is always passed as a parameter. Modules never import side-effectful packages at the top level.

2. **Factory functions, not classes** — Public API is `createXyz(config, ...deps): XyzInterface`. No `new`, no `this`, no inheritance.

3. **String-literal unions, not enums** — `type Foo = "a" | "b" | "c"` instead of `enum Foo { A, B, C }`. This produces zero runtime code and enables exhaustive pattern matching.

```
src/
├── agents/          # Track A, B, C, D modules
├── tools/           # Track E modules (+ checkpoint-manager from C)
├── channels/
│   └── adapters/    # Track F gateway adapters
├── training/        # Track G pipeline
│   ├── environments/
│   ├── tool-call-parsers/
│   └── benchmarks/
└── config/
    └── types.*.ts   # Per-track configuration types
```

---

## Adding a New Tool (Track E)

Tools are agent-visible capabilities registered via tool definitions.

### Step 1: Create the module

Create `src/tools/<tool-name>.ts`:

```ts
import type { SomeDependency } from "../dependency.js";

// --- Types ---

export type MyToolConfig = {
  enabled: boolean;
  someSetting: string;
};

export type MyToolResult = {
  success: boolean;
  data: string;
};

// --- Injectable interface ---

export type MyExternalClient = {
  doSomething(input: string): Promise<string>;
};

// --- Tool definitions ---

export function getMyToolDefinitions(): readonly {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}[] {
  return [
    {
      name: "my_tool_action",
      description: "Does something useful",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "The input" },
        },
        required: ["input"],
      },
    },
  ] as const;
}

// --- Factory ---

export type MyTool = {
  execute(input: string): Promise<MyToolResult>;
  checkAvailability(): Promise<boolean>;
};

export function createMyTool(
  config: MyToolConfig,
  client: MyExternalClient,
): MyTool {
  return {
    async execute(input) {
      const data = await client.doSomething(input);
      return { success: true, data };
    },
    async checkAvailability() {
      return config.enabled;
    },
  };
}
```

### Step 2: Add config types

Add a section to `src/config/types.advanced-tools.ts`:

```ts
export type MyToolConfig = {
  enabled?: boolean;
  someSetting?: string;
};
```

Then add the field to the parent config type in the same file.

### Step 3: Add journal recorder

In `src/agents/journal-integration.ts`, add:

```ts
export function recordMyToolAction(
  journal: JournalWriter,
  result: { success: boolean; data: string },
): void {
  journal.write({
    kind: "my_tool_action",
    ...result,
  });
}
```

### Step 4: Write tests

Create `tests/tools/<tool-name>.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createMyTool, getMyToolDefinitions } from "../../src/tools/my-tool.js";

describe("my-tool", () => {
  const mockClient = {
    doSomething: async (input: string) => `result: ${input}`,
  };

  it("executes successfully", async () => {
    const tool = createMyTool({ enabled: true, someSetting: "x" }, mockClient);
    const result = await tool.execute("hello");
    expect(result.success).toBe(true);
  });

  it("returns tool definitions", () => {
    const defs = getMyToolDefinitions();
    expect(defs.length).toBeGreaterThan(0);
    expect(defs[0].name).toBe("my_tool_action");
  });
});
```

### Checklist

- [ ] Module exports factory function + types + tool definitions
- [ ] All external deps are injectable parameters
- [ ] Config type added to `types.advanced-tools.ts`
- [ ] Journal recorder added
- [ ] Test file with happy path, error path, availability check
- [ ] Zero `tsc` errors

---

## Adding a Gateway Adapter (Track F)

Gateway adapters connect OpenClaw to messaging platforms.

### Step 1: Create the adapter

Create `src/channels/adapters/<platform>.ts`:

```ts
// --- Config ---
export type PlatformConfig = {
  appId: string;
  appSecret: string;
  webhookToken?: string;
};

// --- Injectable HTTP ---
export type PlatformHttpClient = {
  post<T>(url: string, body: unknown, headers?: Record<string, string>): Promise<T>;
};

// --- Token manager (if platform uses access tokens) ---
export type PlatformTokenManager = {
  getToken(): Promise<string>;
  invalidate(): void;
};

export function createPlatformTokenManager(
  config: PlatformConfig,
  http: PlatformHttpClient,
): PlatformTokenManager {
  let cached: { token: string; expiresAt: number } | null = null;

  return {
    async getToken() {
      if (cached && Date.now() < cached.expiresAt) return cached.token;
      // Fetch new token via http.post(...)
      const resp = await http.post<{ access_token: string; expires_in: number }>(
        "https://api.platform.com/token",
        { appid: config.appId, secret: config.appSecret },
      );
      cached = { token: resp.access_token, expiresAt: Date.now() + resp.expires_in * 1000 - 60_000 };
      return cached.token;
    },
    invalidate() { cached = null; },
  };
}

// --- Client ---
export type PlatformClient = {
  sendText(to: string, content: string): Promise<PlatformResult<void>>;
  sendMarkdown(to: string, content: string): Promise<PlatformResult<void>>;
  parseInboundMessage(body: unknown): PlatformInboundMessage | null;
};

export type PlatformResult<T> = { ok: true; value: T } | { ok: false; error: string };
export type PlatformInboundMessage = { senderId: string; text: string; timestamp: number };

export function createPlatformClient(
  config: PlatformConfig,
  http: PlatformHttpClient,
  tokenManager: PlatformTokenManager,
): PlatformClient {
  // Implementation...
}
```

### Key Patterns

- **Token managers** cache tokens in-memory with TTL, invalidate on auth errors.
- **Crypto helpers** (if the platform requires message signing) are separate exported functions.
- **Inbound parsing** accepts `unknown` and returns `SomeMessage | null` — never throws.
- **Result types** use discriminated unions (`ok: true/false`), not thrown errors.

### Step 2: Add config and journal

Same pattern as tools — add to `types.gateway-expansion.ts` and `journal-integration.ts`.

### Checklist

- [ ] Token manager with TTL caching and `invalidate()`
- [ ] Injectable HTTP client (no `fetch` at module scope)
- [ ] `parseInboundMessage()` returns `null` on invalid input
- [ ] Result type uses `{ ok, value/error }` pattern
- [ ] Config type in `types.gateway-expansion.ts`
- [ ] Journal recorders for sent/received messages
- [ ] Tests with mock HTTP client

---

## Adding a Security Pattern (Track B)

### Adding a threat pattern to skills-guard

Edit `src/agents/skills-guard.ts` and add to the pattern list:

```ts
{
  id: "new_pattern_id",
  severity: "high",         // "critical" | "high" | "medium" | "low"
  category: "exfiltration", // one of the 12 ThreatCategory values
  regex: /your_pattern/gi,
  description: "What this pattern detects",
}
```

### Adding a new threat category

1. Add the category name to the `ThreatCategory` union in `skills-guard.ts`.
2. Add patterns that use the new category.
3. Update the `formatScanReport()` function if the category needs special display.
4. Add test cases covering the new category.

### Adding a new trust level

1. Add to the `TrustLevel` union.
2. Update `shouldAllowInstall()` logic to handle the new level.
3. Document when the new level applies.

---

## Adding a Plugin Hook (Track D)

### Adding a new hook point

1. Add the hook name to the `PluginBusHookName` union in `src/agents/plugin-hooks.ts`:

```ts
type PluginBusHookName =
  | "pre_tool_call" | "post_tool_call"
  | "pre_llm_call" | "post_llm_call"
  | "session_start" | "session_end"
  | "session_finalize" | "session_reset"
  | "your_new_hook";  // ← add here
```

2. Fire the hook at the appropriate point in the agent loop:

```ts
await hookBus.invoke("your_new_hook", { somePayload: "data" });
```

3. Add a journal recorder for the hook invocation (if the hook carries meaningful data).
4. Add tests verifying callback invocation, priority ordering, and fault isolation.

---

## Adding a Tool-Call Parser (Track G)

Parsers extract structured tool calls from raw LLM output text.

### Step 1: Create the parser

In `src/training/tool-call-parsers/index.ts`, add before the auto-registration block:

```ts
const myModelParser: ToolCallParser = {
  name: "my_model",
  parse(text: string): ParseResult {
    // Extract tool calls from text using model-specific patterns
    // Return { content, toolCalls } where toolCalls may be null
    const toolCallRegex = /<tool_call>(.*?)<\/tool_call>/gs;
    const toolCalls: ToolCallParsed[] = [];
    let match: RegExpExecArray | null;

    while ((match = toolCallRegex.exec(text)) !== null) {
      const parsed = JSON.parse(match[1]);
      toolCalls.push({
        id: `call_${toolCalls.length}`,
        type: "function",
        function: { name: parsed.name, arguments: JSON.stringify(parsed.arguments) },
      });
    }

    const content = text.replace(toolCallRegex, "").trim() || null;
    return { content, toolCalls: toolCalls.length > 0 ? toolCalls : null };
  },
};
```

### Step 2: Register

Add to the auto-registration array:

```ts
[hermes, deepseek, /* ... */, myModelParser].forEach(registerParser);
```

### Step 3: Test

Add a test case with real model output samples, verifying:
- Tool calls are extracted correctly.
- Content text is preserved without tool-call markup.
- Malformed tool calls return `null` toolCalls (never throw).

---

## Adding a Benchmark Environment (Track G)

### Step 1: Create the benchmark

```ts
import type {
  BenchmarkEnvironment,
  BenchmarkTask,
  TaskResult,
  BenchmarkSummary,
  TaskAgentRunner,
} from "./index.js";
import type { ExecutionEnvironment } from "../environments/index.js";

export type MyBenchConfig = {
  name: string;
  tasksPath: string;
  timeoutMs?: number;
};

export function createMyBenchmark(config: MyBenchConfig): BenchmarkEnvironment {
  return {
    name: config.name,
    async loadTasks() {
      // Load tasks from config.tasksPath
      return [];
    },
    async runTask(task, env, agentRunner, options) {
      // Execute task, return TaskResult
    },
    async evaluate(env, agentRunner, options) {
      // Run all tasks, return BenchmarkSummary
    },
  };
}
```

### Step 2: Wire into rl-cli

The `runEvaluation()` function in `src/training/rl-cli.ts` accepts any `BenchmarkEnvironment` — pass your new benchmark as the first argument.

---

## Adding a Journal Recorder

All tracks emit structured events to the OpenClaw journal. To add a new recorder:

```ts
// In src/agents/journal-integration.ts

export function recordMyEvent(
  journal: JournalWriter,
  data: {
    field1: string;
    field2: number;
    success: boolean;
  },
): void {
  journal.write({
    kind: "my_event",
    ...data,
  });
}
```

**Conventions:**
- Function name: `record<PascalCaseEvent>`
- Event kind: `snake_case_event`
- Keep payloads flat (no nested objects deeper than 1 level).
- Include a `success` or `ok` boolean where applicable.
- Update the journal event table in `HERMES_OPENCLAW_TECHNICAL_REFERENCE.md`.

---

## Coding Conventions

### Imports

```ts
// ✅ Type-only imports for types
import type { SomeType } from "../module.js";

// ✅ .js suffix on all relative imports (ESM)
import { someFunction } from "../module.js";

// ❌ No .ts suffix
import { someFunction } from "../module.ts";

// ❌ No barrel imports from parent directories
import { a, b, c } from "../index.js";
```

### Types

```ts
// ✅ String-literal union
type Status = "active" | "paused" | "exhausted";

// ❌ Enum
enum Status { Active, Paused, Exhausted }

// ✅ Branded config state (Readonly + required fields)
type ValidatedConfig = Readonly<Required<RawConfig>>;

// ✅ Discriminated union for results
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
```

### Functions

```ts
// ✅ Factory function returning interface
export function createFoo(config: FooConfig, dep: SomeDep): FooInterface {
  return { /* methods */ };
}

// ❌ Class with constructor
export class Foo {
  constructor(private config: FooConfig) {}
}

// ✅ Pure functions for stateless operations
export function parseSomething(input: string): ParsedOutput { }

// ✅ Async only when truly async
export async function fetchData(client: HttpClient): Promise<Data> { }
export function computeHash(data: string): string { } // sync — no async
```

### Error Handling

```ts
// ✅ Return result types at boundaries
function doThing(): Result<string> {
  if (bad) return { ok: false, error: "reason" };
  return { ok: true, value: "data" };
}

// ✅ Try-catch for fault isolation in hooks/callbacks
try {
  await callback(payload);
} catch {
  // Log, continue — don't propagate
}

// ❌ Throw for expected conditions
if (!found) throw new Error("Not found"); // Use Result instead
```

---

## Testing Patterns

### Structure

```
tests/
├── agents/       # Tracks A, B, C, D tests
├── tools/        # Track E tests (+ checkpoint-manager)
├── channels/     # Track F tests
└── training/     # Track G tests
```

### Conventions

```ts
import { describe, it, expect, vi } from "vitest";

describe("module-name", () => {
  // Group by feature or function
  describe("functionName", () => {
    it("handles the happy path", () => { });
    it("returns error on invalid input", () => { });
    it("uses default config when none provided", () => { });
  });
});
```

### Mock Pattern

All external dependencies are injectable — pass mocks directly:

```ts
// ✅ Direct mock injection
const mockHttp = {
  post: async () => ({ ok: true }),
};
const client = createClient(config, mockHttp);

// ❌ Module-level mocking
vi.mock("node-fetch");
```

### What to Test

| Category | Examples |
|----------|---------|
| Happy path | Valid input → expected output |
| Error path | Invalid input → error result (not thrown) |
| Defaults | Missing config fields → sensible defaults |
| Edge cases | Empty arrays, zero values, Unicode, very long strings |
| Fault isolation | Callback throws → caller survives |

### Running Tests

```bash
# All tests
pnpm test

# Specific track
pnpm test tests/agents/error-classifier.test.ts

# Watch mode
pnpm test --watch
```

---

## Quick Reference

| I want to add... | Track | Key files to modify |
|---|---|---|
| New agent tool | E | `src/tools/`, `types.advanced-tools.ts`, `journal-integration.ts` |
| New gateway adapter | F | `src/channels/adapters/`, `types.gateway-expansion.ts`, `journal-integration.ts` |
| New threat pattern | B | `src/agents/skills-guard.ts` |
| New plugin hook | D | `src/agents/plugin-hooks.ts` |
| New tool-call parser | G | `src/training/tool-call-parsers/index.ts` |
| New benchmark | G | `src/training/benchmarks/index.ts` |
| New execution env | G | `src/training/environments/index.ts` |
| New journal event | — | `src/agents/journal-integration.ts` |
| New config section | — | `src/config/types.<track>.ts` |
