---
name: Good First Issue - Mode contract tests
about: Starter task for Track E
title: "[Good First Issue] Scaffold mode contract tests"
labels: [good first issue, testing, reliability]
assignees: []
---

## Objective

Create a first pass of contract tests for one runtime mode.

## Why This Matters

The spec highlights mode drift as a real risk. Test scaffolding creates a foundation for reliability work.

## Suggested Scope

- Pick one mode such as remote, SSH, teleport, or direct
- Define a small happy-path and failure-path contract
- Add test names or skeletons even if the runtime is still partial

## Acceptance Criteria

- At least one mode has documented contract expectations
- Tests or test scaffolding exist in the repository
- Failure states are named clearly enough to extend later

## Relevant Spec

- Track E: Mode Contract Test Matrix
