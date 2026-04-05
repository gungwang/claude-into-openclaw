> ## 🎉 本地构建并运行成功！(2026-04-05)
>
> OpenClaw `2026.4.1-beta.1` 已在 Ubuntu 22.04 上**从源码成功构建并本地运行**。
> 构建过程中修复了两个模块导入路径错误 — 详情请参见 [OPENCLAW-BUILD-ISSUES-FIXES.MD](./OPENCLAW-BUILD-ISSUES-FIXES.MD) 和 [RUNNING-FIX-AFTER-BUILD.md](./RUNNING-FIX-AFTER-BUILD.md)。
>
> **构建环境：** Node v22.22.0 · pnpm v10.32.1 (Corepack) · rolldown v1.0.0-rc.12 · TypeScript

---

<p align="center">
  <a href="https://github.com/gungwang/claude-code-openclaw/stargazers"><img src="https://img.shields.io/github/stars/gungwang/claude-code-openclaw?style=for-the-badge" alt="GitHub stars" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-2ea44f?style=for-the-badge" alt="MIT License" /></a>
  <a href="./GOOD_FIRST_ISSUES.md"><img src="https://img.shields.io/badge/onboarding-good%20first%20issues-f59e0b?style=for-the-badge" alt="Good First Issues" /></a>
  <a href="./SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2.md"><img src="https://img.shields.io/badge/roadmap-spec%20driven-2563eb?style=for-the-badge" alt="Spec Driven" /></a>
</p>

<p align="center">
  <a href="./README_zh.md">中文 README</a> ·
  <a href="./SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2_zh.md">中文规范</a> ·
  <a href="./CONTRIBUTING.md">Contributing</a> ·
  <a href="./CODE_OF_CONDUCT.md">Code of Conduct</a> ·
  <a href="./GOOD_FIRST_ISSUES.md">Good First Issues</a>
</p>

---

# 集成到 OpenClaw 中的 Claude 特性

本仓库旨在成为 Claude Code 架构洞察与 OpenClaw 智能体平台之间的桥梁。通过分析 Claude Code 的工具/命令清单、智能体 harness 模式以及运行时结构，我们希望从以下几个方面增强 OpenClaw：

- **安全性提升**：规范化身份层、策略决策可追溯性，以及带有运行时信任标签的技能审查
- **能力增强**：适配器成熟度框架、模式契约测试，以及具备可解释性的确定性路由
- **智能增强**：路由质量基准测试、用于重放/调试的会话事件日志，以及避免冲突的工具解析机制
- **令牌效率**：受 harness 生命周期模式和上下文管理技术启发的更优压缩策略

这项工作将 Claude Code 的特性、功能与架构模式，同 OpenClaw 已有的优势（智能体循环、流式生命周期、多智能体委托、对话记录清理）结合起来，以实现面向迁移场景的可观测性和更完善的适配器工程体验。

📋 **有关详细改进规范**，请参见 ---
- [README.md](./README.md)
- [SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2.md](./SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2.md) |
- [中文版-规范](./SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2_zh.md)
- [CLAUDE_OPENCLOW_EXECUTION_PLANS.md](./CLAUDE_OPENCLOW_EXECUTION_PLANS.md)
- [CLAUDE_OPENCLAW_TECHNICAL_REFERENCE.md](./CLAUDE_OPENCLAW_TECHNICAL_REFERENCE.md)

## 社区文档
- [README_zh.md](./README_zh.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- [CODE_OF_CONDUCT_zh.md](./CODE_OF_CONDUCT_zh.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [CONTRIBUTING_zh.md](./CONTRIBUTING_zh.md)
- [GOOD_FIRST_ISSUES.md](./GOOD_FIRST_ISSUES.md)
- [GOOD_FIRST_ISSUES_zh.md](./GOOD_FIRST_ISSUES_zh.md)

--- ---------------------------------------------------------- ----

# OpenClaw 改进规范（源自 claw-code 分析）

## 状态
仅为计划/规范。**不包含实现更改**。

## 目标
分析 `claw-code` 仓库作为 Claude-code 风格的架构镜像，并为 **OpenClaw** 提取实用的改进建议（特性、技能、功能、智能体架构），使其与 OpenClaw 当前的文档设计兼容。

---

## 1) 执行摘要

`claw-code` 代码库当前充当**高保真清单 + 模拟脚手架**：

- 通过快照镜像广泛的命令/工具表面（207 个命令条目，184 个工具条目）。
- 良好的 CLI 探索/报告脚手架。
- 有限的真实运行时语义（许多占位符/模拟处理程序）。

这对 OpenClaw 有用，因为它突出了大型架构清单在基线功能之外需要什么：

1. 用于大规模命令/工具表面的规范化身份和去重
2. 确定性路由和可解释性
3. 严格的对等治理（元数据 → 试运行 → 活跃运行时）
4. 模式契约测试（远程/ssh/teleport/等）
5. 更丰富的适配器生命周期和策略可见性

OpenClaw 已经拥有许多成熟的原语（智能体循环、流式生命周期、对话清理、压缩、钩子、多智能体/委托）。机会在于添加**迁移级可观测性和适配器人机工程学**，使 OpenClaw 能够以更少的歧义和更好的安全姿态吸收更大的工具生态系统。

---

## 2) claw-code 中观察到的内容（相关信号）

## 2.1 清单优先架构

- `commands_snapshot.json` 和 `tools_snapshot.json` 驱动命令/工具目录。
- 命令/工具执行垫片经常返回"镜像的...将处理..."消息。
- 许多子系统包是占位符元数据包装器。

### 为什么这对 OpenClaw 重要
每当导入第三方技能/工具或镜像外部生态系统时，OpenClaw 都可以从更强的"清单治理"层中受益。

## 2.2 大型表面中的重复名称压力

从快照中观察到：

- 命令：总共 207 个，141 个唯一名称（显示名称重复率高）。
- 工具：总共 184 个，94 个唯一名称；大量重复的通用名称（`prompt`、`UI`、`constants`）。

### 为什么这对 OpenClaw 重要
随着工具/插件生态系统的扩展，名称冲突变得常见。仅基于名称的路由/查找很快变得脆弱。

## 2.3 占位符模式处理程序

claw-code 中的运行时模式处理程序（`remote/ssh/teleport/direct/deep-link`）大多是占位符。

### 为什么这对 OpenClaw 重要
OpenClaw 已经拥有真实的智能体循环机制和运行时队列。编纂模式契约和诊断可以防止未来的退化并提高操作人员的信心。

## 2.4 对等审计模式（好主意，执行不完整）

claw-code 有对等审计概念，但当本地归档缺失时，回退行为较弱。

### 为什么这对 OpenClaw 重要
OpenClaw 可以采用**对等级别模式**用于可选特性/技能/提供者，将"支持/不支持"转变为可测量的成熟度带。

---

## 3) OpenClaw 基线优势（来自文档）

OpenClaw 文档表明这些强大的基础已经存在：

- 序列化智能体循环 + 生命周期流 + 等待语义。
- 队列通道和按会话一致性保证。
- 对话清理和特定于提供者的清理规则。
- 会话压缩 + 预压缩内存刷新。
- 具有策略边界的多智能体/委托架构。
- 关键生命周期点的内部/插件钩子。

因此，本规范**不**建议替换核心 OpenClaw 架构；它建议在其之上进行累加性改进。

---

## 4) OpenClaw 的拟议改进轨道

## 轨道 A — 规范化工具/命令身份层

### 问题
在大型生态系统中，人类可读的名称不是全局唯一的。

### 提议
为命令/工具注册表条目添加规范化身份元数据：

- `id`（稳定唯一，命名空间化）
- `displayName`
- `namespace`（核心/插件/技能/提供者/本地）
- `version` 或源摘要
- `capabilityClass`（读取、写入、执行、网络、消息传递、调度）

### 结果
- 确定性查找
- 防冲突路由
- 更好的审计跟踪

### 验收标准
- 注册表拒绝 `id` 上的身份冲突。
- 路由、状态和诊断表面公开规范化 ID。
- 基于名称的传统查找仍然可用，但在歧义时发出警告。

---

## 轨道 B — 路由可解释性和基准测试

### 问题
当工具表面增长时，错误路由既昂贵又难以调试。

### 提议
引入路由可解释性格式和基准集：

- 精确匹配 / 别名 / 语义 / 策略优先信号
- 每个候选的分数细分
- 带理由的 top-k
- 用于回归测试的离线基准套件

### 结果
- 更容易的调试
- 可测量的发布版本路由质量

### 验收标准
- 内部诊断中的 `route --explain` 风格输出。
- 在文档/测试资产中提交稳定的基准语料库。
- CI 中关键意图的路由质量门。

---

## 轨道 C — 适配器成熟度级别（对等评估体系）

### 问题
二元"存在 vs 工作"隐藏了真实的成熟度。

### 提议
为工具/命令/技能采用对等/成熟度级别：

- **L0**：可发现的元数据
- **L1**：模式验证 + 列出
- **L2**：试运行语义 + 策略检查
- **L3**：受控范围内的活跃运行时支持
- **L4**：生产加固（遥测 + 重放信心）

### 结果
- 诚实的能力报告
- 更清晰的贡献者路线图

### 验收标准
- 机器可读的成熟度报告工件
- 从工件生成的文档能力表
- 每个非实验性工具都标记了成熟度级别

---

## 轨道 D — 策略决策可追溯性

### 问题
用户和操作人员需要可重现的逻辑来回答"为什么被阻止/允许"。

### 提议
使用结构化原因代码扩展策略决策日志：

- 能力被拒绝
- 命名空间被拒绝
- 风险层被拒绝
- 缺少批准上下文
- 通道策略冲突

### 结果
- 更容易的合规审查
- 更快的支持/调试

### 验收标准
- 每个被阻止的工具调用都包含原因代码 + 策略源指针
- 生命周期流可以在详细/调试模式下发出策略决策事件

---

## 轨道 E — 模式契约测试矩阵

### 问题
模式复杂性（直接/远程/节点/acp/会话编排）在没有明确契约的情况下存在漂移风险。

### 提议
定义模式契约和所需的测试用例：

- 连接/身份验证/健康/拆除状态
- 超时/重试行为
- 错误分类（身份验证、网络、策略、运行时）
- 确定性的面向用户的失败消息

### 结果
- 跨环境的更高可靠性
- 更容易的事件分类

### 验收标准
- 每个模式路径的契约测试
- CLI + 面向聊天的表面使用的标准化失败封装

---

## 轨道 F — 技能审查 + 运行时信任标签

### 问题
开放的技能生态系统需要安全透明度和运行时信任上下文。

### 提议
为技能/工具来源和审查状态集成信任标签：

- 来源：核心 | 第一方 | 社区 | 本地
- 审查：未审查 | 已审查 | 已验证
- 请求的能力摘要

### 结果
- 更安全的安装/使用工作流
- 更清晰的操作人员决策

### 验收标准
- 安装/启用流程显示信任标签 + 能力范围
- 策略可以要求某些能力类的已审查/已验证

---

## 轨道 G — 会话事件日志外观（可选，累加性）

### 问题
复杂的运行受益于与原始对话详细信息分开的简明事件时间线。

### 提议
为诊断添加可选的规范化事件日志导出：

- message_in
- route_selected
- tool_call_start/end
- policy_decision
- compaction_start/end
- memory_flush

### 结果
- 更容易的重放/调试
- 更好的可观测性仪表板

### 验收标准
- 日志视图的导出端点/CLI 路径
- 相关 ID 将日志事件与对话条目联系起来

---

## 5) OpenClaw 特定的高影响候选（第一次迭代）

1. 命令/工具注册表的**规范化 ID + 歧义警告层**。
2. 带分数分解的**路由可解释性诊断**。
3. 文档/CI 中工具/技能/特性的**成熟度报告工件**。
4. 调试/详细流中的**策略原因代码显示**。

这四个提供了高运营价值，而不会破坏现有的循环/运行时设计。

---

## 6) 风险和缓解措施

- **风险：** 增加的元数据复杂性给维护者带来负担。
  **缓解：** 尽可能自动生成大多数字段；要求最少的强制字段。

- **风险：** 可解释性数据默认泄露内部信息。
  **缓解：** 在调试/详细模式下控制详细跟踪，并删除敏感值。

- **风险：** 成熟度标签变得过时。
  **缓解：** 将标签与 CI 检查和契约测试通过标准联系起来。

- **风险：** 策略原因代码与实际执行路径不一致。
  **缓解：** 原因仅从执行引擎发出，而不是从包装器发出。

---

## 7) 拟议的交付阶段

## 阶段 1 — 可观测性基础

- 规范化 ID（内部注册表）
- 歧义检测/警告
- 策略原因代码模式

## 阶段 2 — 质量控制

- 路由可解释性
- 路由基准测试工具
- 模式契约矩阵规范

## 阶段 3 — 治理和生态系统安全

- 成熟度级别报告工件
- 技能/工具的信任标签
- 文档和贡献者模板

---

## 8) 成功指标

- 具有规范化 ID 的注册表条目百分比
- 随时间减少的歧义查找数量
- 路由基准 top-1/top-3 准确率趋势
- 具有结构化原因代码的被拒绝调用百分比
- 模式契约测试通过率
- 具有信任标签 + 成熟度级别的技能/工具百分比

---

## 9) 可交付成果（规范周期）

1. ADR：命令/工具的规范化身份模式。
2. ADR：路由可解释性和基准测试协议。
3. ADR：成熟度评估体系和报告模式。
4. ADR：策略原因代码分类。
5. 模式契约矩阵的测试计划文档。
6. 使用 ID + 信任元数据添加新工具/技能条目的贡献者指南。

---

# 安装方式与原始 OpenClaw 相同

克隆仓库：

```bash
git clone https://github.com/gungwang/claude-code-openclaw.git
# The openclaw is a sub-directory of this project (Current Version 3.31).
cd claude-code-openclaw/openclaw
```

## 快速开始（TL;DR）

运行时环境：**Node 24（推荐）或 Node 22.16+**。

完整新手指南（认证、配对、频道）：[开始使用](https://docs.openclaw.ai/start/getting-started)

```bash
openclaw onboard --install-daemon

openclaw gateway --port 18789 --verbose

# Send a message
openclaw message send --to +1234567890 --message "Hello from OpenClaw"

# Talk to the assistant (optionally deliver back to any connected channel: WhatsApp/Telegram/Slack/Discord/Google Chat/Signal/iMessage/BlueBubbles/IRC/Microsoft Teams/Matrix/Feishu/LINE/Mattermost/Nextcloud Talk/Nostr/Synology Chat/Tlon/Twitch/Zalo/Zalo Personal/WeChat/WebChat)
openclaw agent --message "Ship checklist" --thinking high
```

升级请参考：[更新指南](https://docs.openclaw.ai/install/updating)（并运行 `openclaw doctor`）。

## 开发频道

- **stable**：带标签的正式发布版本（`vYYYY.M.D` 或 `vYYYY.M.D-<patch>`），npm dist-tag 为 `latest`。
- **beta**：预发布标签（`vYYYY.M.D-beta.N`），npm dist-tag 为 `beta`（可能没有 macOS 应用）。
- **dev**：`main` 分支的最新开发头部，npm dist-tag 为 `dev`（发布时提供）。

切换频道（git + npm）：`openclaw update --channel stable|beta|dev`。
详情请见：[开发频道](https://docs.openclaw.ai/install/development-channels)。

## 从源码运行（开发）

从源码构建时推荐使用 `pnpm`。如果要直接运行 TypeScript，Bun 是可选项。

```bash
pnpm install
pnpm ui:build # auto-installs UI deps on first run
pnpm build

pnpm openclaw onboard --install-daemon

# Dev loop (auto-reload on source/config changes)
pnpm gateway:watch
```

说明：`pnpm openclaw ...` 会直接运行 TypeScript（通过 `tsx`）。`pnpm build` 会产出 `dist/`，供通过 Node 或打包后的 `openclaw` 二进制运行。
