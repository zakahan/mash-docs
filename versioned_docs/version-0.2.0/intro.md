---
slug: /
title: 概览
---
# VeADK Agent Loop

这个镜像为 AgentKit Runtime 提供三种组件。应用开发者根据调用方式选择入口；扩展运行时的开发者可以从各篇的执行过程进入实现。

| 组件 | 在 AgentKit 中的职责 | 使用入口 |
|---|---|---|
| Harness App | 接收应用请求，组装本轮 Agent，执行模型与工具调用，返回文本或流式事件。 | [调用与会话](app/guide.md) |
| Managed Agents Worker | 执行托管会话的工作，消费固定的 Agent 配置，向托管服务回传执行事件。应用通过 Session 数据面读写消息。 | [托管会话指南](managed/guide.md) |
| Studio Harness | 为 Studio 提供独立的 Harness 服务。镜像代理通过请求头 `X-AgentKit-Target: studio` 将请求转给该服务。 | 从 AgentKit Studio 使用 |

## Harness 资源与运行时组件

在 AgentKit 控制面，Harness 是一个有标识、有修订版本的配置资源，可描述模型、系统指令、工具与技能。调用方通过 [Agentkit:Harness 管理接口](api/harness.md) 管理这些配置。Harness App 是镜像里的服务名称。它的调用参数使用自己的请求结构，例如 `harness.system_prompt`。Managed Agents 在创建 Session 时通过 `agent` 引用 Harness，把选定的配置固定在会话中。

本站的版本选择器表示镜像版本；资源字段 `HarnessVersion` 表示某个 Harness 的配置修订号。[版本说明](versions.md)

## Studio Harness 开关

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `STUDIO_ENABLED` | `true` | 在共享镜像中启用 Studio Harness，Studio 请求由 X-AgentKit-Target: studio 路由。 |
