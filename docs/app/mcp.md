# 调用 MCP 工具

本篇是[实战教学](flow.md)的 MCP 分支。继续使用主教程中的 Runtime、Harness 和 Session，只向 Harness 增加一个远程 MCP 服务并刷新快照，再通过必须查询该服务的问题验证工具发现和调用链路。

| 相对基础流程 | 本篇做什么 |
| --- | --- |
| 配置 | 将 MCP 服务写入已有 Harness |
| 生效 | 在下一次 `/run_sse` 请求中设置 `refreshSnapshot: true` |
| 执行 | 模型发现工具、生成参数，Harness App 连接 MCP 服务并返回结果 |
| 验收 | 同时核对 `functionCall`、`functionResponse` 和最终回复中的业务数据 |

MCP 将远程服务的能力提供为模型可调用的工具。应用仍然只向 `/run_sse` 发消息，不需要自行调用 MCP 协议。

## 在 Harness 中登记服务

绑定会话读取的 `GetAgent` 响应示例：

```json
{"McpServers":[{"MCPServiceId":"m-orders","Type":"custom"}]}
```

创建、刷新或恢复快照时，Runtime 使用绑定 Workspace 和部署身份调用 `GetMCPService`，按 ID 去重。服务须能提供可用网关，优先选择 Public Endpoint，拼接服务 Path（默认 /mcp）并使用 Streamable HTTP。支持无认证或 Header ApiKey；显式 Parameter 时原样发送密钥，未指定时使用 Authorization Bearer。解析失败会中止本次操作。

服务配置及凭据缓存在当前实例的会话快照中。已有绑定会话可以在一次请求中选择其他服务：

```json
{"harness":{"mcp_service_ids":["m-orders"]}}
```

命中缓存直接复用，仅查询缺失 ID；下一轮省略该字段恢复默认列表。传空数组仅本轮禁用。刷新重建缓存，实例恢复按固定 Harness 版本重新查询当前服务配置。服务配置本身没有随 Harness 锁定版本。

## 刷新并验证工具调用

让已有会话取得新服务列表，并提出一个必须访问该服务的任务。

```bash
jq '.refreshSnapshot = true | .newMessage.parts = [{text:"请调用订单查询工具，查询昨天的订单数量。返回实际查询日期和工具提供的数量；查询失败时报告失败原因。"}]' \
  message.json > mcp-message.json
curl --fail-with-body -sS -N \
  -H "Authorization: Bearer $RUNTIME_TOKEN" "${ROUTE_HEADERS[@]}" \
  -H 'Content-Type: application/json' \
  --data-binary @mcp-message.json "$RUNTIME_URL/run_sse"
```

假设 MCP 暴露 `query_orders` 工具并返回昨天共有 128 笔订单，关键事件应呈现完整的“调用—结果—回答”链路。

```text
data: {"partial":false,"content":{"role":"model","parts":[{"functionCall":{"id":"call_1","name":"query_orders","args":{"date":"<YESTERDAY>"}}}]}}

data: {"content":{"role":"user","parts":[{"functionResponse":{"id":"call_1","name":"query_orders","response":{"date":"<YESTERDAY>","count":128}}}]}}

data: {"partial":false,"finishReason":"STOP","content":{"role":"model","parts":[{"text":"<YESTERDAY> 共有 128 笔订单。"}]}}
```

**验收运行：** `functionCall` 使用目标 MCP 工具和正确日期，具有相同调用 ID 的 `functionResponse` 返回业务数据，最终完整消息中的日期和数量与工具结果一致。将工具名和返回字段改成你的 MCP 实际契约。创建或刷新成功只确认配置解析，不能证明服务连接和工具执行成功。

## 为单轮替换服务

调试时可以通过请求级 `harness.mcp_servers` 替换列表。下面片段与 `userId`、`sessionId` 和 `newMessage` 放在同一个请求体里。

```json
{
  "harness": {
    "mcp_servers": [
      {
        "protocol": "streamable-http",
        "endpoint": "https://orders.example.com/mcp",
        "api_key": "<MCP_API_KEY>",
        "api_key_header": "Authorization"
      }
    ]
  }
}
```

此处的 `api_key` 只填凭证值，Runtime 会为 Authorization 拼接 `Bearer `。数组整体替换，下一轮省略就回到快照配置，传 `[]` 则清空本轮直接服务列表。[运行接口](../api/chat.md#post-runagentsse)

## 执行与连接生命周期

| 阶段 | Harness App 的行为 |
| --- | --- |
| 创建或刷新会话 | 读取并保存 MCP 配置 |
| 准备模型请求 | 连接 MCP 服务，取得工具声明 |
| 模型选择工具 | 通过 MCP 发送工具参数 |
| 工具返回 | 把结果交给模型，继续推理或输出回复 |
| 本轮结束 | 清理请求级连接和资源 |

使用 AgentKit 托管 ToolSet 时，可以改为配置 `harness.mcp_toolset_id`。Runtime 先以执行身份调用 `GetMCPToolset` 查询连接信息，再访问 MCP 服务。云 API 的读取权限和目标 MCP 服务的认证分别配置。

## 定位连接与调用错误

| 现象 | 检查项 |
| --- | --- |
| 422 | 检查服务 ID、会话绑定与单轮 MCP 字段互斥条件。 |
| 403、404、429 | GetMCPService 查询被拒绝、资源不存在或被限流。 |
| 502 | 检查服务状态、Endpoint、认证方式及控制面响应。 |
| 进入 SSE 后连接失败 | Runtime 是否能访问目标地址，协议是否匹配 |
| 目标服务返回 401 或 403 | 检查服务凭证及 Bearer 是否重复 |
| GetMCPToolset 失败 | 检查部署身份的 ToolSet 读取权限 |
| 模型直接回答，没有工具事件 | 确认工具发现成功，任务明确需要该工具，并检查工具名称和说明 |
| 工具返回业务错误 | 根据 functionResponse 检查调用参数及目标服务状态 |
