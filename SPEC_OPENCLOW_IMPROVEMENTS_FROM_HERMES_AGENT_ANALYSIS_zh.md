# OpenClaw 改进规范（源自 Hermes-Agent 分析）

## 状态
仅限计划/规范。**不包含任何实施变更**。

## 目标
分析 `hermes-agent` 仓库作为开源 AI 编程 Agent 框架，提取对 **OpenClaw** 具有实际价值的改进，确保与 OpenClaw 现有架构兼容。识别 OpenClaw 中缺失的或显著不如 hermes-agent 的功能。

## 交叉引用
基于 `SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2.md` 的先期工作。假设该规范的路径 A–G 已实施或进行中。本文档中的路径编号（A–G）独立于先前规范，专门针对 hermes-agent 衍生的改进。

---

## 1）执行摘要

`hermes-agent` 代码库是一个**生产级 Python AI Agent 框架**，拥有共享的 Agent/工具基底，通过多种表面暴露（CLI、网关、ACP、MCP、批量处理、RL）。核心架构优势：

- **会话持久化**——采用 SQLite WAL + FTS5，含模式迁移、写入竞争处理和会话谱系追踪。
- **训练与评估流水线**——包括批量轨迹生成、RL 训练 CLI、工具集分布、SWE 基准运行器和多后端环境管理。
- **供应链安全**——含威胁模式扫描（20+ 类别）、基于清单的技能同步、URL 安全验证和 OSV 漏洞检查。
- **丰富的工具生态**——涵盖浏览器自动化（10 个工具，3 种提供商后端）、多模型融合（MoA）、语音/TTS、图像生成、后台进程监控和检查点管理。
- **插件架构**——支持工具/LLM 前后置钩子、上下文引擎替换、实时消息注入和完整的 CLI 生命周期管理。
- **网关平台覆盖**——支持 15+ 消息平台，包括中国企业平台（企业微信、钉钉、飞书、微信）。

本规范识别了 7 条改进路径，将 hermes-agent 级别的能力引入 OpenClaw，同时保持 OpenClaw 现有的 TypeScript 架构、插件系统和通道框架。

---

## 2）hermes-agent 中的观察信号

### 2.1 持久化会话状态引擎

Hermes 使用 SQLite WAL 模式和 FTS5 跨所有会话进行全文搜索。模式包含会话谱系（`parent_session_id`）、每会话的 token/成本元数据、推理产物列以及自动模式迁移。写入竞争通过 `BEGIN IMMEDIATE` + 抖动退避处理，确保多进程安全。

**对 OpenClaw 的意义：**
OpenClaw 的会话事件日志（`session-event-journal.ts`）仅存于内存中。会话无法在进程重启后存活，没有跨会话搜索，也没有长对话的轨迹压缩。

### 2.2 训练数据生成基础设施

Hermes 拥有完整的流水线：多进程批量运行器+JSONL 检查点、工具集分布采样（每个工具集独立伯努利采样）、SWE 基准运行器，以及 6+ 环境后端（本地、Docker、Modal、SSH、Daytona、Singularity）。还包含 10+ 模型特定的工具调用解析器（DeepSeek、Qwen、Llama、Mistral、GLM、Kimi 等）。

**对 OpenClaw 的意义：**
OpenClaw 没有任何训练、评估或基准测试基础设施。随着模型微调越来越易于获取，从 Agent 交互中生成训练轨迹已成为竞争差异化因素。

### 2.3 供应链防御层

Hermes 在安装前使用 20+ 威胁模式类别（数据外泄、注入、破坏、持久化、提权、混淆、符号链接逃逸、二进制检测、超大载荷）扫描技能。使用信任级别策略矩阵（内置→自动允许；社区→扫描+关卡；Agent 创建→扫描+询问）和基于清单的三方同步，在更新时保留用户自定义。

**对 OpenClaw 的意义：**
OpenClaw 有成熟度信任框架，但缺乏活跃的安装前扫描、漏洞检查和安全的基于清单的技能同步。

### 2.4 浏览器自动化和多模态工具

Hermes 提供 10 个浏览器工具和 3 种提供商后端（Browserbase、Firecrawl、browser-use）、多模型融合共识、文本转语音合成、音频转录、图像生成以及带监视模式的后台进程监控。

**对 OpenClaw 的意义：**
OpenClaw 的工具面覆盖消息、会话、子 Agent、定时任务、网页获取和图片/PDF，但缺乏交互式浏览器控制、多模型共识和语音能力。

### 2.5 插件钩子粒度

Hermes 插件可以为工具调用和 LLM 调用注册前后置钩子，可以完全替换上下文引擎，向活跃会话注入消息，以及注册 CLI 命令。钩子总线包含每个回调的故障隔离。

**对 OpenClaw 的意义：**
OpenClaw 的插件注册表支持工具、通道、供应商、钩子、HTTP 路由、服务和 CLI 命令注册——但缺乏细粒度的前后置拦截点和上下文引擎替换，而这些是实现高级插件行为的关键。

### 2.6 中国企业平台覆盖

Hermes 包含企业微信（含消息加密）、钉钉、飞书/Lark 和微信公众号的网关适配器，以及短信、邮件、Mattermost 和 Webhook 的通用适配器。

**对 OpenClaw 的意义：**
OpenClaw 支持西方平台（Telegram、Discord、Slack、Signal、WhatsApp、Matrix、Teams），但没有中国企业平台适配器，限制了市场覆盖。

### 2.7 开发者体验模式

Hermes 提供 git worktree 隔离用于安全并发编辑、供应商特定的提示缓存（Anthropic cache_control、OpenAI predicted_outputs）、基于项目结构的自动上下文引用注入、按工具预算配置以及用于显式消歧的澄清工具。

**对 OpenClaw 的意义：**
这些模式可直接降低 token 成本、防止并发会话中的 git 冲突、提高 Agent 交互质量，且无需改变核心 Agent 循环。

---

## 3）OpenClaw 基线优势（已有实现）

OpenClaw 已记录和实现的基础包括：

- 序列化 Agent 循环，含生命周期流、等待语义和事件流。
- 队列通道和按会话的一致性保证。
- 转录清洗和供应商特定的净化规则。
- 会话压缩，含压缩前内存刷新。
- 多 Agent/委托架构，含策略边界。
- 关键生命周期点的内部/插件钩子。
- 规范工具标识层，含诊断发射。
- 路由可解释性引擎，含分数分解。
- 成熟度信任模型，含默认值和报告。
- 策略原因码分类，含可追溯性。
- 模式合约矩阵，含标准化故障信封。
- 会话事件日志门面，含关联 ID。
- 多通道支持（Telegram、Discord、Slack、Signal、iMessage、WhatsApp、Matrix、Teams）。
- ACP over stdio 桥接到网关 WebSocket。
- MCP stdio 服务器，含通道桥接和权限中介。
- OpenAI/OpenResponses HTTP 兼容端点。

因此本规范**不提议**替换核心 OpenClaw 架构；而是提议在 OpenClaw 现有基底上叠加 hermes-agent 级别能力的增量改进。

---

## 4）OpenClaw 改进路径提案

### 路径 A — 会话智能（优先级：P0）

#### 问题
OpenClaw 的会话事件日志仅存于内存中。会话无法在进程重启后持久化，没有跨历史会话的全文搜索，没有长对话的轨迹压缩，没有用于重试逻辑的结构化错误分类，没有按供应商的速率限制追踪，也没有凭证轮换/恢复。

#### 提案
将 hermes-agent 的会话持久化和弹性模式移植到 OpenClaw：

1. **持久化会话数据库** — SQLite 后端，含 WAL 模式和 FTS5 全文搜索。模式包含会话表（模型、token 计数、成本、供应商、标题元数据）、消息表（内容、工具元数据、推理列）以及带触发器的 FTS 虚拟表。含版本化的模式迁移梯度。
2. **轨迹压缩** — 预算感知的中间段摘要，保持执行连续性。用合成摘要替换选定的对话段。异步扇出+并发限制器用于 API 摘要吞吐控制。含单轨迹和聚合统计的指标管道。
3. **错误分类器** — 结构化错误分类：瞬态 vs 永久、速率限制 vs 认证 vs 模型 vs 网络。将每个错误映射到重试策略（立即重试、退避、轮换凭证、失败）。
4. **凭证池** — 多密钥轮换，认证失败时自动恢复。轮询或基于优先级的密钥选择。
5. **速率限制追踪器** — 按供应商的监控与退避协调。追踪剩余配额、重置时间戳和节流状态。
6. **智能模型路由** — 基于任务的自动模型选择。简单任务路由到更便宜/更快的模型，复杂任务路由到更强的模型。
7. **会话搜索工具** — 通过 FTS5 的跨会话知识检索，作为 Agent 工具暴露。
8. **使用量定价** — 按 token 的成本归因，含模型特定价格表。

#### Hermes 源码参考
| 模块 | 关键函数/类 | 用途 |
|------|------------|------|
| `hermes_state.py` | `SessionDB`、`create_session()`、`search_messages()`、`export_session()` | SQLite WAL + FTS5 会话持久化 |
| `trajectory_compressor.py` | `TrajectoryCompressor.compress_trajectory()`、`CompressionConfig` | 预算感知对话压缩 |
| `agent/error_classifier.py` | 错误分类、`classify_error()` | 结构化重试决策 |
| `agent/credential_pool.py` | `CredentialPool`、轮换逻辑 | 多密钥管理 |
| `agent/rate_limit_tracker.py` | `RateLimitTracker`、按供应商状态 | 配额监控+退避 |
| `agent/smart_model_routing.py` | 路由规则、任务分类 | 任务→模型选择 |
| `agent/usage_pricing.py` | 价格表、成本计算 | 按 token 成本归因 |
| `tools/session_search_tool.py` | `session_search` 工具处理器 | 跨会话 FTS 检索 |

#### OpenClaw 集成目标
| 目标文件 | 操作 |
|----------|------|
| `openclaw/src/agents/session-event-journal.ts` | 扩展持久化 SQLite 后端 |
| `openclaw/src/agents/journal-integration.ts` | 将持久化接入运行循环 |
| `openclaw/src/agents/pi-embedded-runner/run.ts` | 添加错误分类、凭证轮换、速率限制感知 |
| `openclaw/src/config/types.openclaw.ts` | 添加会话持久化配置区块 |
| 新增：`openclaw/src/agents/session-persistence.ts` | SQLite 后端（better-sqlite3 或 sql.js） |
| 新增：`openclaw/src/agents/trajectory-compressor.ts` | 移植压缩管道 |
| 新增：`openclaw/src/agents/error-classifier.ts` | 结构化错误分类 |
| 新增：`openclaw/src/agents/smart-model-routing.ts` | 任务→模型路由 |
| 新增：`openclaw/src/agents/rate-limit-tracker.ts` | 按供应商监控 |
| 新增：`openclaw/src/agents/credential-pool.ts` | 多密钥轮换 |

#### 预期成果
- 会话在进程重启后保留完整消息历史和推理产物。
- 跨所有历史会话的全文搜索。
- 自动轨迹压缩降低长对话的 token 成本。
- 结构化重试防止瞬态 API 故障暴露给用户。
- 凭证轮换避免单密钥耗尽导致工作中断。
- 智能路由自动优化成本/质量权衡。

#### 验收标准
- [ ] 会话数据跨进程重启持久化，恢复延迟 <100ms。
- [ ] FTS 搜索在 1000+ 会话中返回相关结果。
- [ ] 轨迹压缩在 >50 轮对话中减少 ≥40% 的 token 数量。
- [ ] 错误分类器正确分类 ≥95% 的常见 API 错误（401、429、500、超时、网络）。
- [ ] 凭证轮换在 401/429 响应时自动触发，无需用户干预。
- [ ] 智能路由在混合负载上降低平均每任务成本 ≥20%。

#### TypeScript 适配说明
- **SQLite**：使用 `better-sqlite3`（同步，WAL 模式兼容）或 `sql.js`（WASM，无原生依赖）。两者均支持 WAL + FTS5。
- **异步压缩扇出**：使用 `Promise.all` + `p-limit` 并发限制器替代 Python `asyncio.Semaphore`。
- **写入竞争**：Node.js 单线程模型下 `BEGIN IMMEDIATE` + 重试比 Python 多进程方案更简单。

---

### 路径 B — 安全与供应链（优先级：P0）

#### 问题
OpenClaw 有成熟度信任框架，但缺乏安装前的技能安全扫描、项目依赖的 OSV 漏洞检查、获取操作前的 URL 安全验证以及保留用户自定义的基于清单的技能同步。

#### 提案
将 hermes-agent 的供应链防御层移植到 OpenClaw：

1. **技能安全卫士** — 静态安全扫描器，含 20+ 威胁模式类别：数据外泄（HTTP/DNS/webhook）、提示注入、破坏操作（rm -rf、DROP TABLE）、持久化机制、提权、代码混淆、符号链接逃逸、嵌入二进制、超大载荷。信任级别策略矩阵（内置→自动允许；社区→扫描+关卡；Agent 创建→扫描+询问）。生成 `ScanResult`：含信任级别、裁决（允许/警告/阻止）、发现列表和摘要。
2. **技能清单同步** — 基于清单的三方协调：比较内置源哈希 vs 当前用户哈希 vs 新内置哈希。保留用户自定义，自动推送未更改的技能，标记冲突。原子清单写入，含 v1→v2 迁移支持。
3. **URL 安全检查器** — 在 Agent 获取操作前验证 URL。阻止私有网络地址（RFC 1918、链路本地、环回）、已知恶意域名和可疑模式的 URL。
4. **OSV 漏洞扫描器** — 查询 OSV.dev API 检查项目依赖中的已知 CVE。支持 npm、PyPI 等生态系统。
5. **凭证文件检测** — 在暴露给 Agent 上下文前，识别工作区中的 .env、.pem、.key、私钥文件和常见密钥模式。
6. **路径安全加固** — 防止文件操作中的路径穿越（../）和符号链接逃逸攻击。

#### Hermes 源码参考
| 模块 | 关键函数/类 | 用途 |
|------|------------|------|
| `tools/skills_guard.py` | `scan_skill()`、`should_allow_install()`、`THREAT_PATTERNS`、`Finding`、`ScanResult` | 威胁模式扫描 |
| `tools/skills_sync.py` | `sync_skills()`、`_read_manifest()`、`_dir_hash()` | 基于清单的技能同步 |
| `tools/url_safety.py` | URL 验证函数 | URL 安全检查 |
| `tools/osv_check.py` | OSV.dev API 集成 | 依赖漏洞扫描 |
| `tools/credential_files.py` | 文件模式匹配器 | 密钥文件检测 |
| `tools/path_security.py` | 路径验证、符号链接检查 | 路径穿越防护 |

#### OpenClaw 集成目标
| 目标文件 | 操作 |
|----------|------|
| `openclaw/src/agents/skills-install.ts` | 添加安装前安全扫描关卡 |
| `openclaw/src/agents/skills.ts` | 添加内置技能的基于清单的同步 |
| `openclaw/src/agents/maturity-trust.ts` | 扩展信任模型，纳入扫描裁决 |
| `openclaw/src/plugins/install.ts` | 添加插件安全扫描 |
| `openclaw/src/config/types.tools.ts` | 添加安全扫描配置选项 |
| 新增：`openclaw/src/agents/skills-guard.ts` | 移植威胁模式扫描器 |
| 新增：`openclaw/src/agents/skills-sync.ts` | 移植基于清单的同步 |
| 新增：`openclaw/src/agents/url-safety.ts` | URL 验证服务 |
| 新增：`openclaw/src/agents/osv-check.ts` | OSV 漏洞扫描器 |
| 新增：`openclaw/src/agents/credential-detector.ts` | 密钥文件检测 |
| 新增：`openclaw/src/agents/path-security.ts` | 路径穿越防护 |

#### 预期成果
- 技能安装前扫描恶意模式。
- 内置技能安全更新，不丢失用户自定义。
- Agent 获取操作前验证 URL。
- 依赖项对照已知漏洞数据库检查。
- 凭证文件在暴露给 Agent 上下文前被标记。
- 路径穿越攻击在文件操作层被阻止。

#### 验收标准
- [ ] 技能卫士在测试语料库中检测出 ≥90% 的 OWASP 分类注入模式。
- [ ] 技能同步在 100% 的内置更新周期中保留用户修改。
- [ ] URL 安全检查阻止已知恶意 URL 和所有 RFC 1918/环回/链路本地地址。
- [ ] OSV 检查在 ≤5s 响应时间内报告项目依赖的已知 CVE。
- [ ] 凭证文件检测标记 .env、.pem、.key 和常见密钥文件模式。
- [ ] 路径安全在测试中阻止所有 `../` 穿越和符号链接逃逸尝试。

---

### 路径 C — 开发者体验（优先级：P1）

#### 问题
OpenClaw 缺乏用于安全并发编辑的 git worktree 隔离、无供应商特定的提示缓存优化、无基于项目结构的自动上下文引用注入、无工具级预算配置以及无显式澄清工具供用户消歧。

#### 提案
将 hermes-agent 的开发者体验模式移植到 OpenClaw：

1. **Git worktree 隔离** — 为并发编辑会话创建隔离的 git worktree。每个会话获得独立的分支/worktree，防止并行 Agent 会话间的冲突。会话结束时自动清理。
2. **提示缓存** — 供应商特定的缓存优化策略。Anthropic：为系统提示和最近上下文使用 `cache_control` 断点。OpenAI：为编辑密集型工作流使用 `predicted_outputs`。减少冗余 token 传输。
3. **上下文引用** — 基于目录结构、文件类型和命名约定自动检测并注入相关项目文件引用。为 Agent 提供项目感知，无需手动指定。
4. **子目录提示** — 注入到 Agent 上下文中的目录结构导航提示。帮助 Agent 理解项目组织以进行文件查找。
5. **预算配置** — 按工具和按会话的成本预算限制。追踪累计成本，超出限制时停止执行。
6. **澄清工具** — Agent 可调用的工具，用于在任务模糊时显式请求用户澄清，而非猜测。
7. **手动压缩反馈** — 上下文压缩决策的用户反馈环。允许用户影响压缩 vs 保留的内容。
8. **检查点管理器** — 基于 Git 的检查点创建和回滚。Agent 可在风险操作前创建命名检查点，需要时回滚。

#### Hermes 源码参考
| 模块 | 关键函数/类 | 用途 |
|------|------------|------|
| `cli.py`（约 674–773 行） | Worktree 创建/清理 | Git worktree 隔离 |
| `agent/prompt_caching.py` | 供应商特定缓存策略 | 提示缓存优化 |
| `agent/context_references.py` | 引用检测/注入 | 自动上下文引用 |
| `agent/subdirectory_hints.py` | 目录提示生成 | 项目结构感知 |
| `tools/budget_config.py` | 预算限制、成本追踪 | 成本预算执行 |
| `tools/clarify_tool.py` | `clarify` 工具处理器 | 用户消歧 |
| `agent/manual_compression_feedback.py` | 反馈环 | 压缩控制 |
| `tools/checkpoint_manager.py` | 检查点创建/回滚 | 基于 Git 的检查点 |

#### OpenClaw 集成目标
| 目标文件 | 操作 |
|----------|------|
| `openclaw/src/agents/pi-embedded-runner/run.ts` | 添加 worktree 隔离、提示缓存、上下文引用 |
| `openclaw/src/agents/pi-tools.ts` | 添加澄清工具、预算配置 |
| `openclaw/src/config/types.tools.ts` | 添加按工具预算限制 |
| 新增：`openclaw/src/agents/git-worktree.ts` | Worktree 隔离管理器 |
| 新增：`openclaw/src/agents/prompt-caching.ts` | 供应商特定缓存策略 |
| 新增：`openclaw/src/agents/context-references.ts` | 自动引用注入 |
| 新增：`openclaw/src/agents/budget-tracker.ts` | 成本预算执行 |
| 新增：`openclaw/src/tools/checkpoint-manager.ts` | Git 检查点/回滚 |

#### 预期成果
- 并发编辑会话通过 worktree 隔离互不冲突。
- 通过供应商特定提示缓存降低 token 成本。
- Agent 基于目录结构自动引用相关项目文件。
- 用户可设置按工具和按会话的成本预算。
- Agent 可主动请求澄清而非猜测。
- Git 检查点实现 Agent 所做变更的安全回滚。

#### 验收标准
- [ ] Git worktree 创建和清理隔离分支，无数据丢失。
- [ ] 提示缓存使 Anthropic 供应商的冗余 token 使用减少 ≥30%。
- [ ] 上下文引用正确识别给定任务 ≥80% 的相关文件。
- [ ] 预算执行在超出成本限制时停止工具执行。
- [ ] 当 Agent 置信度低于配置阈值时触发澄清工具。
- [ ] 检查点回滚恢复精确文件状态，通过 `git diff` 验证。

---

### 路径 D — 插件增强（优先级：P1）

#### 问题
OpenClaw 的插件系统支持工具、通道、供应商、钩子、HTTP 路由、服务和 CLI 命令注册。但缺乏工具和 LLM 调用的细粒度前后置钩子、上下文引擎替换、活跃会话的实时消息注入以及插件管理的工具集注册。

#### 提案
使用 hermes-agent 的更细粒度扩展点来扩展 OpenClaw 的插件系统：

1. **工具前后置钩子** — 插件可在工具执行前拦截调用（用于验证、日志、修改）和执行后（用于后处理、遥测、审计）。钩子总线含每回调的故障隔离，防止一个插件崩溃影响其他插件。
2. **LLM 前后置钩子** — 插件可在发送 LLM 请求前拦截（用于提示修改、缓存、路由）和接收后（用于响应过滤、成本追踪、质量评分）。
3. **上下文引擎替换** — 插件可注册自定义上下文引擎替换默认检索策略。支持专门的 RAG、向量搜索或领域特定的上下文组装。
4. **实时消息注入** — 插件可向活跃会话的对话中注入消息。支持实时协调、外部事件通知和桥接集成。
5. **插件注册工具集** — 插件可注册命名工具集，成为工具集图中的一等公民，与内置工具集可组合。
6. **插件 CLI 管理** — 完整的安装/更新/删除/启用/禁用/切换操作，含清单兼容性把关和安全名称清洗。

#### Hermes 源码参考
| 模块 | 关键函数/类 | 用途 |
|------|------------|------|
| `hermes_cli/plugins.py` | `PluginContext`、`PluginManager`、`invoke_hook()` | 插件生命周期、钩子总线 |
| `hermes_cli/plugins_cmd.py` | `cmd_install()`、`cmd_update()`、`cmd_remove()`、`cmd_enable()`、`cmd_disable()` | 插件 CLI 管理 |
| 钩子名称 | `pre_tool_call`、`post_tool_call`、`pre_llm_call`、`post_llm_call`、`session_start`、`session_end`、`session_finalize`、`session_reset` | 钩子分类 |

#### OpenClaw 集成目标
| 目标文件 | 操作 |
|----------|------|
| `openclaw/src/plugins/registry.ts` | 扩展钩子分类，增加工具/LLM 前后置钩子 |
| `openclaw/src/plugins/discovery.ts` | 添加上下文引擎替换能力 |
| `openclaw/src/plugin-sdk/` | 在公共 SDK 中暴露新钩子类型 |
| `openclaw/src/agents/pi-embedded-runner/run.ts` | 将前后置钩子接入 Agent 循环 |
| `openclaw/src/gateway/server-methods/` | 添加插件管理 API 方法 |

#### 预期成果
- 插件可观察和修改进行中的工具调用和 LLM 请求。
- 插件可替换上下文引擎以实现自定义检索策略。
- 外部系统可向活跃会话注入消息，实现实时协调。
- 插件生命周期管理完全通过 API 可访问。

#### 验收标准
- [ ] 前后置工具钩子在每次工具调用时正确触发，开销 <5ms。
- [ ] 前后置 LLM 钩子在每次 LLM 请求时正确触发，开销 <5ms。
- [ ] 上下文引擎替换正确服务所有现有检索查询。
- [ ] 消息注入在当前轮次的上下文窗口内投递内容。
- [ ] 插件安装/更新/删除操作幂等且抗崩溃。
- [ ] 插件注册的工具集出现在工具集列表中，并可与内置集组合。

---

### 路径 E — 高级工具（优先级：P2）

#### 问题
OpenClaw 拥有核心工具（消息、会话、子 Agent、定时任务、网页获取、图片/PDF），但缺乏完整的浏览器自动化、多模型共识（MoA）、语音/TTS 合成、音频转录、图像生成、带监视模式的后台进程通知以及 Home Assistant 物联网集成。

#### 提案
将 hermes-agent 的高级工具能力移植到 OpenClaw：

1. **浏览器自动化套件** — 10 个工具：`browser_navigate`、`browser_snapshot`、`browser_click`、`browser_type`、`browser_scroll`、`browser_back`、`browser_press`、`browser_get_images`、`browser_vision`、`browser_console`。提供商后端抽象支持 Browserbase（云端）、Firecrawl（提取导向）和 browser-use（本地 Playwright）。
2. **多模型融合（MoA）** — 通过并行委托给不同模型然后综合的多模型共识。通过组合多样化模型视角提高复杂问题的回答质量。
3. **语音/TTS 工具** — 支持多引擎后端的文本转语音合成。支持对话语音输出和无障碍使用场景。
4. **音频转录** — 将音频转换为文本供 Agent 处理。
5. **图像生成** — 用于视觉内容创建的 AI 图像生成工具。
6. **后台进程监控** — 追踪运行中的后台进程，监视模式在特定输出匹配时触发通知。
7. **Home Assistant 集成** — 4 个物联网工具：`ha_list_entities`、`ha_get_state`、`ha_list_services`、`ha_call_service`，用于智能家居控制。

#### Hermes 源码参考
| 模块 | 关键函数/类 | 用途 |
|------|------------|------|
| `tools/browser_tool.py` | 10 个 browser_* 工具注册 | 浏览器自动化 |
| `tools/browser_providers/` | `base.py`、`browserbase.py`、`firecrawl.py`、`browser_use.py` | 提供商后端 |
| `tools/mixture_of_agents_tool.py` | MoA 并行委托+综合 | 多模型共识 |
| `tools/tts_tool.py` | `text_to_speech` 工具处理器 | 文本转语音 |
| `tools/voice_mode.py` | 语音交互模式 | 语音 I/O |
| `tools/transcription_tools.py` | 音频转录处理器 | 语音转文本 |
| `tools/image_generation_tool.py` | `image_generate` 工具处理器 | 图像生成 |
| `tools/process_registry.py` | 后台进程追踪、监视模式 | 进程监控 |
| `tools/homeassistant_tool.py` | 4 个 HA 工具处理器 | 物联网集成 |

#### OpenClaw 集成目标
| 目标文件 | 操作 |
|----------|------|
| `openclaw/src/agents/pi-tools.ts` | 注册新工具定义 |
| `openclaw/src/agents/tool-policy-pipeline.ts` | 为新工具添加策略规则 |
| `openclaw/src/agents/subagent-registry.ts` | 扩展以支持 MoA 模式 |
| 新增：`openclaw/src/tools/browser-automation.ts` | 浏览器工具套件 |
| 新增：`openclaw/src/tools/browser-providers/` | 提供商后端抽象 |
| 新增：`openclaw/src/tools/mixture-of-agents.ts` | 多模型共识 |
| 新增：`openclaw/src/tools/voice-tts.ts` | 文本转语音 |
| 新增：`openclaw/src/tools/checkpoint-manager.ts` | Git 检查点/回滚 |
| 新增：`openclaw/src/tools/process-monitor.ts` | 后台进程通知 |
| 新增：`openclaw/src/tools/homeassistant.ts` | Home Assistant 集成 |

#### 预期成果
- Agent 可导航、交互和提取网页数据。
- 多模型共识提高复杂问题的回答质量。
- 语音输出扩展可访问性和使用场景。
- 后台进程被监控并自动通知。
- 智能家居设备可通过 Agent 控制。

#### 验收标准
- [ ] 浏览器工具可端到端完成 5 步网页交互流程。
- [ ] MoA 在 ≥3 个模型中产生综合输出，延迟 ≤2 倍单模型。
- [ ] TTS 在 <10s 内为 ≤5000 字符的文本生成音频输出。
- [ ] 后台进程监视模式在匹配后 1s 内触发通知。
- [ ] Home Assistant 工具可在配置的实例上列出实体和调用服务。

---

### 路径 F — 网关平台扩展（优先级：P2）

#### 问题
OpenClaw 支持 Telegram、Discord、Slack、Signal、iMessage/BlueBubbles、WhatsApp、Matrix 和 Teams。Hermes 增加了多个中国企业平台（企业微信、钉钉、飞书、微信公众号）及 Mattermost、短信、邮件和通用 Webhook 适配器。Hermes 还提供网关镜像和多目标投递路由。

#### 提案
为 OpenClaw 添加新的网关平台适配器和投递能力：

1. **企业微信适配器** — 企业消息，含通过 `wecom_crypto.py` 的消息加解密和通过 `wecom_callback.py` 的回调服务器。
2. **钉钉适配器** — 钉钉 API 集成，面向中国企业消息。
3. **飞书/Lark 适配器** — 飞书（字节跳动/Lark）API 集成。
4. **微信公众号适配器** — 微信公众号消息。
5. **Mattermost 适配器** — 开源 Slack 替代方案。
6. **短信适配器** — 通过可配置供应商的短信消息。
7. **邮件适配器** — 用于 Agent 交互的邮件收发。
8. **Webhook 适配器** — 通用 HTTP webhook，面向任意集成。
9. **网关镜像** — 任意两个已连接平台间的跨平台消息中继。
10. **多目标投递** — 目标解析和调度，同时向多个平台发送消息。

#### Hermes 源码参考
| 模块 | 用途 |
|------|------|
| `gateway/platforms/wecom.py` + `wecom_crypto.py` + `wecom_callback.py` | 企业微信适配器，含加密 |
| `gateway/platforms/dingtalk.py` | 钉钉适配器 |
| `gateway/platforms/feishu.py` | 飞书/Lark 适配器 |
| `gateway/platforms/weixin.py` | 微信公众号适配器 |
| `gateway/platforms/mattermost.py` | Mattermost 适配器 |
| `gateway/platforms/sms.py` | 短信适配器 |
| `gateway/platforms/email.py` | 邮件适配器 |
| `gateway/platforms/webhook.py` | 通用 Webhook 适配器 |
| `gateway/mirror.py` | 跨平台消息镜像 |
| `gateway/delivery.py` | 多目标投递路由 |

#### OpenClaw 集成目标
| 目标文件 | 操作 |
|----------|------|
| `openclaw/src/channels/` | 添加新通道适配器模块 |
| `openclaw/src/gateway/` | 添加镜像和投递路由 |
| `openclaw/src/config/types.openclaw.ts` | 为新平台添加通道配置 |
| `openclaw/extensions/` | 将适配器打包为扩展 |

#### 预期成果
- OpenClaw 通过企业微信/钉钉/飞书打入中国企业市场。
- 通用 Webhook 适配器支持与任何 HTTP 能力系统的集成。
- 邮件和短信适配器将触达扩展到非聊天平台。
- 网关镜像实现跨平台消息中继。
- 多目标投递同时路由消息到多个平台。

#### 验收标准
- [ ] 每个新适配器以平台特定格式发送和接收文本消息。
- [ ] 企业微信适配器正确处理消息加解密。
- [ ] Webhook 适配器接受和响应任意 HTTP POST 载荷。
- [ ] 网关镜像在 ≥2 个平台间中继消息，延迟 <2s。
- [ ] 多目标投递正确路由到所有指定目标。

#### 合规说明
中国平台适配器（企业微信、钉钉、飞书、微信）需要特定区域的 API 端点，可能有数据驻留合规要求。实现应支持可配置的 API 基础 URL 并记录合规注意事项。

---

### 路径 G — 训练与评估流水线（优先级：P3）

#### 问题
OpenClaw 没有训练、评估或基准测试基础设施。Hermes 提供了完整的 ML-ops 流水线，包括 RL 训练 CLI、批量轨迹生成、工具集分布采样、SWE 基准执行、多后端环境管理以及模型特定的工具调用解析。

#### 提案
为 OpenClaw 引入训练数据生成和评估能力：

1. **批量运行器** — 多进程提示执行，含 JSONL 检查点。通过检查点索引+内容去重的抗崩溃恢复。按样本的工具集随机性，增加训练多样性。按虚构工具名的坏轨迹过滤。推理覆盖率把关。
2. **工具集分布** — 每个工具集的独立伯努利采样，用于课程/领域塑造。保证向最高概率工具集的非空回退。
3. **轨迹格式** — Hermes 兼容的轨迹序列化（JSONL，含 `conversations` 字段、`from`/`value` 轮次模式、工具调用元数据）。
4. **SWE 基准运行器** — 轻量级单工具 Agent 循环，以最小开销生成 SWE 轨迹。
5. **环境后端** — 执行后端抽象：本地、Docker、Modal、SSH、Daytona、Singularity。主机与远程环境间的文件同步。
6. **基准环境** — TerminalBench2、TBLite、YC-Bench，含评估脚本和 YAML 配置。
7. **工具调用解析器** — 模型特定解析器：DeepSeek v3/v3.1、Qwen/Qwen3-Coder、Llama、Mistral、GLM 4.5/4.7、Kimi K2、Hermes、LongCat。
8. **RL 训练 CLI** — 专用 RL 角色运行器，含环境列举、tinker-atropos 集成和先测后训工作流。

#### Hermes 源码参考
| 模块 | 关键函数/类 | 用途 |
|------|------------|------|
| `batch_runner.py` | `BatchRunner.run()`、检查点、统计 | 批量轨迹生成 |
| `toolset_distributions.py` | `sample_toolsets_from_distribution()`、`DISTRIBUTIONS` | 训练多样性 |
| `mini_swe_runner.py` | `MiniSWERunner.run_task()`、轨迹格式 | SWE 轨迹生成 |
| `rl_cli.py` | `main()`、RL 角色、环境集成 | RL 训练接口 |
| `environments/hermes_base_env.py` | `HermesBaseEnv`、奖励、步骤、终止 | 环境基类 |
| `environments/agent_loop.py` | 环境感知 Agent 循环 | RL Agent 编排 |
| `environments/tool_call_parsers/` | 10+ 模型特定解析器 | 工具调用提取 |
| `environments/benchmarks/` | TerminalBench2、TBLite、YC-Bench | 基准定义 |
| `tools/environments/` | 本地、Docker、Modal、SSH、Daytona、Singularity | 执行后端 |

#### OpenClaw 集成目标
| 目标文件 | 操作 |
|----------|------|
| 新增：`openclaw/src/training/` | 完整训练子系统（新顶级模块） |
| 新增：`openclaw/src/training/batch-runner.ts` | 批量轨迹生成 |
| 新增：`openclaw/src/training/trajectory-format.ts` | Hermes 兼容序列化 |
| 新增：`openclaw/src/training/toolset-distributions.ts` | 随机工具集采样 |
| 新增：`openclaw/src/training/environments/` | 环境后端抽象 |
| 新增：`openclaw/src/training/benchmarks/` | 基准环境适配器 |
| 新增：`openclaw/src/training/tool-call-parsers/` | 模型特定解析 |
| 新增：`openclaw/src/training/rl-cli.ts` | RL 训练接口 |

#### 预期成果
- OpenClaw 可从 Agent 交互中生成训练数据。
- 批量处理支持大规模轨迹生成用于模型微调。
- 工具集分布创建多样化训练样本。
- 基准环境实现系统化 Agent 评估。
- 多后端环境支持异构计算。

#### 验收标准
- [ ] 批量运行器处理 100 个提示，具备抗崩溃检查点。
- [ ] 工具集分布在 1000 次运行中产生统计多样的样本。
- [ ] 轨迹格式与 Hermes 训练流水线互操作。
- [ ] 至少 3 个环境后端（本地、Docker、SSH）可用。
- [ ] 至少 1 个基准环境产生评分结果。

#### 实施说明
本路径最为复杂，实施前需要**单独的设计文档**。它引入了新的顶级模块（`training/`），与现有 Agent 运行时耦合度低。建议方案：先从轨迹格式和批量运行器（数据生成）入手，RL CLI 和基准测试推迟到后续阶段。

#### TypeScript 适配说明
- **多进程批量**：使用 Node.js `worker_threads` 或 `child_process.fork()` 替代 Python `multiprocessing`。
- **JSONL 流处理**：使用 `readline` 接口或流式 JSON 解析器。
- **环境后端**：Docker 通过 `dockerode`，SSH 通过 `ssh2`，本地通过 `child_process`。
- **工具调用解析器**：直接移植基于正则的解析器；模型特定的 XML/JSON 提取模式与语言无关。

---

## 5）高价值首轮候选

基于影响力/工作量比和依赖分析，推荐的首轮范围：

1. **SQLite + FTS 会话持久化**（路径 A）— 填补最大的功能空白；即时的用户可见价值。
2. **技能安全卫士**（路径 B）— 安全关键；建立在现有成熟度信任框架上。
3. **错误分类器 + 凭证轮换**（路径 A）— 高可靠性提升；低耦合。
4. **提示缓存**（路径 C）— 直接成本降低；供应商特定但实现隔离。

这四项在不动摇现有循环/运行时设计的情况下提供高运营和安全价值。

---

## 6）风险与缓解措施

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Node.js 中 SQLite 与 Python 的性能特征不同 | 会话持久化可能较慢 | 对比测试 `better-sqlite3` 与 `sql.js`；使用 WAL 模式；考虑 LevelDB 作为备选 |
| 浏览器自动化增加大量依赖面 | 包体积膨胀、安全面扩大 | 浏览器工具设为可选；延迟加载 Playwright；使用提供商后端外部化 |
| 训练流水线深度依赖 Python 生态 | 移植工作量大；分词器依赖 | 仅先移植轨迹格式；Python 训练工具保留为外部流水线 |
| 中国平台 API 变更频繁 | 适配器维护负担 | 使用薄适配器模式；抽象平台特定逻辑；社区维护 |
| 插件钩子扩展可能破坏现有插件 | 向后兼容风险 | 钩子设为可选接入；新钩子名称不与现有注册冲突 |
| 技能安全扫描可能产生误报 | 用户摩擦 | 可配置严重性阈值；通过显式 `--force` 标志绕过 |
| 上下文引擎替换允许不受限制的插件行为 | 恶意插件的安全风险 | 上下文引擎替换需用户显式确认；沙箱化插件执行 |

---

## 7）交付阶段

### 阶段一 — 基础（P0：会话智能 + 安全）

**目标**：持久化会话与供应链安全。

- SQLite 后端的会话持久化
- 全文会话搜索
- 轨迹压缩（基础版）
- 技能安全卫士
- 基于清单的技能同步
- 错误分类器
- 凭证轮换
- URL 安全检查器

**退出标准**：所有 P0 验收标准通过；现有测试无回归。

### 阶段二 — 体验（P1：开发者体验 + 插件增强）

**目标**：更好的日常使用体验和更丰富的扩展性。

- Git worktree 隔离
- 提示缓存（Anthropic + OpenAI）
- 上下文引用自动注入
- 工具和 LLM 前后置钩子
- 上下文引擎替换 API
- 预算配置
- 澄清工具
- 插件 CLI 管理

**退出标准**：所有 P1 验收标准通过；插件 SDK 向后兼容。

### 阶段三 — 能力（P2：高级工具 + 网关平台）

**目标**：扩展工具面和平台覆盖。

- 浏览器自动化套件
- 多模型融合工具
- 语音/TTS 工具
- 后台进程监控
- 企业微信、钉钉、飞书适配器
- Webhook、邮件、短信适配器
- 网关镜像

**退出标准**：所有 P2 验收标准通过；新工具通过功能开关管控。

### 阶段四 — 训练（P3：训练流水线）

**目标**：数据生成与评估基础设施。

- 轨迹格式规范
- 批量运行器
- 工具集分布
- 环境后端（本地、Docker、SSH）
- 基准适配器（1 个基准）

**退出标准**：单独设计文档获批；批量运行器端到端处理 100 个提示。

---

## 8）成功指标

| 指标 | 目标 | 路径 |
|------|------|------|
| 会话恢复延迟 | 1000 条消息的会话 <100ms | A |
| FTS 搜索精度 | Top-5 结果 ≥90% 相关性 | A |
| 轨迹压缩率 | 50+ 轮对话 ≥40% token 缩减 | A |
| 技能卫士检出率 | OWASP 测试语料库 ≥90% | B |
| 提示缓存命中率 | Anthropic 重复交互 ≥60% | C |
| 插件钩子开销 | 每次钩子调用 <5ms | D |
| 浏览器工具成功率 | 标准网页交互流程 ≥85% | E |
| MoA 延迟倍率 | ≤2 倍单模型基线 | E |
| 批量吞吐量 | 4 核机器 ≥10 条轨迹/分钟 | G |

---

## 9）交付产物（规范周期）

1. **本规范文档** — `SPEC_OPENCLOW_IMPROVEMENTS_FROM_HERMES_AGENT_ANALYSIS.md`
2. **技术参考**（后续） — `HERMES_OPENCLAW_TECHNICAL_REFERENCE.md`：类型定义、函数签名和集成接线。
3. **执行计划**（后续） — `HERMES_OPENCLAW_EXECUTION_PLANS.md`：逐文件清单、提交拆分和测试计划。
4. **ADR** — 每条路径一个：
   - ADR：会话持久化模式和 SQLite 配置。
   - ADR：技能安全扫描威胁模式分类。
   - ADR：插件钩子分类和 SDK 扩展。
   - ADR：浏览器自动化提供商后端抽象。
   - ADR：中国企业平台网关适配器模式。
   - ADR：训练轨迹格式规范。
   - ADR：按供应商的提示缓存策略。
5. **测试套件** — 每条路径的验收测试文件。
6. **贡献者指南** — 用于添加新工具、适配器和安全模式。

---

## 10）约束提醒

- **仅限计划/规范** — 本文档不包含代码修改。
- **增量/非破坏性** — 所有提案扩展现有行为而不修改它。
- **交叉引用** — 基于 `SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2.md` 的先期工作；假设该规范的路径 A–G 已实施或进行中。
- **语言边界** — Hermes 是 Python；OpenClaw 是 TypeScript。所有适配必须考虑生态系统差异（SQLite 库、异步模式、进程模型）。
- **Hermes 源码路径** — 所有引用相对于工作区中的 `hermes-agent/` 目录。
- **OpenClaw 目标路径** — 所有引用相对于工作区中的 `openclaw/` 目录。
