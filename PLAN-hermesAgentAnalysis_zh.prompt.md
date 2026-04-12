# 计划：Hermes-Agent 分析与 OpenClaw 规范

分析 hermes-agent 功能，与 openclaw 进行对比，并生成规范文档（`SPEC_OPENCLOW_IMPROVEMENTS_FROM_HERMES_AGENT_ANALYSIS.md`），沿用之前 claw-code V2 规范的相同格式。

## 第一阶段：探索（已完成）

两个代码库均已深入探索。从 50 余项 hermes-agent 独有/优势功能中识别出 7 条改进路径。

## 第二阶段：编写规范文档

在仓库根目录创建 `SPEC_OPENCLOW_IMPROVEMENTS_FROM_HERMES_AGENT_ANALYSIS.md`，结构如下：
- 执行摘要、观察信号、基线优势
- 7 条改进路径（A–G），每条包含：问题/提案/预期成果/验收标准
- 优先级矩阵、交付阶段、风险、成功指标

## 7 条改进路径

| 优先级 | 路径 | 描述 | 关键 Hermes 源码 |
|--------|------|------|------------------|
| **P0** | **D — 会话智能** | SQLite WAL+FTS 持久化、轨迹压缩、智能模型路由、错误分类器、凭证池、速率限制追踪 | `hermes_state.py`、`trajectory_compressor.py`、`agent/smart_model_routing.py`、`agent/error_classifier.py` |
| **P0** | **C — 安全与供应链** | 技能安全卫士（20+ 威胁模式）、基于清单的技能同步、URL 安全检查、OSV 漏洞扫描、凭证文件检测 | `tools/skills_guard.py`、`tools/skills_sync.py`、`tools/url_safety.py`、`tools/osv_check.py` |
| **P1** | **G — 开发者体验** | Git worktree 隔离、提示缓存、上下文引用/子目录提示、预算配置、澄清工具、手动压缩反馈 | `cli.py`（worktree）、`agent/prompt_caching.py`、`agent/context_references.py`、`tools/budget_config.py` |
| **P1** | **E — 插件增强** | 更丰富的生命周期钩子（工具/LLM 前后置）、上下文引擎替换、实时消息注入、插件 CLI 管理、插件注册工具集 | `hermes_cli/plugins.py`、`hermes_cli/plugins_cmd.py` |
| **P2** | **B — 高级工具** | 完整浏览器自动化（10 个工具，3 种提供商后端）、多模型融合（MoA）、语音/TTS、图像生成、后台进程通知、检查点管理 | `tools/browser_tool.py`、`tools/mixture_of_agents_tool.py`、`tools/tts_tool.py`、`tools/checkpoint_manager.py` |
| **P2** | **F — 网关平台** | 企业微信、钉钉、飞书、微信、Mattermost、WhatsApp Cloud、短信、邮件、Webhook；网关镜像与多目标投递 | `gateway/platforms/` |
| **P3** | **A — 训练流水线** | RL CLI、批量运行器、工具集分布、SWE 基准运行器、环境后端（Docker/Modal/SSH/Daytona/Singularity）、工具调用解析器 | `rl_cli.py`、`batch_runner.py`、`toolset_distributions.py`、`mini_swe_runner.py`、`environments/` |

---

## 路径 D — 会话智能（P0）

### 问题
OpenClaw 的会话日志仅存于内存中（`session-event-journal.ts`）。缺乏持久化会话搜索、轨迹压缩、结构化错误分类重试逻辑、按供应商的速率限制追踪以及凭证轮换/恢复。Hermes 在这些方面均有成熟实现。

### Hermes 源码参考
- `hermes_state.py` — SQLite WAL + FTS5 会话数据库，含模式迁移梯度、写入竞争处理（BEGIN IMMEDIATE + 抖动退避）、通过 `parent_session_id` 实现的会话谱系以及带查询清洗的全文搜索
- `trajectory_compressor.py` — 预算感知的中间段摘要，保持执行连续性；异步扇出+信号量；含单轨迹与聚合统计的指标管道；通过 `auxiliary_client` 的供应商抽象
- `agent/smart_model_routing.py` — 基于任务的自动模型选择逻辑
- `agent/error_classifier.py` — 结构化错误分类（瞬态/永久、速率限制/认证/模型）用于重试决策
- `agent/credential_pool.py` — 多密钥轮换，认证失败时自动恢复
- `agent/rate_limit_tracker.py` — 按供应商的速率限制监控与退避协调
- `agent/usage_pricing.py` — 按 token 的成本归因，含模型特定价格表
- `tools/session_search_tool.py` — 通过 FTS5 的跨会话知识检索

### OpenClaw 集成目标
- `openclaw/src/agents/session-event-journal.ts` — 扩展持久化后端
- `openclaw/src/agents/journal-integration.ts` — 将持久化接入运行循环
- `openclaw/src/agents/pi-embedded-runner/run.ts` — 添加错误分类、凭证轮换、速率限制感知
- `openclaw/src/config/types.openclaw.ts` — 添加会话持久化配置区块
- 新增：`openclaw/src/agents/session-persistence.ts` — SQLite 后端（better-sqlite3 或 sql.js）
- 新增：`openclaw/src/agents/trajectory-compressor.ts` — 移植压缩管道
- 新增：`openclaw/src/agents/error-classifier.ts` — 结构化错误分类
- 新增：`openclaw/src/agents/smart-model-routing.ts` — 任务→模型选择
- 新增：`openclaw/src/agents/rate-limit-tracker.ts` — 按供应商的监控

### 预期成果
- 会话在进程重启后保留完整消息历史和推理产物
- 跨所有历史会话的全文搜索
- 自动轨迹压缩降低长对话的 token 成本
- 结构化重试防止瞬态 API 故障暴露给用户
- 凭证轮换避免单密钥耗尽导致工作中断

### 验收标准
- [ ] 会话数据跨进程重启持久化，恢复延迟 <100ms
- [ ] FTS 搜索在 1000+ 会话中返回相关结果
- [ ] 轨迹压缩在 >50 轮对话中减少 ≥40% 的 token 数量
- [ ] 错误分类器正确分类 ≥95% 的常见 API 错误
- [ ] 凭证轮换在 401/429 响应时自动触发，无需用户干预

### TypeScript 适配说明
- SQLite：使用 `better-sqlite3`（同步，WAL 模式兼容）或 `sql.js`（WASM，无原生依赖）。Hermes 使用 Python sqlite3 的 WAL + FTS5 — 两种 Node.js 方案均支持。
- 异步压缩扇出：使用 `Promise.all` + 并发限制器（p-limit）替代 Python asyncio 信号量。
- 写入竞争：Node.js 单线程模型下 BEGIN IMMEDIATE + 重试比 Python 多进程模型更简单。

---

## 路径 C — 安全与供应链（P0）

### 问题
OpenClaw 有成熟度信任框架（`maturity-trust.ts`），但缺乏安装前的技能安全扫描、OSV 漏洞检查、URL 安全验证以及基于清单的技能同步。Hermes 拥有完善的供应链防御层。

### Hermes 源码参考
- `tools/skills_guard.py` — `scan_skill()`、`should_allow_install()`、`format_scan_report()`；20+ 威胁模式类别（数据外泄、注入、破坏、持久化、提权、混淆、符号链接逃逸、二进制检测、超大载荷）；信任级别策略矩阵（内置/社区/Agent 创建）；`Finding` 和 `ScanResult` 数据类
- `tools/skills_sync.py` — `sync_skills()` 基于清单的三方协调（内置源哈希 vs 当前用户哈希 vs 新内置哈希）；保留用户自定义；原子清单写入；从 v1 格式迁移
- `tools/url_safety.py` — 获取操作前的 URL 验证和安全检查
- `tools/osv_check.py` — OSV.dev API 集成，依赖漏洞扫描
- `tools/credential_files.py` — 工作区中凭证/密钥文件检测
- `tools/path_security.py` — 路径穿越和符号链接逃逸防护

### OpenClaw 集成目标
- `openclaw/src/agents/skills-install.ts` — 添加安装前安全扫描关卡
- `openclaw/src/agents/skills.ts` — 添加内置技能的基于清单的同步
- `openclaw/src/agents/maturity-trust.ts` — 扩展信任模型，纳入扫描裁决
- `openclaw/src/plugins/install.ts` — 添加插件安全扫描
- `openclaw/src/config/types.tools.ts` — 添加安全扫描配置选项
- 新增：`openclaw/src/agents/skills-guard.ts` — 移植威胁模式扫描器
- 新增：`openclaw/src/agents/skills-sync.ts` — 移植基于清单的同步
- 新增：`openclaw/src/agents/url-safety.ts` — URL 验证服务
- 新增：`openclaw/src/agents/osv-check.ts` — OSV 漏洞扫描器

### 预期成果
- 技能安装前扫描恶意模式
- 内置技能安全更新，不丢失用户自定义
- Agent 获取操作前验证 URL
- 依赖项对照已知漏洞数据库检查
- 凭证文件在暴露给 Agent 上下文前被标记

### 验收标准
- [ ] 技能卫士在测试语料库中检测出 ≥90% 的 OWASP 分类注入模式
- [ ] 技能同步在 100% 的内置更新周期中保留用户修改
- [ ] URL 安全检查阻止已知恶意和内网 URL
- [ ] OSV 检查报告项目依赖的已知 CVE
- [ ] 凭证文件检测标记 .env、.pem、.key 及常见密钥文件

---

## 路径 G — 开发者体验（P1）

### 问题
OpenClaw 缺乏用于安全并发编辑的 git worktree 隔离、无供应商特定的提示缓存优化、无基于项目结构的自动上下文引用注入、无工具级预算配置以及无显式澄清工具供用户消歧。

### Hermes 源码参考
- `cli.py`（约 674–773 行） — 用于隔离并发编辑的 Git worktree 创建/清理
- `agent/prompt_caching.py` — 供应商特定缓存优化（Anthropic cache_control、OpenAI predicted_outputs 等）
- `agent/context_references.py` — 基于项目结构的自动上下文引用检测与注入
- `agent/subdirectory_hints.py` — 目录结构导航提示
- `tools/budget_config.py` — 按工具的成本预算限制与追踪
- `tools/clarify_tool.py` — 显式用户澄清请求工具
- `agent/manual_compression_feedback.py` — 上下文压缩决策的用户反馈环
- `agent/insights.py` — 会话分析与洞察生成
- `tools/checkpoint_manager.py` — 基于 Git 的检查点创建与回滚

### OpenClaw 集成目标
- `openclaw/src/agents/pi-embedded-runner/run.ts` — 添加 worktree 隔离、提示缓存、上下文引用
- `openclaw/src/agents/pi-tools.ts` — 添加澄清工具、预算配置
- `openclaw/src/config/types.tools.ts` — 添加按工具的预算限制
- 新增：`openclaw/src/agents/git-worktree.ts` — Worktree 隔离管理器
- 新增：`openclaw/src/agents/prompt-caching.ts` — 供应商特定缓存策略
- 新增：`openclaw/src/agents/context-references.ts` — 自动引用注入
- 新增：`openclaw/src/agents/budget-tracker.ts` — 成本预算执行

### 预期成果
- 并发编辑会话通过 worktree 隔离互不冲突
- 通过供应商特定提示缓存降低 token 成本
- Agent 基于目录结构自动引用相关项目文件
- 用户可设置按工具和按会话的成本预算
- Agent 可主动请求澄清而非猜测

### 验收标准
- [ ] Git worktree 创建和清理隔离分支，无数据丢失
- [ ] 提示缓存使 Anthropic 供应商的冗余 token 使用减少 ≥30%
- [ ] 上下文引用正确识别给定任务 ≥80% 的相关文件
- [ ] 预算执行在超出成本限制时停止工具执行
- [ ] 当 Agent 置信度低于配置阈值时触发澄清工具

---

## 路径 E — 插件增强（P1）

### 问题
OpenClaw 的插件系统（`plugins/registry.ts`）支持工具、通道、供应商、钩子、HTTP 路由、服务和 CLI 命令注册。但缺乏工具和 LLM 调用的细粒度前后置钩子、上下文引擎替换、活跃会话的实时消息注入以及插件管理的工具集注册。Hermes 提供了所有这些功能。

### Hermes 源码参考
- `hermes_cli/plugins.py` — `PluginContext`：含 `register_tool()`、`register_hook()`、`register_cli_command()`、`register_context_engine()`、`inject_message()`；`PluginManager`：含 `discover_and_load()`、`invoke_hook()`；钩子总线，每个回调有故障隔离
- `hermes_cli/plugins_cmd.py` — `cmd_install()`、`cmd_update()`、`cmd_remove()`、`cmd_enable()`、`cmd_disable()`、`cmd_toggle()`；清单兼容性把关；安全安装名称清洗
- 钩子名称：`pre_tool_call`、`post_tool_call`、`pre_llm_call`、`post_llm_call`、`session_start`、`session_end`、`session_finalize`、`session_reset`

### OpenClaw 集成目标
- `openclaw/src/plugins/registry.ts` — 扩展钩子分类，增加工具/LLM 前后置钩子
- `openclaw/src/plugins/discovery.ts` — 添加上下文引擎替换能力
- `openclaw/src/plugin-sdk/` — 在公共 SDK 中暴露新钩子类型
- `openclaw/src/agents/pi-embedded-runner/run.ts` — 将前后置钩子接入 Agent 循环
- `openclaw/src/gateway/server-methods/` — 添加插件管理 API 方法

### 预期成果
- 插件可观察和修改进行中的工具调用和 LLM 请求
- 插件可替换上下文引擎以实现自定义检索策略
- 外部系统可向活跃会话注入消息，实现实时协调
- 插件生命周期管理完全通过 API 可访问

### 验收标准
- [ ] 前后置工具钩子在每次工具调用时正确触发，开销 <5ms
- [ ] 上下文引擎替换正确服务所有现有检索查询
- [ ] 消息注入在当前轮次的上下文窗口内投递内容
- [ ] 插件安装/更新/删除操作幂等且抗崩溃

---

## 路径 B — 高级工具（P2）

### 问题
OpenClaw 拥有核心工具（消息、会话、子 Agent、定时任务、网页获取、图片/PDF），但缺乏完整的浏览器自动化、多模型共识（多模型融合）、语音/TTS 合成、音频转录、图像生成、带监视模式的后台进程通知以及基于 Git 的检查点/回滚。

### Hermes 源码参考
- `tools/browser_tool.py` — 10 个浏览器工具：`browser_navigate`、`browser_snapshot`、`browser_click`、`browser_type`、`browser_scroll`、`browser_back`、`browser_press`、`browser_get_images`、`browser_vision`、`browser_console`；
- `tools/browser_providers/` 中的提供商后端（Browserbase、Firecrawl、browser-use）
- `tools/mixture_of_agents_tool.py` — 通过并行委托给不同模型然后综合的多模型共识
- `tools/tts_tool.py` — 支持多引擎后端的文本转语音合成
- `tools/voice_mode.py` — 语音交互模式
- `tools/transcription_tools.py` — 音频转录
- `tools/image_generation_tool.py` — 图像生成工具
- `tools/process_registry.py` — 后台进程追踪：监视模式和完成通知
- `tools/checkpoint_manager.py` — 基于 Git 的检查点创建与回滚
- `tools/homeassistant_tool.py` — Home Assistant 物联网集成（4 个工具）

### OpenClaw 集成目标
- `openclaw/src/agents/pi-tools.ts` — 注册新工具定义
- `openclaw/src/agents/tool-policy-pipeline.ts` — 为新工具添加策略规则
- `openclaw/src/agents/subagent-registry.ts` — 扩展以支持 MoA 模式
- 新增：`openclaw/src/tools/browser-automation.ts` — 浏览器工具套件
- 新增：`openclaw/src/tools/mixture-of-agents.ts` — 多模型共识
- 新增：`openclaw/src/tools/voice-tts.ts` — 文本转语音
- 新增：`openclaw/src/tools/checkpoint-manager.ts` — Git 检查点/回滚
- 新增：`openclaw/src/tools/process-monitor.ts` — 后台进程通知

### 预期成果
- Agent 可导航、交互和提取网页数据
- 多模型共识提高复杂问题的回答质量
- 语音输出扩展可访问性和使用场景
- 后台进程被监控并自动通知
- Git 检查点实现 Agent 所做更改的安全回滚

### 验收标准
- [ ] 浏览器工具可端到端完成 5 步网页交互流程
- [ ] MoA 在 ≥3 个模型中产生综合输出，延迟 ≤2 倍单模型
- [ ] TTS 在 <10s 内为 ≤5000 字符的文本生成音频输出
- [ ] 后台进程监视模式在匹配后 1s 内触发通知
- [ ] 检查点回滚恢复精确文件状态，通过 git diff 验证

---

## 路径 F — 网关平台（P2）

### 问题
OpenClaw 支持 Telegram、Discord、Slack、Signal、iMessage/BlueBubbles、WhatsApp、Matrix 和 Teams。Hermes 增加了多个中国企业平台（企业微信、钉钉、飞书、微信公众号）及 Mattermost、短信、邮件和通用 Webhook 适配器。还增加了网关镜像和多目标投递路由。

### Hermes 源码参考
- `gateway/platforms/wecom.py`、`gateway/platforms/wecom_crypto.py`、`gateway/platforms/wecom_callback.py` — 企业微信适配器，含消息加解密
- `gateway/platforms/dingtalk.py` — 钉钉适配器
- `gateway/platforms/feishu.py` — 飞书/Lark 适配器
- `gateway/platforms/weixin.py` — 微信公众号适配器
- `gateway/platforms/mattermost.py` — Mattermost 适配器
- `gateway/platforms/sms.py` — 短信适配器
- `gateway/platforms/email.py` — 邮件适配器
- `gateway/platforms/webhook.py` — 通用 Webhook 适配器
- `gateway/mirror.py` — 网关镜像，跨平台消息中继
- `gateway/delivery.py` — 多目标投递路由和目标解析

### OpenClaw 集成目标
- `openclaw/src/channels/` — 添加新通道适配器
- `openclaw/src/gateway/` — 添加镜像和投递路由
- `openclaw/src/config/types.openclaw.ts` — 为新平台添加通道配置
- `openclaw/extensions/` — 作为扩展包添加

### 预期成果
- OpenClaw 通过企业微信/钉钉/飞书打入中国企业市场
- 通用 Webhook 适配器支持与任何 HTTP 能力系统的集成
- 邮件和短信适配器将触达扩展到非聊天平台
- 网关镜像实现跨平台消息中继

### 验收标准
- [ ] 每个新适配器以平台特定格式发送和接收文本消息
- [ ] 企业微信适配器正确处理消息加解密
- [ ] Webhook 适配器接受和响应任意 HTTP POST 载荷
- [ ] 网关镜像在 ≥2 个平台间中继消息，延迟 <2s
- [ ] 多目标投递正确路由到所有指定目标

### 合规说明
中国平台适配器（企业微信、钉钉、飞书、微信）需要特定区域的 API 端点，可能有数据驻留合规要求。实现应支持可配置的 API 基础 URL 并记录合规注意事项。

---

## 路径 A — 训练与评估流水线（P3）

### 问题
OpenClaw 没有训练、评估或基准测试基础设施。Hermes 提供了完整的 ML-ops 流水线，包括 RL 训练 CLI、批量轨迹生成、工具集分布采样、SWE 基准执行、多后端环境管理以及模型特定的工具调用解析。

### Hermes 源码参考
- `rl_cli.py` — RL CLI：专用角色、环境列举、tinker-atropos 集成、30 分钟检查节奏、先测后训工作流
- `batch_runner.py` — 多进程批量执行：JSONL 检查点、通过检查点索引+内容去重的抗崩溃恢复、按样本的工具集随机性、按虚构工具名的坏轨迹过滤、推理覆盖率把关
- `toolset_distributions.py` — 每个工具集的独立伯努利采样，保证训练多样性；非空回退保证
- `mini_swe_runner.py` — 轻量级单工具 Agent 循环，用于 SWE 轨迹生成；Hermes 兼容的轨迹格式
- `environments/hermes_base_env.py` — 环境基类：奖励计算、步骤管理、终止检测
- `environments/agent_loop.py` — 环境感知的 Agent 循环
- `environments/tool_context.py` — 环境后端的工具执行上下文
- `environments/tool_call_parsers/` — 模型特定解析器：DeepSeek v3/v3.1、Qwen/Qwen3-Coder、Llama、Mistral、GLM 4.5/4.7、Kimi K2、Hermes、LongCat
- `environments/benchmarks/` — TerminalBench2、TBLite、YC-Bench，含评估脚本和 YAML 配置
- `tools/environments/` — 执行后端：本地、Docker、Modal、SSH、Daytona、Singularity

### OpenClaw 集成目标
- 新增：`openclaw/src/training/` — 完整训练子系统（新顶级模块）
- 新增：`openclaw/src/training/batch-runner.ts` — 批量轨迹生成
- 新增：`openclaw/src/training/rl-cli.ts` — RL 训练接口
- 新增：`openclaw/src/training/trajectory-format.ts` — Hermes 兼容的轨迹序列化
- 新增：`openclaw/src/training/toolset-distributions.ts` — 随机工具集采样
- 新增：`openclaw/src/training/environments/` — 环境后端抽象
- 新增：`openclaw/src/training/benchmarks/` — 基准环境适配器
- 新增：`openclaw/src/training/tool-call-parsers/` — 模型特定解析

### 预期成果
- OpenClaw 可从 Agent 交互中生成训练数据
- 批量处理支持大规模轨迹生成用于模型微调
- 工具集分布创建多样化训练样本
- 基准环境实现系统化 Agent 评估
- 多后端环境支持异构计算

### 验收标准
- [ ] 批量运行器处理 100 个提示，具备抗崩溃检查点
- [ ] 工具集分布在 1000 次运行中产生统计多样的样本
- [ ] 轨迹格式与 Hermes 训练流水线互操作
- [ ] 至少 3 个环境后端（本地、Docker、SSH）可用
- [ ] 至少 1 个基准环境产生评分结果

### 实施说明
本路径最为复杂，实施前需要单独的设计文档。它引入了新的顶级模块（`training/`），与现有 Agent 运行时耦合度低。建议方案：先从轨迹格式和批量运行器（数据生成）入手，RL CLI 和基准测试推迟到后续阶段。

### TypeScript 适配说明
- 多进程批量：使用 Node.js `worker_threads` 或 `child_process.fork()` 替代 Python `multiprocessing`
- JSONL 流处理：使用 `readline` 接口或流式 JSON 解析器
- 环境后端：Docker 通过 `dockerode`，SSH 通过 `ssh2`，本地通过 `child_process`
- 工具调用解析器：直接移植基于正则的解析器；模型特定的 XML/JSON 提取模式与语言无关

---

## 风险与缓解措施

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Node.js 中 SQLite 与 Python 的性能特征不同 | 会话持久化可能较慢 | 对比测试 `better-sqlite3` 与 `sql.js`；使用 WAL 模式；考虑 LevelDB 作为备选 |
| 浏览器自动化增加大量依赖面 | 包体积膨胀、安全面扩大 | 浏览器工具设为可选；延迟加载 Playwright；使用提供商后端外部化 |
| 训练流水线深度依赖 Python 生态 | 移植工作量大；分词器依赖 | 仅先移植轨迹格式；Python 训练工具保留为外部流水线 |
| 中国平台 API 变更频繁 | 适配器维护负担 | 使用薄适配器模式；抽象平台特定逻辑；社区维护 |
| 插件钩子扩展可能破坏现有插件 | 向后兼容风险 | 钩子设为可选接入；新钩子名称不与现有注册冲突 |
| 技能安全扫描可能产生误报 | 用户摩擦 | 可配置严重性阈值；通过显式 `--force` 标志绕过 |

---

## 交付阶段

### 阶段一：基础（P0 — 会话智能 + 安全）
**目标**：持久化会话与供应链安全
- SQLite 后端的会话持久化
- 全文会话搜索
- 轨迹压缩（基础版）
- 技能安全卫士
- 基于清单的技能同步
- 错误分类器
- 凭证轮换
**退出标准**：所有 P0 验收标准通过；现有测试无回归

### 阶段二：体验（P1 — 开发者体验 + 插件增强）
**目标**：更好的日常使用体验和更丰富的扩展性
- Git worktree 隔离
- 提示缓存（Anthropic + OpenAI）
- 上下文引用自动注入
- 工具和 LLM 前后置钩子
- 上下文引擎替换 API
- 预算配置
- 澄清工具
**退出标准**：所有 P1 验收标准通过；插件 SDK 向后兼容

### 阶段三：能力（P2 — 高级工具 + 网关平台）
**目标**：扩展工具面和平台覆盖
- 浏览器自动化套件
- 多模型融合工具
- 语音/TTS 工具
- 检查点管理器
- 企业微信、钉钉、飞书适配器
- Webhook、邮件、短信适配器
- 网关镜像
**退出标准**：所有 P2 验收标准通过；新工具通过功能开关管控

### 阶段四：训练（P3 — 训练流水线）
**目标**：数据生成与评估基础设施
- 轨迹格式规范
- 批量运行器
- 工具集分布
- 环境后端（本地、Docker、SSH）
- 基准适配器（1 个基准）
**退出标准**：单独设计文档获批；批量运行器端到端处理 100 个提示

---

## 成功指标

| 指标 | 目标 | 路径 |
|------|------|------|
| 会话恢复延迟 | 1000 条消息的会话 <100ms | D |
| FTS 搜索精度 | Top-5 结果 ≥90% 相关性 | D |
| 轨迹压缩率 | 50+ 轮对话 ≥40% token 缩减 | D |
| 技能卫士检出率 | OWASP 测试语料库 ≥90% | C |
| 提示缓存命中率 | Anthropic 重复交互 ≥60% | G |
| 插件钩子开销 | 每次钩子调用 <5ms | E |
| 浏览器工具成功率 | 标准网页交互流程 ≥85% | B |
| MoA 延迟倍率 | ≤2 倍单模型基线 | B |
| 批量吞吐量 | 4 核机器 ≥10 条轨迹/分钟 | A |

---

## 交付产物

1. **本规范文档** — `SPEC_OPENCLOW_IMPROVEMENTS_FROM_HERMES_AGENT_ANALYSIS.md`
2. **技术参考**（后续） — `HERMES_OPENCLAW_TECHNICAL_REFERENCE.md`：类型定义、函数签名、集成接线
3. **执行计划**（后续） — `HERMES_OPENCLAW_EXECUTION_PLANS.md`：逐文件清单、提交拆分、测试计划
4. **ADR** — 每条路径一个，用于模式级决策
5. **测试套件** — 每条路径的验收测试文件

---

## 约束提醒

- **仅限计划/规范** — 本文档不实施任何代码变更
- **增量/非破坏性** — 所有提案扩展现有行为而不修改它
- **交叉引用** — 基于 `SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2.md` 的先期工作；假设该规范的路径 A–G 已实施或进行中
- **语言边界** — Hermes 是 Python；OpenClaw 是 TypeScript。所有适配必须考虑生态系统差异
