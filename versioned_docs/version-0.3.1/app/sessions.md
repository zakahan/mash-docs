# 会话状态、历史与快照恢复

[完整调用示例](flow.md)中的报告助手在每次追问时复用同一个 ADK 会话。应用应保存 `app_name`、`user_id` 和创建响应中的 `id`，用这三个标识读取历史并发送消息。Runtime 响应头 `X-Session-Id` 用于请求路由，可以与 ADK 会话 ID 分别保存。

| 数据 | 保存位置 | 读取时机 |
|---|---|---|
| 三个绑定 ID、业务状态、显式提供的非空会话技能包 | ADK Session state；跨实例或重启能否读取取决于会话后端 | 创建响应、会话详情；App 用绑定 ID 刷新快照 |
| 对话事件 | ADK 会话后端 | 界面重开时恢复历史，Runner 执行时恢复上下文 |
| 解析后的 Harness 与 Environment 配置 | 处理请求的实例内存，按应用、用户和会话标识索引 | 绑定会话的每次普通消息和刷新后的当前轮 |
| 请求级 `harness` 覆盖 | 当前执行的配置副本 | 合入快照后仅用于本轮 |

## 恢复聊天界面

调用 `GET /apps/{app_name}/users/{user_id}/sessions` 取得列表，用户选中会话后通过 `GET /apps/{app_name}/users/{user_id}/sessions/{session_id}` 读取详情和事件。启用会话元数据时可同时显示标题和运行状态。详情返回 404 时先核对标识、访问身份及目标会话后端。绑定会话所在的实例发生变化时，即使详情和历史可读，发消息仍可能需要显式刷新。

## 根据建流前的错误决定是否重试

| HTTP 响应与场景 | 调用方处理 |
|---|---|
| 409，`Session snapshot unavailable; set refresh_snapshot to true` | 服务端能读取三个绑定 ID。保留原消息，增加 `refresh_snapshot: true` 重发一次，在当前实例重建快照后执行。 |
| 409，`Session has no snapshot binding` | 核对会话标识。未绑定会话可发送普通消息；需要快照时通过任一创建入口新建绑定会话。 |
| 409，Harness 或 Environment 未处于 Active | 核对控制面的资源状态，待资源就绪后再创建或刷新。 |
| 422，缺少绑定字段或 Cloud Environment 没有 ToolId | 检查创建请求的三个顶层 ID 和指定 Environment 的配置。业务 state 不能替代创建请求的绑定字段。 |

主动刷新只替换收到该消息的实例上的配置。需要让另一实例使用新配置时，也要在该实例处理的消息中要求刷新。会话后端选择及元数据配置见[高级配置](advanced.md)；请求和响应字段见[查询会话详情](../api/app.md#get-getsession)。
