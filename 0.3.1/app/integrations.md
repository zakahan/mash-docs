# A2A 调用与定时任务

当调用方本身是另一个 Agent，可以使用镜像提供的 A2A 协议。当需要在约定时间发起一次提示词执行，可以创建 Cronjob。两种能力都使用 Harness App 的执行链路，但会话标识、返回对象和启用条件各有自己的约定。

完整参数、Harness 扩展和流式事件见 [Harness App 调用接口：A2A](../api/app.md#get-a2acard)。

## 从另一个 Agent 调用

在镜像注册 Harness A2A 处理器的 KeyAuth 模式下，请求 `GET /.well-known/agent-card.json`，从 Agent Card 获取服务地址与流式能力。使用 JSON-RPC 向 `/a2a` 发出一轮消息，例如：

```json
{
  "jsonrpc":"2.0","id":"rpc-1","method":"message/send",
  "params":{"message":{"kind":"message","role":"user","messageId":"input-1",
    "parts":[{"kind":"text","text":"总结本周报告。"}]}}
}
```

响应的 `result` 是 Task。读取 `status.state` 判断任务结果，从 `artifacts[].parts` 取输出。继续对话时，使用新消息 ID，将上一轮返回的 `contextId` 放入新的 `params.message`。下一轮在同一上下文中产生新的 Task ID。需要增量时改用 `message/stream`，按 A2A 事件协议消费任务更新。这个实现公开的发送方法是 `message/send` 和 `message/stream`。

## 让 Runtime 定时执行

Cronjob 适用于用服务身份执行、拥有直接模型凭据的 Harness。管理员需要启用 Cronjob 并配置任务存储。创建接口为 `POST /harness/cronjobs`，成功返回 201。下面的任务在上海时区每周一上午九点运行：

```json
{
  "name":"周报提醒","prompt":"列出准备本周周报需要确认的事项。",
  "schedule":{"cron":"0 9 * * 1","timezone":"Asia/Shanghai"},
  "timeout_seconds":300,"idempotency_key":"weekly-report-v1"
}
```

一次性任务使用带时区偏移的 `schedule.at`，周期任务使用五段式 `schedule.cron`；每个任务只选一种调度方式。保存返回的任务标识，以 `GET /harness/cronjobs/{job_id}/runs` 查看执行列表，再用具体的 run ID 查询单次结果。在调整提示词或周期时可先暂停任务，修改后恢复。状态接口 `GET /harness/cronjobs/status` 用于确认调度服务是否启用。
