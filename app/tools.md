# 内置工具、MCP 与 Skills

假设报告助手需要检索资料、查询内部指标，再按团队模板生成摘要。内置工具提供可调用的操作，MCP 将远程服务的能力提供给 Agent，Skills 提供特定任务的说明及配套资源。下面各段 JSON 是兼容入口请求体的 `harness` 字段值。模型是否调用工具取决于任务、指令和实际可用的工具。

按名称添加的内置工具执行各自的实现。例如网页搜索调用搜索服务；ADK 的命令执行与工作目录读写则可以交给 AIO 沙箱。首次创建、跨轮复用和 Skill 加载过程见[在沙箱中执行任务](sandbox.md)。

## 绑定会话怎样选择技能包

创建 Harness 时可登记 `Skills`。绑定或刷新会话时，服务从 `GetHarness.Result.Skills` 读取整份列表并保存在实例内存中。发送消息时，按下表从上到下选择本轮使用的技能资源。[创建会话与发送消息](flow.md)

| 来源 | 生效条件 |
|---|---|
| 消息体的 `harness.resources` | 显式传入时使用本轮列表，传 `[]` 可在这一轮跳过会话技能包。 |
| 创建会话时的 `skills` 或 `resources` | 优先取非空的 `skills`，否则取非空的兼容字段 `resources`。选中的包随会话 state 保存。 |
| 快照的 `Skills` | 创建会话时两项均为空或省略，且本轮未覆盖时使用。显式刷新成功后采用重新读取的列表。 |

例如，在 `CreateHarness` 请求中声明一个公开下载的技能包：

```json
{"Skills":[{"Type":"external_skill_package","Source":"public_url","Url":"https://skills.example.com/report.zip"}]}
```

公开包由 App 在本轮装配时下载。对于 `Type: "custom"`，App 将完整的 `SkillId` 转为沙箱引用（例如 `ss-demo:s-report`），使用空间中加载时可见的最新版本。配置中的 `Version` 不固定运行版本。详见[使用 Skill 完成任务](skills.md)。

## 按名称添加内置工具

```json
{"tools":"web_search","system_prompt":"查询公开资料后，附上来源。"}
```

服务按逗号拆分名称，从镜像的 VeADK 工具注册表查找，按名称去重后加入本轮 Harness Agent。无法解析的名称会被跳过并记录告警。因此仅看到请求成功还不能确认工具可用；可以发送确实需要查询的任务，在事件中检查工具调用和返回结果。工具本身需要的服务凭据也应已在 Runtime 配好。

## 连接远程 MCP 服务

```json
{"mcp_servers":[{"protocol":"streamable-http","endpoint":"https://metrics.example.com/mcp"}]}
```

把地址替换成 Runtime 能访问的服务。直接连接可选择 `streamable-http` 或 `sse`；服务需要凭据时，配置支持 `api_key`，认证头名称可选 `Authorization` 或 `X-Api-Key`。使用 AgentKit 托管工具集时可传 `mcp_toolset_id`，由运行时解析对应的服务。连接远程 MCP 的协议和应用读取模型输出的 SSE 是两段各自独立的连接。

本轮显式设置 `mcp_servers` 或 `mcp_toolset_id` 会重建副本中的 Harness MCP 工具集。准备多个服务时，应确认请求包含本轮需要的全部 MCP 配置。可以用「从指标服务查询昨日订单数」验收，核对工具名、参数和返回内容，再检查最终总结是否采用了查询结果。

## 按引用选择 Skill

```json
{"skills":"ss-example:s-report"}
```

将示例替换为实际空间和技能标识。解析器支持 Skill Hub slug、整个技能空间 `ss-…` 和空间内指定技能 `ss-…:s-…`。使用 AIO 沙箱的 ADK 请求会按沙箱技能路径装配这些引用；执行时还依赖对应空间或技能包可读。给报告助手追加技能后，用一个依赖该模板的任务检查产出，而不仅仅询问「你会什么」。

[MCP 字段与约束](../api/chat.md)
