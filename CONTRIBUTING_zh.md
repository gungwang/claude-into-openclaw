# 贡献指南

感谢你为本仓库做出贡献。

本项目聚焦于把 claw-code 分析中提炼出的经验用于改进 OpenClaw。当前路线图由 [SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2.md](./SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2.md) 驱动，因此最有价值的贡献，是那些能让这些改进方向变得更具体、更可测试、更容易实现的工作。

## 开始之前

1. 阅读 [README.md](./README.md) 中的项目目的。
2. 阅读 [SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2.md](./SPEC_OPENCLOW_IMPROVEMENTS_FROM_CLAW_CODE_ANALYSIS_V2.md) 中的路线图。
3. 查看入门任务清单 [GOOD_FIRST_ISSUES.md](./GOOD_FIRST_ISSUES.md)。
4. 编辑 Markdown 文档时，请同时维护英文版和中文版。

## 本地环境准备

克隆仓库：

```bash
git clone https://github.com/gungwang/claude-code-openclaw.git
cd claude-code-openclaw
```

可选的虚拟环境：

```bash
python3 -m venv .venv
source .venv/bin/activate
```

常用命令：

```bash
python3 -m src.main summary
python3 -m src.main manifest
python3 -m src.main parity-audit
python3 -m unittest discover -s tests -v
```

## 欢迎的贡献方向

- 与规范中 A-G 轨道一致的改进
- 更好的诊断、可解释性和治理原语
- 更安全的插件和工具生命周期处理
- 文档、入门流程和贡献者体验优化
- 让迁移和对等进展可衡量的测试

## 贡献规则

1. 优先提交聚焦的小改动，而不是大范围重构。
2. 将你的工作关联到某一个规范轨道或具体问题陈述。
3. 当行为或工作流发生变化时，同时更新文档。
4. 修改运行时或路由行为时，请补充或更新测试。
5. 除非有明确理由，否则不要随意改变现有项目结构。

## 文档规则

- 如果新增顶层 Markdown 文档，请同时提供带 `_zh.md` 后缀的中文版。
- 如果修改现有双语文档，请在同一次变更中同时更新两个版本。
- 在 README、规范文档和 Issue 模板之间保持术语一致。

## Pull Request 检查清单

提交 Pull Request 前，请确认：

- 已阅读相关规范部分
- 已清晰限定改动范围
- 已更新相关文档
- 已在本地运行相关测试
- 已说明此改动对 OpenClaw 的价值

## 适合新贡献者的起点

如果你刚接触这个代码库，可以从以下方向开始：

- 为命令和工具条目添加规范化 ID
- 增加路由可解释性输出
- 生成成熟度级别报告工件
- 暴露策略原因代码
- 搭建模式契约测试脚手架

## 社区标准

参与本项目即表示你同意遵守 [CODE_OF_CONDUCT_zh.md](./CODE_OF_CONDUCT_zh.md)。
