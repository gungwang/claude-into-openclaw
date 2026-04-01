---
name: Good First Issue - 模式契约测试
about: Track E 的入门任务
title: "[Good First Issue] 搭建模式契约测试脚手架"
labels: [good first issue, testing, reliability]
assignees: []
---

## 目标

为某一种运行模式创建第一版契约测试。

## 为什么重要

规范指出，模式行为漂移是一个真实风险。测试脚手架能够为后续可靠性工作打下基础。

## 建议范围

- 选择一种模式，例如 remote、SSH、teleport 或 direct
- 定义一个最小的成功路径和失败路径契约
- 即使运行时仍不完整，也先添加测试名称或骨架

## 验收标准

- 至少一个模式拥有文档化的契约预期
- 仓库中存在测试或测试脚手架
- 失败状态的命名足够清晰，便于后续扩展

## 对应规范

- Track E：模式契约测试矩阵
