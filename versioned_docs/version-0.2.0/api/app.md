# Harness App 调用接口

本页适用于镜像 0.2.0 的 Runtime HTTP 入口，覆盖 Harness Agent 的会话、执行和产物查询。请求路径相对于已授权的 Runtime 地址。示例使用应用名 `harness_agent`、用户 `reader-1` 和会话 `report-1`。认证主体和路径中的用户需满足该入口的身份要求。

| 操作 | 选择接口 |
|---|---|
| 打开会话列表、恢复聊天历史 | ListSessions、GetSession |
| 开始对话、修改业务状态、清理记录 | CreateSession、CreateSessionWithId、UpdateSession、DeleteSession |
| 完整事件数组、实时事件流 | RunAgent、RunAgentSSE |
| 简化输入、取得兼容的文本结果 | Invoke（SSE）、HarnessInvoke（JSON） |
| 展示会话生成的文件 | ListHarnessArtifacts |

### 会话标识与响应约定

`X-Session-Id` 是 Runtime 返回的可选路由亲和标识；收到后原样回传。同一业务对话仍需保存创建响应正文中的 `id`，用作路径或请求体的会话标识。JSON 请求发送 `Content-Type: application/json`；流式调用可声明 `Accept: text/event-stream`。示例只列与各操作相关的字段，认证头见各接口表。

## GET /apps/{app_name}/users/{user_id}/sessions {#get-listsessions}

查询会话列表 · `ListSessions`

查询指定用户在 Harness App 下的全部会话，用于展示会话列表。

**请求参数**

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | 认证凭证，格式为 `Bearer <token>`；具体 token 类型由 Runtime 的认证模式决定。 |
| `X-Session-Id` | string | Header | 否 | Runtime 返回过该值时原样回传，用于维持会话亲和性。 |
| `app_name` | string | Path | 是 | 应为 `harness_agent`。 |
| `user_id` | string | Path | 是 | 会话所属用户标识。 |

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
| `[].state.{key}` | any | Body | 否 | 业务自定义状态项。 |
| `[].events` | Event[] | Body | 是 | 按发生顺序保存的会话事件；可为空数组。 |
| `[].lastUpdateTime` | number | Body | 是 | 最近更新时间，Unix 秒时间戳；未发生更新时可为 `0`。 |

**调用示例**

```http
GET /apps/harness_agent/users/reader-1/sessions
```

空列表返回 HTTP 200 和 `[]`。已有会话时返回下文 GetSession 对象组成的数组。恢复历史请读取会话详情；列表返回的事件数量取决于会话后端。

## POST /apps/{app_name}/users/{user_id}/sessions {#post-createsession}

创建会话 · `CreateSession`

创建会话，用于在未预先指定会话 ID 时开始一次新对话。

**请求参数**

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | 认证凭证，格式为 `Bearer <token>`；具体 token 类型由 Runtime 的认证模式决定。 |
| `X-Session-Id` | string | Header | 否 | Runtime 返回过该值时原样回传，用于维持会话亲和性。 |
| `app_name` | string | Path | 是 | 应为 `harness_agent`。 |
| `user_id` | string | Path | 是 | 会话所属用户标识。 |
| `id` | string 或 null | Body | 否 | 显式会话 ID，非空时优先于 sessionId。 |
| `sessionId` | string or null | Body | 否 | 指定会话 ID；省略或为 `null` 时由服务端生成。 |
| `state` | object or null | Body | 否 | 初始会话状态。 |
| `state.{key}` | any | Body | 否 | 业务自定义状态项。 |
| `events` | Event[] or null | Body | 否 | 初始化到会话中的事件列表。 |
| `skills` | SkillResource[] | Body | 否 | Session 级 Skill 快照；创建时保存到 Session，后续 `POST /run_sse` 使用同一 `sessionId` 时会自动恢复并加载。当前支持外部公开 Skill zip 包。 |
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
| `state.{key}` | any | Body | 否 | 业务自定义状态项。 |
| `events` | Event[] | Body | 是 | 会话事件；可为空数组。 |
| `lastUpdateTime` | number | Body | 是 | 最近更新时间，Unix 秒时间戳。 |

**调用示例**

```http
POST /apps/harness_agent/users/reader-1/sessions
Content-Type: application/json

{"sessionId":"report-1","state":{"report":"Q1"}}
```

返回创建的会话，保存 `id`。使用 `{}` 可由服务分配 ID。镜像的集合创建入口也接受正文 `id`，同时提供时优先使用非空的 `id`。

响应示例：

```json
{
  "id": "report-1",
  "appName": "harness_agent",
  "userId": "reader-1",
  "state": {
    "report": "Q1"
  },
  "events": [],
  "lastUpdateTime": 1794800000
}
```

## POST /apps/{app_name}/users/{user_id}/sessions/{session_id} {#post-createsessionwithid}

使用指定 ID 创建会话 · `CreateSessionWithId`

调用方可以使用业务系统中的标识作为会话 ID，后续通过同一 ID 读取会话或继续对话。

**请求参数**

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | 认证凭证，格式为 `Bearer <token>`；具体 token 类型由 Runtime 的认证模式决定。 |
| `X-Session-Id` | string | Header | 否 | Runtime 返回过该值时原样回传，用于维持会话亲和性。 |
| `app_name` | string | Path | 是 | 应为 `harness_agent`。 |
| `user_id` | string | Path | 是 | 会话所属用户标识。 |
| `session_id` | string | Path | 是 | 要创建的会话标识。 |
| 请求体 | object 或 null | Body | 否 | 直接提供初始状态的键值对象。 |

**响应字段**

| 字段 | 类型 | 位置 | 必返 | 说明 |
|-|-|-|-|-|
| `X-Session-Id` | string | Header | 否 | Runtime 分配的会话亲和标识；后续请求应原样回传。 |
| `id` | string | Body | 是 | 与请求的 `session_id` 相同。 |
| `appName` | string | Body | 是 | 应用名。 |
| `userId` | string | Body | 是 | 会话所属用户标识。 |
| `state` | object | Body | 是 | 会话状态；可为空对象。 |
| `state.{key}` | any | Body | 否 | 业务自定义状态项。 |
| `events` | Event[] | Body | 是 | 会话事件；可为空数组。 |
| `lastUpdateTime` | number | Body | 是 | 最近更新时间，Unix 秒时间戳。 |

**调用示例**

```http
POST /apps/harness_agent/users/reader-1/sessions/report-1
Content-Type: application/json

{"report":"Q1"}
```

返回会话对象；重复创建同一 ID 可返回 409。该路由随 ADK SDK 提供，其处理器直接将 JSON 对象作为初始 state。需要一并写入历史事件或 Skill 快照时，使用上一节的集合创建入口。

## GET /apps/{app_name}/users/{user_id}/sessions/{session_id} {#get-getsession}

查询会话详情 · `GetSession`

获取指定会话的状态与历史事件，用于恢复或查看既有对话。

**请求参数**

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | 认证凭证，格式为 `Bearer <token>`；具体 token 类型由 Runtime 的认证模式决定。 |
| `X-Session-Id` | string | Header | 否 | Runtime 返回过该值时原样回传，用于维持会话亲和性。 |
| `app_name` | string | Path | 是 | 应为 `harness_agent`。 |
| `user_id` | string | Path | 是 | 会话所属用户标识。 |
| `session_id` | string | Path | 是 | 会话标识。 |

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
    "report": "Q1"
  },
  "events": [],
  "lastUpdateTime": 1794800000,
  "status": "idle",
  "title": "新会话"
}
```

## PATCH /apps/{app_name}/users/{user_id}/sessions/{session_id} {#patch-updatesession}

更新会话状态 · `UpdateSession`

合并更新会话状态，用于不执行 Agent 的状态写入。

**请求参数**

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | 认证凭证，格式为 `Bearer <token>`；具体 token 类型由 Runtime 的认证模式决定。 |
| `X-Session-Id` | string | Header | 否 | Runtime 返回过该值时原样回传，用于维持会话亲和性。 |
| `app_name` | string | Path | 是 | 应为 `harness_agent`。 |
| `user_id` | string | Path | 是 | 会话所属用户标识。 |
| `session_id` | string | Path | 是 | 会话标识。 |
| `stateDelta` | object | Body | 是 | 要合并到当前会话状态的字段集合。 |
| `stateDelta.{key}` | any | Body | 否 | 要新增或覆盖的状态项。 |

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

## DELETE /apps/{app_name}/users/{user_id}/sessions/{session_id} {#delete-deletesession}

删除会话 · `DeleteSession`

删除指定会话，用于清理历史会话或临时会话。

**请求参数**

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | 认证凭证，格式为 `Bearer <token>`；具体 token 类型由 Runtime 的认证模式决定。 |
| `X-Session-Id` | string | Header | 否 | Runtime 返回过该值时原样回传，用于维持会话亲和性。 |
| `app_name` | string | Path | 是 | 应为 `harness_agent`。 |
| `user_id` | string | Path | 是 | 会话所属用户标识。 |
| `session_id` | string | Path | 是 | 会话标识。 |

**响应字段**

| 字段 | 类型 | 位置 | 必返 | 说明 |
|-|-|-|-|-|
| — | — | Body | 否 | 成功时无业务响应字段。 |

**调用示例**

```http
DELETE /apps/harness_agent/users/reader-1/sessions/report-1
```

成功时没有业务返回对象。删除后再查询详情将返回 404。

## POST /run {#post-runagent}

运行对话 · `RunAgent`

在已创建的会话中执行一次 Agent 并在执行完成后返回事件数组，适用于非流式调用。

**请求参数**

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | 认证凭证，格式为 `Bearer <token>`；身份模式下 `userId` 的有效值由认证主体决定。 |
| `X-Session-Id` | string | Header | 否 | Runtime 返回过该值时原样回传，用于维持会话亲和性。 |
| `appName` | string or null | Body | 否 | 应为 `harness_agent`；省略时由服务端选择应用。 |
| `userId` | string | Body | 是 | 用户标识；身份模式下服务端使用认证主体覆盖该值。 |
| `sessionId` | string | Body | 是 | 已创建的会话标识。 |
| `newMessage` | Content or null | Body | 否 | 本轮输入消息。 |
| `newMessage.role` | string or null | Body | 否 | 消息角色，调用方消息通常为 `user`。 |
| `newMessage.parts` | Part[] or null | Body | 否 | 消息分片。 |
| `newMessage.parts[].text` | string or null | Body | 否 | 文本内容。 |
| `newMessage.parts[].inlineData` | Blob or null | Body | 否 | 内联二进制内容，包含 MIME 类型和 Base64 数据。 |
| `newMessage.parts[].fileData` | FileData or null | Body | 否 | URI 文件内容。 |
| `newMessage.parts[].functionCall` | FunctionCall or null | Body | 否 | 函数调用。 |
| `newMessage.parts[].functionResponse` | FunctionResponse or null | Body | 否 | 函数调用结果。 |
| `newMessage.parts[].executableCode` | ExecutableCode or null | Body | 否 | 可执行代码。 |
| `newMessage.parts[].codeExecutionResult` | CodeExecutionResult or null | Body | 否 | 代码执行结果。 |
| `newMessage.parts[].thought` | boolean or null | Body | 否 | 是否为思考内容。 |
| `newMessage.parts[].thoughtSignature` | string or null | Body | 否 | Base64 编码的思考签名。 |
| `newMessage.parts[].videoMetadata` | VideoMetadata or null | Body | 否 | 视频元数据。 |
| `newMessage.parts[].mediaResolution` | PartMediaResolution or null | Body | 否 | 媒体分辨率配置。 |
| `newMessage.parts[].toolCall` | ToolCall or null | Body | 否 | 服务端工具调用。 |
| `newMessage.parts[].toolResponse` | ToolResponse or null | Body | 否 | 服务端工具调用结果。 |
| `newMessage.parts[].partMetadata` | object or null | Body | 否 | 分片自定义元数据。 |
| `newMessage.parts[].audioTranscription` | Transcription or null | Body | 否 | 音频转写内容。 |
| `streaming` | boolean | Body | 否 | 是否要求模型流式生成；默认 `false`。 |
| `stateDelta` | object or null | Body | 否 | 本轮执行前合并到 Session 的状态增量。 |
| `functionCallEventId` | string or null | Body | 否 | 续接函数调用时对应的事件 ID。 |
| `invocationId` | string or null | Body | 否 | 调用标识；省略时由服务端生成。 |
| `customMetadata` | object or null | Body | 否 | 调用方自定义元数据。 |

**响应字段**

| 字段 | 类型 | 位置 | 必返 | 说明 |
|-|-|-|-|-|
| `[]` | Event[] | Body | 是 | 本次执行产生的事件数组。 |
| `[].id` | string | Body | 是 | 事件标识。 |
| `[].invocationId` | string | Body | 是 | 调用标识。 |
| `[].author` | string | Body | 是 | 事件作者。 |
| `[].timestamp` | number | Body | 是 | 事件时间戳。 |
| `[].content` | Content or null | Body | 否 | 事件消息内容。 |
| `[].actions` | EventActions | Body | 是 | 事件动作集合。 |
| `[].partial` | boolean or null | Body | 否 | 是否为部分响应。 |
| `[].turnComplete` | boolean or null | Body | 否 | 当前轮次是否结束。 |
| `[].finishReason` | string or null | Body | 否 | 模型结束原因。 |
| `[].errorCode` | string or null | Body | 否 | 事件错误码。 |
| `[].errorMessage` | string or null | Body | 否 | 事件错误信息。 |
| `[].usageMetadata` | object or null | Body | 否 | Token 使用量等模型计量信息。 |
| `[].customMetadata` | object or null | Body | 否 | 自定义元数据。 |
| `[].output` | any or null | Body | 否 | 节点输出。 |
| `[].branch` | string or null | Body | 否 | 事件所属分支。 |

**调用示例**

```http
POST /run
Content-Type: application/json

{"appName":"harness_agent","userId":"reader-1","sessionId":"report-1","newMessage":{"role":"user","parts":[{"text":"总结报告。"}]}}
```

先创建会话。返回完整的 ADK Event 数组，按顺序读取每个事件的 content.parts。

## POST /run_sse {#post-runagentsse}

流式运行对话 · `RunAgentSSE`

在已有会话中运行 Harness Agent，以 SSE 返回事件。示例使用支持本轮 Harness 配置覆盖的 legacy KeyAuth 入口。

<div class="api-contract"><section><h4>请求体</h4><details open><summary><code>harness</code> <small>object · 可选</small><span class="api-field-description">设置本轮 Harness Agent 使用的模型、指令和工具。</span></summary><dl><div class="api-property"><dt><code>model_name</code> <small>string · 可选</small></dt><dd>模型名称；默认空字符串表示沿用部署配置。</dd></div><div class="api-property"><dt><code>system_prompt</code> <small>string · 可选</small></dt><dd>系统提示词。</dd></div><div class="api-property"><dt><code>tools</code> <small>string · 可选</small></dt><dd>逗号分隔的内置工具名称。</dd></div><div class="api-property"><dt><code>skills</code> <small>string · 可选</small></dt><dd>逗号分隔的 Skill Hub slug、Space ID 或 Space:Skill 引用。</dd></div><div class="api-property"><dt><code>runtime</code> <small><code>adk</code> or <code>codex</code> · 可选</small></dt><dd>默认 <code>adk</code>。</dd></div><div class="api-property"><dt><code>max_llm_calls</code> <small>int or null · 可选</small></dt><dd>最大模型调用次数，最小值为 <code>1</code>。</dd></div><div class="api-property"><dt><code>model_provider</code> <small>string · 可选</small></dt><dd>模型提供方；默认空字符串表示沿用部署配置。</dd></div><div class="api-property"><dt><code>model_api_base</code> <small>string · 可选</small></dt><dd>模型 API 地址；不得指向链路本地或云元数据地址。</dd></div><div class="api-property"><dt><code>model_api_key</code> <small>string · 可选</small></dt><dd>模型 API 密钥。仅用于兼容历史调用方，新调用方应改用 <code>X-Model-API-Key</code>；两者同时提供时以 Header 为准。</dd></div><div class="api-property"><dt><code>mcp_toolset_id</code> <small>string · 可选</small></dt><dd>MCP ToolSet ID，只能选一个，而且是本账号下的。</dd></div></dl><details><summary><code>mcp_servers</code> <small>McpServer[]</small></summary><dl><div class="api-property"><dt><code>protocol</code> <small><code>streamable-http</code> or <code>sse</code> · 可选</small></dt><dd>默认 <code>streamable-http</code>。</dd></div><div class="api-property"><dt><code>endpoint</code> <small>string · 必填</small></dt><dd>HTTP(S) 地址，不允许 userinfo 或 fragment。</dd></div><div class="api-property"><dt><code>api_key</code> <small>string or null · 可选</small></dt><dd>MCP 认证密钥。</dd></div></dl></details><details><summary><code>knowledgebase</code> <small>object or null</small></summary><dl><div class="api-property"><dt><code>index</code> <small>string or null · 可选</small></dt><dd>知识库索引；长度不超过 <code>128</code>，仅允许字母、数字、下划线、点和连字符。</dd></div><div class="api-property"><dt><code>type</code> <small>string or null · 可选</small></dt><dd><code>local</code>、<code>opensearch</code>、<code>redis</code>、<code>milvus</code>、<code>tos_vector</code>、<code>viking</code>、<code>context_search</code> 或 <code>openviking</code>。</dd></div></dl></details><details><summary><code>sandbox</code> <small>object or null</small></summary><dl><div class="api-property"><dt><code>tool_id</code> <small>string or null · 可选</small></dt><dd>Sandbox Tool ID；部署设置 allowlist 时必须在 allowlist 内。</dd></div><div class="api-property"><dt><code>ttl</code> <small>int or null · 可选</small></dt><dd>Session TTL，范围 <code>60</code>–<code>86400</code> 秒。</dd></div></dl></details><dl><div class="api-property"><dt><code>registry_space_id</code> <small>string · 可选</small></dt><dd>A2A Registry Space 标识。</dd></div><div class="api-property"><dt><code>registry_endpoint</code> <small>string · 可选</small></dt><dd>A2A Registry 地址。</dd></div><div class="api-property"><dt><code>registry_region</code> <small>string · 可选</small></dt><dd>A2A Registry 区域。</dd></div><div class="api-property"><dt><code>registry_top_k</code> <small>int · 可选</small></dt><dd>Registry 返回数量，最小值为 <code>1</code>，默认 <code>3</code>。</dd></div></dl><p><code>resources</code> · array · 可选。结构见同页的顶层资源字段。</p></details><dl><div class="api-property"><dt><code>userId</code> <small>string · 必填</small></dt><dd>用户标识；兼容输入 <code>user_id</code>；身份模式下服务端使用认证主体覆盖该值。</dd></div><div class="api-property"><dt><code>sessionId</code> <small>string · 必填</small></dt><dd>已创建的会话标识；兼容输入 <code>session_id</code>。</dd></div><div class="api-property"><dt><code>newMessage</code> <small>Content or null · 可选</small></dt><dd>本轮输入；兼容输入 <code>new_message</code>。<code>Content</code> 和 <code>Part</code> 字段与 <code>POST RunAgent</code> 相同。</dd></div><div class="api-property"><dt><code>appName</code> <small>string or null · 可选</small></dt><dd>应为 <code>harness_agent</code>；兼容输入 <code>app_name</code>。</dd></div><div class="api-property"><dt><code>streaming</code> <small>boolean · 可选</small></dt><dd>是否要求模型流式生成。请求级 Harness 适配器在省略时选择流式；建议调用方显式传值。</dd></div><div class="api-property"><dt><code>stateDelta</code> <small>object or null · 可选</small></dt><dd>本轮执行前合并到 Session 的状态增量；兼容输入 <code>state_delta</code>。</dd></div><div class="api-property"><dt><code>functionCallEventId</code> <small>string or null · 可选</small></dt><dd>续接函数调用时对应的事件 ID。</dd></div><div class="api-property"><dt><code>invocationId</code> <small>string or null · 可选</small></dt><dd>调用标识；省略时由服务端生成。</dd></div><div class="api-property"><dt><code>customMetadata</code> <small>object or null · 可选</small></dt><dd>调用方自定义元数据。</dd></div><div class="api-property"><dt><code>max_llm_calls</code> <small>int or null · 可选</small></dt><dd>最大模型调用次数，最小值为 <code>1</code>。</dd></div></dl><details><summary><code>resources</code> <small>array · 可选</small></summary><p>兼容路径将顶层资源传入 <code>harness.resources</code>，同时提供时顶层值优先。省略显式资源且使用示例中的会话标识写法时，可恢复创建会话保存的 Skill 包。</p><details><summary><code>openviking_context</code> <small>资源条目</small></summary><dl><div class="api-property"><dt><code>type</code> <small>string · 必填</small></dt><dd>资源类型；MemoryStore 展开后的运行时快照固定为 openviking_context。</dd></div><div class="api-property"><dt><code>usage</code> <small>string · 必填</small></dt><dd>资源用途；长期记忆固定为 memory。</dd></div><div class="api-property"><dt><code>source</code> <small>string or null · 可选</small></dt><dd>资源来源；由 AgentKit MemoryStore 展开时为 memory_store。</dd></div><div class="api-property"><dt><code>memory_store_id</code> <small>string or null · 可选</small></dt><dd>AgentKit MemoryStore ID，仅作为已冻结快照的来源标识；Runtime 不使用该字段回查 AgentKit。</dd></div><div class="api-property"><dt><code>context_id</code> <small>string · 必填</small></dt><dd>OpenViking Context ID，必须以 ov- 开头。</dd></div><div class="api-property"><dt><code>path</code> <small>string or null · 可选</small></dt><dd>OpenViking 路径类型；长期记忆只允许 memories，省略时按 memories 处理。</dd></div><div class="api-property"><dt><code>store_path</code> <small>string or null · 可选</small></dt><dd>MemoryStore 在 OpenViking memories 下的目录段；由 AgentKit 创建 Session 时冻结。</dd></div><div class="api-property"><dt><code>root_uri</code> <small>string or null · 可选</small></dt><dd>MemoryStore 根 URI，例如 viking://.../memories/{store_path}/；用于运行时定位和审计。</dd></div><div class="api-property"><dt><code>peer</code> <small>object or null · 可选</small></dt><dd>OpenViking 读写的 peer 配置；省略时使用当前用户派生 peer。</dd></div><div class="api-property"><dt><code>peer.mode</code> <small>current_user or explicit · 可选</small></dt><dd>peer 解析模式；current_user 表示 Runtime 按 userId 派生，explicit 表示使用 peer_id。</dd></div><div class="api-property"><dt><code>peer.peer_id</code> <small>string or null · 可选</small></dt><dd>mode=explicit 时必填；必须是安全路径段。</dd></div><div class="api-property"><dt><code>credential_ref</code> <small>object · 必填</small></dt><dd>OpenViking 凭证引用；只允许 Identity API key provider 引用，不允许明文 api_key、token、cookie 或 secret。</dd></div><div class="api-property"><dt><code>credential_ref.type</code> <small>string · 必填</small></dt><dd>固定为 identity_api_key_provider。</dd></div><div class="api-property"><dt><code>credential_ref.Name</code> <small>string · 必填</small></dt><dd>Identity API key provider 名称，例如 openviking-user-key。</dd></div><div class="api-property"><dt><code>credential_ref.PoolName</code> <small>string · 必填</small></dt><dd>Identity API key provider 池名称，例如 default。</dd></div><div class="api-property"><dt><code>access</code> <small>read_only or read_write · 可选</small></dt><dd>访问模式；默认 read_only，只召回不自动保存；read_write 会启用 write_memory 和会话后保存。</dd></div></dl></details><details><summary><code>external_skill_package</code> <small>资源条目</small></summary><dl><div class="api-property"><dt><code>type</code> <small>string · 必填</small></dt><dd>资源类型；外部公开 Skill 包固定为 <code>external_skill_package</code>。</dd></div><div class="api-property"><dt><code>source</code> <small>string · 可选</small></dt><dd>外部公开 Skill 包使用 <code>public_url</code>。省略时按 <code>public_url</code> 处理。</dd></div><div class="api-property"><dt><code>url</code> <small>string · 必填</small></dt><dd>外部公开 Skill zip 下载链接。Runtime 下载并校验 zip 后读取 <code>SKILL.md</code>，将 Skill 的 <code>name</code> 和 <code>description</code> 注入 system prompt，并挂载为 ADK <code>SkillToolset</code>。</dd></div></dl></details></details></section><aside><h4>请求示例</h4><pre><code>{
  &quot;app_name&quot;: &quot;harness_agent&quot;,
  &quot;user_id&quot;: &quot;reader-1&quot;,
  &quot;session_id&quot;: &quot;report-1&quot;,
  &quot;new_message&quot;: {
    &quot;role&quot;: &quot;user&quot;,
    &quot;parts&quot;: [{&quot;text&quot;: &quot;总结本周报告。&quot;}]
  },
  &quot;streaming&quot;: true,
  &quot;harness&quot;: {
    &quot;system_prompt&quot;: &quot;用三条要点回复。&quot;,
    &quot;max_llm_calls&quot;: 3
  }
}</code></pre></aside></div>

#### 请求头

<div class="api-contract-meta"><dl><div class="api-property"><dt><code>Authorization</code> <small>string · 必填</small></dt><dd>认证凭证，格式为 <code>Bearer &lt;token&gt;</code>；身份模式下 <code>userId</code> 的有效值由认证主体决定。</dd></div><div class="api-property"><dt><code>X-Session-Id</code> <small>string · 可选</small></dt><dd>Runtime 返回过该值时原样回传，用于维持会话亲和性。</dd></div><div class="api-property"><dt><code>X-Model-API-Key</code> <small>string · 可选</small></dt><dd>本次请求使用的模型 API 密钥，值为原始密钥，不包含 <code>Bearer</code> 等认证方案前缀；同时提供时优先于 <code>harness.model_api_key</code>。</dd></div></dl></div>

#### 响应与错误

成功建连后以 `text/event-stream` 逐帧发送 ADK Event。请求级适配器使用 `Cache-Control: no-cache`。以下仅展示文本相关字段：

```text
data: {"partial":true,"content":{"parts":[{"text":"甲"}]}}

data: {"partial":false,"content":{"parts":[{"text":"甲乙"}]}}
```

兼容处理器在建连前发现参数错误时返回 HTTP 422；建连后执行失败可返回 `data: {"error":"..."}` 并结束流。客户端应读完整消息结算预览文本。[流式事件消费](../app/features.md)

## POST /invoke {#post-invoke}

简化流式调用 · `Invoke`

使用简化请求执行默认 Harness 并流式返回事件，适用于不需要显式管理应用名和 Session 创建过程的调用方。

**请求参数**

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | 认证凭证，格式为 `Bearer <token>`；身份模式下用户标识取认证主体。 |
| `user_id` | string | Header | 否 | legacy 模式的用户标识；默认 `agentkit_user`；身份模式忽略该值。 |
| `session_id` | string | Header | 否 | 会话标识；默认空字符串；会话不存在时自动创建。 |
| `prompt` | string | Body | 否 | 用户输入。若缺失，则将整个 JSON Body 序列化为输入；非 JSON Body 按 UTF-8 文本处理。 |
| `{key}` | any | Body | 否 | `prompt` 缺失时参与序列化的任意 JSON 字段。 |

**响应字段**

| 字段 | 类型 | 位置 | 必返 | 说明 |
|-|-|-|-|-|
| `Content-Type` | string | Header | 是 | `text/event-stream`。 |
| `Cache-Control` | string | Header | 是 | `no-cache`。 |
| `data` | Event JSON | Body | 否 | 普通 SSE 帧；Event 字段与 `POST RunAgent` 的响应元素相同。 |
| `data.error` | string | Body | 否 | 建连后执行失败时返回的错误帧；身份模式固定为 `agent execution failed`。 |

**调用示例**

```http
POST /invoke
Content-Type: application/json
session_id: report-1

{"prompt":"总结报告。"}
```

返回 SSE。此入口使用 Header 中的 session_id；会话不存在时可自动创建。

## POST /harness/invoke {#post-harnessinvoke}

使用配置覆盖调用 · `HarnessInvoke`

执行一次带可选 Harness 覆盖的非流式调用，适用于 legacy KeyAuth Runtime 的兼容调用。

**请求参数**

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | Runtime KeyAuth 或自定义 JWT 凭证；身份模式不注册本接口。 |
| `prompt` | string | Body | 是 | 用户输入。 |
| `harness_name` | string | Body | 是 | 返回结果中使用的 Harness 名称。 |
| `harness` | object or null | Body | 否 | 本次调用覆盖；字段与 `POST RunAgentSSE` 的 `harness` 完全相同。 |
| `run_agent_request` | object | Body | 是 | 会话与调用限制。 |
| `run_agent_request.user_id` | string | Body | 是 | 用户标识。 |
| `run_agent_request.session_id` | string | Body | 是 | 会话标识。 |
| `run_agent_request.max_llm_calls` | int or null | Body | 否 | 最大模型调用次数，最小值为 `1`。 |

**响应字段**

| 字段 | 类型 | 位置 | 必返 | 说明 |
|-|-|-|-|-|
| `harness_name` | string | Body | 是 | 请求中的 Harness 名称。 |
| `overwrite` | boolean | Body | 是 | 请求是否提供了 `harness` 覆盖。 |
| `output` | string | Body | 是 | Agent 最终输出；执行失败时为空字符串。 |
| `error` | string or null | Body | 是 | 执行错误；成功时为 `null`。 |
| `artifacts` | Artifact[] | Body | 是 | 本次调用产生的产物；无产物时为空数组。 |
| `artifacts[].name` | string | Body | 否 | 产物名称。 |
| `artifacts[].url` | string | Body | 否 | 产物访问地址。 |
| `artifacts[].mime_type` | string or null | Body | 否 | MIME 类型。 |
| `artifacts[].size` | int or null | Body | 否 | 字节数。 |
| `artifacts[].source` | string | Body | 否 | 产物来源。 |
| `artifacts[].version` | int, string or null | Body | 否 | 产物版本。 |

**调用示例**

```http
POST /harness/invoke
Content-Type: application/json

{"harness_name":"report","prompt":"回复 OK","run_agent_request":{"user_id":"reader-1","session_id":"report-1"}}
```

仅在未启用且未强制共享身份时注册。即使 HTTP 为 200，调用方也应检查正文 error。

响应示例：

```json
{
  "harness_name": "report",
  "overwrite": false,
  "output": "OK",
  "error": null,
  "artifacts": []
}
```

## GET /harness/artifacts {#get-listharnessartifacts}

查询会话产物 · `ListHarnessArtifacts`

查询指定 Session 产生的最新产物，用于结构化客户端展示或下载产物。

**请求参数**

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | 认证凭证，格式为 `Bearer <token>`。 |
| `session_id` | string | Query | 是 | Session 标识。 |
| `user_id` | string | Query | 否 | legacy 模式下默认 `default`；身份模式下由认证主体覆盖。 |
| `app_name` | string | Query | 否 | 默认 `harness_agent`。 |
| `invocation_id` | string | Query | 否 | 仅返回指定 Invocation 的产物。 |
| `since` | number | Query | 否 | 仅返回该 Unix 秒时间戳之后创建的产物。 |

**响应字段**

| 字段 | 类型 | 位置 | 必返 | 说明 |
|-|-|-|-|-|
| `artifacts` | Artifact[] | Body | 是 | 最新产物数组；产物能力未启用或没有匹配项时为空数组，最多返回 `50` 项。 |
| `artifacts[].name` | string | Body | 否 | 产物名称。 |
| `artifacts[].url` | string | Body | 否 | 产物访问地址。 |
| `artifacts[].mime_type` | string or null | Body | 否 | MIME 类型。 |
| `artifacts[].size` | int or null | Body | 否 | 字节数。 |
| `artifacts[].source` | string | Body | 否 | 产物来源。 |
| `artifacts[].version` | int, string or null | Body | 否 | 产物版本。 |

**调用示例**

```http
GET /harness/artifacts?user_id=reader-1&session_id=report-1
```

无记录或产物服务关闭时返回 `{"artifacts":[]}`。服务启用时缺少 session_id 或 since 格式无效返回 400。

本页字段与示例适用于 0.2.0 镜像，版本适用范围见[版本说明](../versions.md)。

## 调用结构

以下 JSON Schema 取自镜像入口的请求和响应模型，包含 MCP、知识库和沙箱等嵌套字段的类型、枚举和范围约束。

<details>
<summary>InvokeHarnessRequest</summary>

```json
{
  "$defs": {
    "HarnessOverrides": {
      "description": "Fields that may be changed for one invocation without redeploying.",
      "properties": {
        "model_name": {
          "default": "",
          "description": "Reasoning model name.",
          "title": "Model Name",
          "type": "string"
        },
        "model_provider": {
          "default": "",
          "title": "Model Provider",
          "type": "string"
        },
        "model_api_base": {
          "default": "",
          "title": "Model Api Base",
          "type": "string"
        },
        "model_api_key": {
          "default": "",
          "format": "password",
          "title": "Model Api Key",
          "type": "string",
          "writeOnly": true
        },
        "tools": {
          "default": "",
          "description": "Comma-separated built-in tool names.",
          "title": "Tools",
          "type": "string"
        },
        "mcp_servers": {
          "description": "Optional remote MCP protocol/endpoint/api_key settings.",
          "items": {
            "$ref": "#/$defs/McpServerConfig"
          },
          "title": "Mcp Servers",
          "type": "array"
        },
        "mcp_toolset_id": {
          "default": "",
          "description": "Optional AgentKit MCP toolset id; empty selects no toolset.",
          "pattern": "^(?:[A-Za-z0-9][A-Za-z0-9_-]{0,127})?$",
          "title": "Mcp Toolset Id",
          "type": "string"
        },
        "skills": {
          "default": "",
          "description": "Comma-separated Skill Hub slugs, space ids, or space:skill refs.",
          "title": "Skills",
          "type": "string"
        },
        "system_prompt": {
          "default": "",
          "description": "Agent instruction.",
          "title": "System Prompt",
          "type": "string"
        },
        "runtime": {
          "default": "adk",
          "enum": [
            "adk",
            "codex"
          ],
          "title": "Runtime",
          "type": "string"
        },
        "registry_space_id": {
          "default": "",
          "title": "Registry Space Id",
          "type": "string"
        },
        "registry_endpoint": {
          "default": "",
          "title": "Registry Endpoint",
          "type": "string"
        },
        "registry_region": {
          "default": "",
          "title": "Registry Region",
          "type": "string"
        },
        "registry_top_k": {
          "default": 3,
          "minimum": 1,
          "title": "Registry Top K",
          "type": "integer"
        },
        "max_llm_calls": {
          "anyOf": [
            {
              "minimum": 1,
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Max Llm Calls"
        },
        "knowledgebase": {
          "anyOf": [
            {
              "$ref": "#/$defs/KnowledgebaseOverrides"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "sandbox": {
          "anyOf": [
            {
              "$ref": "#/$defs/SandboxOverrides"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "resources": {
          "items": {
            "additionalProperties": true,
            "type": "object"
          },
          "title": "Resources",
          "type": "array"
        }
      },
      "title": "HarnessOverrides",
      "type": "object"
    },
    "KnowledgebaseOverrides": {
      "additionalProperties": false,
      "description": "Request-scoped knowledge base selector.\n\nOnly the index and the backend type may change per request; names,\ndescriptions, top_k, credentials and connection settings stay with the\ndeployment. Unknown fields are rejected so older clients that still send\n``top_k`` get a clear 422 instead of a silently ignored field.",
      "properties": {
        "index": {
          "anyOf": [
            {
              "pattern": "^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$",
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Index"
        },
        "type": {
          "anyOf": [
            {
              "enum": [
                "local",
                "opensearch",
                "redis",
                "milvus",
                "tos_vector",
                "viking",
                "context_search",
                "openviking"
              ],
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Type"
        }
      },
      "title": "KnowledgebaseOverrides",
      "type": "object"
    },
    "McpServerConfig": {
      "additionalProperties": false,
      "description": "Direct MCP connection settings or a gateway resolved from GetMCPToolset.",
      "properties": {
        "protocol": {
          "default": "streamable-http",
          "enum": [
            "streamable-http",
            "sse"
          ],
          "title": "Protocol",
          "type": "string"
        },
        "endpoint": {
          "title": "Endpoint",
          "type": "string"
        },
        "api_key": {
          "anyOf": [
            {
              "format": "password",
              "type": "string",
              "writeOnly": true
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Api Key"
        },
        "api_key_header": {
          "default": "Authorization",
          "enum": [
            "Authorization",
            "X-Api-Key"
          ],
          "title": "Api Key Header",
          "type": "string"
        }
      },
      "required": [
        "endpoint"
      ],
      "title": "McpServerConfig",
      "type": "object"
    },
    "RunAgentRequest": {
      "properties": {
        "user_id": {
          "title": "User Id",
          "type": "string"
        },
        "session_id": {
          "title": "Session Id",
          "type": "string"
        },
        "max_llm_calls": {
          "anyOf": [
            {
              "minimum": 1,
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Max Llm Calls"
        }
      },
      "required": [
        "user_id",
        "session_id"
      ],
      "title": "RunAgentRequest",
      "type": "object"
    },
    "SandboxOverrides": {
      "additionalProperties": false,
      "description": "Request-scoped AgentKit Sandbox target.\n\n``tool_id`` selects the sandbox for this invocation and ``ttl`` tunes how\nlong its session survives. The workspace, region, credentials and the\nper-command budget are fixed by the deployment (``Execute`` always uses\nADK's 30 second limit).",
      "properties": {
        "tool_id": {
          "anyOf": [
            {
              "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$",
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Tool Id"
        },
        "ttl": {
          "anyOf": [
            {
              "maximum": 86400,
              "minimum": 60,
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Ttl"
        }
      },
      "title": "SandboxOverrides",
      "type": "object"
    }
  },
  "properties": {
    "prompt": {
      "title": "Prompt",
      "type": "string"
    },
    "harness_name": {
      "title": "Harness Name",
      "type": "string"
    },
    "harness": {
      "anyOf": [
        {
          "$ref": "#/$defs/HarnessOverrides"
        },
        {
          "type": "null"
        }
      ],
      "default": null
    },
    "run_agent_request": {
      "$ref": "#/$defs/RunAgentRequest"
    }
  },
  "required": [
    "prompt",
    "harness_name",
    "run_agent_request"
  ],
  "title": "InvokeHarnessRequest",
  "type": "object"
}
```

</details>

<details>
<summary>InvokeHarnessResponse</summary>

```json
{
  "$defs": {
    "ArtifactLink": {
      "description": "One user-visible artifact returned by an invocation.",
      "properties": {
        "name": {
          "title": "Name",
          "type": "string"
        },
        "url": {
          "title": "Url",
          "type": "string"
        },
        "mime_type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Mime Type"
        },
        "size": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Size"
        },
        "source": {
          "title": "Source",
          "type": "string"
        },
        "version": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Version"
        }
      },
      "required": [
        "name",
        "url",
        "source"
      ],
      "title": "ArtifactLink",
      "type": "object"
    }
  },
  "properties": {
    "harness_name": {
      "title": "Harness Name",
      "type": "string"
    },
    "overwrite": {
      "default": false,
      "title": "Overwrite",
      "type": "boolean"
    },
    "output": {
      "title": "Output",
      "type": "string"
    },
    "error": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "default": null,
      "title": "Error"
    },
    "artifacts": {
      "items": {
        "$ref": "#/$defs/ArtifactLink"
      },
      "title": "Artifacts",
      "type": "array"
    }
  },
  "required": [
    "harness_name",
    "output"
  ],
  "title": "InvokeHarnessResponse",
  "type": "object"
}
```

</details>
