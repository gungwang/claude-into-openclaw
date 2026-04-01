---
name: Good First Issue - 策略原因代码
about: Track D 的入门任务
title: "[Good First Issue] 在详细诊断中暴露策略原因代码"
labels: [good first issue, enhancement, governance]
assignees: []
---

## 目标

当命令或工具被拒绝、受限或以特殊方式被允许时，输出结构化的策略原因代码。

## 为什么重要

OpenClaw 需要清楚回答为什么某个动作被阻止或允许。这是治理能力和可支持性的改进。

## 建议范围

- 增加一个小型原因代码分类
- 在 verbose 或 debug 模式下暴露至少一条原因路径
- 第一版实现应保持范围小且可测试

## 验收标准

- 详细诊断中至少显示一个结构化原因代码
- 原因代码与真实执行路径绑定
- 相关行为有文档说明或测试覆盖

## 对应规范

- Track D：策略决策可追溯性
