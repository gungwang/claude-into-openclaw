---
name: Good First Issue - 路由可解释性
about: Track B 的入门任务
title: "[Good First Issue] 增加路由可解释性诊断输出"
labels: [good first issue, enhancement, diagnostics]
assignees: []
---

## 目标

为路由选择增加面向调试的解释输出格式。

## 为什么重要

随着工具表面扩大，贡献者需要知道为什么会选择某条路由，以及为什么其他候选没有被选中。

## 建议范围

- 增加 verbose 或 debug 输出模式
- 显示候选列表，或显示被选中候选及其原因
- 尽量复用现有的路由相关 CLI 路径

## 验收标准

- 用户可以触发路由解释输出
- 输出中包含分数、原因或排序细节
- 新行为有文档说明或测试覆盖

## 对应规范

- Track B：路由可解释性与基准测试
