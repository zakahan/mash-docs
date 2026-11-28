# 版本说明

| 文档入口 | 对应实现 | 适用范围 |
|---|---|---|
| v0.6（0.6.0） | `0.6.0` | **破坏性变更**：控制面调用从 `GetHarness` 切换为 `GetAgent`（`AgentID` / `AgentVersion`）；Harness App 会话绑定与版本字段全面替换为 `agentId` / `agent_id` 与 `agentVersion` / `agent_version`，不再接受旧 `harnessId` / `harnessVersion` 字段。 |
| v0.5（0.5.1） | `005029b1` | 按会话解析 MCP 服务，支持单轮选择服务、设置推理强度和选择沙箱工具。 |
| v0.4（0.4.0） | `release/v0.4` | 会话输入文件异步准备；会话沙箱文件上传、列出、下载；ReadFile 图片视觉输入；重启后重新附着仍有效的沙箱。 |
| v0.3（0.3.1） | `0.3.1` | Cloud 会话绑定与显式刷新。自定义 Skill 使用空间中加载时可见的最新版本。 |
| v0.2（0.2.0） | `v0.2.0` | 请求级 Harness 配置与会话技能包。 |

控制面字段 `AgentVersion` 是 Agent 配置资源的修订号。镜像版本由部署选择。参见[创建 Agent 到对话](app/flow.md)。

## 0.6.0 变更（破坏性变更） {#060-changes}

0.6.0 将控制面资源对接与会话绑定字段全面切换至 Agent 语义，不再兼容 0.5 的 `HarnessId` / `harnessId` 与 `HarnessVersion` / `harnessVersion` 字段：

| 变更范围 | 0.5.1 | 0.6.0 | 说明 |
|---|---|---|---|
| 控制面查询接口 | `GetHarness`（`HarnessId`、`HarnessVersion`） | `GetAgent`（`AgentID`、`AgentVersion`） | 会话绑定、刷新和快照恢复统一调用 `GetAgent`，读取 `Result.AgentVersion`。 |
| 运行角色 IAM 权限 | `agentkit:GetHarness` | `agentkit:GetAgent` | 服务身份策略需更新为 `agentkit:GetAgent`。 |
| 控制面管理接口 | `CreateHarness`、`GetHarness`、`ListHarnesses`、`UpdateHarness`、`ArchiveHarness`、`DeleteHarness`、`ListHarnessVersions` | `CreateAgent`、`GetAgent`、`ListAgents`、`UpdateAgent`、`ArchiveAgent`、`DeleteAgent`、`ListAgentVersions` | 见 [Agent 管理接口](api/harness.md)。 |
| 会话绑定与版本请求字段 | `harnessId` / `harness_id`、`harnessVersion` / `harness_version` | `agentId` / `agent_id`、`agentVersion` / `agent_version` | 适用于 REST 会话创建、`/run_sse` 及 A2A `params.metadata`，不再接受旧字段名。 |
| 持久化 `session.state` | `state.harnessId`、`state.harnessVersion` | `state.agentId`、`state.agentVersion` | 绑定、版本与文件声明统一以驼峰字段名保存。 |

- **控制面错误透传 `request_id`**：调用控制面（`GetAgent`、`GetEnvironment`、`GetMCPService`）失败时，REST 错误响应（403/404/429/502）的 `detail` 与 A2A `-32603`（`error.data`）透传经字符白名单校验的控制面 `code` 与 `request_id`（不透传上游原始错误消息或内部日志头），便于按 `request_id` 排查控制面日志。见[会话管理接口](api/app.md)与[对话调用接口](api/chat.md)。

## 0.5.1 变更

绑定会话按 MCPServiceId 解析并缓存服务；/run_sse 支持本轮选择服务。 [MCP 使用方式](app/mcp.md)

ADK 对话支持推理强度 model_effort，按工具配置启用沙箱 grep、glob 等工具。 [请求字段和示例](api/chat.md#post-runagentsse)

## 0.4.0 变更

- **沙箱图片读取。** `ReadFile` 将 PNG、JPEG、WebP、GIF 图片作为视觉内容返回，最大 5 MiB；扩展名与文件签名必须一致，图片不支持行范围。Harness Chat 和 OBO 的模型请求可消费视觉块，会话事件维持原有工具响应。
- **会话输入文件。** 创建会话支持 `fileIds`，首次沙箱工具调用时异步准备到 `/workspace/uploads/<fileId>/<filename>`；任务被接受不表示下载完成，依赖配套沙箱镜像。[使用方式与限制](app/sandbox.md#session-input-files)
- **字段命名。** 绑定、版本和刷新字段推荐使用驼峰名称，兼容对应下划线名称；正式刷新字段为 `refreshSnapshot`。
- **默认工作目录。** 沙箱默认工作目录调整为 `/workspace`。
- **会话文件 API。** 新增[上传、列出、下载](api/files.md)操作。上传单文件最多 8 MiB，请求体最多 9 MiB；重复文件名返回 409，不覆盖已有文件。下载支持单段 Range。
- **沙箱恢复。** Runtime 重启或切换实例后，按会话稳定标识重新查找仍有效的物理沙箱。沙箱 TTL 到期后旧文件仍会失效。
