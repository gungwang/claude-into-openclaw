# 我创建了一个新仓库，因为无法从 @instructkr 那里 fork 该仓库
---

## 项目目的：Claude-code => OpenClaw

本仓库作为 Claude Code 架构见解与 OpenClaw 智能体平台之间的桥梁。通过分析 Claude Code 的工具/命令清单、智能体架构模式和运行时结构，我们旨在增强 OpenClaw 的以下能力：

- **改进安全性**：规范化身份层、策略决策可追溯性，以及带运行时信任标签的技能审查
- **增强功能**：适配器成熟度框架、模式契约测试，以及具备可解释性的确定性路由
- **提高智能性**：路由质量基准测试、用于重放/调试的会话事件日志，以及防冲突的工具解析
- **Token 效率**：基于架构生命周期模式和上下文管理技术的更好压缩策略

本工作将 Claude Code 的特性、功能和架构模式与 OpenClaw 现有的优势（智能体循环、流式生命周期、多智能体委托、对话清理）相结合，以创建迁移级的可观测性和适配器人机工程学。

📋 **详细改进规范请参阅** [SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2.md](./SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2.md) | [中文版](./SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2_zh.md)

---

# 重写项目 Claw Code

<p align="center">
  <strong>更好的架构工具，而不仅仅是存储泄露的 Claude Code 归档</strong>
</p>

> [!IMPORTANT]
> **Rust 移植正在进行中**，位于 [`dev/rust`](https://github.com/instructkr/claw-code/tree/dev/rust) 分支，预计今天将合并到主分支。Rust 实现旨在提供更快、内存安全的架构运行时。敬请期待 — 这将是项目的最终版本。

> 如果您觉得这项工作有用，请考虑[在 GitHub 上赞助 @instructkr](https://github.com/sponsors/instructkr) 以支持持续的开源架构工程研究。

---

## 背景故事

2026 年 3 月 31 日凌晨 4 点，我被手机的通知声吵醒。Claude Code 源代码被曝光，整个开发者社区陷入疯狂。我在韩国的女朋友真的很担心我会因为在电脑上有这些代码而面临 Anthropic 的法律诉讼 — 所以我做了任何在压力下的工程师都会做的事：坐下来，从头开始将核心功能移植到 Python，并在太阳升起之前推送了代码。

整个过程都是使用 [@bellman_ych](https://x.com/bellman_ych) 的 [oh-my-codex (OmX)](https://github.com/Yeachan-Heo/oh-my-codex) 端到端编排的 — 这是一个构建在 OpenAI 的 Codex ([@OpenAIDevs](https://x.com/OpenAIDevs)) 之上的工作流层。我使用 `$team` 模式进行并行代码审查，使用 `$ralph` 模式进行持久执行循环和架构级验证。整个移植过程 — 从阅读原始架构结构到生成带测试的工作 Python 树 — 都是通过 OmX 编排驱动的。

结果是一个全新的 Python 重写，它捕获了 Claude Code 智能体架构的架构模式，而没有复制任何专有源代码。我现在正在积极与 [@bellman_ych](https://x.com/bellman_ych) — OmX 的创建者本人 — 合作，进一步推进这项工作。基本的 Python 基础已经就绪并可用，但我们才刚刚开始。**敬请期待 — 一个更强大的版本即将到来。**

https://github.com/instructkr/claw-code

![推特截图](assets/tweet-screenshot.png)

## 创建者登上华尔街日报（致狂热的 Claude Code 粉丝）

我一直对**架构工程**深感兴趣 — 研究智能体系统如何连接工具、编排任务和管理运行时上下文。这不是突然的事情。《华尔街日报》本月早些时候报道了我的工作，记录了我作为探索这些系统最活跃的超级用户之一：

> AI 创业公司员工 Sigrid Jin 参加了首尔的晚宴，去年一个人就使用了 250 亿个 Claude Code token。当时使用限制较为宽松，允许早期爱好者以非常低的成本达到数百亿 token。
>
> 尽管在 Claude Code 上花费了无数小时，Jin 并不忠于任何一个 AI 实验室。他说，可用的工具有不同的优势和劣势。Codex 更擅长推理，而 Claude Code 生成更清晰、更易分享的代码。
>
> Jin 于 2 月飞往旧金山参加 Claude Code 的一周年派对，参与者排队与 Cherny 交流笔记。人群中包括一位来自比利时的执业心脏病专家，他构建了一个帮助患者导航护理的应用程序，以及一位加利福尼亚律师，他制作了一个使用 Claude Code 自动化建筑许可审批的工具。
>
> Jin 说："基本上就像一个分享派对。有律师、医生、牙医。他们没有软件工程背景。"
>
> — *华尔街日报*, 2026年3月21日, [*"万亿美元竞赛：自动化我们的整个生活"*](https://lnkd.in/gs9td3qd)

![WSJ 专题报道](assets/wsj-feature.png)

---

## 移植状态

主源代码树现在以 Python 为主。

- `src/` 包含活跃的 Python 移植工作空间
- `tests/` 验证当前的 Python 工作空间
- 暴露的快照不再是被跟踪的仓库状态的一部分

当前的 Python 工作空间还不是原始系统的完整一对一替代品，但主要实现表面现在是 Python。

## 为什么存在这个重写

我最初研究暴露的代码库是为了了解它的架构、工具连接和智能体工作流。在花更多时间思考法律和伦理问题之后 — 并在阅读下面链接的文章之后 — 我不希望暴露的快照本身仍然是主要被跟踪的源代码树。

这个仓库现在专注于 Python 移植工作。

## 仓库布局

```text
.
├── src/                                # Python 移植工作空间
│   ├── __init__.py
│   ├── commands.py
│   ├── main.py
│   ├── models.py
│   ├── port_manifest.py
│   ├── query_engine.py
│   ├── task.py
│   └── tools.py
├── tests/                              # Python 验证
├── assets/omx/                         # OmX 工作流截图
├── 2026-03-09-is-legal-the-same-as-legitimate-ai-reimplementation-and-the-erosion-of-copyleft.md
└── README.md
```

## Python 工作空间概述

新的 Python `src/` 树目前提供：

- **`port_manifest.py`** — 总结当前的 Python 工作空间结构
- **`models.py`** — 用于子系统、模块和待办状态的数据类
- **`commands.py`** — Python 端命令移植元数据
- **`tools.py`** — Python 端工具移植元数据
- **`query_engine.py`** — 从活跃工作空间渲染 Python 移植摘要
- **`main.py`** — 清单和摘要输出的 CLI 入口点

## 快速开始

渲染 Python 移植摘要：

```bash
python3 -m src.main summary
```

打印当前的 Python 工作空间清单：

```bash
python3 -m src.main manifest
```

列出当前的 Python 模块：

```bash
python3 -m src.main subsystems --limit 16
```

运行验证：

```bash
python3 -m unittest discover -s tests -v
```

对本地忽略的归档运行对等审计（如果存在）：

```bash
python3 -m src.main parity-audit
```

检查镜像的命令/工具清单：

```bash
python3 -m src.main commands --limit 10
python3 -m src.main tools --limit 10
```

## 当前对等检查点

移植现在更接近地镜像归档的根条目文件表面、顶级子系统名称和命令/工具清单。然而，它**尚未**是原始 TypeScript 系统的完整运行时等效替代品；Python 树仍然包含比归档源代码更少的可执行运行时切片。

## 使用 `oh-my-codex` 构建

此仓库的重组和文档工作由 AI 辅助，并使用 Yeachan Heo 的 [oh-my-codex (OmX)](https://github.com/Yeachan-Heo/oh-my-codex) 编排，该工具构建在 Codex 之上。

- **`$team` 模式:** 用于协调的并行审查和架构反馈
- **`$ralph` 模式:** 用于持久执行、验证和完成纪律
- **Codex 驱动的工作流:** 用于将主 `src/` 树转变为以 Python 为主的移植工作空间

### OmX 工作流截图

![OmX 工作流截图 1](assets/omx/omx-readme-review-1.png)

*在终端窗格中审查 README 和文章内容时的 Ralph/团队编排视图。*

![OmX 工作流截图 2](assets/omx/omx-readme-review-2.png)

*在最终 README 措辞审查期间的分屏审查和验证流程。*

## 社区

<p align="center">
  <a href="https://instruct.kr/"><img src="assets/instructkr.png" alt="instructkr" width="400" /></a>
</p>

加入 [**instructkr Discord**](https://instruct.kr/) — 最好的韩国语言模型社区。来聊聊 LLM、架构工程、智能体工作流以及其他一切。

[![Discord](https://img.shields.io/badge/Join%20Discord-instruct.kr-5865F2?logo=discord&style=for-the-badge)](https://instruct.kr/)

## Star 历史

这个仓库成为**历史上最快突破 30K star 的 GitHub 仓库**，在发布后仅几小时就达到了这一里程碑。

<a href="https://star-history.com/#instructkr/claw-code&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=instructkr/claw-code&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=instructkr/claw-code&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=instructkr/claw-code&type=Date" />
  </picture>
</a>

![Star 历史截图](assets/star-history.png)

## 所有权 / 隶属关系免责声明

- 本仓库**不**声称拥有原始 Claude Code 源材料的所有权。
- 本仓库**不**与 Anthropic 关联、认可或由其维护。
