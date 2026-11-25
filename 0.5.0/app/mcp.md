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

准备一个支持 Streamable HTTP 的 MCP 地址。示例采用提供订单查询工具的服务，你可以替换为自己的 MCP 地址、凭证和任务。

在签名客户端调用 `UpdateHarness`。填入当前 Harness 修订号，提交完整的服务列表。

```json
{
  "WorkspaceId": "<WORKSPACE_ID>",
  "HarnessId": "<HARNESS_ID>",
  "HarnessVersion": 1,
  "McpServers": [
    {
      "mcpServers": {
        "orders": {
          "type": "http",
          "url": "https://orders.example.com/mcp",
          "headers": {"Authorization": "Bearer <MCP_API_KEY>"}
        }
      }
    }
  ]
}
```

更新成功后，响应中的 `HarnessVersion` 应增加，并回显新的 MCP 配置。以下响应已隐藏凭证。

```json
{
  "Result": {
    "HarnessId": "<HARNESS_ID>",
    "HarnessVersion": 2,
    "McpServers": [
      {
        "McpServers": {
          "orders": {
            "Type": "http",
            "Url": "https://orders.example.com/mcp",
            "Headers": {"Authorization": "<REDACTED>"}
          }
        }
      }
    ]
  }
}
```

**验收配置：** 新版本号大于更新前的版本号，服务名称、协议和 URL 与请求一致。此时只证明控制面保存成功；连接和工具发现发生在运行请求中。无需认证的服务可以省略 `headers`。新建 Harness 时，直接将 `McpServers` 放到 `CreateHarness` 正文即可。控制面会规范化结构字段的大小写，GetHarness 响应里的键可能为 `McpServers`、`Type`、`Url` 和 `Headers`。[控制面 MCP 字段](../api/harness.md#harness-element-details)

快照解析将 `http` 转成 `streamable-http`。省略类型时按 HTTP 处理，也支持 `sse`。当前支持 Bearer Authorization 和 X-Api-Key 认证头，其他头会使快照解析返回 422。

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

此处的 `api_key` 只填凭证值，Runtime 会为 Authorization 拼接 `Bearer `。这与控制面配置中填写完整 `Headers.Authorization` 的方式不同。数组整体替换，下一轮省略就回到快照配置，传 `[]` 则清空本轮直接服务列表。[运行接口](../api/chat.md#post-runagentsse)

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
| 创建或刷新返回 422 | 服务结构、协议、URL 和认证头是否受支持 |
| 进入 SSE 后连接失败 | Runtime 是否能访问目标地址，协议是否匹配 |
| 目标服务返回 401 或 403 | 检查服务凭证及 Bearer 是否重复 |
| GetMCPToolset 失败 | 检查部署身份的 ToolSet 读取权限 |
| 模型直接回答，没有工具事件 | 确认工具发现成功，任务明确需要该工具，并检查工具名称和说明 |
| 工具返回业务错误 | 根据 functionResponse 检查调用参数及目标服务状态 |
