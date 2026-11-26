---
toc_max_heading_level: 2
---
# 对话调用接口

本页记录 0.5.1 的 Harness App 对话执行、SSE 与 A2A 接口。请求路径相对于已授权的 Runtime 地址。使用 `/run`、`/run_sse` 或 `/invoke` 时，先通过[会话管理接口](app.md#post-createsession)创建会话并保存返回的 `id`。A2A 消息调用按本页对应接口构造请求。认证方式与请求头取决于 Runtime 部署，具体字段见各接口。沙箱文件的上传、列出与下载见[文件操作接口](files.md)。请求字段推荐使用本页列出的驼峰名称；`refreshSnapshot` 兼容下划线名称 `refresh_snapshot`，绑定字段兼容规则见[会话管理接口](app.md)。`harness` 内的配置字段仍使用本页列出的下划线名称。

## POST /run {#post-runagent}

运行对话 · `RunAgent`

在已创建的会话中执行一次 Agent 并在执行完成后返回事件数组，适用于非流式调用。

### 请求参数

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

### 调用示例

```http
POST /run
Content-Type: application/json

{"appName":"harness_agent","userId":"reader-1","sessionId":"report-1","newMessage":{"role":"user","parts":[{"text":"总结报告。"}]}}
```

### 响应字段

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

先创建会话。返回完整的 ADK Event 数组，按顺序读取每个事件的 content.parts。

## POST /run_sse {#post-runagentsse}

流式运行对话 · `RunAgentSSE` **[推荐]**

日常对话调用推荐使用此接口，以便及时接收增量输出；`/run` 保留用于需要完整事件数组的调用。在已有会话中运行 Harness Agent，以 SSE 返回事件。服务认证部署的绑定会话默认使用固定版本对应的实例快照；缓存缺失或版本不一致时按 Session 中的版本自动重建。普通消息不会仅因经过一段时间而读取最新 Harness。

<div class="api-contract"><section><h4>请求体</h4><dl><div class="api-property"><dt><code>harnessVersion</code> <small>integer · 可选</small></dt><dd>续聊通常省略；显式提供时必须是正整数且与 Session 固定版本一致，不能用它切换版本。与 <code>refreshSnapshot: true</code> 互斥。</dd></div><div class="api-property"><dt><code>refreshSnapshot</code> <small>boolean · 可选 · 默认值 false</small></dt><dd>传 true 时，用原绑定获取最新 Harness 和当前 Environment，成功后持久化实际版本、替换快照并执行本轮。字符串和 null 返回 422。</dd></div></dl><details open><summary><code>harness</code> <small>object · 可选</small><span class="api-field-description">设置本轮 Harness Agent 使用的模型、指令和工具。</span></summary><dl><div class="api-property"><dt><code>model_name</code> <small>string · 可选</small></dt><dd>模型名称；绑定会话省略时沿用快照，未绑定时沿用部署配置。</dd></div><div class="api-property"><dt><code>model_effort</code> <small>string or null · 可选</small></dt><dd>ADK 模型推理强度：low、medium、high、xhigh、max。省略沿用快照，显式 null 清除继承值。非空值要求 ADK 直接模型调用，模型本身须支持所选等级。</dd></div><div class="api-property"><dt><code>system_prompt</code> <small>string · 可选</small></dt><dd>系统提示词。</dd></div></dl><details open><summary><code>tools</code> <small>string or object[] · 可选</small><span class="api-field-description">逗号分隔的名称（如 grep,read），或按名称选择工具的对象数组。</span></summary><dl><div class="api-property"><dt><code>tool_name</code> <small>string · 数组元素必填</small></dt><dd>每项填写一个非空名称，不能含逗号。数组支持 bash、read、edit、write、glob、grep、web_fetch、web_search。其他名称被过滤，重复名称按首次出现顺序保留。</dd></div></dl></details><dl><div class="api-property"><dt><code>mcp_service_ids</code> <small>string[] · 可选</small></dt><dd>仅用于绑定会话。省略沿用默认服务，[] 仅本轮禁用。ID 去除首尾空白后按序去重。缺少用户或会话标识返回 409；已定位但未绑定的会话、null、空白元素、与 mcp_servers 同传或与非空 mcp_toolset_id 同传均返回 422。</dd></div><div class="api-property"><dt><code>skills</code> <small>string · 可选</small></dt><dd>逗号分隔的 Skill Hub slug、Space ID 或 Space:Skill 引用。</dd></div><div class="api-property"><dt><code>runtime</code> <small><code>adk</code> or <code>codex</code> · 可选</small></dt><dd>默认 <code>adk</code>。</dd></div><div class="api-property"><dt><code>max_llm_calls</code> <small>int or null · 可选</small></dt><dd>最大模型调用次数，最小值为 <code>1</code>。</dd></div><div class="api-property"><dt><code>model_provider</code> <small>string · 可选</small></dt><dd>模型提供方；绑定会话省略时沿用快照，未绑定时沿用部署配置。</dd></div><div class="api-property"><dt><code>model_api_base</code> <small>string · 可选</small></dt><dd>模型 API 地址；不得指向链路本地或云元数据地址。</dd></div><div class="api-property"><dt><code>model_api_key</code> <small>string · 可选</small></dt><dd>模型 API 密钥。仅用于兼容历史调用方，新调用方应改用 <code>X-Model-API-Key</code>；两者同时提供时以 Header 为准。</dd></div><div class="api-property"><dt><code>mcp_toolset_id</code> <small>string · 可选</small></dt><dd>MCP ToolSet ID，只能选一个，而且是本账号下的。</dd></div></dl><details><summary><code>mcp_servers</code> <small>McpServer[]</small></summary><dl><div class="api-property"><dt><code>protocol</code> <small><code>streamable-http</code> or <code>sse</code> · 可选</small></dt><dd>默认 <code>streamable-http</code>。</dd></div><div class="api-property"><dt><code>endpoint</code> <small>string · 必填</small></dt><dd>HTTP(S) 地址，不允许 userinfo 或 fragment。</dd></div><div class="api-property"><dt><code>api_key</code> <small>string or null · 可选</small></dt><dd>MCP 认证密钥。</dd></div><div class="api-property"><dt><code>api_key_header</code> <small>string · 可选</small></dt><dd>默认 Authorization。可指定合法 HTTP Header 名。</dd></div><div class="api-property"><dt><code>api_key_bearer</code> <small>boolean · 可选</small></dt><dd>默认 true；使用 Authorization 时自动添加 Bearer 前缀，false 时直接发送密钥。</dd></div></dl></details><details><summary><code>knowledgebase</code> <small>object or null</small></summary><dl><div class="api-property"><dt><code>index</code> <small>string or null · 可选</small></dt><dd>知识库索引；长度不超过 <code>128</code>，仅允许字母、数字、下划线、点和连字符。</dd></div><div class="api-property"><dt><code>type</code> <small>string or null · 可选</small></dt><dd><code>local</code>、<code>opensearch</code>、<code>redis</code>、<code>milvus</code>、<code>tos_vector</code>、<code>viking</code>、<code>context_search</code> 或 <code>openviking</code>。</dd></div></dl></details><details><summary><code>sandbox</code> <small>object or null</small></summary><dl><div class="api-property"><dt><code>tool_id</code> <small>string or null · 可选</small></dt><dd>Sandbox Tool ID；部署设置 allowlist 时必须在 allowlist 内。绑定会话不能改为快照之外的 Tool ID，否则返回 422；调整 TTL 时省略此字段。</dd></div><div class="api-property"><dt><code>ttl</code> <small>int or null · 可选</small></dt><dd>Session TTL，范围 <code>60</code>–<code>86400</code> 秒。</dd></div></dl></details><dl><div class="api-property"><dt><code>registry_space_id</code> <small>string · 可选</small></dt><dd>A2A Registry Space 标识。</dd></div><div class="api-property"><dt><code>registry_endpoint</code> <small>string · 可选</small></dt><dd>A2A Registry 地址。</dd></div><div class="api-property"><dt><code>registry_region</code> <small>string · 可选</small></dt><dd>A2A Registry 区域。</dd></div><div class="api-property"><dt><code>registry_top_k</code> <small>int · 可选</small></dt><dd>Registry 返回数量，最小值为 <code>1</code>，默认 <code>3</code>。</dd></div></dl><dl><div class="api-property"><dt><code>resources</code> <small>object[] · 可选</small></dt><dd>与下方顶层 resources 使用相同的资源对象结构。两处同时传入时，顶层值优先；显式空数组清空本轮资源。</dd></div></dl></details><dl><div class="api-property"><dt><code>userId</code> <small>string · 必填</small></dt><dd>用户标识；兼容输入 <code>user_id</code>；身份模式下服务端使用认证主体覆盖该值。</dd></div><div class="api-property"><dt><code>sessionId</code> <small>string · 必填</small></dt><dd>已创建的会话标识；兼容输入 <code>session_id</code>。</dd></div><details open><summary><code>newMessage</code> <small>Content or null · 可选</small><span class="api-field-description">本轮输入消息；兼容输入 <code>new_message</code>。普通文本使用 <code>role: user</code> 和 <code>parts[].text</code>。嵌套字段使用下列 camelCase 名称，也兼容 SDK 的 snake_case 名称（如 inline_data、mime_type）。字段可被请求模型接受不代表所有模型提供方都支持相应能力。</span></summary><div class="api-property"><dt><code>role</code> <small>string or null · 可选</small></dt><dd>消息角色：<code>user</code> 或 <code>model</code>；本轮用户输入应为 <code>user</code>。</dd></div><details><summary><code>parts[]</code> <small>Part[] or null · 可选</small><span class="api-field-description">按顺序组成消息的分片。每个分片选择一种内容类型，文本和文件组合时分别放入数组元素；下列类型允许省略/null，具体内容约束由模型和工具协议决定。</span></summary><div class="api-property"><dt><code>text</code> <small>string or null · 可选</small></dt><dd>文本内容。普通对话通常只需填写此字段。</dd></div><details><summary><code>inlineData</code> <small>Blob or null · 可选</small><span class="api-field-description">内联图片、音频或其他二进制文件。</span></summary><div class="api-property"><dt><code>mimeType</code> <small>string or null · 可选</small></dt><dd>媒体 MIME 类型，例如 <code>image/png</code>；提供内联文件时应填写。</dd></div><div class="api-property"><dt><code>data</code> <small>string or null · 可选</small></dt><dd>Base64 编码的文件字节；提供内联文件时应填写，不带 data URL 前缀。</dd></div><div class="api-property"><dt><code>displayName</code> <small>string or null · 可选</small></dt><dd>文件显示名称，是否被模型使用取决于提供方。</dd></div></details><details><summary><code>fileData</code> <small>FileData or null · 可选</small><span class="api-field-description">通过 URI 引用文件。</span></summary><div class="api-property"><dt><code>mimeType</code> <small>string or null · 可选</small></dt><dd>文件 MIME 类型，例如 <code>application/pdf</code>。</dd></div><div class="api-property"><dt><code>fileUri</code> <small>string or null · 可选</small></dt><dd>文件 URI；提供文件时应填写，地址格式和读取能力取决于模型提供方。</dd></div><div class="api-property"><dt><code>displayName</code> <small>string or null · 可选</small></dt><dd>文件显示名称。</dd></div></details><details><summary><code>functionCall</code> <small>FunctionCall or null · 可选</small><span class="api-field-description">模型产生的函数调用。普通用户输入不需要构造此对象。</span></summary><div class="api-property"><dt><code>id</code> <small>string or null · 可选</small></dt><dd>函数调用标识；返回结果时用同一 ID 关联。</dd></div><div class="api-property"><dt><code>name</code> <small>string or null · 可选</small></dt><dd>函数名称。</dd></div><div class="api-property"><dt><code>args</code> <small>object or null · 可选</small></dt><dd>函数参数 JSON 对象，键由对应工具定义。</dd></div><details><summary><code>partialArgs[]</code> <small>PartialArg[] or null · 可选</small><span class="api-field-description">增量函数参数，是否支持取决于提供方。</span></summary><div class="api-property"><dt><code>jsonPath</code> <small>string or null · 可选</small></dt><dd>增量参数的 JSON Path，例如 <code>$.query</code>。</dd></div><div class="api-property"><dt><code>stringValue</code> <small>string or null · 可选</small></dt><dd>字符串值。</dd></div><div class="api-property"><dt><code>numberValue</code> <small>number or null · 可选</small></dt><dd>数值。</dd></div><div class="api-property"><dt><code>boolValue</code> <small>boolean or null · 可选</small></dt><dd>布尔值。</dd></div><div class="api-property"><dt><code>nullValue</code> <small>string or null · 可选</small></dt><dd>空值标记，固定为 <code>NULL_VALUE</code>。</dd></div><div class="api-property"><dt><code>willContinue</code> <small>boolean or null · 可选</small></dt><dd>同一 JSON Path 是否还有后续增量。</dd></div></details><div class="api-property"><dt><code>willContinue</code> <small>boolean or null · 可选</small></dt><dd>是否还有本次函数调用的后续增量。</dd></div></details><details><summary><code>functionResponse</code> <small>FunctionResponse or null · 可选</small><span class="api-field-description">函数调用结果；仅在相应工具续接流程中使用。</span></summary><div class="api-property"><dt><code>id</code> <small>string or null · 可选</small></dt><dd>对应 functionCall.id。</dd></div><div class="api-property"><dt><code>name</code> <small>string or null · 可选</small></dt><dd>对应函数名称。</dd></div><div class="api-property"><dt><code>response</code> <small>object or null · 可选</small></dt><dd>工具结果 JSON 对象；可用 output 表示输出、error 表示错误；未提供这两个键时整个对象作为输出。</dd></div><details><summary><code>parts[]</code> <small>FunctionResponsePart[] or null · 可选</small><span class="api-field-description">工具返回的多模态内容。</span></summary><details><summary><code>inlineData</code> <small>FunctionResponseBlob or null · 可选</small><span class="api-field-description">内联文件。</span></summary><div class="api-property"><dt><code>mimeType</code> <small>string or null · 可选</small></dt><dd>媒体 MIME 类型，例如 <code>image/png</code>；提供内联文件时应填写。</dd></div><div class="api-property"><dt><code>data</code> <small>string or null · 可选</small></dt><dd>Base64 编码的文件字节；提供内联文件时应填写，不带 data URL 前缀。</dd></div><div class="api-property"><dt><code>displayName</code> <small>string or null · 可选</small></dt><dd>文件显示名称，是否被模型使用取决于提供方。</dd></div></details><details><summary><code>fileData</code> <small>FunctionResponseFileData or null · 可选</small><span class="api-field-description">URI 文件。</span></summary><div class="api-property"><dt><code>mimeType</code> <small>string or null · 可选</small></dt><dd>文件 MIME 类型，例如 <code>application/pdf</code>。</dd></div><div class="api-property"><dt><code>fileUri</code> <small>string or null · 可选</small></dt><dd>文件 URI；提供文件时应填写，地址格式和读取能力取决于模型提供方。</dd></div><div class="api-property"><dt><code>displayName</code> <small>string or null · 可选</small></dt><dd>文件显示名称。</dd></div></details></details><div class="api-property"><dt><code>willContinue</code> <small>boolean or null · 可选</small></dt><dd>非阻塞工具是否还有后续结果，其他工具忽略此值。</dd></div><div class="api-property"><dt><code>scheduling</code> <small>string or null · 可选</small></dt><dd>非阻塞工具的结果调度方式：SCHEDULING_UNSPECIFIED、SILENT、WHEN_IDLE、INTERRUPT；适用时默认 WHEN_IDLE。</dd></div></details><details><summary><code>executableCode</code> <small>ExecutableCode or null · 可选</small><span class="api-field-description">模型生成的待执行代码，不表示提交此字段就会运行代码。</span></summary><div class="api-property"><dt><code>code</code> <small>string or null · 可选</small></dt><dd>代码正文。</dd></div><div class="api-property"><dt><code>language</code> <small>string or null · 可选</small></dt><dd>LANGUAGE_UNSPECIFIED 或 PYTHON。</dd></div><div class="api-property"><dt><code>id</code> <small>string or null · 可选</small></dt><dd>代码执行标识。</dd></div></details><details><summary><code>codeExecutionResult</code> <small>CodeExecutionResult or null · 可选</small><span class="api-field-description">代码执行结果。</span></summary><div class="api-property"><dt><code>outcome</code> <small>string or null · 可选</small></dt><dd>OUTCOME_UNSPECIFIED、OUTCOME_OK、OUTCOME_FAILED 或 OUTCOME_DEADLINE_EXCEEDED。</dd></div><div class="api-property"><dt><code>output</code> <small>string or null · 可选</small></dt><dd>执行输出或错误说明。</dd></div><div class="api-property"><dt><code>id</code> <small>string or null · 可选</small></dt><dd>对应 executableCode.id。</dd></div></details><div class="api-property"><dt><code>thought</code> <small>boolean or null · 可选</small></dt><dd>标记模型思考内容；普通用户消息无需设置。</dd></div><div class="api-property"><dt><code>thoughtSignature</code> <small>string or null · 可选</small></dt><dd>Base64 编码的不透明思考签名；如需回传应原样保留。</dd></div><details><summary><code>videoMetadata</code> <small>VideoMetadata or null · 可选</small><span class="api-field-description">配合 inlineData 或 fileData 中的视频使用。</span></summary><div class="api-property"><dt><code>startOffset</code> <small>string or null · 可选</small></dt><dd>视频开始偏移，例如 <code>1.5s</code>。</dd></div><div class="api-property"><dt><code>endOffset</code> <small>string or null · 可选</small></dt><dd>视频结束偏移。</dd></div><div class="api-property"><dt><code>fps</code> <small>number or null · 可选</small></dt><dd>采样帧率；提供方支持时默认 1.0，范围大于 0 且不超过 24。</dd></div></details><details><summary><code>mediaResolution</code> <small>PartMediaResolution or null · 可选</small><span class="api-field-description">输入媒体的分辨率配置，具体能力取决于模型提供方。</span></summary><div class="api-property"><dt><code>level</code> <small>string or null · 可选</small></dt><dd>媒体质量枚举，例如 MEDIA_RESOLUTION_LOW、MEDIA_RESOLUTION_MEDIUM、MEDIA_RESOLUTION_HIGH。</dd></div><div class="api-property"><dt><code>numTokens</code> <small>integer or null · 可选</small></dt><dd>媒体 tokenization 所需序列长度。</dd></div></details><details><summary><code>toolCall</code> <small>ToolCall or null · 可选</small><span class="api-field-description">服务端工具调用，通常由模型产生。</span></summary><div class="api-property"><dt><code>id</code> <small>string or null · 可选</small></dt><dd>工具调用标识。</dd></div><div class="api-property"><dt><code>toolType</code> <small>string or null · 可选</small></dt><dd>提供方定义的 ToolType 枚举，例如 GOOGLE_SEARCH_WEB、URL_CONTEXT。</dd></div><div class="api-property"><dt><code>args</code> <small>object or null · 可选</small></dt><dd>由该工具定义的参数对象。</dd></div></details><details><summary><code>toolResponse</code> <small>ToolResponse or null · 可选</small><span class="api-field-description">服务端工具调用结果。</span></summary><div class="api-property"><dt><code>id</code> <small>string or null · 可选</small></dt><dd>对应 toolCall.id。</dd></div><div class="api-property"><dt><code>toolType</code> <small>string or null · 可选</small></dt><dd>对应 toolCall.toolType。</dd></div><div class="api-property"><dt><code>response</code> <small>object or null · 可选</small></dt><dd>工具结果对象。</dd></div></details><div class="api-property"><dt><code>partMetadata</code> <small>object or null · 可选</small></dt><dd>分片附加元数据，键由业务约定，支持情况取决于提供方。</dd></div><details><summary><code>audioTranscription</code> <small>Transcription or null · 可选</small><span class="api-field-description">音频转写输出字段，普通输入无需构造。</span></summary><div class="api-property"><dt><code>text</code> <small>string or null · 可选</small></dt><dd>转写文本。</dd></div><div class="api-property"><dt><code>finished</code> <small>boolean or null · 可选</small></dt><dd>转写是否结束。</dd></div><div class="api-property"><dt><code>languageCode</code> <small>string or null · 可选</small></dt><dd>BCP-47 语言代码。</dd></div><div class="api-property"><dt><code>speakerLabel</code> <small>string or null · 可选</small></dt><dd>说话人标识。</dd></div><details><summary><code>words[]</code> <small>WordInfo[] or null · 可选</small><span class="api-field-description">逐词转写与时间。</span></summary><div class="api-property"><dt><code>word</code> <small>string or null · 可选</small></dt><dd>单词文本。</dd></div><div class="api-property"><dt><code>startOffset</code> <small>string or null · 可选</small></dt><dd>相对音频开始的时间偏移。</dd></div><div class="api-property"><dt><code>endOffset</code> <small>string or null · 可选</small></dt><dd>相对音频开始的结束偏移。</dd></div></details></details></details></details><div class="api-property"><dt><code>appName</code> <small>string or null · 可选</small></dt><dd>应为 <code>harness_agent</code>；兼容输入 <code>app_name</code>。</dd></div><div class="api-property"><dt><code>streaming</code> <small>boolean · 可选</small></dt><dd>是否要求模型流式生成。请求级 Harness 适配器在省略时选择流式；建议调用方显式传值。</dd></div><div class="api-property"><dt><code>stateDelta</code> <small>object or null · 可选</small></dt><dd>本轮执行前合并到 Session 的状态增量；兼容输入 <code>state_delta</code>。不得修改三个绑定 ID、<code>harnessVersion</code> 或 <code>fileIds</code>，也不得通过对应下划线名称修改。</dd></div><div class="api-property"><dt><code>functionCallEventId</code> <small>string or null · 可选</small></dt><dd>续接函数调用时对应的事件 ID。</dd></div><div class="api-property"><dt><code>invocationId</code> <small>string or null · 可选</small></dt><dd>调用标识；省略时由服务端生成。</dd></div><div class="api-property"><dt><code>customMetadata</code> <small>object or null · 可选</small></dt><dd>调用方自定义元数据。</dd></div><div class="api-property"><dt><code>max_llm_calls</code> <small>int or null · 可选</small></dt><dd>最大模型调用次数，最小值为 <code>1</code>。</dd></div></dl><details><summary><code>resources</code> <small>array · 可选</small></summary><p>兼容路径将顶层资源传入 <code>harness.resources</code>，同时提供时顶层值优先。显式空数组表示本轮清空。省略两处资源时，优先使用会话保存的非空 Skill 包，绑定会话其次使用内存快照。</p><details><summary><code>openviking_context</code> <small>资源条目</small></summary><dl><div class="api-property"><dt><code>type</code> <small>string · 必填</small></dt><dd>资源类型；MemoryStore 展开后的运行时快照固定为 openviking_context。</dd></div><div class="api-property"><dt><code>usage</code> <small>string · 必填</small></dt><dd>资源用途；长期记忆固定为 memory。</dd></div><div class="api-property"><dt><code>source</code> <small>string or null · 可选</small></dt><dd>资源来源；由 AgentKit MemoryStore 展开时为 memory_store。</dd></div><div class="api-property"><dt><code>memory_store_id</code> <small>string or null · 可选</small></dt><dd>AgentKit MemoryStore ID，仅作为已冻结快照的来源标识；Runtime 不使用该字段回查 AgentKit。</dd></div><div class="api-property"><dt><code>context_id</code> <small>string · 必填</small></dt><dd>OpenViking Context ID，必须以 ov- 开头。</dd></div><div class="api-property"><dt><code>path</code> <small>string or null · 可选</small></dt><dd>OpenViking 路径类型；长期记忆只允许 memories，省略时按 memories 处理。</dd></div><div class="api-property"><dt><code>store_path</code> <small>string or null · 可选</small></dt><dd>MemoryStore 在 OpenViking memories 下的目录段；由 AgentKit 创建 Session 时冻结。</dd></div><div class="api-property"><dt><code>root_uri</code> <small>string or null · 可选</small></dt><dd>MemoryStore 根 URI，例如 viking://.../memories/{store_path}/；用于运行时定位和审计。</dd></div><div class="api-property"><dt><code>peer</code> <small>object or null · 可选</small></dt><dd>OpenViking 读写的 peer 配置；省略时使用当前用户派生 peer。</dd></div><div class="api-property"><dt><code>peer.mode</code> <small>current_user or explicit · 可选</small></dt><dd>peer 解析模式；current_user 表示 Runtime 按 userId 派生，explicit 表示使用 peer_id。</dd></div><div class="api-property"><dt><code>peer.peer_id</code> <small>string or null · 可选</small></dt><dd>mode=explicit 时必填；必须是安全路径段。</dd></div><div class="api-property"><dt><code>credential_ref</code> <small>object · 必填</small></dt><dd>OpenViking 凭证引用；只允许 Identity API key provider 引用，不允许明文 api_key、token、cookie 或 secret。</dd></div><div class="api-property"><dt><code>credential_ref.type</code> <small>string · 必填</small></dt><dd>固定为 identity_api_key_provider。</dd></div><div class="api-property"><dt><code>credential_ref.Name</code> <small>string · 必填</small></dt><dd>Identity API key provider 名称，例如 openviking-user-key。</dd></div><div class="api-property"><dt><code>credential_ref.PoolName</code> <small>string · 必填</small></dt><dd>Identity API key provider 池名称，例如 default。</dd></div><div class="api-property"><dt><code>access</code> <small>read_only or read_write · 可选</small></dt><dd>访问模式；默认 read_only，只召回不自动保存；read_write 会启用 write_memory 和会话后保存。</dd></div></dl></details><details><summary><code>external_skill_package</code> <small>资源条目</small></summary><dl><div class="api-property"><dt><code>type</code> <small>string · 必填</small></dt><dd>资源类型；外部公开 Skill 包固定为 <code>external_skill_package</code>。</dd></div><div class="api-property"><dt><code>source</code> <small>string · 可选</small></dt><dd>外部公开 Skill 包使用 <code>public_url</code>。省略时按 <code>public_url</code> 处理。</dd></div><div class="api-property"><dt><code>url</code> <small>string · 必填</small></dt><dd>外部公开 Skill zip 下载链接。Runtime 下载并校验 zip 后读取 <code>SKILL.md</code>，将 Skill 的 <code>name</code> 和 <code>description</code> 注入 system prompt，并挂载为 ADK <code>SkillToolset</code>。</dd></div></dl></details></details></section><aside><h4>请求示例</h4><pre><code>{
  &quot;appName&quot;: &quot;harness_agent&quot;,
  &quot;userId&quot;: &quot;reader-1&quot;,
  &quot;sessionId&quot;: &quot;report-1&quot;,
  &quot;newMessage&quot;: {
    &quot;role&quot;: &quot;user&quot;,
    &quot;parts&quot;: [{&quot;text&quot;: &quot;总结本周报告。&quot;}]
  },
  &quot;streaming&quot;: true,
  &quot;refreshSnapshot&quot;: true,
  &quot;harness&quot;: {
    &quot;model_effort&quot;: &quot;medium&quot;,
    &quot;tools&quot;: [{&quot;tool_name&quot;: &quot;grep&quot;}],
    &quot;mcp_service_ids&quot;: [&quot;m-orders&quot;],
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

#### 注意事项：绑定会话与配置覆盖

| 本轮请求 | App 的处理方式 |
|---|---|
| 省略 `refreshSnapshot` 或传 `false` | 使用 Session 固定版本对应的快照。实例内没有匹配缓存时，按 `state.harnessVersion` 自动查询历史版本并重建，然后执行本轮；不会升级到最新版本。 |
| 传 `refreshSnapshot: true` | 用已保存的三个 ID 查询最新 Harness 和当前 Environment，校验成功后先持久化实际版本，再替换快照并执行消息。任一步失败都保留原版本和原快照，本轮在建连前结束。未绑定会话请求刷新返回 409。 |
| 显式提供 `harnessVersion` | 仅用于断言版本，必须是正整数并与 Session 固定版本相同。不能切换版本，也不能与 `refreshSnapshot: true` 同时提供；冲突返回 422。 |
| 提供 `harness` | 在本轮使用的快照上应用显式字段，省略的字段继承快照。sandbox、knowledgebase 对象按子字段合并，数组整体替换。若同时刷新，先取新快照。请求覆盖只对本轮有效。 |
| 覆盖模型地址且快照含密钥 | 若 `harness.model_api_base` 与快照不同，必须显式提供本轮凭证，优先使用 `X-Model-API-Key`。即使快照已有密钥，省略本轮凭证也会在建连前返回 422。 |

在 ADK 直接调用模型的链路上，`model_provider` 为 `openai` 或 `openai-responses` 时使用 Ark Responses，`openai-completions` 使用 Chat Completions。请求级 `harness.model_provider` 优先于快照的 `Model.Provider`。

**直接连接 MCP 的请求示例。** 已知网关地址时，在本轮使用 `harness.mcp_servers`。此示例使用自定义认证头，并原样发送密钥值。需要按服务 ID 选择时使用上方请求体示例中的 `harness.mcp_service_ids`；两个字段同时出现会返回 422。

```json
{
  "userId": "reader-1",
  "sessionId": "report-1",
  "newMessage": {"role": "user", "parts": [{"text": "查询订单"}]},
  "streaming": true,
  "harness": {
    "mcp_servers": [{
      "protocol": "streamable-http",
      "endpoint": "https://orders.example.com/mcp",
      "api_key_header": "X-Api-Key",
      "api_key": "<MCP_API_KEY>",
      "api_key_bearer": false
    }]
  }
}
```

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

## Harness 配置结构 {#harness-overrides}

RunAgentSSE 的 `harness` 使用此配置模型。A2A 不接受 `params.metadata.harness`，其配置由绑定的 Harness 解析。

<details>
<summary>HarnessOverrides JSON Schema</summary>

```json
{
  "$defs": {
    "HarnessSnapshotTool": {
      "properties": {
        "tool_name": {
          "title": "Tool Name",
          "type": "string"
        }
      },
      "required": [
        "tool_name"
      ],
      "title": "HarnessSnapshotTool",
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
          "pattern": "^[!#$%&'*+.^_`|~0-9A-Za-z-]+$",
          "title": "Api Key Header",
          "type": "string"
        },
        "api_key_bearer": {
          "default": true,
          "title": "Api Key Bearer",
          "type": "boolean"
        }
      },
      "required": [
        "endpoint"
      ],
      "title": "McpServerConfig",
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
  "description": "Fields that may be changed for one invocation without redeploying.",
  "properties": {
    "model_effort": {
      "anyOf": [
        {
          "enum": [
            "low",
            "medium",
            "high",
            "xhigh",
            "max"
          ],
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "default": null,
      "description": "Reasoning effort for this invocation. Omit to inherit existing configuration; explicit null clears inherited effort and uses model defaults.",
      "title": "Model Effort"
    },
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
      "anyOf": [
        {
          "type": "string"
        },
        {
          "items": {
            "$ref": "#/$defs/HarnessSnapshotTool"
          },
          "type": "array"
        }
      ],
      "default": "",
      "description": "Comma-separated built-in tool names; also accepts snapshot objects such as [{\"tool_name\": \"web_search\"}]. Snapshot objects use the CONFIG_AGENT_TOOLS allowlist in session_snapshot.py.",
      "title": "Tools"
    },
    "mcp_service_ids": {
      "anyOf": [
        {
          "items": {
            "type": "string"
          },
          "type": "array"
        },
        {
          "type": "null"
        }
      ],
      "default": null,
      "title": "Mcp Service Ids"
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
}
```

</details>

## GET /.well-known/agent-card.json {#get-a2acard}

发现 A2A 服务 · `GetAgentCard`

本节及以下两个消息接口适用于 **0.3.1 的 Runtime KeyAuth 模式**，且 Agent 已成功初始化。Identity 模式不注册这里描述的 Harness 专用处理器。认证由 Runtime 层负责，按部署要求发送认证凭据；请求体留空。成功返回 HTTP 200 和 Agent Card。

这是基于官方 A2A SDK 的 **A2A 0.3 消息接口子集，带 Harness 扩展**。JSON-RPC 外壳、Task、Message、Part 和流式任务更新沿用 A2A；配置覆盖、judge 和输出 metadata 是 Harness 约定。没有实现完整的异步任务管理协议。

**请求参数**

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | Runtime 认证凭据，按部署的 KeyAuth 配置传入。 |

**响应字段**

| 字段 | 类型 | 位置 | 必返 | 说明 |
|-|-|-|-|-|
| `name` | string | Body | 是 | 部署的 Harness 名称。 |
| `description` | string | Body | 是 | Agent 描述。 |
| `url` | string | Body | 是 | JSON-RPC 地址；部署用 HARNESS_A2A_URL 配置，默认 `http://localhost:8000/a2a`，外部调用前应配置为可达地址。 |
| `version` | string | Body | 是 | 此适配器声明为 1.0.0，不是镜像版本。 |
| `protocolVersion` | string | Body | 是 | 0.3.0。 |
| `capabilities` | object | Body | 是 | streaming=true，pushNotifications=false。 |
| `defaultInputModes` | string[] | Body | 是 | text/plain、application/json。 |
| `defaultOutputModes` | string[] | Body | 是 | text/plain、application/octet-stream。 |
| `skills` | object[] | Body | 是 | 包含 id=harness 的能力声明。 |

**调用示例**

```http
GET /.well-known/agent-card.json
```

## POST /a2a {#post-a2asend}

A2A 消息调用 · `message/send`

发送一轮消息，等待执行完成，成功的协议响应为 HTTP 200、JSON-RPC 2.0 信封；业务结果在 `result.status.state` 中。必须检查任务状态，HTTP 200 不代表模型执行成功。本接口仅支持阻塞模式。

**请求参数**

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | Runtime 认证凭据，按部署的 KeyAuth 配置传入。 |
| `Content-Type` | string | Header | 是 | application/json。 |
| `X-Model-API-Key` | string | Header | 请求禁止 | A2A 的模型凭据随绑定的 Harness 解析，不接受单轮模型凭据覆盖。 |
| `jsonrpc` | string | Body | 是 | 固定 2.0。 |
| `id` | string or integer | Body | 是 | JSON-RPC 请求关联 ID，响应原样关联；不代表业务幂等键。 |
| `method` | string | Body | 是 | 固定 message/send。 |
| `params` | object | Body | 是 | 消息及调用设置。 |
| `params.message` | object | Body | 是 | A2A Message，展开查看消息和 Part 字段。 |
| `params.message.kind` | string | Body | 是 | message。 |
| `params.message.role` | string | Body | 是 | 固定为 `user`。 |
| `params.message.messageId` | string | Body | 是 | 调用方为每条新输入生成新 ID；响应消息 ID 由服务端生成。 |
| `params.message.contextId` | string | Body | 否 | 首轮省略，由服务端生成；后续使用上一轮返回值。映射到 ADK session_id，内部 user_id 为 A2A_USER_ 加 contextId。 |
| `params.message.taskId` | string | Body | 请求禁止 | 每轮创建新 Task，不能用旧 taskId 续接。 |
| `params.message.parts` | Part[] | Body | 是 | 非空数组，可组合 text、data、file。 |
| `params.message.parts[].kind` | string | Body | 是 | text、data 或 file。 |
| `params.message.parts[].text` | string | Body | text 时必填 | 非空文字。 |
| `params.message.parts[].data` | object | Body | data 时必填 | JSON 对象；序列化为用户文本交给模型，不执行其中的工具指令。 |
| `params.message.parts[].file` | object | Body | file 时必填 | bytes 与 uri 采用对应的文件类型，二选一。 |
| `params.message.parts[].file.bytes` | string | Body | bytes 类型必填 | 合法 Base64；解码后作为模型的 inline_data。 |
| `params.message.parts[].file.uri` | string | Body | uri 类型必填 | 作为模型的 file_data URI；是否可读取取决于模型和地址能力。 |
| `params.message.parts[].file.name` | string | Body | 否 | 文件名。 |
| `params.message.parts[].file.mimeType` | string | Body | 否 | 输入省略时使用 application/octet-stream。 |
| `params.message.metadata` | object | Body | 否 | 标准消息附加数据；输入 metadata 不会被解释为 ADK 工具响应或思考。 |
| `params.configuration` | object | Body | 否 | 标准发送配置。 |
| `params.configuration.blocking` | boolean | Body | 否 | 默认 true。仅允许 true；false 被拒绝，实时输出使用 message/stream。 |
| `params.configuration.historyLength` | integer | Body | 否 | 省略时按 SDK 默认行为返回历史。返回历史消息数量；0 不返回历史，不删除内部历史。 |
| `params.configuration.acceptedOutputModes` | string[] | Body | 否 | 标准 A2A 字段；适配器没有额外实现输出格式协商。 |
| `params.metadata` | object | Body | 首轮条件必填 | Harness 绑定字段放在这里，不放在 message.metadata。首轮必须提供三个 ID；续聊不刷新时可省略。 |
| `params.metadata.workspaceId` | string | Body | 首轮必填 | 资源所属 Workspace；三个 ID 必须一起提供。 |
| `params.metadata.harnessId` | string | Body | 首轮必填 | 在该 Workspace 内读取的 Harness ID。 |
| `params.metadata.harnessVersion` | integer | Body | 否 | 首轮可指定正整数版本，省略时选择最新；续聊提供时必须与固定版本一致。与 `refreshSnapshot: true` 互斥。 |
| `params.metadata.environmentId` | string | Body | 首轮必填 | 同一 Workspace 下的 Active Cloud Environment ID。 |
| `params.metadata.refreshSnapshot` | boolean | Body | 否 | 默认 false。续聊传 true 时按原绑定升级到最新 Harness 并持久化版本；首轮不接受 true。 |
| `params.metadata.judge` | boolean | Body | 否 | 默认 false。Harness 扩展：开启沙箱产物收集能力。必须使用 adk runtime 且配置 sandbox.tool_id（本轮或部署配置）；执行时要求恰好一个 AIO sandbox toolset。字符串和 null 均不合法。 |

公共入站认证沿用部署的 Runtime KeyAuth 配置。A2A 不接受 `/run_sse` 的顶层 `userId`、`sessionId`、`refreshSnapshot` 或 `harness` object；绑定、版本和刷新字段均放在 `params.metadata`，推荐使用表中的驼峰名称；兼容对应下划线名称，同时提供两种名称且值或类型不一致时返回参数错误。续聊通过 `contextId` 关联原 Session，普通消息按固定版本恢复，显式刷新才推进到最新版本。

**响应字段**

| 字段 | 类型 | 位置 | 必返 | 说明 |
|-|-|-|-|-|
| `jsonrpc` | string | Body | 是 | 2.0。 |
| `id` | string or integer | Body | 是 | 对应请求 ID。 |
| `result` | Task | Body | 成功协议响应 | 与 error 互斥。 |
| `result.kind` | string | Body | 是 | task。 |
| `result.id` | string | Body | 是 | 本轮 Task ID。 |
| `result.contextId` | string | Body | 是 | 多轮对话的上下文标识。 |
| `result.status` | object | Body | 是 | state 必返；message、timestamp 可选。正常结束为 completed，执行异常为 failed。 |
| `result.status.state` | string | Body | 是 | completed 表示完成；failed 表示执行失败。 |
| `result.status.timestamp` | string | Body | 否 | 任务状态时间戳。 |
| `result.status.message` | Message | Body | 否 | 任务状态说明或答案；结构同请求的 `params.message`，响应 role 为 `agent`。 |
| `result.artifacts` | Artifact[] | Body | 否 | 文本答案及文件产物；不要将 status.message 与 answer 产物重复拼接。 |
| `result.artifacts[].artifactId` | string | Body | 是 | 产物标识；最终文本答案为 Task ID 加 :answer。 |
| `result.artifacts[].name` | string | Body | 否 | 答案名为 answer，文件通常为文件名。 |
| `result.artifacts[].parts` | Part[] | Body | 是 | 与请求的 `params.message.parts` 结构相同；文件可为 bytes 或 uri。 |
| `result.artifacts[].metadata` | object | Body | 否 | 保存的 ADK 文件带 harness.source=adk、harness.size（字节数）、harness.version（版本号）；直接模型文件不保证有该信息。 |
| `result.artifacts[].metadata.harness` | object | Body | 否 | ADK 保存的文件产物扩展。 |
| `result.artifacts[].metadata.harness.source` | string | Body | 是 | 固定为 adk。 |
| `result.artifacts[].metadata.harness.size` | integer | Body | 是 | 文件大小，单位字节。 |
| `result.artifacts[].metadata.harness.version` | integer | Body | 是 | 文件版本号。 |
| `error` | object | Body | 错误时必返 | 与 result 互斥。 |
| `error.code` | integer | Body | 是 | JSON-RPC 错误码。 |
| `error.message` | string | Body | 是 | 错误说明。 |
| `result.history` | Message[] | Body | 否 | 由 historyLength 控制。 |

继续对话时，在新请求的 `params.message.contextId` 填 `ctx-1`，生成新的 `messageId`，不要传 `taskId`。续聊可以省略三个绑定 ID 和版本，服务使用 Session 固定版本；实例缓存缺失时自动按该版本恢复。思考内容和内部工具 payload 不直接透传到 A2A 输出。

以下为不带工具的一轮文本回答，ID 为示意值。Runtime 认证头按部署配置添加。

**调用示例**

```http
POST /a2a
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": "rpc-1",
  "method": "message/send",
  "params": {
    "message": {
      "kind": "message",
      "role": "user",
      "messageId": "input-1",
      "parts": [{"kind": "text", "text": "回复你好。"}]
    },
    "configuration": {"blocking": true, "historyLength": 0},
    "metadata": {
      "workspaceId": "<workspace-id>",
      "harnessId": "<harness-id>",
      "harnessVersion": 1,
      "environmentId": "<environment-id>",
      "judge": false
    }
  }
}
```

**响应示例**

```json
{
  "jsonrpc": "2.0",
  "id": "rpc-1",
  "result": {
    "kind": "task",
    "id": "task-1",
    "contextId": "ctx-1",
    "status": {
      "state": "completed",
      "message": {
        "kind": "message", "role": "agent", "messageId": "output-1",
        "taskId": "task-1", "contextId": "ctx-1",
        "parts": [{"kind": "text", "text": "你好。"}]
      }
    },
    "artifacts": [{
      "artifactId": "task-1:answer", "name": "answer",
      "parts": [{"kind": "text", "text": "你好。"}]
    }],
    "history": []
  }
}
```

## POST /a2a {#post-a2astream}

A2A 流式消息 · `message/stream`

请求字段与上方 `message/send` 相同，将 `method` 改为 `message/stream`，发送 `Accept: text/event-stream`，省略 blocking。HTTP 200 后按 SSE 逐帧读取，每个 `data` 是一个 JSON-RPC 响应信封，`result.kind` 区分 Task、状态更新和产物更新。不是原始 ADK Event 流。

**请求参数**

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | Runtime 认证凭据，按部署的 KeyAuth 配置传入。 |
| `Content-Type` | string | Header | 是 | `application/json`。 |
| `Accept` | string | Header | 是 | `text/event-stream`。 |
| `X-Model-API-Key` | string | Header | 请求禁止 | A2A 的模型凭据随绑定的 Harness 解析。 |
| `jsonrpc` | string | Body | 是 | 固定 `2.0`。 |
| `id` | string or integer | Body | 是 | 本轮 JSON-RPC 请求关联 ID。 |
| `method` | string | Body | 是 | 固定 `message/stream`。 |
| `params` | object | Body | 是 | 与 [message/send](#post-a2asend) 的 params 结构相同，省略 blocking；包含 message、configuration 和 metadata。 |

**响应字段**

| 字段 | 类型 | 位置 | 必返 | 说明 |
|-|-|-|-|-|
| `Content-Type` | string | Header | 是 | `text/event-stream`。 |
| `data` | JSON-RPC response | Body | 是 | 每个 SSE data 帧是一个 JSON-RPC 信封。 |
| `data.jsonrpc` | string | Body | 是 | `2.0`。 |
| `data.id` | string or integer | Body | 是 | 对应请求 ID。 |
| `data.result` | object | Body | 成功帧必返 | 与 error 互斥，按 kind 区分 Task、状态和产物更新。 |
| `data.result.kind` | string | Body | 是 | `task`、`status-update`、`artifact-update`。 |
| `data.result.id` | string | Body | task 时必返 | 初始 Task ID；其他字段见 [message/send 响应](#post-a2asend)，初始状态通常为 submitted。 |
| `data.result.taskId` | string | Body | 更新时必返 | 状态或产物更新对应的 Task。 |
| `data.result.contextId` | string | Body | 是 | 会话上下文标识。 |
| `data.result.status` | object | Body | task 或 status-update 时必返 | 当前状态。 |
| `data.result.status.state` | string | Body | 是 | working 表示执行中；completed 正常完成；failed 执行失败。 |
| `data.result.status.message` | Message | Body | 否 | Agent 正文或任务说明，结构同发送接口的 Message。 |
| `data.result.status.message.metadata` | object | Body | 否 | 输出扩展信息。 |
| `data.result.status.message.metadata.harness` | object | Body | 否 | Harness 输出扩展。 |
| `data.result.status.message.metadata.harness.partial` | boolean | Body | 正文更新时返回 | true 为增量，false 为完整非增量文字；不能重复追加。 |
| `data.result.final` | boolean | Body | status-update 时必返 | true 表示终态更新，仍须检查 status.state。 |
| `data.result.artifact` | Artifact | Body | artifact-update 时必返 | 产物结构见发送接口的 result.artifacts。 |
| `data.result.append` | boolean or null | Body | 否 | 是否向同一 artifactId 追加内容。 |
| `data.result.lastChunk` | boolean or null | Body | 否 | 当前产物最后一块，不表示整个任务结束。 |
| `data.error` | object | Body | 错误帧必返 | 与 result 互斥。 |
| `data.error.code` | integer | Body | 是 | JSON-RPC 错误码。 |
| `data.error.message` | string | Body | 是 | 错误说明。 |

**调用示例**

```http
POST /a2a
Content-Type: application/json
Accept: text/event-stream

{
  "jsonrpc": "2.0",
  "id": "rpc-2",
  "method": "message/stream",
  "params": {
    "message": {
      "kind": "message", "role": "user", "messageId": "input-2",
      "contextId": "ctx-1",
      "parts": [{"kind": "text", "text": "再次回复你好。"}]
    }
  }
}
```

**Harness 流式扩展：** `status.message.metadata.harness.partial=true` 表示模型增量；`false` 表示完整的非增量文本，不能再追加到已拼接的文字后面。最终以 `answer` 产物为答案。多次模型调用可能产生多段文字；协议没有额外提供逐段 ADK 消息 ID 的对应契约。首字延迟应取第一个含非空正文的状态消息到达时间，不能拿初始 Task 或 working 空状态帧计时。

以下示例展示同一请求的关键帧（实际还会有初始 Task、working 和完整正文等帧）：

**响应示例**

```text
data: {"jsonrpc":"2.0","id":"rpc-2","result":{"kind":"status-update","taskId":"task-2","contextId":"ctx-1","status":{"state":"working","message":{"kind":"message","role":"agent","messageId":"delta-1","taskId":"task-2","contextId":"ctx-1","parts":[{"kind":"text","text":"你"}],"metadata":{"harness":{"partial":true}}}},"final":false}}

data: {"jsonrpc":"2.0","id":"rpc-2","result":{"kind":"artifact-update","taskId":"task-2","contextId":"ctx-1","artifact":{"artifactId":"task-2:answer","name":"answer","parts":[{"kind":"text","text":"你好。"}]},"lastChunk":true}}

data: {"jsonrpc":"2.0","id":"rpc-2","result":{"kind":"status-update","taskId":"task-2","contextId":"ctx-1","status":{"state":"completed","message":{"kind":"message","role":"agent","messageId":"output-2","taskId":"task-2","contextId":"ctx-1","parts":[{"kind":"text","text":"你好。"}]}},"final":true}}
```

**错误与支持边界**

| 场景 | 返回与处理 |
|---|---|
| Runtime 认证拒绝 | 在进入处理器前返回 HTTP 错误，按部署认证策略处理。 |
| 非 user 消息、空内容、无效 Base64、非法 Harness 覆盖、携带 taskId、blocking=false | JSON-RPC error，参数错误码 -32602；修正请求后再调用。 |
| 模型或工具执行链路失败 | Task 进入 failed，错误消息为 Harness invocation failed；不要将 HTTP 200 当作成功。 |
| tasks/get、tasks/cancel、tasks/resubscribe、推送通知配置等未开放方法 | JSON-RPC -32601（Method not found）。configuration.pushNotificationConfig 也不支持。 |
| SSE 中收到 error | 协议调用失败，读取 error.code、error.message；不要当作正文。 |
| SSE 未收到终态就断开 | 本轮结果未知。断连不保证取消执行；没有 Last-Event-ID 续传或任务重订阅，不要盲目重发有副作用的请求。 |

任务只在当前执行期间使用内存存储，终态后清理；会话上下文与 Task 生命周期不同。不能依赖 Task ID 在重启后查询结果，也不提供业务幂等保证。

参数错误响应示例：

```json
{"jsonrpc":"2.0","id":"rpc-2","error":{"code":-32602,"message":"Use contextId, without taskId"}}
```
