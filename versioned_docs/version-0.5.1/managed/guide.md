# 通过 Managed Agents 会话使用 Worker

Managed Agents Worker 是 AgentKit Runtime 中执行托管会话任务的组件。应用通过 Managed Agents API 把用户输入写入 Session。Worker 领取工作，使用该会话固定的 Agent 配置运行，并把输出作为事件写回。应用在断开连接后仍可以通过 Session ID 查询历史。

## 创建会话

准备已创建的 Harness、允许当前身份访问的环境、Runtime 和方舟模型 Key Name。通过已授权的 Session Endpoint 调用下列接口。示例中的 ID 和名称均需替换。

```http
POST /v1/sessions
Content-Type: application/json
x-api-key: <环境访问密钥>
x-ark-key-name: <方舟模型密钥名称>

{
  "agent":"agent_example",
  "environment_id":"env_example",
  "runtime_type":"agentkit_runtime",
  "runtime_id":"r-example",
  "initial_events":[]
}
```

成功时返回 Session 对象。保存其 `id`，后续请求沿用环境认证。需要固定特定配置版本时，见[会话配置](config.md)。

## 发出第一条消息

```http
POST /v1/sessions/{session_id}/events
Content-Type: application/json
x-api-key: <环境访问密钥>

{"events":[{"type":"user.message","content":[{"type":"text","text":"用一句话解释工作队列。"}]}]}
```

写入成功表示服务已接受输入。打开 `GET /v1/sessions/{session_id}/events/stream`，从 `agent.message` 读取回答。继续提问时向同一个 Session 写入下一条用户消息。[事件读取与续读](events.md)
