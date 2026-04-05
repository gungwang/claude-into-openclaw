# Running Fix After Build (2026-04-05)

## Summary
Today we fixed a version mismatch where the OpenClaw **gateway service** was already running a local dev build, but the `openclaw` CLI command in shell was still using an older global install.

---

## Fixed Issue

### Symptom
`openclaw status` reported:
- Config/gateway related components at newer build (`2026.4.1-beta.1`)
- CLI version at older build (`2026.3.28`)

### Root Cause
Two different OpenClaw entrypoints were being used:
1. **Gateway systemd service** was started from local source build (`dist/index.js` in repo)
2. **Shell `openclaw` binary on PATH** pointed to globally installed npm package (`2026.3.28`)

This created a mixed-version runtime.

---

## Solution Applied

### 1) Verified the mismatch
Checked:
- `which openclaw`
- `readlink -f $(which openclaw)`
- `openclaw --version`
- `systemctl --user cat openclaw-gateway.service`
- `systemctl --user status openclaw-gateway.service`

Findings:
- PATH binary was old global install
- systemd service `ExecStart` already referenced local build from:
  - `/home/wang/projects/claud-code-src/claw-code/openclaw/dist/index.js`

### 2) Re-pointed CLI to local build
Executed from repo:

```bash
cd /home/wang/projects/claud-code-src/claw-code/openclaw
[ -f dist/index.js ] || pnpm build
npm link
hash -r
```

### 3) Verified final state
- `which openclaw` → `/home/wang/.nvm/versions/node/v22.22.0/bin/openclaw`
- `readlink -f $(which openclaw)` → `/home/wang/projects/claud-code-src/claw-code/openclaw/openclaw.mjs`
- `openclaw --version` → `OpenClaw 2026.4.1-beta.1 (1eea719)`

Result: CLI and gateway now aligned to the same local dev build.

---

## Technical Details

- **Source repo used:**
  `/home/wang/projects/claud-code-src/claw-code/openclaw`
- **Target version:**
  `2026.4.1-beta.1`
- **Gateway service unit:**
  `~/.config/systemd/user/openclaw-gateway.service`
- **Service description observed:**
  `OpenClaw Gateway (v2026.4.1-beta.1)`
- **Service was active/running during fix.**

### Why this happens
Common in local development when:
- A global npm install remains on PATH
- Service is pinned to local source build
- CLI command is not linked to local package

### Recommended practice (dev workflow)
For local OpenClaw dev iterations:
1. Build local repo (`pnpm build`)
2. Link CLI (`npm link` in repo)
3. Confirm with `openclaw --version` and `readlink -f $(which openclaw)`
4. Keep service `ExecStart` pointing to local `dist/index.js`

---

## Status After Fix
- ✅ CLI version aligned to local build
- ✅ Gateway service aligned to local build
- ✅ Version mismatch resolved
