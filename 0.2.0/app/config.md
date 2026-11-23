# Harness App 调用配置

本页说明兼容调用入口的请求级覆盖。共享身份模式使用经过认证的 SDK 处理链路，一般模型、工具和指令覆盖受限。

一次调用可以在请求体中附带 `harness`。Runtime 为该请求构造 Agent，运行结束后释放请求资源。使用同一个会话可以保留对话上下文；如果后续请求仍然依赖本次指定的工具或提示词，应在构造后续请求时继续提供相应配置。

```json
{
  "prompt":"总结上文，给出两个行动项。",
  "harness_name":"reading-assistant",
  "harness":{"system_prompt":"用简短的中文回答。","max_llm_calls":5},
  "run_agent_request":{"user_id":"reader-1","session_id":"reading-1","max_llm_calls":3}
}
```

| 字段 | 作用 |
|---|---|
| `harness.model_name` | 选择推理模型。模型名和可用凭据取决于当前 AgentKit 环境。 |
| `harness.system_prompt` | 设置本轮 Harness Agent 的系统指令。用户消息仍放在 `prompt`。 |
| `run_agent_request.max_llm_calls` | 正整数。本例运行上限为 3；省略后依次使用 Harness 请求配置和运行时默认值。 |
| `harness.knowledgebase` | 选择知识库类型和索引。连接参数和凭据由 Runtime 配置提供。 |

控制面采用 `Model`、`System` 等字段；直接构造 Harness App 请求时按上表和[接口类型](../api/app.md)填写。

## 比较连续两次请求

第一轮在 `harness` 中同时设置 `model_name` 与 `system_prompt`。服务克隆部署 Harness Agent，只应用请求中显式出现的字段，并为修改过的模型配置构造新的模型客户端。第二轮向同一会话发送新的问题，省略整个 `harness`。这时历史仍属于同一会话；模型和指令按部署配置解析。会话中保留的上一轮回答本身仍可能影响模型输出。

| 本轮需要 | 写法（位于 `harness` 对象中） | 运行时行为 |
|---|---|---|
| 换知识库索引 | `{"knowledgebase":{"index":"reports_q1"}}` | 仅覆盖索引；若指定后端，使用 `type`。请求级结构拒绝 `top_k` 等未声明字段。 |
| 选择沙箱 | `{"sandbox":{"tool_id":"tool-example","ttl":3600}}` | 在 ADK 下选择工具和沙箱会话存活时间。Tool ID 受部署允许列表约束。 |
| 选择 MCP 工具集 | `{"mcp_toolset_id":"toolset-example"}` | 为本轮重建对应的 MCP 工具集，按部署身份解析目标。 |
| 补充内置工具 | `{"tools":"web_search"}` | 在副本的工具列表中按名添加和去重。 |

为所有请求选择默认数据库、模型或工具控制面时，在 [Runtime 环境变量](advanced.md) 中设置相应项。调用参考中的 JSON Schema 展开了支持的请求级嵌套结构。
