---
name: Good First Issue - 规范化注册表 ID
about: Track A 的入门任务
title: "[Good First Issue] 为注册表条目添加规范化 ID"
labels: [good first issue, enhancement, governance]
assignees: []
---

## 目标

为命令或工具注册表条目添加稳定、带命名空间的 ID。

## 为什么重要

规范指出，重复名称压力是扩展过程中的核心问题。规范化 ID 是实现更安全路由和更好审计的第一步。

## 建议范围

- 找到命令或工具注册表结构
- 在至少一条注册表路径中添加 `id` 字段
- 在一条校验路径中拒绝或标记重复 ID

## 验收标准

- 至少一条注册表路径暴露规范化 ID
- 能检测或警告重复 ID
- 如有需要，同步更新相关文档或帮助信息

## 对应规范

- Track A：规范化工具/命令身份层
