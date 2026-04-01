# I created a new repository as I couldn't fork the repository from @instructkr

<p align="center">
  <a href="https://github.com/gungwang/claude-code-openclaw/stargazers"><img src="https://img.shields.io/github/stars/gungwang/claude-code-openclaw?style=for-the-badge" alt="GitHub stars" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-2ea44f?style=for-the-badge" alt="MIT License" /></a>
  <a href="./GOOD_FIRST_ISSUES.md"><img src="https://img.shields.io/badge/onboarding-good%20first%20issues-f59e0b?style=for-the-badge" alt="Good First Issues" /></a>
  <a href="./SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2.md"><img src="https://img.shields.io/badge/roadmap-spec%20driven-2563eb?style=for-the-badge" alt="Spec Driven" /></a>
</p>

<p align="center">
  <img src="assets/clawd-hero.jpeg" alt="OpenClaw promotion visual" width="320" />
</p>

<p align="center">
  <a href="./README_zh.md">中文 README</a> ·
  <a href="./SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2_zh.md">中文规范</a> ·
  <a href="./CONTRIBUTING.md">Contributing</a> ·
  <a href="./CODE_OF_CONDUCT.md">Code of Conduct</a> ·
  <a href="./GOOD_FIRST_ISSUES.md">Good First Issues</a>
</p>

---

## Purpose: Claude-code => OpenClaw

This repository serves as a bridge between Claude Code's architectural insights and OpenClaw's agent platform. By analyzing Claude Code's tool/command inventory, agent harness patterns, and runtime structures, we aim to enhance OpenClaw with:

- **Improved Security**: Canonical identity layers, policy decision traceability, and skill vetting with runtime trust labels
- **Enhanced Power**: Adapter maturity frameworks, mode contract testing, and deterministic routing with explainability
- **Greater Intelligence**: Route quality benchmarking, session event journals for replay/debug, and collision-safe tool resolution
- **Token Efficiency**: Better compaction strategies informed by harness lifecycle patterns and context management techniques

This work combines Claude Code features, functionality, and architectural patterns with OpenClaw's existing strengths (agent loop, streaming lifecycle, multi-agent delegation, transcript hygiene) to create migration-grade observability and adapter ergonomics.

📋 **For detailed improvement specifications**, see [SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2.md](./SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2.md) | [中文版规范](./SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2_zh.md)

## Community Docs

- [README_zh.md](./README_zh.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [CONTRIBUTING_zh.md](./CONTRIBUTING_zh.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- [CODE_OF_CONDUCT_zh.md](./CODE_OF_CONDUCT_zh.md)
- [GOOD_FIRST_ISSUES.md](./GOOD_FIRST_ISSUES.md)
- [GOOD_FIRST_ISSUES_zh.md](./GOOD_FIRST_ISSUES_zh.md)

---

# Rewriting Project Claw Code

<p align="center">
  <strong>Better Harness Tools, not merely storing the archive of leaked Claude Code</strong>
</p>

> [!IMPORTANT]
> **Rust port is now in progress** on the [`dev/rust`](https://github.com/instructkr/claw-code/tree/dev/rust) branch and is expected to be merged into main today. The Rust implementation aims to deliver a faster, memory-safe harness runtime. Stay tuned — this will be the definitive version of the project.

> If you find this work useful, consider [sponsoring @instructkr on GitHub](https://github.com/sponsors/instructkr) to support continued open-source harness engineering research.

## Setup

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

Useful commands:

```bash
python3 -m src.main summary
python3 -m src.main manifest
python3 -m src.main parity-audit
python3 -m unittest discover -s tests -v
```

## Starter Roadmap

These starter contribution themes come directly from the OpenClaw improvement spec:

- Track A: canonical command and tool identities
- Track B: route explainability and debugging output
- Track C: maturity-level reporting artifacts
- Track D: policy reason-code surfacing
- Track E: mode contract tests

If you want a scoped entry point, start with [GOOD_FIRST_ISSUES.md](./GOOD_FIRST_ISSUES.md).

---

## Backstory

At 4 AM on March 31, 2026, I woke up to my phone blowing up with notifications. The Claude Code source had been exposed, and the entire dev community was in a frenzy. My girlfriend in Korea was genuinely worried I might face legal action from Anthropic just for having the code on my machine — so I did what any engineer would do under pressure: I sat down, ported the core features to Python from scratch, and pushed it before the sun came up.

The whole thing was orchestrated end-to-end using [oh-my-codex (OmX)](https://github.com/Yeachan-Heo/oh-my-codex) by [@bellman_ych](https://x.com/bellman_ych) — a workflow layer built on top of OpenAI's Codex ([@OpenAIDevs](https://x.com/OpenAIDevs)). I used `$team` mode for parallel code review and `$ralph` mode for persistent execution loops with architect-level verification. The entire porting session — from reading the original harness structure to producing a working Python tree with tests — was driven through OmX orchestration.

The result is a clean-room Python rewrite that captures the architectural patterns of Claude Code's agent harness without copying any proprietary source. I'm now actively collaborating with [@bellman_ych](https://x.com/bellman_ych) — the creator of OmX himself — to push this further. The basic Python foundation is already in place and functional, but we're just getting started. **Stay tuned — a much more capable version is on the way.**

https://github.com/instructkr/claw-code

![Tweet screenshot](assets/tweet-screenshot.png)

## The Creators Featured in Wall Street Journal For Avid Claude Code Fans

I've been deeply interested in **harness engineering** — studying how agent systems wire tools, orchestrate tasks, and manage runtime context. This isn't a sudden thing. The Wall Street Journal featured my work earlier this month, documenting how I've been one of the most active power users exploring these systems:

> AI startup worker Sigrid Jin, who attended the Seoul dinner, single-handedly used 25 billion of Claude Code tokens last year. At the time, usage limits were looser, allowing early enthusiasts to reach tens of billions of tokens at a very low cost.
>
> Despite his countless hours with Claude Code, Jin isn't faithful to any one AI lab. The tools available have different strengths and weaknesses, he said. Codex is better at reasoning, while Claude Code generates cleaner, more shareable code.
>
> Jin flew to San Francisco in February for Claude Code's first birthday party, where attendees waited in line to compare notes with Cherny. The crowd included a practicing cardiologist from Belgium who had built an app to help patients navigate care, and a California lawyer who made a tool for automating building permit approvals using Claude Code.
>
> "It was basically like a sharing party," Jin said. "There were lawyers, there were doctors, there were dentists. They did not have software engineering backgrounds."
>
> — *The Wall Street Journal*, March 21, 2026, [*"The Trillion Dollar Race to Automate Our Entire Lives"*](https://lnkd.in/gs9td3qd)

![WSJ Feature](assets/wsj-feature.png)

---

## Porting Status

The main source tree is now Python-first.

- `src/` contains the active Python porting workspace
- `tests/` verifies the current Python workspace
- the exposed snapshot is no longer part of the tracked repository state

The current Python workspace is not yet a complete one-to-one replacement for the original system, but the primary implementation surface is now Python.

## Why this rewrite exists

I originally studied the exposed codebase to understand its harness, tool wiring, and agent workflow. After spending more time with the legal and ethical questions—and after reading the essay linked below—I did not want the exposed snapshot itself to remain the main tracked source tree.

This repository now focuses on Python porting work instead.

## Repository Layout

```text
.
├── src/                                # Python porting workspace
│   ├── __init__.py
│   ├── commands.py
│   ├── main.py
│   ├── models.py
│   ├── port_manifest.py
│   ├── query_engine.py
│   ├── task.py
│   └── tools.py
├── tests/                              # Python verification
├── assets/omx/                         # OmX workflow screenshots
├── 2026-03-09-is-legal-the-same-as-legitimate-ai-reimplementation-and-the-erosion-of-copyleft.md
└── README.md
```

## Python Workspace Overview

The new Python `src/` tree currently provides:

- **`port_manifest.py`** — summarizes the current Python workspace structure
- **`models.py`** — dataclasses for subsystems, modules, and backlog state
- **`commands.py`** — Python-side command port metadata
- **`tools.py`** — Python-side tool port metadata
- **`query_engine.py`** — renders a Python porting summary from the active workspace
- **`main.py`** — a CLI entrypoint for manifest and summary output

## Quickstart

Render the Python porting summary:

```bash
python3 -m src.main summary
```

Print the current Python workspace manifest:

```bash
python3 -m src.main manifest
```

List the current Python modules:

```bash
python3 -m src.main subsystems --limit 16
```

Run verification:

```bash
python3 -m unittest discover -s tests -v
```

Run the parity audit against the local ignored archive (when present):

```bash
python3 -m src.main parity-audit
```

Inspect mirrored command/tool inventories:

```bash
python3 -m src.main commands --limit 10
python3 -m src.main tools --limit 10
```

## Current Parity Checkpoint

The port now mirrors the archived root-entry file surface, top-level subsystem names, and command/tool inventories much more closely than before. However, it is **not yet** a full runtime-equivalent replacement for the original TypeScript system; the Python tree still contains fewer executable runtime slices than the archived source.


## Built with `oh-my-codex`

The restructuring and documentation work on this repository was AI-assisted and orchestrated with Yeachan Heo's [oh-my-codex (OmX)](https://github.com/Yeachan-Heo/oh-my-codex), layered on top of Codex.

- **`$team` mode:** used for coordinated parallel review and architectural feedback
- **`$ralph` mode:** used for persistent execution, verification, and completion discipline
- **Codex-driven workflow:** used to turn the main `src/` tree into a Python-first porting workspace

### OmX workflow screenshots

![OmX workflow screenshot 1](assets/omx/omx-readme-review-1.png)

*Ralph/team orchestration view while the README and essay context were being reviewed in terminal panes.*

![OmX workflow screenshot 2](assets/omx/omx-readme-review-2.png)

*Split-pane review and verification flow during the final README wording pass.*

## Community

<p align="center">
  <a href="https://instruct.kr/"><img src="assets/instructkr.png" alt="instructkr" width="400" /></a>
</p>

Join the [**instructkr Discord**](https://instruct.kr/) — the best Korean language model community. Come chat about LLMs, harness engineering, agent workflows, and everything in between.

[![Discord](https://img.shields.io/badge/Join%20Discord-instruct.kr-5865F2?logo=discord&style=for-the-badge)](https://instruct.kr/)

## Star History

This repository became **the fastest GitHub repo in history to surpass 30K stars**, reaching the milestone in just a few hours after publication.

<a href="https://star-history.com/#instructkr/claw-code&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=instructkr/claw-code&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=instructkr/claw-code&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=instructkr/claw-code&type=Date" />
  </picture>
</a>

![Star History Screenshot](assets/star-history.png)

## Ownership / Affiliation Disclaimer

- This repository does **not** claim ownership of the original Claude Code source material.
- This repository is **not affiliated with, endorsed by, or maintained by Anthropic**.
