# 会话管理接口

本页记录 0.4.0（待发布）的 Harness App 会话管理接口。请求路径相对于已授权的 Runtime 地址。示例使用应用名 `harness_agent`、用户 `reader-1` 和会话 `report-1`。认证主体和路径中的用户需满足该入口的身份要求。

**开发中：**本页的 `workspaceId`、`harnessId`、`harnessVersion`、`environmentId` 是 0.4.0 目标请求与会话状态字段；当前 `release/v0.4` 实现仍使用 snake_case。待运行时改动合入并验证后按本页示例调用。

创建会话后，通过[对话调用接口](chat.md)发送消息；需要直接操作沙箱中的文件时，使用[文件操作接口](files.md)。

### 绑定会话与认证

0.3.1的两个创建入口都可以用三个顶层 ID 绑定会话。调用方先通过 [CreateHarness](harness.md#createharness) 取得 Harness ID，再选择同一 Workspace 的 Environment。Runtime 负责认证入站请求。Harness App 使用部署的服务身份调用 `agentkit:GetHarness` 和 `agentkit:GetEnvironment`。启用或强制共享身份的部署在创建绑定会话时返回 422。

两个资源都须为 `Active`，且 Environment 的 `Config.Type` 为 `Cloud`、顶层 `ToolId` 非空。两项查询和配置校验均成功后，App 将三个 ID 和 `GetHarness` 返回的实际版本随会话 state 保存，将解析出的模型、指令、Skills、MCP 和沙箱配置放入当前实例的内存。快照按应用、用户和会话 ID 区分，创建响应回显绑定 ID、`harnessVersion` 和会话自身的数据。控制面快照和其中的凭据不会写入会话存储。

| 创建或刷新时的 HTTP 状态 | 触发条件 |
|---|---|
| 403、404、429 | 相应控制面查询被拒、找不到资源或限流。资源返回的 Workspace 与请求不一致也返回 404。 |
| 409 | Harness 或 Environment 未处于 Active。 |
| 422 | 绑定字段不合法、使用共享身份、Environment 为 SelfHosted 或缺少 Cloud ToolId，或返回的配置不受支持。 |
| 502 | 其他控制面查询失败。 |

### 会话标识与响应约定

`X-Session-Id` 是 Runtime 返回的可选路由亲和标识；收到后原样回传。同一业务对话仍需保存创建响应正文中的 `id`，用作路径或请求体的会话标识。JSON 请求发送 `Content-Type: application/json`；流式调用可声明 `Accept: text/event-stream`。示例只列与各操作相关的字段，认证头见各接口表。

绑定 Harness 中的自定义 Skill 按空间和 Skill ID 加载最新可用版本；`Skills[].Version` 不固定 Harness App 的执行版本。[Skill 加载与缓存](../app/skills.md)

## GET /apps/{appName}/users/{userId}/sessions {#get-listsessions}

查询会话列表 · `ListSessions`

查询指定用户在 Harness App 下的全部会话，用于展示会话列表。

**请求参数**

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | 认证凭证，格式为 `Bearer <token>`；具体 token 类型由 Runtime 的认证模式决定。 |
| `X-Session-Id` | string | Header | 否 | Runtime 返回过该值时原样回传，用于维持会话亲和性。 |
| `appName` | string | Path | 是 | 应为 `harness_agent`。 |
| `userId` | string | Path | 是 | 会话所属用户标识。 |

**响应字段**

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
| `[].state.workspaceId` | string | Body | 否 | 绑定会话使用的 Workspace；旧会话或未绑定会话可缺省。 |
| `[].state.harnessId` | string | Body | 否 | 绑定会话使用的 Harness；旧会话或未绑定会话可缺省。 |
| `[].state.harnessVersion` | integer | Body | 否 | Session 固定的 Harness 版本；绑定会话存在，旧会话或未绑定会话可缺省。 |
| `[].state.environmentId` | string | Body | 否 | 绑定会话使用的 Environment；旧会话或未绑定会话可缺省。 |
| `[].state.{key}` | any | Body | 否 | 业务自定义状态项。 |
| `[].events` | Event[] | Body | 是 | 按发生顺序保存的会话事件；可为空数组。 |
| `[].lastUpdateTime` | number | Body | 是 | 最近更新时间，Unix 秒时间戳；未发生更新时可为 `0`。 |

**调用示例**

```http
GET /apps/harness_agent/users/reader-1/sessions
```

空列表返回 HTTP 200 和 `[]`。已有会话时返回下文 GetSession 对象组成的数组。恢复历史请读取会话详情；列表返回的事件数量取决于会话后端。

## POST /apps/{appName}/users/{userId}/sessions {#post-createsession}

创建会话 · `CreateSession`

创建会话，用于在未预先指定会话 ID 时开始一次新对话。

**请求参数**

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | 认证凭证，格式为 `Bearer <token>`；具体 token 类型由 Runtime 的认证模式决定。 |
| `X-Session-Id` | string | Header | 否 | Runtime 返回过该值时原样回传，用于维持会话亲和性。 |
| `appName` | string | Path | 是 | 应为 `harness_agent`。 |
| `userId` | string | Path | 是 | 会话所属用户标识。 |
| `workspaceId` | string | Body | 绑定时必填 | 两个资源所属 Workspace。三个 ID 必须一起提供且均为非空字符串，全部省略时创建未绑定会话。 |
| `harnessId` | string | Body | 绑定时必填 | CreateHarness 返回的 Harness ID。 |
| `harnessVersion` | integer | Body | 否 | 指定 Harness 历史版本的正整数；省略时选择创建时的最新版本，并持久化实际返回版本。仅在三个绑定 ID 完整时允许。 |
| `environmentId` | string | Body | 绑定时必填 | 用于解析沙箱 ToolId 的 Environment ID。 |
| `id` | string 或 null | Body | 否 | 显式会话 ID，非空时优先于 sessionId。 |
| `sessionId` | string or null | Body | 否 | 指定会话 ID；省略或为 `null` 时由服务端生成。 |
| `state` | object or null | Body | 否 | 初始会话状态。 |
| `state.{key}` | any | Body | 否 | 业务自定义状态项。 |
| `events` | Event[] or null | Body | 否 | 初始化到会话中的事件列表。 |
| `skills` | object[]、JSON 数组字符串或 null | Body | 否 | 非空时作为会话级技能包保存，优先于控制面快照的 Skills。省略、null 或空数组时尝试 resources。 |
| `resources` | object[]、JSON 数组字符串或 null | Body | 否 | 兼容字段。skills 为空时选用非空的 resources，两者均为空时绑定会话使用快照中的 Skills。 |
| `skills[].type` | string | Body | 是 | Skill 类型；外部公开 Skill 包固定为 `external_skill_package`。 |
| `skills[].source` | string | Body | 否 | Skill 来源；外部公开 Skill 包使用 `public_url`。省略时按 `public_url` 处理。 |
| `skills[].url` | string | Body | 是 | 外部公开 Skill zip 下载链接，必须是 HTTPS URL；不要求 URL path 以 `.zip` 结尾，Runtime 按响应内容校验 zip 包。 |

**响应字段**

| 字段 | 类型 | 位置 | 必返 | 说明 |
|-|-|-|-|-|
| `X-Session-Id` | string | Header | 否 | Runtime 分配的会话亲和标识；后续请求应原样回传。 |
| `id` | string | Body | 是 | 会话标识。 |
| `appName` | string | Body | 是 | 应用名。 |
| `userId` | string | Body | 是 | 会话所属用户标识。 |
| `state` | object | Body | 是 | 会话状态；可为空对象。 |
| `state.workspaceId` | string | Body | 绑定时必返 | 创建时选定的 Workspace。 |
| `state.harnessId` | string | Body | 绑定时必返 | 创建时选定的 Harness。 |
| `state.harnessVersion` | integer | Body | 绑定时必返 | `GetHarness` 返回且已持久化的实际版本；即使创建请求未指定版本也返回。 |
| `state.environmentId` | string | Body | 绑定时必返 | 创建时选定的 Environment。 |
| `state.{key}` | any | Body | 否 | 业务自定义状态项。 |
| `events` | Event[] | Body | 是 | 会话事件；可为空数组。 |
| `lastUpdateTime` | number | Body | 是 | 最近更新时间，Unix 秒时间戳。 |

**调用示例**

```http
POST /apps/harness_agent/users/reader-1/sessions
Content-Type: application/json

{"workspaceId":"<workspace-id>","harnessId":"<harness-id>","harnessVersion":1,"environmentId":"<environment-id>","state":{"report":"Q1"}}
```

示例明确选择 Harness v1。省略 `harnessVersion` 时，服务选择创建时的最新版本；无论是否指定，响应都会在 `state.harnessVersion` 中返回并保存实际版本。

HTTP 200 返回创建的会话，保存服务端分配的 `id`。仅在 state 中传绑定 ID 或 `harnessVersion`、与顶层字段冲突、单独指定版本，或版本不是正整数时，返回 422。使用 `{}` 可由服务分配 ID。镜像的集合创建入口也接受正文 `id`，同时提供时优先使用非空的 `id`。

响应示例：

```json
{
  "id": "report-1",
  "appName": "harness_agent",
  "userId": "reader-1",
  "state": {
    "workspaceId": "<workspace-id>",
    "harnessId": "<harness-id>",
    "harnessVersion": 1,
    "environmentId": "<environment-id>",
    "report": "Q1"
  },
  "events": [],
  "lastUpdateTime": 1794800000
}
```

## POST /apps/{appName}/users/{userId}/sessions/{sessionId} {#post-createsessionwithid}

使用指定 ID 创建会话 · `CreateSessionWithId`

调用方可以使用业务系统中的标识作为会话 ID，后续通过同一 ID 读取会话或继续对话。

**请求参数**

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | 认证凭证，格式为 `Bearer <token>`；具体 token 类型由 Runtime 的认证模式决定。 |
| `X-Session-Id` | string | Header | 否 | Runtime 返回过该值时原样回传，用于维持会话亲和性。 |
| `appName` | string | Path | 是 | 应为 `harness_agent`。 |
| `userId` | string | Path | 是 | 会话所属用户标识。 |
| `sessionId` | string | Path | 是 | 要创建的会话标识。 |
| `workspaceId` | string | Body | 绑定时必填 | 两个资源所属 Workspace。三个 ID 必须一起提供且均为非空字符串，全部省略时创建未绑定会话。 |
| `harnessId` | string | Body | 绑定时必填 | CreateHarness 返回的 Harness ID。 |
| `harnessVersion` | integer | Body | 否 | 指定 Harness 历史版本的正整数；省略时选择创建时的最新版本，并持久化实际返回版本。仅在三个绑定 ID 完整时允许。 |
| `environmentId` | string | Body | 绑定时必填 | 用于解析沙箱 ToolId 的 Environment ID。 |
| `skills` | object[]、JSON 数组字符串或 null | Body | 否 | 非空时作为会话级技能包保存，优先于控制面快照的 Skills。省略、null 或空数组时尝试 resources。 |
| `resources` | object[]、JSON 数组字符串或 null | Body | 否 | 兼容字段。skills 为空时选用非空的 resources，两者均为空时绑定会话使用快照中的 Skills。 |
| 其他顶层键 | any | Body | 否 | 直接作为初始 state 的业务字段。未绑定时，skills 和 resources 也作为普通状态键保存。 |

**响应字段**

| 字段 | 类型 | 位置 | 必返 | 说明 |
|-|-|-|-|-|
| `X-Session-Id` | string | Header | 否 | Runtime 分配的会话亲和标识；后续请求应原样回传。 |
| `id` | string | Body | 是 | 与请求的 `sessionId` 相同。 |
| `appName` | string | Body | 是 | 应用名。 |
| `userId` | string | Body | 是 | 会话所属用户标识。 |
| `state` | object | Body | 是 | 会话状态；可为空对象。 |
| `state.workspaceId` | string | Body | 绑定时必返 | 创建时选定的 Workspace。 |
| `state.harnessId` | string | Body | 绑定时必返 | 创建时选定的 Harness。 |
| `state.harnessVersion` | integer | Body | 绑定时必返 | `GetHarness` 返回且已持久化的实际版本；即使创建请求未指定版本也返回。 |
| `state.environmentId` | string | Body | 绑定时必返 | 创建时选定的 Environment。 |
| `state.{key}` | any | Body | 否 | 业务自定义状态项。 |
| `events` | Event[] | Body | 是 | 会话事件；可为空数组。 |
| `lastUpdateTime` | number | Body | 是 | 最近更新时间，Unix 秒时间戳。 |

**调用示例**

```http
POST /apps/harness_agent/users/reader-1/sessions/report-1
Content-Type: application/json

{"workspaceId":"<workspace-id>","harnessId":"<harness-id>","harnessVersion":1,"environmentId":"<environment-id>","report":"Q1"}
```

示例明确选择 Harness v1。省略 `harnessVersion` 时选择创建时的最新版本，并在响应的 `state.harnessVersion` 中返回实际版本。

HTTP 200 返回会话对象，结构见上一节响应示例，`id` 取自路径。重复创建同一 ID 返回 409。该入口直接接收初始状态对象，业务字段写在顶层。要导入历史事件，请使用集合创建入口。

## GET /apps/{appName}/users/{userId}/sessions/{sessionId} {#get-getsession}

查询会话详情 · `GetSession`

获取指定会话的状态与历史事件，用于恢复或查看既有对话。

**请求参数**

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | 认证凭证，格式为 `Bearer <token>`；具体 token 类型由 Runtime 的认证模式决定。 |
| `X-Session-Id` | string | Header | 否 | Runtime 返回过该值时原样回传，用于维持会话亲和性。 |
| `appName` | string | Path | 是 | 应为 `harness_agent`。 |
| `userId` | string | Path | 是 | 会话所属用户标识。 |
| `sessionId` | string | Path | 是 | 会话标识。 |

**响应字段**

| 字段 | 类型 | 位置 | 必返 | 说明 |
|-|-|-|-|-|
| `X-Session-Id` | string | Header | 否 | Runtime 分配的会话亲和标识；后续请求应原样回传。 |
| `id` | string | Body | 是 | 会话标识。 |
| `appName` | string | Body | 是 | 应用名。 |
| `userId` | string | Body | 是 | 会话所属用户标识。 |
| `status` | string | Body | 是 | Runtime 维护的真实会话运行状态，不从 `events` 推断。枚举：`idle`（空闲或正常完成）、`running`（正在执行）、`waiting`（等待认证、确认、异步结果或未闭合工具调用）、`error`（执行失败）。 |
| `title` | string | Body | 是 | 会话标题。首次收到非空用户文本时，Runtime 在本地取第一句话生成，最长 40 个字符，且不调用模型（额外模型 Token 消耗为 0）；后续消息不自动覆盖。尚未生成标题的会话返回 `新会话`。 |
| `state` | object | Body | 是 | 会话状态；可为空对象。 |
| `state.workspaceId` | string | Body | 否 | 绑定会话使用的 Workspace；旧会话或未绑定会话可缺省。 |
| `state.harnessId` | string | Body | 否 | 绑定会话使用的 Harness；旧会话或未绑定会话可缺省。 |
| `state.harnessVersion` | integer | Body | 否 | Session 固定的 Harness 版本；旧会话或未绑定会话可缺省。 |
| `state.environmentId` | string | Body | 否 | 绑定会话使用的 Environment；旧会话或未绑定会话可缺省。 |
| `state.{key}` | any | Body | 否 | 业务自定义状态项。 |
| `events` | Event[] | Body | 是 | 历史事件数组；可为空数组。 |
| `lastUpdateTime` | number | Body | 是 | 最近更新时间，Unix 秒时间戳。 |

**调用示例**

```http
GET /apps/harness_agent/users/reader-1/sessions/report-1
```

返回 HTTP 200；指定的应用、用户和会话组合不存在时返回 404。

响应示例：

```json
{
  "id": "report-1",
  "appName": "harness_agent",
  "userId": "reader-1",
  "state": {
    "workspaceId": "<workspace-id>",
    "harnessId": "<harness-id>",
    "harnessVersion": 1,
    "environmentId": "<environment-id>",
    "report": "Q1"
  },
  "events": [],
  "lastUpdateTime": 1794800000,
  "status": "idle",
  "title": "新会话"
}
```

## PATCH /apps/{appName}/users/{userId}/sessions/{sessionId} {#patch-updatesession}

更新会话状态 · `UpdateSession`

合并更新会话状态，用于不执行 Agent 的状态写入。

**请求参数**

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | 认证凭证，格式为 `Bearer <token>`；具体 token 类型由 Runtime 的认证模式决定。 |
| `X-Session-Id` | string | Header | 否 | Runtime 返回过该值时原样回传，用于维持会话亲和性。 |
| `appName` | string | Path | 是 | 应为 `harness_agent`。 |
| `userId` | string | Path | 是 | 会话所属用户标识。 |
| `sessionId` | string | Path | 是 | 会话标识。 |
| `stateDelta` | object | Body | 是 | 要合并到当前会话状态的字段集合。 |
| `stateDelta.{key}` | any | Body | 否 | 要新增或覆盖的业务状态项。三个绑定 ID 和 `harnessVersion` 由服务端维护，状态增量包含其中任意键会返回 422。 |

**响应字段**

| 字段 | 类型 | 位置 | 必返 | 说明 |
|-|-|-|-|-|
| `id` | string | Body | 是 | 会话标识。 |
| `appName` | string | Body | 是 | 应用名。 |
| `userId` | string | Body | 是 | 会话所属用户标识。 |
| `state` | object | Body | 是 | 更新后的完整会话状态。 |
| `state.{key}` | any | Body | 否 | 业务自定义状态项。 |
| `events` | Event[] | Body | 是 | 会话事件；可为空数组。 |
| `lastUpdateTime` | number | Body | 是 | 最近更新时间，Unix 秒时间戳。 |

**调用示例**

```http
PATCH /apps/harness_agent/users/reader-1/sessions/report-1
Content-Type: application/json

{"stateDelta":{"report":"Q2"}}
```

响应包含更新后的 state。已有的其他顶层键保留；服务追加状态变更事件。会话不存在返回 404。

## DELETE /apps/{appName}/users/{userId}/sessions/{sessionId} {#delete-deletesession}

删除会话 · `DeleteSession`

删除指定会话，用于清理历史会话或临时会话。

**请求参数**

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | 认证凭证，格式为 `Bearer <token>`；具体 token 类型由 Runtime 的认证模式决定。 |
| `X-Session-Id` | string | Header | 否 | Runtime 返回过该值时原样回传，用于维持会话亲和性。 |
| `appName` | string | Path | 是 | 应为 `harness_agent`。 |
| `userId` | string | Path | 是 | 会话所属用户标识。 |
| `sessionId` | string | Path | 是 | 会话标识。 |

**响应字段**

| 字段 | 类型 | 位置 | 必返 | 说明 |
|-|-|-|-|-|
| — | — | Body | 否 | 成功时无业务响应字段。 |

**调用示例**

```http
DELETE /apps/harness_agent/users/reader-1/sessions/report-1
```

成功时没有业务返回对象。删除后再查询详情将返回 404。
