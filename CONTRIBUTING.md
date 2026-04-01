# Contributing

Thank you for contributing to this repository.

This project focuses on improving OpenClaw using lessons extracted from the claw-code analysis. The current roadmap is driven by the specification in [SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2.md](./SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2.md), so the best contributions are the ones that make those tracks more concrete, testable, and implementable.

## Before You Start

1. Read the project purpose in [README.md](./README.md).
2. Read the roadmap in [SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2.md](./SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2.md).
3. Check the starter backlog in [GOOD_FIRST_ISSUES.md](./GOOD_FIRST_ISSUES.md).
4. Keep English and Chinese documentation in sync when editing markdown files.

## Local Setup

Clone the repository:

```bash
git clone https://github.com/gungwang/claude-code-openclaw.git
cd claude-code-openclaw
```

Optional virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Common commands:

```bash
python3 -m src.main summary
python3 -m src.main manifest
python3 -m src.main parity-audit
python3 -m unittest discover -s tests -v
```

## What We Welcome

- Improvements aligned with Tracks A-G in the spec
- Better diagnostics, explainability, and governance primitives
- Safer plugin and tool lifecycle handling
- Documentation, onboarding, and contributor experience improvements
- Tests that make migration and parity progress measurable

## Contribution Guidelines

1. Prefer focused changes over broad refactors.
2. Link your work to one spec track or one concrete problem statement.
3. Update documentation when behavior or workflow changes.
4. Add or update tests when changing runtime or routing behavior.
5. Preserve existing project structure unless there is a clear reason to change it.

## Documentation Rules

- If you add a new top-level markdown document, also add a Chinese version with the `_zh.md` suffix.
- When you update an existing bilingual document, update both language versions in the same change.
- Keep technical terms consistent across README, spec, and issue templates.

## Pull Request Checklist

Before opening a pull request, make sure you have:

- Read the relevant part of the spec
- Scoped the change clearly
- Updated related docs
- Run the relevant tests locally
- Described why the change matters for OpenClaw

## Good Starting Areas

If you are new to the codebase, start with one of these:

- Canonical IDs for command and tool entries
- Route explainability output
- Maturity-level reporting artifacts
- Policy reason-code surfacing
- Mode contract test scaffolding

## Community Standards

By participating in this project, you agree to follow [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
