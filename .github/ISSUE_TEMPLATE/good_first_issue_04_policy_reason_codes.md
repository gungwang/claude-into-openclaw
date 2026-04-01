---
name: Good First Issue - Policy reason codes
about: Starter task for Track D
title: "[Good First Issue] Surface policy reason codes in verbose diagnostics"
labels: [good first issue, enhancement, governance]
assignees: []
---

## Objective

Expose structured policy reason codes when a command or tool is denied, gated, or allowed in a notable way.

## Why This Matters

OpenClaw needs clear answers to why something was blocked or permitted. This is a governance and supportability improvement.

## Suggested Scope

- Add a small reason-code taxonomy
- Surface one reason path in verbose or debug mode
- Keep the first implementation narrow and testable

## Acceptance Criteria

- Verbose diagnostics show at least one structured reason code
- The reason code is tied to an actual enforcement path
- The behavior is documented or tested

## Relevant Spec

- Track D: Policy Decision Traceability
