# Add Copilot Agents to OpenClaw ACP Runtime

## Goal
Enable OpenClaw to use agent profiles found in:

- `~/.copilot/agents/*.agent.md`

as callable ACP agents (or provide a reliable fallback path when direct IDs are not resolvable).

---

## What was observed

### 1) Initial blocker
When attempting to spawn ACP sessions (`sessions_spawn` with `runtime: "acp"`), OpenClaw returned:

- `ACP runtime backend is not configured. Install and enable the acpx runtime plugin.`

### 2) ACPX plugin state
`openclaw plugins list` showed:

- `ACPX Runtime (id: acpx)` was **disabled**.

### 3) Fix applied
Enabled ACPX plugin:

```bash
openclaw plugins enable acpx
```

Then verified:

```bash
openclaw plugins inspect acpx
```

Result:

- `Status: loaded`

### 4) Post-fix behavior
- `agentId: copilot` → works (accepted, completes successfully).
- Custom IDs from `~/.copilot/agents` (e.g. `debug`, `planner`, `drupal-expert`, `expert-nextjs-developer`, `expert-react-frontend-engineer`) → fail with:
  - `-32603: Failed to spawn agent command: <agent-id>`

So ACP runtime is healthy, but custom agent names are not auto-registered as OpenClaw ACP `agentId`s.

---

## Technical root cause

OpenClaw ACP runtime (`acpx` extension) can resolve agent commands in two ways:

1. Built-in names (e.g. `codex`, `claude`, `copilot`, etc.)
2. User-defined overrides from `acpx config show` under `.agents.<name>.command`

Important detail:

- Files like `~/.copilot/agents/*.agent.md` are Copilot-side profile descriptors.
- OpenClaw does **not** automatically convert those filenames into ACP `agentId`s.
- Therefore, using `sessions_spawn` with `agentId: debug` fails unless ACPX is configured to map `debug` to a real executable command.

---

## Recommended solution

## Option A (fastest, working now)
Use:

- `agentId: "copilot"`

and pass the intended profile/rules in the task prompt.

Example:

```json
{
  "runtime": "acp",
  "agentId": "copilot",
  "task": "Use the debug profile behavior from ~/.copilot/agents/debug.agent.md and diagnose ..."
}
```

Pros: immediate, no additional ACPX command mapping needed.

---

## Option B (structured custom IDs)
Define ACPX agent overrides so names like `debug`, `planner`, etc. resolve to concrete commands.

### Step 1: initialize ACPX config (if needed)

```bash
acpx config init
```

### Step 2: inspect current config

```bash
acpx config show
```

### Step 3: add agent command mappings

Add entries under `agents` that map each alias to a **real ACP-capable command** in your environment.

Template:

```json
{
  "agents": {
    "debug": {
      "command": "<your-acp-capable-command>"
    },
    "planner": {
      "command": "<your-acp-capable-command>"
    },
    "drupal-expert": {
      "command": "<your-acp-capable-command>"
    },
    "expert-nextjs-developer": {
      "command": "<your-acp-capable-command>"
    },
    "expert-react-frontend-engineer": {
      "command": "<your-acp-capable-command>"
    }
  }
}
```

> Important: in this host check, `copilot --help` output did **not** expose ACP flags in the captured snippet, so do not hardcode `copilot --acp --stdio` unless `copilot <subcommand> --help` explicitly confirms ACP mode on your installed version.
> If ACP mode is unavailable in your Copilot CLI build, keep using `agentId: "copilot"` via OpenClaw ACP bridge and encode profile behavior in prompt text.
### Step 4: restart gateway

```bash
openclaw gateway restart
```

(If restart exits non-zero, confirm service health with `openclaw gateway status` and continue if runtime is active.)

### Step 5: validate from OpenClaw

Probe each ID with `sessions_spawn` (runtime `acp`) and verify it no longer returns `Failed to spawn agent command`.

---

## Validation checklist

- [x] `acpx` plugin enabled in OpenClaw
- [x] `openclaw plugins inspect acpx` => loaded
- [x] `agentId: copilot` successful end-to-end
- [ ] custom IDs mapped in ACPX config
- [ ] custom IDs validated via `sessions_spawn`

---

## Troubleshooting

### Error
`ACP runtime backend is not configured`

### Fix
Enable plugin:

```bash
openclaw plugins enable acpx
```

Then restart/check gateway.

### Error
`Failed to spawn agent command: <name>`

### Meaning
Agent name is not resolvable by ACPX (no built-in and no valid override).

### Fix
Add `acpx config` agent mapping for `<name>`.

---

## Practical recommendation

For reliability and lower operational complexity:

1. Keep OpenClaw ACP `agentId` as `copilot` for most runs.
2. Encode role/profile (`debug`, `planner`, `drupal-expert`, etc.) in the task prompt.
3. Only add custom ACPX command aliases when you truly need separate executable routes.

---

## Commands used in this diagnosis

```bash
openclaw status
openclaw plugins list
openclaw plugins enable acpx
openclaw plugins inspect acpx
openclaw gateway status
copilot --help
```

ACPX capability indicators seen from help output include:

```bash
acpx config show
acpx config init
acpx --agent ./my-custom-server "do something"
```

Copilot CLI snippet captured here showed general controls (URL allow/deny, init), so ACP subcommand/flags should be verified explicitly on the installed version before using it as an ACPX mapped command.
---

## Final status

- ACP runtime integration is enabled and functional.
- Copilot ACP agent is confirmed working.
- Custom `.agent.md` names are not automatically callable as OpenClaw `agentId`s without ACPX mapping.
