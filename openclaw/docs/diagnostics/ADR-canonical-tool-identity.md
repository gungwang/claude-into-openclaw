# ADR: Canonical Tool Identity (PR-1 Scaffold)

- **Status:** Accepted (initial scaffold)
- **Date:** 2026-04-01
- **Scope:** Tool identity metadata and ambiguity diagnostics only

## Context

OpenClaw supports a growing set of built-in and plugin-provided tools. Human-facing names are useful, but they are not globally unique at scale. Name collisions and repeated display names make diagnostics and audits harder.

PR-1 introduces a low-risk identity scaffold that does **not** change routing or execution behavior.

## Decision

Add a canonical identity model for tools with these fields:

- `id` (stable, machine-readable, namespaced)
- `displayName`
- `namespace` (`core|plugin|skill|provider|local`)
- `capabilityClass` (`read|write|execute|network|messaging|scheduling|other`)
- optional `version` and `sourceDigest`

### Fallback canonical ID derivation

When no explicit ID is supplied, derive a stable fallback:

- Core tools: `core:<toolName>`
- Plugin tools: `plugin:<pluginId>:<toolName>`
- Provider tools: `provider:<providerId>:<toolName>`

Normalization is lowercase and token-safe.

## PR-1 behavior

PR-1 is diagnostics-only:

- Detect duplicate canonical IDs
- Detect ambiguous display names that map to multiple canonical IDs
- Emit warnings via existing logging paths

No tool dispatch, policy enforcement, or execution semantics change in PR-1.

## Non-goals (PR-1)

- No routing enforcement by canonical ID
- No CLI/API schema changes for tool invocation
- No hard-fail behavior for ambiguity

## Follow-up path

Future phases can add:

1. Canonical ID exposure in diagnostics/catalog APIs
2. Route explainability keyed by canonical ID
3. Optional strict mode for identity collisions
4. Tool maturity/trust reporting keyed by canonical ID

## Risk and mitigation

- **Risk:** additional metadata overhead  
  **Mitigation:** auto-derive fallback IDs and keep explicit fields optional initially.

- **Risk:** warning noise in mixed plugin environments  
  **Mitigation:** warnings are deterministic and scoped to identity ambiguity/collision only.
