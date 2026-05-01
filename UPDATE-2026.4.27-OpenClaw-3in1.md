# OpenClaw 2026.4.27 Update Report (3-in-1)

Date: 2026-04-30

## Scope

This update combined three pieces of work completed today:

1. Merged the newest upstream OpenClaw into the custom monorepo subtree.
2. Rebuilt and revalidated the embedded OpenClaw checkout.
3. Investigated why the Control UI still showed an older version and refreshed the running gateway service.

## Repositories And Runtime Context

- Custom repo root: `/home/wang/projects/claud-code-src/claw-code`
- Embedded OpenClaw subtree: `/home/wang/projects/claud-code-src/claw-code/openclaw`
- Upstream OpenClaw repo: `/home/wang/projects/openclaw-origin/openclaw`
- Upstream source commit used for sync: `359d871293e801dc9e5506b5002a4bf545c42662`
- Final embedded runtime version after rebuild: `2026.4.27`

## Final Outcome

- The embedded OpenClaw subtree was updated to upstream `2026.4.27`.
- The merge was split into two reviewable commits.
- The project rebuilt successfully.
- Focused tests and a CLI smoke test passed.
- The running gateway service on port `18789` was refreshed and now reports `v2026.4.27`.
- The health endpoint responded successfully after restart.

## 1. Upstream Merge Work

### Goal

Bring the latest upstream OpenClaw code into the custom subtree without losing custom integrations and diagnostics work.

### Technical Strategy

Direct `git merge` was not viable because the embedded `openclaw/` directory is a subtree inside the custom monorepo rather than an independent Git repository with shared active history.

The merge was completed with a scratch replay workflow:

1. Use the historical subtree import anchor as the merge base.
2. Generate the custom delta relative to that anchor.
3. Replay that delta onto the latest upstream tree in a scratch location.
4. Use reject files to isolate only the real overlap conflicts.
5. Sync the merged scratch tree back into the embedded `openclaw/` subtree.
6. Manually reconcile the small set of files that were half-merged or semantically conflicted.

### Manually Reconciled Files

- `openclaw/README.md`
- `openclaw/src/agents/pi-embedded-runner/run.ts`
- `openclaw/src/agents/tool-policy-pipeline.ts`
- `openclaw/src/agents/tool-policy.ts`
- `openclaw/src/plugins/tools.ts`
- `openclaw/src/plugins/tools.optional.test.ts`

### Key Merge Details

- `README.md` was cleaned up after the bulk sync left broken sections and partially merged content.
- `run.ts` was repaired to keep custom journal instrumentation while fitting the new upstream control flow.
- `tool-policy-pipeline.ts` and `tool-policy.ts` were repaired so policy decision records and deny metadata remained coherent.
- `tools.ts` and `tools.optional.test.ts` were repaired to preserve plugin tool metadata fields such as `namespace` and `canonicalIdHint`.

### Issues Encountered During Merge

#### Issue: direct merge approach did not fit subtree layout

Problem:
The embedded OpenClaw directory was not a standalone repo, so a normal upstream merge path was not reliable.

Solution:
Used a patch replay workflow against a scratch upstream checkout, then synced the result back into the subtree.

#### Issue: replay produced overlap rejects in a few files

Problem:
Several files were already partially merged, so replaying the custom delta created reject hunks instead of a clean apply.

Solution:
Triaged only the true overlap files and repaired them manually instead of reworking the full subtree.

#### Issue: initial build failures after manual repair

Problem:
The first pass introduced a misplaced `recordCompactionEnd` call and one nullability issue around `terminalPayloads`.

Solution:
- Moved `recordCompactionEnd` into the correct timeout-compaction block.
- Changed the outbound payload iteration to `terminalPayloads ?? []`.

### Reviewable Commits Created

1. `9343139a` `chore(openclaw): sync embedded OpenClaw to upstream 359d871`
2. `e427a085` `fix(openclaw): restore custom overlap resolutions`

The first commit contains the large upstream subtree sync.
The second commit contains only the small manual reconciliation layer.

## 2. Rebuild And Validation Work

### Goal

Confirm that the freshly merged embedded OpenClaw tree builds and still passes its most relevant targeted checks.

### Build Result

The rebuild completed successfully with exit code `0`.

Key generated outputs included:

- `openclaw/dist/build-info.json`
- `openclaw/dist/cli-startup-metadata.json`
- `openclaw/dist/cli/daemon-cli.js`
- `openclaw/dist/canvas-host/a2ui/a2ui.bundle.js`
- refreshed `dist/plugin-sdk/*` and `packages/plugin-sdk/dist/*` artifacts

Representative artifact metadata after the rebuild:

- Version in `dist/build-info.json`: `2026.4.27`
- Commit in `dist/build-info.json`: `e427a085259db5c49c7383879af7516b598c1be6`
- Build timestamp in `dist/build-info.json`: `2026-05-01T00:04:24.012Z`

### Tests Run

Focused regression suite passed:

- `src/plugins/tools.optional.test.ts`
- `src/agents/journal-integration.test.ts`
- `src/agents/route-explainability.test.ts`
- `src/agents/tool-identity.test.ts`

CLI smoke test passed:

- `src/cli/program.smoke.test.ts`

### Issues Encountered During Rebuild/Run

#### Issue: first `pnpm start` launched in the wrong directory

Problem:
One start attempt executed from `~/.openclaw` instead of the repo root and failed with `ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND`.

Solution:
Reran using an explicit repo path:

`pnpm --dir /home/wang/projects/claud-code-src/claw-code/openclaw start`

#### Issue: shell wrapper/noisy prompt output obscured command results

Problem:
`oh-my-zsh` prompt noise and shell state made some terminal results look incomplete.

Solution:
Re-ran commands with explicit `command ...` calls and log redirection when needed.

## 3. Control UI Version Investigation

### User-Visible Symptom

The Control UI page at `http://127.0.0.1:18789/sessions` still showed an older `2026.4.1.x` version even after the project had been rebuilt to `2026.4.27`.

### Root Cause

The running process on port `18789` was not the freshly launched local TUI process. It was the long-running user `systemd` gateway service:

- Unit: `~/.config/systemd/user/openclaw-gateway.service`
- Port owner: `127.0.0.1:18789`
- Old unit metadata before refresh:
  - `Description=OpenClaw Gateway (v2026.4.1-beta.1)`
  - `Environment=OPENCLAW_SERVICE_VERSION=2026.4.1-beta.1`

So the new code had been built, but the actively serving gateway service still had stale metadata and had not yet been refreshed from the rebuilt repo.

### Additional Detail

The Control UI version text is driven by the gateway snapshot/update banner path, not only by the raw `/health` endpoint. That is why the browser could still show an older version banner even while a separate local run had been rebuilt successfully.

### Fix Applied

The gateway service was reinstalled from the rebuilt repo and restarted:

- `pnpm openclaw gateway install --force`
- `pnpm openclaw gateway restart`

After that:

- `systemctl --user status openclaw-gateway` reported `OpenClaw Gateway (v2026.4.27)`
- the on-disk unit file showed:
  - `Description=OpenClaw Gateway (v2026.4.27)`
  - `Environment=OPENCLAW_SERVICE_VERSION=2026.4.27`
- `curl http://127.0.0.1:18789/health` returned `{"ok":true,"status":"live"}`

### Service-Related Note

During the refreshed startup, the gateway rewrote the runtime config and created a backup:

- Active config: `/home/wang/.openclaw/openclaw.json`
- Backup created by gateway startup: `/home/wang/.openclaw/openclaw.json.bak`

No editor errors were reported for the active config after the rewrite.

## Commands Used Today

### Upstream Merge And Commit Packaging

```bash
cd /home/wang/projects/claud-code-src/claw-code
git diff --name-only -- openclaw
diff -rq openclaw /tmp/openclaw-merge-scratch-359d871/openclaw --exclude .git --exclude node_modules --exclude '*.rej'
git add -A -- openclaw
git commit -m "chore(openclaw): sync embedded OpenClaw to upstream 359d871"
git add -- openclaw/README.md \
  openclaw/src/agents/pi-embedded-runner/run.ts \
  openclaw/src/agents/tool-policy-pipeline.ts \
  openclaw/src/agents/tool-policy.ts \
  openclaw/src/plugins/tools.ts \
  openclaw/src/plugins/tools.optional.test.ts
git commit -m "fix(openclaw): restore custom overlap resolutions"
```

### Build And Test

```bash
cd /home/wang/projects/claud-code-src/claw-code/openclaw
pnpm docs:list
pnpm build
pnpm test -- src/plugins/tools.optional.test.ts \
  src/agents/journal-integration.test.ts \
  src/agents/route-explainability.test.ts \
  src/agents/tool-identity.test.ts
pnpm test -- src/cli/program.smoke.test.ts
pnpm ui:build
```

### Runtime / Artifact Inspection

```bash
find dist dist-runtime packages/plugin-sdk/dist -type f -printf '%TY-%Tm-%Td %TT %p\n' | sort | tail -n 40
ls -lh dist/canvas-host/a2ui/a2ui.bundle.js \
  dist/cli/daemon-cli.js \
  dist/build-info.json \
  dist/cli-startup-metadata.json
curl -sS http://127.0.0.1:18789/health
ss -ltnp '( sport = :18789 )'
systemctl --user status openclaw-gateway --no-pager -l
journalctl --user -u openclaw-gateway.service -n 80 --no-pager
```

### Gateway Service Refresh

```bash
cd /home/wang/projects/claud-code-src/claw-code/openclaw
pnpm openclaw gateway install --force
pnpm openclaw gateway restart
```

## Important Technical Notes

- The rebuild itself was correct before the UI issue was fixed.
- The wrong thing was running: the browser was connected to the persistent gateway service, not to the just-built one-off local process.
- The UI version mismatch was operational, not a source-merge failure.
- The refreshed service now points at the rebuilt repo `dist/index.js` and carries `OPENCLAW_SERVICE_VERSION=2026.4.27`.
- Generated build artifacts were intentionally kept out of Git diff review because they are ignored outputs rather than source changes.
- Sensitive environment values present in the service environment were intentionally redacted from this report.

## Current Status At End Of Session

- Embedded OpenClaw source: updated
- Embedded OpenClaw build: successful
- Focused regression tests: passed
- CLI smoke test: passed
- UI bundle rebuild: successful
- Gateway service metadata: refreshed to `2026.4.27`
- Gateway health endpoint: live

## Recommended Follow-Up

1. Hard refresh the browser page for the Control UI after the service restart.
2. If an older banner still appears, inspect the specific UI field again rather than assuming the backend is stale.
3. Review the backup config file if any runtime config changes were unexpected.