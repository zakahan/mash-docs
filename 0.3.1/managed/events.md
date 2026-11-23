# 事件、状态与断线续读

聊天界面可以同时使用历史查询和 SSE。首次进入会话时按顺序读取已有消息，之后从最后一个持久化事件的位置订阅，避免刷新页面后重复显示回答。

| 操作 | 请求 |
|---|---|
| 查询会话状态 | `GET /v1/sessions/{session_id}` |
| 顺序读取历史 | `GET /v1/sessions/{session_id}/events?order=asc&limit=100` |
| 从序号 42 之后开始订阅 | `GET /v1/sessions/{session_id}/events/stream?after_sequence=42` |

列表响应包含 `data`、`has_more` 和 `next_page`。消费完整页后再推进本地游标。SSE 的 `id` 是持久化事件序号，可以用 `Last-Event-ID` 重连；正数 `after_sequence` 优先。增量预览可能没有 ID，只用于临时展示，以持久化消息更新最终记录。

`running` 表示正在执行，`idle` 表示等待后续输入或工具确认，`rescheduling` 表示等待重新调度，`terminated` 表示会话已结束。接入方应区分连接断开、一次执行进入空闲和整个会话结束。详见[Session 和 Events 契约](../api/session.md)。
