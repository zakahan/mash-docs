# Agent 配置与版本管理

在[实战教学](flow.md)中，我们在创建 Session 时提供 `workspaceId`、`agentId` 和 `environmentId`，将一个具体的 Agent 及其执行环境绑定到当前对话。后续消息可以沿用其中的模型、系统指令、Skill、MCP 和沙箱配置，不需要每轮重新提交。

但一次对话可能持续数小时甚至数天。在此期间，其他调用方可能通过 `UpdateAgent` 修改 Agent；开发者也可能只想临时调整某一轮，而不影响其他会话。要正确处理这些需求，需要先区分三件事：创建 Session 时绑定的是配置来源，实例快照承载解析后的执行配置，`/run_sse` 中的 `harness` object 只覆盖当前一轮。

![会话绑定、实例快照与单轮覆盖的分层关系](/img/next/snapshot-layers.svg)

## 创建阶段的 `agentId` 决定配置来源

创建 Session 时提交的三个 ID 组成一组会话绑定，各自承担不同职责。

| 字段 | 作用 |
| --- | --- |
| `workspaceId` | 限定 Agent 和 Environment 所属的 Workspace，也是查询两个资源时使用的范围 |
| `agentId` | 指向模型、系统指令、Skill 和 MCP 等对话配置的来源 |
| `environmentId` | 指向执行环境，Harness App 从中取得沙箱 `ToolId`（可选；省略时不启用沙箱） |

`agentId` 本身不是 Agent 配置，也不是一份可以直接执行的快照。创建 Session 时，Harness App 使用这组绑定调用 `GetAgent`（及可选的 `GetEnvironment`），确认资源属于同一 Workspace、状态可用，再把控制面结构转换成运行时配置。例如，`Model.Id` 转换为 `model_name`，`System` 转换为 `system_prompt`，Environment 的 `ToolId` 转换为 `sandbox.tool_id`。

绑定 ID 随 Session state 保存，解析后的结果则缓存在 Harness App 实例中。可以把两者的职责理解为：

```text
会话绑定 B = (workspaceId, agentId, environmentId?)
实例快照 S = resolve(B)
```

Session state 保存“配置来自哪里”，实例快照保存“当前执行具体使用什么”。查询或转换失败时，创建请求直接失败，不会留下只有绑定而没有可用配置的新 Session。

后续普通 `/run_sse` 请求复用实例快照，不会每轮重新调用控制面。这样既减少控制面调用，也为多轮对话提供稳定的配置基线。控制面中的 Agent 发生变化时，已有会话不会立即改变。

## `UpdateAgent` 后主动刷新快照

`UpdateAgent` 修改的是控制面中的 Agent 资源。它不会把新配置主动推送到正在运行的 Harness App，也不会直接替换已有 Session 使用的快照。

如果希望已有 Session 采用更新后的配置，在下一次 `/run_sse` 请求中设置 `refreshSnapshot: true`：

```json
{
  "appName": "harness_agent",
  "userId": "tutorial-user",
  "sessionId": "<SESSION_ID>",
  "refreshSnapshot": true,
  "newMessage": {
    "role": "user",
    "parts": [{"text": "请继续处理刚才的任务。"}]
  }
}
```

![更新 Agent 后主动刷新会话快照的时序](/img/next/snapshot-refresh-sequence.svg)

收到刷新请求后，Harness App 从 Session state 读取原有绑定，重新查询 Agent 和 Environment，完成校验与转换后更新会话的配置基线和实例快照，再执行本轮消息。刷新与对话历史相互独立，因此配置可以改变，前文仍然保留。

刷新失败时，本轮消息不会执行，原有配置基线和快照保持不变。调用方可以先修复资源状态、权限或配置问题，再决定是否重试。

通常只需要在 `UpdateAgent` 后、并且业务明确希望已有 Session 采用修改时刷新一次。刷新成功后，后续普通请求会继续复用新的快照，不需要一直携带 `refreshSnapshot: true`。

不建议每一轮都刷新。`GetAgent` 和 `GetEnvironment` 是控制面接口，有独立的 QPS 限制和调用延迟；反复刷新会产生额外访问，也会让每次对话依赖控制面的即时可用性。普通消息应复用快照，主动采用配置变更时才刷新。

## 用 `harness` object 只修改当前一轮

有些变化不应该写入 Agent。例如，开发者可能只想在一轮调试中切换模型、临时缩短系统指令，或者调整本轮的沙箱 TTL。此时无需调用 `UpdateAgent`，也无需刷新快照，可以在 `/run_sse` 请求中提供 `harness` object：

```json
{
  "appName": "harness_agent",
  "userId": "tutorial-user",
  "sessionId": "<SESSION_ID>",
  "harness": {
    "model_name": "<TEMPORARY_MODEL>",
    "system_prompt": "本轮请用一句话回答。",
    "sandbox": {"ttl": 3600}
  },
  "newMessage": {
    "role": "user",
    "parts": [{"text": "总结当前结论。"}]
  }
}
```

本轮配置由实例快照和请求覆盖共同产生：

```text
本轮配置 E = merge(实例快照 S, request.harness)
```

普通字段以请求中的显式值为准；`sandbox` 和 `knowledgebase` 按子字段合并，列表字段显式提供时整体替换。完整字段和嵌套结构见 [RunAgentSSE 的 `harness` object](../api/chat.md#post-runagentsse)。

合并只作用于当前一轮。它不会调用 `UpdateAgent`，不会修改控制面，也不会写回会话快照。下一轮省略 `harness` object 时，配置会回到 Session 的快照。

`refreshSnapshot: true` 和 `harness` object 可以同时使用。Harness App 先刷新快照，再在本轮配置副本上应用请求覆盖；本轮结束后保留的是刷新得到的快照，不包含这次单轮覆盖。

## Agent 版本与快照恢复

前面的使用方式只需要关心“普通请求复用、需要更新时刷新、临时变化时覆盖”。在实例重启和多副本场景中，还需要一个持久化标识，保证服务知道应该重建哪一份 Agent 配置，这就是 `state.agentVersion` 的作用。

创建绑定 Session 时可以提供正整数 `agentVersion`，明确选择一个 Agent 历史版本。省略该字段时，服务读取创建时的最新 Agent，并把 `GetAgent` 实际返回的版本写入 Session state。省略只代表“创建时选择最新”，不代表后续持续跟随最新。

下面以 Session 创建时使用 v1、之后 Agent 更新到 v2 为例：

| 场景 | Session 使用的配置 |
| --- | --- |
| 创建时省略版本，控制面最新为 v1 | 记录 `agentVersion: 1`，使用 v1 |
| `UpdateAgent` 发布 v2，随后发送普通消息 | 继续使用 v1 |
| 实例重启或请求切换副本，内存快照丢失 | 服务以 `AgentVersion=1` 自动重建快照，仍使用 v1 |
| 发送 `refreshSnapshot: true` | 查询最新 Agent，成功后记录 v2 并使用 v2 |

![Session 记录 Agent 版本、实例自动恢复快照与主动刷新的关系](/img/next/snapshot-lifecycle.svg)

因此，实例快照只是可以重建的内存缓存，Session state 中的绑定和 `agentVersion` 才是恢复依据。使用 PostgreSQL 等持久化会话后端时，调用方在实例重启后继续发送普通消息即可，不需要用刷新字段恢复缓存。默认的本地内存后端会同时丢失 Session state 和对话历史，此时原 Session 无法恢复。

运行阶段显式提供 `agentVersion` 时，它只用于确认请求中的版本与 Session 当前记录一致，不能借此为已有 Session 切换版本。`agentVersion` 与 `refreshSnapshot: true` 也不能同时提供：前者表示指定版本，后者表示采用最新版本。若要回到历史版本或并行比较两个版本，应以目标 `agentVersion` 创建另一个 Session。

版本固定的范围是 Agent 历史配置，不是整个外部执行环境。Environment 仍按 `environmentId` 读取，外部 Skill 包、MCP 服务和工具实现也可能独立变化。因此，恢复旧 Agent 可以还原其中保存的引用和参数，但不承诺外部依赖的内容完全回到同一时刻。

已有旧 Session 可能没有 `state.agentVersion`。这类 Session 有可用缓存时可以继续使用；缓存丢失后，普通消息使用部署默认配置，不会擅自查询 Agent 最新版本。若 Session 保存了完整的绑定 ID（`workspaceId` + `agentId`），可以显式刷新一次，由服务建立新的配置基线和版本记录。

综上，创建阶段的 `agentId` 决定配置来源，`refreshSnapshot` 让已有 Session 主动采用来源中的新配置，`harness` object 只改变当前一轮；`agentVersion` 则让这份会话配置在实例重启后仍可准确恢复。

会话状态和异常处理见[会话状态、历史与快照恢复](sessions.md)，控制面历史版本查询见 [GetAgent](../api/harness.md#getagent-top) 和 [ListAgentVersions](../api/harness.md#listagentversions-top)。
