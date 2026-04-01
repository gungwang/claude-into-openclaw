---
name: Good First Issue - Route explainability
about: Starter task for Track B
title: "[Good First Issue] Add route explainability diagnostics"
labels: [good first issue, enhancement, diagnostics]
assignees: []
---

## Objective

Add a debug-oriented explanation format for route selection.

## Why This Matters

As the tool surface grows, contributors need to understand why a route was selected and why alternatives were not.

## Suggested Scope

- Add a verbose or debug output mode
- Show top candidates or one selected candidate with rationale
- Reuse existing route-related CLI paths where possible

## Acceptance Criteria

- A user can trigger route explanation output
- The output includes score, reason, or ranking details
- The new behavior is documented or tested

## Relevant Spec

- Track B: Route Explainability & Benchmarking
