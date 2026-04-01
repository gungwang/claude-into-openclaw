---
name: Good First Issue - Canonical registry IDs
about: Starter task for Track A
title: "[Good First Issue] Add canonical IDs to registry entries"
labels: [good first issue, enhancement, governance]
assignees: []
---

## Objective

Add stable, namespaced IDs to command or tool registry entries.

## Why This Matters

The spec identifies duplicate-name pressure as a core scaling problem. Canonical IDs are the first step toward safer routing and better audits.

## Suggested Scope

- Identify the command/tool registry structures
- Add an `id` field to one registry path
- Reject or flag duplicate IDs in one validation path

## Acceptance Criteria

- At least one registry path exposes canonical IDs
- Duplicate IDs are detected or warned about
- Related docs or inline help are updated if needed

## Relevant Spec

- Track A: Canonical Tool/Command Identity Layer
