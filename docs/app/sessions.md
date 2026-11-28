# 会话状态、历史与快照恢复

[完整调用示例](flow.md)中的报告助手在每次追问时复用同一个 ADK 会话。应用应保存 `appName`、`userId` 和创建响应中的 `id`，用这三个标识读取历史并发送消息。Runtime 响应头 `X-Session-Id` 用于请求路由，可以与 ADK 会话 ID 分别保存。

| 数据 | 保存位置 | 读取时机 |
|---|---|---|
| 绑定 ID（`workspaceId`、`agentId`、可选 `environmentId`）、`agentVersion`、`fileIds`、业务状态、显式提供的非空会话技能包 | ADK Session state；跨实例或重启能否读取取决于会话后端 | 创建响应、会话详情；App 用绑定和固定版本核对或重建快照 |
| 对话事件 | ADK 会话后端 | 界面重开时恢复历史，Runner 执行时恢复上下文 |
| 解析后的 Harness 与 Environment 配置 | 处理请求的实例内存，按应用、用户和会话标识索引 | 绑定会话的每次普通消息和刷新后的当前轮 |
| 请求级 `harness` 覆盖 | 当前执行的配置副本 | 合入快照后仅用于本轮 |

## 恢复聊天界面

调用 `GET /apps/{appName}/users/{userId}/sessions` 取得列表，用户选中会话后通过 `GET /apps/{appName}/users/{userId}/sessions/{sessionId}` 读取详情和事件。启用会话元数据时可同时显示标题和运行状态。详情返回 404 时先核对标识、访问身份及目标会话后端。绑定会话所在的实例发生变化时，普通消息会按 Session 中的 `agentVersion` 自动重建实例快照，不需要调用方为了恢复缓存而刷新。

## 根据建流前的错误决定是否重试

| HTTP 响应与场景 | 调用方处理 |
|---|---|
| 409，`Session has no snapshot binding` | 核对会话标识。未绑定会话可发送普通消息；需要快照时通过任一创建入口新建绑定会话。 |
| 409，Agent 或 Environment 未处于 Active | 核对控制面的资源状态，待资源就绪后再创建或刷新。 |
| 422，版本与刷新冲突 | `agentVersion` 和 `refreshSnapshot: true` 只能二选一。普通续聊省略版本；升级最新版本时只保留刷新字段。 |
| 422，续聊指定的版本与 Session 不一致 | 不能用 `/run_sse` 为已有 Session 切换或回退版本。使用原版本，或以目标历史版本创建新 Session。 |
| 422，缺少绑定字段或 Cloud Environment 没有 ToolId | 检查创建请求的顶层 `workspaceId`、`agentId` 和可选 `environmentId` 配置。业务 state 不能替代创建请求的绑定字段。 |
| 403、404 或 502，固定历史版本无法恢复 | 检查历史版本是否存在、运行身份权限和控制面状态。服务不会自动改用最新版本或部署默认配置。403/404/429/502 与 A2A `snapshot_resolution_failed` 报错中会附带控制面 `request_id`，可直接用于检索控制面日志。 |

主动刷新成功后会先把新版本写入 Session，再发布当前实例的新快照。其他实例处理下一条消息时会发现缓存版本不一致，并按新的持久化版本自动重建。会话后端选择及元数据配置见[高级配置](advanced.md)；完整的版本关系见[在会话中管理 Harness 版本与单轮配置](snapshots.md)。
