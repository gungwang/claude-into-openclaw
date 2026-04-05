# OpenClaw Build Issues & Fixes — 2026-04-05

## Environment

- **Project:** `openclaw@2026.4.1-beta.1`
- **Bundler:** rolldown v1.0.0-rc.12
- **TypeScript:** tsc (plugin-sdk DTS build)
- **Package Manager:** pnpm v10.32.1 (installed via Corepack)
- **Node:** v22.22.0
- **OS:** Ubuntu 22.04 (Linux)

---

## Issue 1: Unresolved import `./policy-reason-codes.js`

### Error

```
[UNRESOLVED_IMPORT] Error: Could not resolve './policy-reason-codes.js' in src/node-host/exec-policy.ts

 5 │ } from "./policy-reason-codes.js";
   │        ─────────────┬────────────
   │                     ╰────────────── Module not found.
```

The rolldown bundler could not resolve a relative import. The import chain leading to this file:

```
src/entry.ts
  → src/cli/run-main.ts
    → src/cli/program/register.subclis.ts
      → src/cli/node-cli.ts
        → src/cli/node-cli/register.ts
          → src/node-host/runner.ts
            → src/node-host/invoke.ts
              → src/node-host/invoke-system-run.ts
                → src/node-host/exec-policy.ts  ← broken import here
```

### Root Cause

`src/node-host/exec-policy.ts` imported `./policy-reason-codes.js` — expecting the file to be in `src/node-host/`. The actual file is at `src/agents/policy-reason-codes.ts`.

### Fix

**File:** `src/node-host/exec-policy.ts` (line 5)

```diff
- } from "./policy-reason-codes.js";
+ } from "../agents/policy-reason-codes.js";
```

### Verification

Other files in the codebase correctly import from `src/agents/policy-reason-codes.js`:

| File | Import Path |
|------|-------------|
| `src/agents/tool-policy.ts` | `./policy-reason-codes.js` |
| `src/agents/tool-policy-pipeline.ts` | `./policy-reason-codes.js` |
| `src/agents/pi-tools.before-tool-call.ts` | `./policy-reason-codes.js` |
| `src/gateway/server-methods/tools-diagnostics.ts` | `../../agents/policy-reason-codes.js` |

All of these resolve correctly to `src/agents/policy-reason-codes.ts`.

---

## Issue 2: Cannot find module `../../agents/session-event-journal.js`

### Error

After fixing Issue 1, rolldown succeeded but the TypeScript DTS build (`tsc -p tsconfig.plugin-sdk.dts.json`) failed:

```
src/agents/pi-embedded-runner/run/params.ts(150,20): error TS2307:
  Cannot find module '../../agents/session-event-journal.js' or its corresponding type declarations.
```

### Root Cause

`src/agents/pi-embedded-runner/run/params.ts` used a dynamic `import()` type:

```ts
journal?: import("../../agents/session-event-journal.js").SessionEventJournal;
```

Path resolution from `src/agents/pi-embedded-runner/run/`:

- `../../` resolves up to `src/agents/`
- Then `agents/session-event-journal.js` would resolve to `src/agents/agents/session-event-journal.js` — which doesn't exist.

The actual file is `src/agents/session-event-journal.ts`, which is already two directories up from the importing file.

### Fix

**File:** `src/agents/pi-embedded-runner/run/params.ts` (line 150)

```diff
- journal?: import("../../agents/session-event-journal.js").SessionEventJournal;
+ journal?: import("../../session-event-journal.js").SessionEventJournal;
```

### Verification

Other files correctly import the same module:

| File | Import Path |
|------|-------------|
| `src/agents/journal-integration.ts` | `./session-event-journal.js` |
| `src/agents/session-event-journal.test.ts` | `./session-event-journal.js` |
| `src/gateway/server-methods/tools-diagnostics.ts` | `../../agents/session-event-journal.js` |

---

## Build Result After Fixes

```
✔ rolldown v1.0.0-rc.12 Finished in 122.76 ms
OK: All 4 required plugin-sdk exports verified.
[copy-hook-metadata] Copied 4 hook metadata files.
[copy-export-html-templates] Copied 5 export-html assets.
```

Full build succeeded with no errors.

---

## Additional Note: pnpm Install Warnings

During `pnpm install`, numerous `ECONNRESET` / `ETIMEDOUT` warnings appeared for platform-specific optional packages (darwin, win32, android, arm64, riscv64 binaries for sharp, esbuild, canvas, node-pty, etc.). These are **harmless** — pnpm retried automatically and the install completed successfully (`Done in 4.5s`). The warnings indicate unstable network connectivity to `registry.npmjs.org`, not a project configuration issue.

To reduce these warnings on flaky networks:

```sh
pnpm install --fetch-retries 5 --network-timeout 120000
```

---

## pnpm Installation (Prerequisite)

pnpm was not initially available on the system. Installed via Node.js Corepack (Node v22.22.0):

```sh
corepack enable
corepack prepare pnpm@latest --activate
```

This activated pnpm v10.33.0 globally without needing `npm install -g pnpm`.
