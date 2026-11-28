---
toc_max_heading_level: 2
---
# 会话管理接口

本页描述 **0.6.0** 的 Harness App 会话管理接口契约。请求路径相对于已授权的 Runtime 地址。示例使用应用名 `harness_agent`、用户 `reader-1` 和会话 `report-1`。认证主体和路径中的用户需满足该入口的身份要求。

请求字段推荐使用本页列出的驼峰名称；下划线别名兼容、冲突校验与 `state` 落盘规则见[API 调用约定](conventions.md#harness-field-naming)，从 0.5 升级的字段迁移见[版本说明](../versions.md#060-changes)。

创建会话后，通过[对话调用接口](chat.md)发送消息；需要直接操作沙箱中的文件时，使用[文件操作接口](files.md)。

绑定配置含 MCP 服务引用时，Runtime 还会使用部署身份调用 `GetMCPService`。服务 ID 与凭据只进入实例快照；创建请求和响应字段保持原有结构。详见[MCP 服务解析](../app/mcp.md)。

### 绑定会话与认证

两个创建入口都支持将会话绑定到控制面 Agent 配置。调用方先通过 [CreateAgent](harness.md#createagent-top) 取得 `AgentID`，创建会话时以顶层 `workspaceId` 和 `agentId` 成对传入，并可按需传入同一 Workspace 下的 `environmentId`。Runtime 负责认证入站请求。Harness App 使用部署的服务身份调用 `agentkit:GetAgent`（传入 `WorkspaceId`、`AgentID` 及可选 `AgentVersion`），并在提供 `environmentId` 时调用 `agentkit:GetEnvironment`。启用或强制共享身份的部署在创建绑定会话时返回 422。

目标 Agent 须处于 `Active`；若指定了 `environmentId`，该 Environment 也须处于 `Active`，且 `Config.Type` 为 `Cloud`、顶层 `ToolId` 非空。查询和配置校验均成功后，App 将传入的绑定 ID 和 `GetAgent` 返回的实际 `AgentVersion`（保存为 `state.agentVersion`）写入会话 `state`，将解析出的模型、指令、工具、Skills、MCP 和沙箱配置放入当前实例的内存快照。未传入 `environmentId` 的绑定会话跳过 `GetEnvironment`，不绑定沙箱 `ToolId`。快照按应用、用户和会话 ID 区分，创建响应回显绑定 ID、`agentVersion` 和会话自身的数据。控制面快照中的模型与 MCP 凭据不会写入会话存储。

| 创建或刷新时的 HTTP 状态 | 触发条件 |
|---|---|
| 403、404、429 | 相应控制面查询（`GetAgent`、`GetEnvironment`、`GetMCPService`）被拒、找不到资源或限流。资源返回的 `WorkspaceId` 与请求不一致也返回 404。 |
| 409 | Agent 或 Environment 未处于 `Active`，或指定 ID 创建入口的会话已存在。 |
| 422 | 绑定字段不合法（如仅传 `workspaceId` 或仅传 `agentId`、别名冲突、非正整数版本）、使用共享身份、Environment 为 SelfHosted 或缺少 Cloud `ToolId`、`fileIds` 用于无 ADK 沙箱的会话，或返回的配置不受支持。 |
| 502 | 其他控制面查询失败，或控制面返回的 `AgentVersion` 非法、与请求的显式版本不一致。 |

当控制面调用（`GetAgent`、`GetEnvironment`、`GetMCPService`）失败返回 403、404、429 或 502 时，错误响应的 `detail` 会附带经字符白名单校验的 `code` 与控制面 `request_id`（缺失或未通过校验的字段自动省略；不透传上游原始错误消息或内部日志头），便于按 `request_id` 排查控制面日志：

- 通用格式：`<Action> failed (code: <Code>, request_id: <RequestId>)`，例如 `GetAgent failed (code: AccessDenied, request_id: req_example)`。
- `GetAgent` 返回 404 时：无 `code` 或 `code` 以 `NotFound` 结尾时返回 `Agent not found for the supplied WorkspaceId and AgentID (code: ..., request_id: ...)`；其他 404（如 `InvalidActionOrVersion`）返回 `GetAgent failed (code: ..., request_id: ...)`。

### 会话标识与响应约定

`X-Session-Id` 是 Runtime 返回的可选路由亲和标识；收到后原样回传。同一业务对话仍需保存创建响应正文中的 `id`，用作路径或请求体的会话标识。带 JSON 正文的请求须发送 `Content-Type: application/json`；无请求体的请求保持请求体留空。

绑定 Agent 中的自定义 Skill 按空间和 Skill ID 加载最新可用版本；`Skills[].Version` 不固定 Harness App 的执行版本。[Skill 加载与缓存](../app/skills.md)

## GET /apps/{appName}/users/{userId}/sessions {#get-listsessions}

查询会话列表 · `ListSessions`

查询指定用户在 Harness App 下的全部会话，用于展示会话列表。请求体留空。

### 请求参数

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | 认证凭证，格式为 `Bearer <token>`；具体 token 类型由 Runtime 的认证模式决定。 |
| `X-Session-Id` | string | Header | 否 | Runtime 返回过该值时原样回传，用于维持会话亲和性。 |
| `appName` | string | Path | 是 | 应为 `harness_agent`。 |
| `userId` | string | Path | 是 | 会话所属用户标识。 |

### 调用示例

```http
GET /apps/harness_agent/users/reader-1/sessions
Authorization: Bearer <token>
```

### 响应字段

| 字段 | 类型 | 位置 | 必返 | 说明 |
|-|-|-|-|-|
| `X-Session-Id` | string | Header | 否 | Runtime 分配的会话亲和标识；后续请求应原样回传。 |
| `[]` | Session[] | Body | 是 | 会话数组；没有会话时返回空数组。 |
| `[].id` | string | Body | 是 | 会话标识。 |
| `[].appName` | string | Body | 是 | 应用名。 |
| `[].userId` | string | Body | 是 | 会话所属用户标识。 |
| `[].status` | string | Body | 是 | Runtime 维护的真实会话运行状态，不从 `events` 推断。枚举：`idle`（空闲或正常完成）、`running`（正在执行）、`waiting`（等待认证、确认、异步结果或未闭合工具调用）、`error`（执行失败）。 |
| `[].title` | string | Body | 是 | 会话标题。首次收到非空用户文本时，Runtime 在本地取第一句话生成，最长 40 个字符，且不调用模型（额外模型 Token 消耗为 0）；后续消息不自动覆盖。尚未生成标题的会话返回 `新会话`。 |
| `[].state` | object | Body | 是 | 会话状态；可为空对象。 |
| `[].state.workspaceId` | string | Body | 否 | 绑定会话使用的 Workspace；未绑定会话可缺省。 |
| `[].state.agentId` | string | Body | 否 | 绑定会话使用的 Agent ID；未绑定会话可缺省。 |
| `[].state.agentVersion` | integer | Body | 否 | Session 固定的 Agent 版本；绑定会话存在，未绑定会话可缺省。 |
| `[].state.environmentId` | string | Body | 否 | 绑定会话选用的 Environment ID；创建时未指定环境或未绑定会话时缺省。 |
| `[].state.fileIds` | string[] | Body | 否 | 创建时声明的文件 ID；旧会话可缺省。 |
| `[].state.{key}` | any | Body | 否 | 业务自定义状态项。 |
| `[].events` | Event[] | Body | 是 | 按发生顺序保存的会话事件；可为空数组。 |
| `[].lastUpdateTime` | number | Body | 是 | 最近更新时间，Unix 秒时间戳；未发生更新时可为 `0`。 |

空列表返回 HTTP 200 和 `[]`。已有会话时返回下文 `GetSession` 对象组成的数组。恢复历史请读取会话详情；列表返回的事件数量取决于会话后端。

## POST /apps/{appName}/users/{userId}/sessions {#post-createsession}

创建会话 · `CreateSession`

创建会话，用于在未预先指定路径会话 ID 时开始一次新对话。

### 请求参数

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | 认证凭证，格式为 `Bearer <token>`；具体 token 类型由 Runtime 的认证模式决定。 |
| `Content-Type` | string | Header | 有 JSON 正文时必填 | `application/json`。 |
| `X-Session-Id` | string | Header | 否 | Runtime 返回过该值时原样回传，用于维持会话亲和性。 |
| `appName` | string | Path | 是 | 应为 `harness_agent`。 |
| `userId` | string | Path | 是 | 会话所属用户标识。 |
| `workspaceId` | string | Body | 绑定时必填 | 资源所属 Workspace，兼容输入 `workspace_id`。绑定会话时必须与 `agentId` 成对提供且均为非空字符串；省略全部绑定字段时创建未绑定会话。 |
| `agentId` | string | Body | 绑定时必填 | `CreateAgent` 返回的 `AgentID`，兼容输入 `agent_id`。必须与 `workspaceId` 成对提供且为非空字符串。 |
| `agentVersion` | integer | Body | 否 | 指定 Agent 历史版本的正整数，兼容输入 `agent_version`；省略时读取创建时的最新版本，并持久化实际返回的 `AgentVersion`。仅在同时提供 `workspaceId` 和 `agentId` 时允许；不接受布尔值、零、负数、字符串或 `null`。 |
| `environmentId` | string | Body | 否 | 同一 Workspace 下用于解析沙箱 `ToolId` 的 Cloud Environment ID，兼容输入 `environment_id`。提供时必须同时提供 `workspaceId` 和 `agentId`；省略时不调用 `GetEnvironment`，会话不绑定沙箱环境。 |
| `fileIds` | string[] | Body | 否 | 默认 `[]`，兼容输入 `file_ids`。最多 100 个 Ark File ID，按原顺序去重；每项 1–128 个字符，以字母或数字开头，其余仅允许字母、数字、点、下划线和连字符，不接受 `null`。非空时须绑定 `workspaceId`、`agentId` 与有效 Cloud `environmentId`，且绑定配置使用 ADK 和 AIO Sandbox。下载时机见下文。 |
| `id` | string or null | Body | 否 | 显式会话 ID，非空时优先于 `sessionId`。 |
| `sessionId` | string or null | Body | 否 | 指定会话 ID，兼容输入 `session_id`；省略或为 `null` 时由服务端生成。 |
| `state` | object or null | Body | 否 | 初始业务会话状态；不能在其中声明 `fileIds`、`agentVersion`，也不能仅在 `state` 中传入或覆盖顶层绑定 ID。 |
| `state.{key}` | any | Body | 否 | 业务自定义状态项。 |
| `events` | Event[] or null | Body | 否 | 初始化到会话中的事件列表；事件的 `actions.stateDelta` 同样不得包含绑定 ID、`agentVersion` 或 `fileIds`。 |
| `skills` | object[]、JSON 数组字符串或 null | Body | 否 | 非空时作为会话级技能包保存，优先于控制面快照的 `Skills`。省略、`null` 或空数组时尝试 `resources`。 |
| `resources` | object[]、JSON 数组字符串或 null | Body | 否 | 兼容字段。`skills` 为空时选用非空的 `resources`，两者均为空时绑定会话使用快照中的 `Skills`。 |
| `skills[].type` | string | Body | 是 | Skill 类型；外部公开 Skill 包固定为 `external_skill_package`。 |
| `skills[].source` | string | Body | 否 | Skill 来源；外部公开 Skill 包使用 `public_url`。省略时按 `public_url` 处理。 |
| `skills[].url` | string | Body | 是 | 外部公开 Skill zip 下载链接，必须是 HTTPS URL；不要求 URL path 以 `.zip` 结尾，Runtime 按响应内容校验 zip 包。 |

### 调用示例

```http
POST /apps/harness_agent/users/reader-1/sessions
Authorization: Bearer <token>
Content-Type: application/json

{"workspaceId":"ws-example","agentId":"agent_example","agentVersion":1,"environmentId":"env_example","state":{"report":"Q1"}}
```

### 响应字段

| 字段 | 类型 | 位置 | 必返 | 说明 |
|-|-|-|-|-|
| `X-Session-Id` | string | Header | 否 | Runtime 分配的会话亲和标识；后续请求应原样回传。 |
| `id` | string | Body | 是 | 会话标识。 |
| `appName` | string | Body | 是 | 应用名。 |
| `userId` | string | Body | 是 | 会话所属用户标识。 |
| `state` | object | Body | 是 | 会话状态；可为空对象。 |
| `state.workspaceId` | string | Body | 绑定时必返 | 创建时选定的 Workspace。 |
| `state.agentId` | string | Body | 绑定时必返 | 创建时选定的 Agent ID。 |
| `state.agentVersion` | integer | Body | 绑定时必返 | `GetAgent` 返回且已持久化的实际版本；即使创建请求省略 `agentVersion` 也会返回。 |
| `state.environmentId` | string | Body | 提供环境时必返 | 创建时选定的 Environment ID；未传入 `environmentId` 时省略。 |
| `state.fileIds` | string[] | Body | 是 | 创建时声明的文件 ID；未声明时为 `[]`。 |
| `state.{key}` | any | Body | 否 | 业务自定义状态项。 |
| `events` | Event[] | Body | 是 | 会话事件；可为空数组。 |
| `lastUpdateTime` | number | Body | 是 | 最近更新时间，Unix 秒时间戳。 |

### 响应示例

```json
{
  "id": "report-1",
  "appName": "harness_agent",
  "userId": "reader-1",
  "state": {
    "workspaceId": "ws-example",
    "agentId": "agent_example",
    "agentVersion": 1,
    "environmentId": "env_example",
    "fileIds": [],
    "report": "Q1"
  },
  "events": [],
  "lastUpdateTime": 1794800000
}
```

示例明确选择 Agent v1。省略 `agentVersion` 时，服务读取创建时的最新版本；无论是否指定，响应都会在 `state.agentVersion` 中返回并保存实际版本。

HTTP 200 返回创建的会话，请保存服务端分配的 `id`。在 `state` 中传 `fileIds`、仅在 `state` 中传绑定 ID 或 `agentVersion`、与顶层字段冲突、单独指定 `agentVersion` 或 `environmentId` 而未成对提供 `workspaceId` 与 `agentId`，或版本号不是正整数时，均返回 422。发送 `{}` 可创建未绑定会话并由服务分配 ID。

## POST /apps/{appName}/users/{userId}/sessions/{sessionId} {#post-createsessionwithid}

使用指定 ID 创建会话 · `CreateSessionWithId`

调用方可以使用业务系统中的标识作为会话 ID，后续通过同一 ID 读取会话或继续对话。

### 请求参数

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | 认证凭证，格式为 `Bearer <token>`；具体 token 类型由 Runtime 的认证模式决定。 |
| `Content-Type` | string | Header | 有 JSON 正文时必填 | `application/json`。 |
| `X-Session-Id` | string | Header | 否 | Runtime 返回过该值时原样回传，用于维持会话亲和性。 |
| `appName` | string | Path | 是 | 应为 `harness_agent`。 |
| `userId` | string | Path | 是 | 会话所属用户标识。 |
| `sessionId` | string | Path | 是 | 要创建的会话标识。 |
| `workspaceId` | string | Body | 绑定时必填 | 资源所属 Workspace，兼容输入 `workspace_id`。绑定会话时必须与 `agentId` 成对提供且均为非空字符串；省略全部绑定字段时创建未绑定会话。 |
| `agentId` | string | Body | 绑定时必填 | `CreateAgent` 返回的 `AgentID`，兼容输入 `agent_id`。必须与 `workspaceId` 成对提供且为非空字符串。 |
| `agentVersion` | integer | Body | 否 | 指定 Agent 历史版本的正整数，兼容输入 `agent_version`；省略时读取创建时的最新版本，并持久化实际返回的 `AgentVersion`。仅在同时提供 `workspaceId` 和 `agentId` 时允许。 |
| `environmentId` | string | Body | 否 | 同一 Workspace 下用于解析沙箱 `ToolId` 的 Cloud Environment ID，兼容输入 `environment_id`。提供时必须同时提供 `workspaceId` 和 `agentId`。 |
| `fileIds` | string[] | Body | 否 | 默认 `[]`，兼容输入 `file_ids`。最多 100 个 Ark File ID，按原顺序去重；非空时须绑定 `workspaceId`、`agentId` 与有效 Cloud `environmentId`，且绑定配置使用 ADK 和 AIO Sandbox。下载时机见下文。 |
| `skills` | object[]、JSON 数组字符串或 null | Body | 否 | 非空时作为会话级技能包保存，优先于控制面快照的 `Skills`。省略、`null` 或空数组时尝试 `resources`。 |
| `resources` | object[]、JSON 数组字符串或 null | Body | 否 | 兼容字段。`skills` 为空时选用非空的 `resources`，两者均为空时绑定会话使用快照中的 `Skills`。 |
| 其他顶层键 | any | Body | 否 | 直接作为初始 `state` 的业务字段。未绑定时，`skills` 和 `resources` 也作为普通状态键保存。 |

### 调用示例

```http
POST /apps/harness_agent/users/reader-1/sessions/report-1
Authorization: Bearer <token>
Content-Type: application/json

{"workspaceId":"ws-example","agentId":"agent_example","agentVersion":1,"environmentId":"env_example","report":"Q1"}
```

### 响应字段

| 字段 | 类型 | 位置 | 必返 | 说明 |
|-|-|-|-|-|
| `X-Session-Id` | string | Header | 否 | Runtime 分配的会话亲和标识；后续请求应原样回传。 |
| `id` | string | Body | 是 | 与路径中的 `sessionId` 相同。 |
| `appName` | string | Body | 是 | 应用名。 |
| `userId` | string | Body | 是 | 会话所属用户标识。 |
| `state` | object | Body | 是 | 会话状态；可为空对象。 |
| `state.workspaceId` | string | Body | 绑定时必返 | 创建时选定的 Workspace。 |
| `state.agentId` | string | Body | 绑定时必返 | 创建时选定的 Agent ID。 |
| `state.agentVersion` | integer | Body | 绑定时必返 | `GetAgent` 返回且已持久化的实际版本；即使创建请求省略 `agentVersion` 也会返回。 |
| `state.environmentId` | string | Body | 提供环境时必返 | 创建时选定的 Environment ID；未传入 `environmentId` 时省略。 |
| `state.fileIds` | string[] | Body | 是 | 创建时声明的文件 ID；未声明时为 `[]`。 |
| `state.{key}` | any | Body | 否 | 业务自定义状态项。 |
| `events` | Event[] | Body | 是 | 会话事件；可为空数组。 |
| `lastUpdateTime` | number | Body | 是 | 最近更新时间，Unix 秒时间戳。 |

示例明确选择 Agent v1。省略 `agentVersion` 时选择创建时的最新版本，并在响应的 `state.agentVersion` 中返回实际版本。

HTTP 200 返回会话对象，结构与上一节响应示例一致，`id` 取自路径。重复创建同一 ID 返回 409。该入口直接接收初始状态对象，业务字段写在顶层。要导入历史事件，请使用集合创建入口。

两个创建入口都只保存 `fileIds` 声明，不在创建时下载。首次通过 `/run_sse` 调用沙箱工具时，Runtime 使用本轮模型 API Key 查询 Ark Files，文件须为 `active` 且 `purpose=agent`，并带有 HTTPS 下载地址。下载任务被沙箱接受后即继续执行，不等待文件下载完成。文件路径为 `/workspace/uploads/<fileId>/<filename>`；过早读取可能不存在，后台失败也不会自动重试。需部署包含 `/usr/local/bin/ve-load-files` 的配套沙箱镜像；文件声明不可通过 `stateDelta` 修改。完整流程见[会话输入文件](../app/sandbox.md#session-input-files)。

例如，在创建请求的顶层加入 `"fileIds":["file-report","file-data"]`，响应的 `state.fileIds` 返回相同列表。非空列表用于未绑定会话或非 ADK 沙箱配置时返回 422；该声明不受[上传接口](files.md#post-uploadsessionfile)的 8 MiB 限制。

## GET /apps/{appName}/users/{userId}/sessions/{sessionId} {#get-getsession}

查询会话详情 · `GetSession`

获取指定会话的状态与历史事件，用于恢复或查看既有对话。请求体留空。

### 请求参数

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | 认证凭证，格式为 `Bearer <token>`；具体 token 类型由 Runtime 的认证模式决定。 |
| `X-Session-Id` | string | Header | 否 | Runtime 返回过该值时原样回传，用于维持会话亲和性。 |
| `appName` | string | Path | 是 | 应为 `harness_agent`。 |
| `userId` | string | Path | 是 | 会话所属用户标识。 |
| `sessionId` | string | Path | 是 | 会话标识。 |

### 调用示例

```http
GET /apps/harness_agent/users/reader-1/sessions/report-1
Authorization: Bearer <token>
```

### 响应字段

| 字段 | 类型 | 位置 | 必返 | 说明 |
|-|-|-|-|-|
| `X-Session-Id` | string | Header | 否 | Runtime 分配的会话亲和标识；后续请求应原样回传。 |
| `id` | string | Body | 是 | 会话标识。 |
| `appName` | string | Body | 是 | 应用名。 |
| `userId` | string | Body | 是 | 会话所属用户标识。 |
| `status` | string | Body | 是 | Runtime 维护的真实会话运行状态，不从 `events` 推断。枚举：`idle`（空闲或正常完成）、`running`（正在执行）、`waiting`（等待认证、确认、异步结果或未闭合工具调用）、`error`（执行失败）。 |
| `title` | string | Body | 是 | 会话标题。首次收到非空用户文本时，Runtime 在本地取第一句话生成，最长 40 个字符，且不调用模型（额外模型 Token 消耗为 0）；后续消息不自动覆盖。尚未生成标题的会话返回 `新会话`。 |
| `state` | object | Body | 是 | 会话状态；可为空对象。 |
| `state.workspaceId` | string | Body | 否 | 绑定会话使用的 Workspace；未绑定会话可缺省。 |
| `state.agentId` | string | Body | 否 | 绑定会话使用的 Agent ID；未绑定会话可缺省。 |
| `state.agentVersion` | integer | Body | 否 | Session 固定的 Agent 版本；未绑定会话可缺省。 |
| `state.environmentId` | string | Body | 否 | 绑定会话选用的 Environment ID；未指定环境或未绑定会话可缺省。 |
| `state.fileIds` | string[] | Body | 否 | 创建时声明的文件 ID；旧会话可缺省。 |
| `state.{key}` | any | Body | 否 | 业务自定义状态项。 |
| `events` | Event[] | Body | 是 | 历史事件数组；可为空数组。 |
| `lastUpdateTime` | number | Body | 是 | 最近更新时间，Unix 秒时间戳。 |

### 响应示例

```json
{
  "id": "report-1",
  "appName": "harness_agent",
  "userId": "reader-1",
  "state": {
    "workspaceId": "ws-example",
    "agentId": "agent_example",
    "agentVersion": 1,
    "environmentId": "env_example",
    "fileIds": [],
    "report": "Q1"
  },
  "events": [],
  "lastUpdateTime": 1794800000,
  "status": "idle",
  "title": "新会话"
}
```

返回 HTTP 200；指定的应用、用户和会话组合不存在时返回 404。

## PATCH /apps/{appName}/users/{userId}/sessions/{sessionId} {#patch-updatesession}

更新会话状态 · `UpdateSession`

合并更新会话状态，用于不执行 Agent 的状态写入。

### 请求参数

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | 认证凭证，格式为 `Bearer <token>`；具体 token 类型由 Runtime 的认证模式决定。 |
| `Content-Type` | string | Header | 是 | `application/json`。 |
| `X-Session-Id` | string | Header | 否 | Runtime 返回过该值时原样回传，用于维持会话亲和性。 |
| `appName` | string | Path | 是 | 应为 `harness_agent`。 |
| `userId` | string | Path | 是 | 会话所属用户标识。 |
| `sessionId` | string | Path | 是 | 会话标识。 |
| `stateDelta` | object | Body | 是 | 要合并到当前会话状态的字段集合。 |
| `stateDelta.{key}` | any | Body | 否 | 要新增或覆盖的业务状态项。绑定 ID（`workspaceId`、`agentId`、`environmentId`）、`agentVersion` 和 `fileIds` 由服务端维护，状态增量包含其中任意键或对应下划线名称会返回 422。 |

### 调用示例

```http
PATCH /apps/harness_agent/users/reader-1/sessions/report-1
Authorization: Bearer <token>
Content-Type: application/json

{"stateDelta":{"report":"Q2"}}
```

### 响应字段

| 字段 | 类型 | 位置 | 必返 | 说明 |
|-|-|-|-|-|
| `id` | string | Body | 是 | 会话标识。 |
| `appName` | string | Body | 是 | 应用名。 |
| `userId` | string | Body | 是 | 会话所属用户标识。 |
| `state` | object | Body | 是 | 更新后的完整会话状态。 |
| `state.{key}` | any | Body | 否 | 业务自定义状态项。 |
| `events` | Event[] | Body | 是 | 会话事件；可为空数组。 |
| `lastUpdateTime` | number | Body | 是 | 最近更新时间，Unix 秒时间戳。 |

响应包含更新后的 `state`。已有的其他顶层键保留；服务追加状态变更事件。会话不存在返回 404。

## DELETE /apps/{appName}/users/{userId}/sessions/{sessionId} {#delete-deletesession}

删除会话 · `DeleteSession`

删除指定会话，用于清理历史会话或临时会话。请求体留空。

### 请求参数

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | 认证凭证，格式为 `Bearer <token>`；具体 token 类型由 Runtime 的认证模式决定。 |
| `X-Session-Id` | string | Header | 否 | Runtime 返回过该值时原样回传，用于维持会话亲和性。 |
| `appName` | string | Path | 是 | 应为 `harness_agent`。 |
| `userId` | string | Path | 是 | 会话所属用户标识。 |
| `sessionId` | string | Path | 是 | 会话标识。 |

### 调用示例

```http
DELETE /apps/harness_agent/users/reader-1/sessions/report-1
Authorization: Bearer <token>
```

### 响应字段

| 字段 | 类型 | 位置 | 必返 | 说明 |
|-|-|-|-|-|
| — | — | Body | 否 | 成功时无业务响应字段。 |

成功时没有业务返回对象。删除后再查询详情将返回 404。
