---
toc_max_heading_level: 2
---
# Managed Agents API：Session 与事件

本页描述与 Runtime 配套的 Session 接口契约。目标环境的接口可用性取决于控制面版本。

<!-- api-contracts:start -->
<a id="全字段参考"></a>

接口的请求参数、嵌套字段和响应示例均在本页列出。认证方式见[调用约定](conventions.md#认证与请求地址)。

本页成功响应直接返回业务对象，不包含 `ResponseMetadata` / `Result` 包装；具体结构见各接口说明。

| 接口 | 分面 | 功能 |
| --- | --- | --- |
| [CreateAgentSession（REST）](#createagentsessionrest-rest) | 数据面 | 创建会话 |
| [GetAgentSession（REST）](#getagentsessionrest-rest) | 数据面 | 查询会话 |
| [ListAgentSessions（REST）](#listagentsessionsrest-rest) | 数据面 | 列出 AgentSessions |
| [UpdateAgentSession（REST）](#updateagentsessionrest-rest) | 数据面 | 更新会话 |
| [ArchiveAgentSession（REST）](#archiveagentsessionrest-rest) | 数据面 | 归档会话 |
| [DeleteAgentSession（REST）](#deleteagentsessionrest-rest) | 数据面 | 删除会话 |
| [SendSessionEvents（REST）](#sendsessioneventsrest-rest) | 数据面 | 发送会话事件 |
| [ListSessionEvents（REST）](#listsessioneventsrest-rest) | 数据面 | 列出会话事件 |
| [SessionEventsStream（REST）](#sessioneventsstreamrest-rest) | 数据面 | 订阅会话事件 |
| [ListSessionResources（REST）](#listsessionresourcesrest-rest) | 数据面 | 列出会话资源 |

本页覆盖 Session 生命周期、事件写入、历史查询和 SSE 订阅。本页接口均为 REST，成功响应直接返回业务对象。创建、查询、更新、归档及列表元素复用本页的 Session 对象。

<a id="session-config-support"></a>

## 配置支持边界

`budget`、`resources`、`vault_ids` 可以随创建请求保存。`resources` 中的 TOS 声明不再进入挂载执行链（能力已移除，只保存并返回）；`type=memory_store` 支持挂载 AgentKit 已管理的 MemoryStore，并展开为运行时 OpenViking 记忆快照；`type=openviking_context, usage=memory` 兼容绑定用户已提前准备好的 OpenViking Context 作为记忆资源；记忆资源默认 `read_only`，显式 `read_write` 才允许 agent-loop 会话结束后写入 OpenViking。预算、Vault 和其他资源类型的执行边界如下，保存声明不等于相应能力已启用。

| 字段 | 创建与查询 | 当前执行边界 |
| --- | --- | --- |
| `budget` / `Budget` | 对象或 null；省略/null 返回 null。 | 不验证 Claude 金额结构、不按金额或 token 限额中止、不实现预算耗尽恢复；更新接口不接受 budget。 |
| `resources` / `Resources` | JSON 数组；省略/null 返回 []；ListSessionResources 返回此数组。TOS 声明 `{type:"tos",tos_bucket,tos_key}` 仅保存；MemoryStore 输入为 `{type:"memory_store",memory_store_id}` 或 `{Type:"memory_store",MemoryStoreId}`，可选 `access/read_write` 或 `Access/read_write`；创建时按账号和 Workspace 校验 active Store 后展开为 `type=openviking_context`、`usage=memory`、`source=memory_store`、`memory_store_id`、`context_id`、`path=memories`、`store_path`、`root_uri`、`peer`、`credential_ref`、`access`。直接 OpenViking 记忆绑定创建时归一为 `context_id`、`path=memories`、`peer`、`credential_ref`、`access`；省略 `access` 默认 `read_only`，仅允许 `read_only` 或 `read_write`。`credential_ref` 是 Identity provider 引用，不是 OpenViking API Key。 | TOS 存储挂载能力已移除：`{type:"tos",tos_bucket,tos_key}` 不再解析或挂载到 `/mnt/session/storage/` 或 `/mnt/session/outputs/`，也不再冻结输入输出目标，仅按普通声明保存并返回。AgentKit 不保存真实密钥、不代理 Memory CRUD；MemoryStore 与 OpenViking Context 均在 Session 创建时固定运行时快照，agent-loop 根据快照用 `credential_ref` 换取真实 key 后挂载 `load_memory`。`read_only` 只召回不自动写入；`read_write` 会启用 agent-loop 的会话后保存，由 OpenViking 负责抽取和持久化。归档或删除的 MemoryStore 不允许新 Session 挂载。其他资源类型仍只保存并返回。 |
| `vault_ids` / `VaultIds` | 字符串数组；省略/null 返回 []。 | 不根据这些 ID 查询凭据或挂载 Vault；更新时非 null 值（包括 []）返回 400。 |

模型和 MCP 身份使用已实现的 [Session 模型身份](session.md#session-rest-object)与 `credential_keys` 流程；这些身份引用不能由 vault_ids 替代。Claude 的[预算](https://platform.claude.com/docs/en/managed-agents/budgets)和[Vault](https://platform.claude.com/docs/en/managed-agents/vaults)属于官方服务的执行能力，本服务没有实现相同能力。

<a id="session-lifecycle"></a>

## 状态、固定版本与更新

| status | 含义 |
| --- | --- |
| `idle` | 等待输入或工具确认；空会话创建后为 idle。 |
| `running` | 会话工作正在执行。 |
| `rescheduling` | 遇到可重试问题，等待重新调度。 |
| `terminated` | 已结束或归档。 |

`requires_action` 是事件 stop_reason，不是 Session.status。用本轮的 `session.status_idle` 与 stop_reason 判断是否等待输入，不能将 HTTP 200、工具 Ready 或 SSE 断开当成本轮完成。

创建后固定环境、Runtime、Harness 快照和 Skill 版本。Harness 后续更新不会改变已有会话；Session 更新仅修改 title、metadata、agent.tools 和 agent.mcp_servers，tools/MCP 数组整体替换，[] 清空。模型、system、skills、环境、模板、工作池和方舟 API Key Name 不可更新。当前更新未校验 idle 状态；为避免运行中配置变化，调用方应先等待 idle 再改工具定义。[Claude 官方 Session 更新](https://platform.claude.com/docs/en/managed-agents/session-operations)要求 idle，该状态限制尚未由本服务强制执行。

归档保留 Session/Event 和首次 archived_at，停止活动 Work，没有取消归档。Delete 是单个会话的异步清理：受理成功不表示全部物理实例已清理；确认 Get 返回 404。

创建时，`agent` 字符串引用当前版本；`{"type":"agent","id":"agent_example","version":1}` 查询同账号、未归档 Harness 的历史版本。`agent_with_overrides` 在基础版本上整体替换提供的 `model/system/tools/mcp_servers/skills`，省略字段继承；`null` 清空可清空字段，模型不可清空。模型覆盖不继承基础模型的 effort、speed 或 inference_geo；未提供的 effort/地域返回 null，speed 默认 standard。工具清空要求有效 skills 为空，MCP 服务清空要求移除引用该服务的 mcp_toolset。覆盖不会更新 Harness，也不能覆盖其 AgentLoop；生成的会话快照和技能版本在创建后固定。已有完整内联配置继续作为本地扩展支持。官方行为依据见[Session 创建与覆盖](https://platform.claude.com/docs/en/managed-agents/sessions#override-agent-configuration-for-a-session)。

<a id="session-pagination"></a>

## 分页与筛选

| 接口 | 请求分页 | 返回字段 | 顺序与边界 |
| --- | --- | --- | --- |
| Session 列表 | limit 默认 100，0 也按 100；有效范围 1～100。page 原样使用上一页游标。 | next_page/prev_page；无后续/前页时为 null。 | 按创建时间排序，默认 desc；支持 asc。默认隐藏归档对象。 |
| Event 列表 | limit 默认 100，0 也按 100；有效范围 1～1000。page 使用响应给出的十进制序号字符串。 | has_more/next_page。 | 默认 sequence asc；desc 从游标之前向前读取。after_sequence 始终为排除式下界。 |
| Session 资源列表 | 无分页入参。 | data、has_more=false。 | 仅返回已保存 resources 声明。 |

Session 的 page 与 Event 的序号、Environment 的 page 和其他列表接口的游标不能互换。翻页时保持 order 和过滤条件一致。当前 Session 游标包含时间、ID 和前后方向，不校验 order 或过滤条件是否改变；调用方改变排序可能重复或遗漏。Claude 官方[Session 分页](https://platform.claude.com/docs/en/managed-agents/session-operations#listing-sessions)会校验游标与 order 和时间范围，本服务尚未实现该验证。

时间筛选使用本页字段表所列 `created_at_gt/gte/lt/lte`，当前不读取 Claude 的 `created_at[gt/gte/lt/lte]` 写法。Event 当前按 sequence 排序，不支持 Claude Event 接口按 processed_at 筛选/排序。processed_at 当前在事件受理时写入，不表示模型处理完成；不要提交未声明的查询参数。

<a id="session-events-sse"></a>

## 事件写入、SSE 与恢复

同一事件 ID 与同一内容可以重放；内容不同返回 409。未提供 ID 时服务生成 ID，网络失败后用新 ID 重试可能产生重复事件。Event 与后继 Work 同事务；503 时写入可能已经提交，重试必须保持原 ID 和正文。

SSE 持久化帧的 id 是十进制 sequence，data 是完整事件；只有持久化事件推进恢复游标；预览 event_start/event_delta 不保存、没有 id，断线不能重放。

正的 after_sequence 优先于 Last-Event-ID；显式 `after_sequence=0` 也会回退 Last-Event-ID。若希望从起点重读，应同时省略/清空 Last-Event-ID。没有正数或有效头时从 0 开始，返回已有历史后继续订阅。客户端保存最后已处理持久化帧的 id，断线后重连并按事件 ID 去重。

服务在等待新事件时每 15 秒发送注释心跳；设置 5 分钟定时器，到期后在等待阶段关闭连接。持续回放积压事件或写入阻塞时不保证恰好 5 分钟结束。连接关闭不改变会话状态，客户端应自动重连。200 之后发生的订阅错误以 error 帧返回，区别于会话的 session.error 业务事件。

本服务的 sequence 恢复扩展与 [Claude 官方 SSE](https://platform.claude.com/docs/en/managed-agents/events-and-streaming)不同：官方实时流仅发送连接打开后的事件，恢复建议结合历史列表与事件 ID 去重；不要将本服务的历史回放能力假定为官方语义。

<a id="session-rest-object"></a>

## Session 对象（REST）

REST 成功响应直接返回该对象；列表的 data 数组元素使用同一对象。是否省略/null 按本表定义。

| 字段 | 类型 | 是否必返 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| ark_api_key_name | string | 否 | — | 方舟模型 API Key Name。保存并返回创建时指定的 Ark API Key Name，不返回模型 Key 明文。示例：`"api-key-example"`。 |
| id | string | 是 | — | 资源标识。示例：`"sesn_example"`。 |
| type | string | 是 | — | 类型标识。示例：`"session"`。 |
| agent | JSON | 是 | — | 固定的 Agent 快照。创建时固定的完整 Agent 快照；内部字段保持 snake_case。允许 `null`。示例：`{"id":"agent_example","type":"agent","version":1,"model":{"id":"example-model"}}`。 |
| environment_id | string | 是 | — | 环境 ID。示例：`"env_example"`。 |
| metadata | object | 是 | — | 业务元数据。字典值类型为 `string`。示例：`{}`。 |
| status | string | 是 | — | 状态。rescheduling、running、idle、terminated；requires_action 属于 stop_reason，不是 Session.status。示例：`"idle"`。 |
| title | string | 是 | — | 会话标题。允许 `null`。示例：`"文档问答"`。 |
| created_at | string | 是 | — | 创建时间。UTC RFC3339 时间。示例：`"2026-10-12T08:00:00Z"`。 |
| updated_at | string | 是 | — | 最后更新时间。UTC RFC3339 时间。示例：`"2026-10-12T08:00:00Z"`。 |
| archived_at | string | 是 | — | 首次归档时间。UTC RFC3339 时间。允许 `null`。示例：`"2026-10-12T08:00:00Z"`。 |
| vault_ids | string[] | 是 | — | Vault 引用。仅保存字符串 ID，不读取凭据；完整说明见[配置支持边界](#session-config-support)。示例：`[]`。 |
| stats | object | 是 | — | 统计值。number 字典；当前固定包含 active_seconds（累计活动秒数）、duration_seconds（自创建起经过秒数）。字典值类型为 `number`。示例：`{"active_seconds":0,"duration_seconds":0}`。 |
| usage | object | 是 | — | 用量。字典值类型为 `integer`。示例：`{}`。 |
| budget | JSON | 是 | — | 预算配置。对象或 null；仅保存，不执行限额或超限中止；完整说明见[配置支持边界](#session-config-support)。示例：`null`。 |
| deployment_id | string | 是 | — | 部署引用。允许 `null`。示例：`"example"`。 |
| runtime_type | string | 是 | — | 模型工作池类型。允许 `null`。示例：`"agentkit_runtime"`。 |
| credential_keys | object[] | 是 | — | Identity 凭据引用。子字段在本表下方逐项列出。 |
| credential_keys[].Name | string | 是 | — | Identity key 名称。普通引用去空白后非空；MCP 引用必须匹配 [A-Za-z0-9][A-Za-z0-9_-]{0,127}。示例：`"example-key"`。 |
| credential_keys[].PoolName | string | 是 | — | Identity pool 名称。普通引用去空白后非空；MCP 引用必须匹配 [A-Za-z0-9][A-Za-z0-9_-]{0,127}。示例：`"example-pool"`。 |
| credential_keys[].MCPServerName | string | 否 | — | MCP 服务器名称。MCP 引用必填，必须匹配会话 mcp_servers。示例：`"example-mcp"`。可能省略。 |
| credential_keys[].HeaderName | string | 否 | — | MCP 凭据头。默认 Authorization；合法 HTTP header token，禁止 Host、Cookie、proxy- 前缀。示例：`"Authorization"`。可能省略。 |
| credential_keys[].Prefix | string | 否 | — | 凭据前缀。省略默认 Bearer 加空格；最长 32 字节，禁止 CR、LF、NUL。示例：`"Bearer "`。 |
| resources | JSON[] | 是 | — | 资源声明。TOS 存储挂载已移除，不再挂载 /mnt/session/storage/；OpenViking Context 记忆绑定按创建时快照返回，access=read_only 只召回，access=read_write 由 agent-loop 自动保存；不创建 Context、不保存密钥、不代理 Memory CRUD；其他类型只保存；完整说明见[配置支持边界](#session-config-support)。示例：`[]`。 |
| output_persistence_status | string | 否 | — | 输出持久化状态。not_required、configured、pending、failed、succeeded。示例：`"configured"`。可能省略。 |
| output_persistence_error_code | string | 否 | — | 输出持久化错误码。仅失败时返回稳定错误码，不包含上游正文。示例：`"provider_delete_failed"`。 |
| outcome_evaluations | JSON[] | 是 | — | 评估结果。示例：`[]`。 |
| provisioning_status | string | 否 | — | 工具准备进度。pending、installing、ready、failed；仅存在可报告的工具 Work 时在 Create/Get 中返回。示例：`"pending"`。 |
| operation_id | string | 否 | — | 异步操作 ID。示例：`"op_example"`。可能省略。 |
| agent_loop | string | 是 | — | Session 固定的执行实现。只返回 adk、codex、dsh、piagent；从创建时冻结的 Agent 快照派生。历史 Session 缺少有效选择时返回 adk。创建后不可更换。示例：`"codex"`。 |
| runtime_id | string | 否 | — | 物理 AgentKit Runtime ID。返回 Session 固定的 Runtime ID；没有物理 Runtime 绑定时省略。示例：`"r-example"`。 |

<a id="session-event-object"></a>

## 持久化事件对象

事件写入结果、事件列表与 SSE 中的完整持久化事件复用本结构；事件按 type 携带不同业务字段。预览 event_start/event_delta 不属于持久化事件。

| 字段 | 类型 | 是否必返 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| id | string | 是 | — | 持久化事件 ID。字符串标识。示例：`"event_example"`。 |
| type | string | 是 | — | 事件类型。只允许：agent.custom_tool_use、agent.mcp_tool_use、agent.mcp_tool_result、agent.message、agent.thinking、agent.tool_result、agent.tool_use、session.error、session.outcome_evaluation、session.status_idle、session.status_rescheduled、session.status_running、session.status_terminated、span.model_request_start、span.model_request_end、user.custom_tool_result、user.define_outcome、user.interrupt、user.message、user.tool_confirmation、user.tool_result；持久化事件不包含 _chunk、_stream_、event_start 或 event_delta。示例：`"user.message"`。 |
| sequence | integer | 是 | — | 持久化序号。Session 内单调递增；用于分页和 SSE 恢复。示例：`1`。 |
| created_at | string | 是 | — | 创建时间。UTC RFC3339 时间。示例：`"2026-10-12T08:00:00Z"`。 |
| content | JSON | 否 | — | 内容。按原事件类型保留原始 JSON。允许 `null`。示例：`[{"type":"text","text":"请介绍项目。"}]`。可能省略。 |
| seq | integer | 是 | — | 序号兼容字段。与 sequence 相同。示例：`1`。 |
| processed_at | string | 是 | — | 服务处理时间。事件受理并规范化时由服务写入 UTC RFC3339 时间；不是模型处理完成标志，也不按该字段排序。示例：`"2026-10-12T08:00:00Z"`。 |

<a id="createagentsessionrest-rest"></a>

## POST /v1/sessions {#createagentsessionrest}

创建托管会话 · `CreateAgentSession`

### 请求参数

**请求头**

| 参数 | 类型 | 是否必传 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| x-ark-key-name | string | 条件 | — | 方舟模型 API Key Name。agentkit_runtime 条件必填；长度 1～128，仅允许 ASCII 字母、数字、下划线和连字符；仅保存 Name，由执行器按账号、地域和项目分页查询 ListApiKeys，全字匹配唯一条目后调用 GetRawApiKey；进程内使用标准库 LRU 缓存 Name 到 Key 内容。示例：`"api-key-example"`。 |
| Idempotency-Key | string | 否 | 不启用幂等重放 | 创建幂等键。同键重试必须保持原始请求和模型 API Key Name 一致。示例：`"session-create-001"`。 |
| anthropic-workspace-id | string | 否 | — | 工作区身份。可信工作区身份头，优先于正文 workspace_id。示例：`"workspace_example"`。 |

**请求体**

| 参数 | 类型 | 是否必传 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| agent | JSON | 是 | — | Harness 引用。同账号未归档 Harness 的 ID 字符串（固定当前版本）、{type:"agent",id,version} 指定版本引用，或 {type:"agent_with_overrides",id,version?,model?,system?,tools?,mcp_servers?,skills?}。省略覆盖字段继承基础快照，提供则整体替换，null 清空可清空字段；model 不可清空；agent_with_overrides 中 AgentLoop 不可覆盖；Session 顶层 agent_loop 可单独选择执行实现。已有完整内联对象作为扩展继续支持。示例：`"agent_example"`。 |
| environment_id | string | 否 | Harness 版本默认环境，其次 Environment Key 绑定 | 环境 ID。显式值优先，省略时继承所选 Harness 版本的 EnvironmentId。该版本未配置时，可使用已认证 Environment Key 绑定的环境。无法解析环境时返回 400。最终环境必须在调用方权限内，并与已认证 Environment Key 的绑定一致。示例：`"env_example"`。 |
| runtime_type | string | 否 | 按模板及部署配置 | 模型工作池。必须为部署已启用类型；省略由模板及配置推导。允许 `null`。示例：`"agentkit_runtime"`。 |
| title | string | 否 | — | 标题。最多 500 字节；null 可省略。示例：`"文档问答"`。 |
| metadata | object | 否 | `{}` | 元数据。省略/null 返回 {}；值为字符串；禁止 account_id/user_id/api_key/access_key/secret/password/token/credential 等保留键，以及含 secret/password/credential 的键。字典值类型为 `string`。示例：`{"purpose":"documentation"}`。 |
| initial_events | object[] | 否 | `[]` | 初始事件。与 Session、后继 Work 同事务保存；单事件最多 1 MiB。允许 `null`。子字段在本表下方逐项列出。 |
| initial_events[].id | string | 否 | 服务生成 | 客户端事件 ID。同 ID 同内容可重放；冲突 409；省略时由服务生成。示例：`"event_example"`。 |
| initial_events[].type | string | 是 | — | 事件类型。只允许：agent.custom_tool_use、agent.mcp_tool_use、agent.mcp_tool_result、agent.message、agent.thinking、agent.tool_result、agent.tool_use、session.error、session.outcome_evaluation、session.status_idle、session.status_rescheduled、session.status_running、session.status_terminated、span.model_request_start、span.model_request_end、user.custom_tool_result、user.define_outcome、user.interrupt、user.message、user.tool_confirmation、user.tool_result；不能提交 _chunk、_stream_、event_start 或 event_delta。示例：`"user.message"`。 |
| initial_events[].content | JSON | 否 | — | 事件内容。动态 JSON；user.message/agent.message 的字符串规范化为 text 内容块数组；其余 payload 由事件类型及执行器解释。允许 `null`。示例：`[{"type":"text","text":"请介绍项目。"}]`。 |
| initial_events[].tool_use_id | string | 否 | — | 工具调用关联 ID。工具结果按协议关联原调用。示例：`"toolu_example"`。 |
| initial_events[].is_error | boolean | 否 | — | 工具结果是否错误。示例：`false`。 |
| budget | object | 否 | `null` | 预算配置。对象或 null；仅保存，不执行限额或超限中止；完整说明见[配置支持边界](#session-config-support)。示例：`{}`。 |
| resources | JSON[] | 否 | `[]` | 资源声明。TOS 存储挂载已移除：{type:"tos",...} 不再生效。同时支持 {type:"memory_store",memory_store_id,access:"read_write"} 挂载 AgentKit 已管理的 active MemoryStore，创建时按账号和 Workspace 校验并展开为 OpenViking 运行时快照；也兼容用户已提前准备好的 OpenViking Context 记忆绑定，归一为 type=openviking_context、usage=memory、context_id、path=memories、peer、credential_ref、access；省略 access 默认 read_only，仅允许 read_only/read_write；每个 OpenViking 记忆绑定必须包含 credential_ref，格式为 {type:identity_api_key_provider,Name,PoolName}，只保存 Identity provider 引用，不保存真实 OpenViking API Key；AgentKit 不代理 Memory CRUD，read_write 写入由 agent-loop 通过 OpenViking SDK 完成。其他资源类型只保存并返回；完整说明见[配置支持边界](#session-config-support)。允许 `null`。示例：`[{"type":"tos","tos_bucket":"input-bucket","tos_key":"inputs/session-1/"}]`。 |
| vault_ids | string[] | 否 | `[]` | Vault 引用。仅保存字符串 ID，不读取凭据；完整说明见[配置支持边界](#session-config-support)。允许 `null`。示例：`[]`。 |
| credential_keys | object[] | 否 | `[]` | Identity 凭据引用。默认 []；普通引用按 Name/PoolName 去重；MCP 按 server 校验冲突。允许 `null`。子字段在本表下方逐项列出。 |
| credential_keys[].Name | string | 是 | — | Identity key 名称。普通引用去空白后非空；MCP 引用必须匹配 [A-Za-z0-9][A-Za-z0-9_-]{0,127}。示例：`"example-key"`。 |
| credential_keys[].PoolName | string | 是 | — | Identity pool 名称。普通引用去空白后非空；MCP 引用必须匹配 [A-Za-z0-9][A-Za-z0-9_-]{0,127}。示例：`"example-pool"`。 |
| credential_keys[].MCPServerName | string | 条件 | — | MCP 服务器名称。MCP 引用必填，必须匹配会话 mcp_servers。示例：`"example-mcp"`。 |
| credential_keys[].HeaderName | string | 否 | `"Authorization"` | MCP 凭据头。默认 Authorization；合法 HTTP header token，禁止 Host、Cookie、proxy- 前缀。示例：`"Authorization"`。 |
| credential_keys[].Prefix | string | 否 | `"Bearer "` | 凭据前缀。省略默认 Bearer 加空格；最长 32 字节，禁止 CR、LF、NUL。示例：`"Bearer "`。 |
| deployment_id | string | 否 | — | 部署引用。示例：`"deployment_example"`。 |
| user_id | string | 否 | — | 用户标识。可信用户头优先。示例：`"user_example"`。 |
| workspace_id | string | 否 | — | 工作区标识。anthropic-workspace-id 头优先。示例：`"workspace_example"`。 |
| agent_loop | string | 否 | 继承 Harness / adk | Session 执行实现。只允许精确小写 adk、codex、dsh、piagent。省略或 null 继承解析后的 Harness AgentLoop，Harness 缺省为 adk；显式值只覆盖当前 Session 快照，不修改 Harness。创建后不可更新；同一创建幂等键更换值返回 409。 历史 Session 使用旧请求 hash 时，仅省略或 null 可走旧 hash 兼容重放；新增显式值返回 409。示例：`"codex"`。 |
| runtime_id | string | 否 | 继承 Harness，其次 Workspace 默认 RuntimeId | 物理 AgentKit Runtime ID。使用已有 AgentKit Runtime 的 r- ID。与 runtime_template_id 互斥；固定到 agentkit_runtime 工作池。两者省略时继承 Harness 版本绑定，未配置则调用 GetWorkspace 读取 DefaultCloudResourceConfig.RuntimeId；缺少默认值时报错，不再查找名为 default 的模板。 创建时固定服务端可确定的模型网关绑定；已固定的网关不能通过环境 Tool 的网关替代，冲突绑定返回 409。示例：`"r-example"`。 |
| runtime_template_id | string | 否 | — | RuntimeTemplate ID（即将过期）。兼容旧客户端。与 runtime_id 互斥；按认证账号查询 Ready 模板，补全对应 RuntimeId，后续 Session 和 Work 统一使用 RuntimeId。建议改传 runtime_id。示例：`"rt_example"`。 |

### 请求示例

```http
POST /v1/sessions HTTP/1.1
Content-Type: application/json
x-ark-key-name: api-key-example
Idempotency-Key: session-create-001

{
  "agent": "agent_example",
  "environment_id": "env_example",
  "runtime_type": "agentkit_runtime",
  "title": "文档问答",
  "initial_events": [],
  "resources": [
    {
      "type": "tos",
      "tos_bucket": "input-bucket",
      "tos_key": "inputs/session-1/"
    }
  ],
  "agent_loop": "adk",
  "runtime_id": "r-example"
}
```

### 响应参数

成功返回 HTTP `200`。

响应正文直接使用[公共对象定义](#session-rest-object)，不额外包装业务结果。

### 响应示例

```json
{
  "id": "sesn_example",
  "type": "session",
  "agent": {
    "id": "agent_example",
    "type": "agent",
    "name": "文档助手",
    "version": 1,
    "description": "文档示例",
    "model": {
      "id": "example-model",
      "base_url": "https://ark.cn-beijing.volces.com/api/v3",
      "effort": null,
      "speed": "standard",
      "inference_geo": null
    },
    "system": "请用中文回答。",
    "tools": [],
    "mcp_servers": [],
    "skills": [],
    "metadata": {
      "purpose": "documentation"
    },
    "created_at": "2026-10-12T08:00:00Z",
    "updated_at": "2026-10-12T08:00:00Z",
    "archived_at": null,
    "agent_loop": "adk",
    "knowledge_contexts": []
  },
  "environment_id": "env_example",
  "metadata": {
    "purpose": "documentation"
  },
  "status": "idle",
  "title": "文档问答",
  "created_at": "2026-10-12T08:00:00Z",
  "updated_at": "2026-10-12T08:00:00Z",
  "archived_at": null,
  "resources": [
    {
      "type": "tos",
      "tos_bucket": "input-bucket",
      "tos_key": "inputs/session-1/"
    }
  ],
  "output_persistence_status": "configured",
  "vault_ids": [],
  "outcome_evaluations": [],
  "stats": {
    "active_seconds": 0,
    "duration_seconds": 0
  },
  "usage": {},
  "budget": null,
  "deployment_id": null,
  "runtime_type": "agentkit_runtime",
  "credential_keys": [],
  "ark_api_key_name": "api-key-example",
  "agent_loop": "adk",
  "runtime_id": "r-example"
}
```

### 使用说明

使用 Endpoint 和已认证的数据面 Key；environment_id 可从 Key 绑定解析。

- 创建体拒绝未知字段。
- agent ID 引用同账号未归档 Harness 并固定当前版本；type=agent 对象查询指定历史版本；type=agent_with_overrides 先解析基础版本，再整体覆盖所提供字段；省略字段继承，model=null 拒绝；tools 清空要求同时清空 skills，mcp_servers 清空要求移除引用其服务的 mcp_toolset；已有完整内联对象继续作为扩展支持。
- 提供 runtime_id 时固定物理 Runtime；兼容 runtime_template_id（即将过期），按账号解析 Ready 模板对应的 RuntimeId，后续统一使用 RuntimeId。
- 两字段互斥。
- 均省略时继承所选 Harness 版本的 RuntimeId，历史版本仅保存模板时先解析为 RuntimeId；Harness 也未配置时调用 GetWorkspace，使用 DefaultCloudResourceConfig.RuntimeId。
- 默认 Runtime 未就绪时报错，不查找或创建默认模板。
- 直接绑定不创建 Runtime 或 SessionStore，持久化由 Runtime 配置负责。
- 创建时在事务内固定可确定的模型网关，旧模板输入解析后仍保留网关绑定；网关配对不依赖模板路由 ID，也不以工具网关替代已固定的模型网关。
- environment_id 省略时继承所选 Harness 版本的 EnvironmentId；版本也未配置时可使用已认证 Environment Key 的环境绑定。
- agentkit_runtime 必须携带 x-ark-key-name。
- Cloud 要求唯一 Ready Tool 绑定，SelfHosted 不要求绑定。
- Idempotency-Key 同请求重放，换正文/模型 API Key Name 返回 409。
- InitialEvents、Session 和后继 Work 同事务；空 Session 不启动模型轮次。
- 模型 API Key Name 与 Environment Key 用途不同。
- agent_loop 显式选择优先于 Harness；省略/null 继承并在 Session 快照冻结，不修改登记 Harness。
- TOS 存储挂载能力已移除：resources 中的 {type:tos,tos_bucket,tos_key} 不再解析、不再挂载到 /mnt/session/storage/ 或 /mnt/session/outputs/，也不会冻结输入输出目标，仅按普通声明保存并返回。
- resources 也支持 {type:memory_store,memory_store_id} 或 {Type:memory_store,MemoryStoreId}，创建时按账号和 Workspace 校验 active MemoryStore，并展开为 OpenViking 记忆运行时快照；归档或删除的 MemoryStore 不允许新挂载。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="getagentsessionrest-rest"></a>

## GET /v1/sessions/{session_id} {#getagentsessionrest}

查询托管会话详情 · `GetAgentSession`

### 请求参数

**路径参数**

| 参数 | 类型 | 是否必传 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| session_id | string | 是 | — | session_id 字段。必填；同账号、同授权范围的资源标识。示例：`"sesn_example"`。 |

请求体留空。

### 请求示例

```http
GET /v1/sessions/sesn_example HTTP/1.1
```

### 响应参数

成功返回 HTTP `200`。

响应正文直接使用[公共对象定义](#session-rest-object)，不额外包装业务结果。

### 响应示例

```json
{
  "id": "sesn_example",
  "type": "session",
  "agent": {
    "id": "agent_example",
    "type": "agent",
    "name": "文档助手",
    "version": 1,
    "description": "文档示例",
    "model": {
      "id": "example-model",
      "base_url": "https://ark.cn-beijing.volces.com/api/v3",
      "effort": null,
      "speed": "standard",
      "inference_geo": null
    },
    "system": "请用中文回答。",
    "tools": [],
    "mcp_servers": [],
    "skills": [],
    "metadata": {
      "purpose": "documentation"
    },
    "created_at": "2026-10-12T08:00:00Z",
    "updated_at": "2026-10-12T08:00:00Z",
    "archived_at": null,
    "agent_loop": "adk",
    "knowledge_contexts": []
  },
  "environment_id": "env_example",
  "metadata": {
    "purpose": "documentation"
  },
  "status": "idle",
  "title": "文档问答",
  "created_at": "2026-10-12T08:00:00Z",
  "updated_at": "2026-10-12T08:00:00Z",
  "archived_at": null,
  "resources": [],
  "vault_ids": [],
  "outcome_evaluations": [],
  "stats": {
    "active_seconds": 0,
    "duration_seconds": 0
  },
  "usage": {},
  "budget": null,
  "deployment_id": null,
  "runtime_type": "agentkit_runtime",
  "credential_keys": [],
  "ark_api_key_name": "api-key-example",
  "agent_loop": "adk"
}
```

### 使用说明

- 可查询归档会话；对象/账号/环境范围不符返回 404。
- Create/Get 可返回工具 Work 的 OperationId/ProvisioningStatus，但不代表模型或 Sandbox E2E 已完成。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="listagentsessionsrest-rest"></a>

## GET /v1/sessions {#listagentsessionsrest}

查询托管会话列表 · `ListAgentSessions`

### 请求参数

**查询参数**

| 参数 | 类型 | 是否必传 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| user_id | string | 否 | 不筛选 | Session 所属用户 ID。去除首尾空白后精确匹配 managed_sessions.user_id；省略、空字符串或仅空白时不筛选。与账号、已认证环境、Workspace 及其他条件共同生效；不自动采用调用者身份。翻页时保持相同 user_id。示例：`"user_example"`。 |
| agent_id | string | 否 | 不筛选 | agent_id 字段。同账号资源或引用标识；省略表示不按该字段筛选。示例：`"agent_example"`。 |
| agent_version | integer | 否 | `0`（不筛选） | AgentVersion 字段。非负整数；0 不筛选版本，正整数选择具体版本。示例：`1`。 |
| created_at_gt | string | 否 | 不筛选 | CreatedAtGt 字段。UTC RFC3339 时间筛选；gt/gte/lt/lte 分别为 >、>=、<、<=。示例：`"2026-10-12T00:00:00Z"`。 |
| created_at_gte | string | 否 | 不筛选 | CreatedAtGte 字段。UTC RFC3339 时间筛选；gt/gte/lt/lte 分别为 >、>=、<、<=。示例：`"2026-10-12T00:00:00Z"`。 |
| created_at_lt | string | 否 | 不筛选 | CreatedAtLt 字段。UTC RFC3339 时间筛选；gt/gte/lt/lte 分别为 >、>=、<、<=。示例：`"2026-10-12T00:00:00Z"`。 |
| created_at_lte | string | 否 | 不筛选 | CreatedAtLte 字段。UTC RFC3339 时间筛选；gt/gte/lt/lte 分别为 >、>=、<、<=。示例：`"2026-10-12T00:00:00Z"`。 |
| deployment_id | string | 否 | 不筛选 | 部署引用。同账号资源或引用标识；省略表示不按该字段筛选。示例：`"example"`。 |
| include_archived | boolean | 否 | `false` | 包含归档对象。示例：`false`。 |
| limit | integer | 否 | `100` | 每页条数。省略或 0 默认 100；1～100；负数或超过 100 返回 400。示例：`100`。 |
| memory_store_id | string | 否 | 不筛选 | Memory Store ID。兼容旧版 Memory Store 资源筛选；匹配 resources 中的 id 或 memory_store_id。省略表示不按 Memory Store 筛选。示例：`"mem_example"`。 |
| context_id | string | 否 | 不筛选 | OpenViking Context ID。筛选 resources 中绑定的 OpenViking Context；省略表示不按 Context 筛选。示例：`"ov-c2d24ddbdd3e3aaa"`。 |
| usage | string | 否 | 不筛选 | OpenViking Context 用途。当前支持 memory；与 context_id 一起用于筛选绑定该 Context 的 Session，省略表示不按用途筛选。示例：`"memory"`。 |
| order | string | 否 | `desc` | Order 字段。asc 或 desc（忽略大小写）；默认 desc。示例：`"desc"`。 |
| page | string | 否 | 首屏 | 分页游标。Session 不透明游标；首屏省略，后续原样传入 next_page/prev_page。翻页保持 order 与筛选一致，见[分页](#session-pagination)。示例：`""`。 |
| statuses | string | 否 | 不筛选 | Statuses 字段。逗号分隔 rescheduling、running、idle、terminated；REST 另支持重复 statuses[]。示例：`"idle,running"`。 |
| environment_id | string | 否 | 不筛选 | 环境 ID。同账号资源或引用标识；省略表示不按该字段筛选。示例：`"env_example"`。 |
| runtime_type | string | 否 | — | 模型工作池类型。示例：`"example"`。 |
| sandbox_id | string | 否 | 不筛选 | sandbox_id 字段。同账号资源或引用标识；省略表示不按该字段筛选。示例：`"example"`。 |

请求体留空。

### 请求示例

```http
GET /v1/sessions?limit=100&order=desc HTTP/1.1
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是否必返 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| data | object[] | 是 | — | 数据。字段定义见[公共对象](#session-rest-object)。 |
| next_page | string | 是 | — | 下一页游标。下一页游标；原样作为 page 传入；没有下一页时返回 null。示例：`""`。 |
| prev_page | string | 是 | — | 上一页游标。上一页游标；原样作为 page 传入；首屏返回 null。示例：`""`。 |

### 响应示例

```json
{
  "data": [
    {
      "id": "sesn_example",
      "type": "session",
      "agent": {
        "id": "agent_example",
        "type": "agent",
        "name": "文档助手",
        "version": 1,
        "description": "文档示例",
        "model": {
          "id": "example-model",
          "base_url": "https://ark.cn-beijing.volces.com/api/v3",
          "effort": null,
          "speed": "standard",
          "inference_geo": null
        },
        "system": "请用中文回答。",
        "tools": [],
        "mcp_servers": [],
        "skills": [],
        "metadata": {
          "purpose": "documentation"
        },
        "created_at": "2026-10-12T08:00:00Z",
        "updated_at": "2026-10-12T08:00:00Z",
        "archived_at": null,
        "agent_loop": "adk",
        "knowledge_contexts": []
      },
      "environment_id": "env_example",
      "metadata": {
        "purpose": "documentation"
      },
      "status": "idle",
      "title": "文档问答",
      "created_at": "2026-10-12T08:00:00Z",
      "updated_at": "2026-10-12T08:00:00Z",
      "archived_at": null,
      "resources": [],
      "vault_ids": [],
      "outcome_evaluations": [],
      "stats": {
        "active_seconds": 0,
        "duration_seconds": 0
      },
      "usage": {},
      "budget": null,
      "deployment_id": null,
      "runtime_type": "agentkit_runtime",
      "credential_keys": [],
      "ark_api_key_name": "api-key-example",
      "agent_loop": "adk"
    }
  ],
  "next_page": null,
  "prev_page": null
}
```

### 使用说明

- 分页、排序、前后游标与 Claude 差异见[分页与筛选](#session-pagination)。
- environment_id 与已认证环境范围冲突返回 403；默认排除归档对象。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="updateagentsessionrest-rest"></a>

## POST /v1/sessions/{session_id} {#updateagentsessionrest}

更新托管会话 · `UpdateAgentSession`

### 请求参数

**路径参数**

| 参数 | 类型 | 是否必传 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| session_id | string | 是 | — | session_id 字段。必填；同账号、同授权范围的资源标识。示例：`"sesn_example"`。 |

**请求体**

| 参数 | 类型 | 是否必传 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| title | string | 否 | 保留原值 | 标题。最多 500 字节；省略/null 保留，空串可清空。示例：`"新标题"`。 |
| metadata | object | 否 | 保留原值 | 元数据补丁。按键合并；值为 string 或 null，null 删除该键；整体省略/null/{} 保留原值。不能提供敏感或保留键。字典值类型为 `JSON`。示例：`{"purpose":"review","obsolete":null}`。 |
| agent | object | 否 | 保留原值 | 会话 Agent 补丁。仅更新 tools/mcp_servers；整体省略/null 保留，子字段 null 拒绝；数组整体替换，[] 清空。子字段在本表下方逐项列出。 |
| agent.tools | JSON[] | 否 | 保留原值 | 工具列表。省略保留，[] 清空，null 拒绝。示例：`[]`。 |
| agent.mcp_servers | JSON[] | 否 | 保留原值 | MCP 列表。省略保留，[] 清空，null 拒绝；不能删除仍被凭据映射引用的服务器。示例：`[]`。 |
| vault_ids | null | 否 | 保留原值 | 不支持的更新字段。当前仅省略/null；非 null（包括 []）返回 400。示例：`null`。 |

### 请求示例

```http
POST /v1/sessions/sesn_example HTTP/1.1
Content-Type: application/json

{
  "title": "新版文档问答",
  "metadata": {
    "purpose": "review",
    "obsolete": null
  }
}
```

### 响应参数

成功返回 HTTP `200`。

响应正文直接使用[公共对象定义](#session-rest-object)，不额外包装业务结果。

### 响应示例

```json
{
  "id": "sesn_example",
  "type": "session",
  "agent": {
    "id": "agent_example",
    "type": "agent",
    "name": "文档助手",
    "version": 1,
    "description": "文档示例",
    "model": {
      "id": "example-model",
      "base_url": "https://ark.cn-beijing.volces.com/api/v3",
      "effort": null,
      "speed": "standard",
      "inference_geo": null
    },
    "system": "请用中文回答。",
    "tools": [],
    "mcp_servers": [],
    "skills": [],
    "metadata": {
      "purpose": "documentation"
    },
    "created_at": "2026-10-12T08:00:00Z",
    "updated_at": "2026-10-12T08:00:00Z",
    "archived_at": null,
    "agent_loop": "adk",
    "knowledge_contexts": []
  },
  "environment_id": "env_example",
  "metadata": {
    "purpose": "documentation"
  },
  "status": "idle",
  "title": "新版文档问答",
  "created_at": "2026-10-12T08:00:00Z",
  "updated_at": "2026-10-12T08:00:00Z",
  "archived_at": null,
  "resources": [],
  "vault_ids": [],
  "outcome_evaluations": [],
  "stats": {
    "active_seconds": 0,
    "duration_seconds": 0
  },
  "usage": {},
  "budget": null,
  "deployment_id": null,
  "runtime_type": "agentkit_runtime",
  "credential_keys": [],
  "ark_api_key_name": "api-key-example",
  "agent_loop": "adk"
}
```

### 使用说明

- 只更新本会话的 title、metadata、agent.tools、agent.mcp_servers；整体替换与 null 行为见请求字段表。
- [配置支持边界](#session-config-support)中的预算与 Vault 不支持更新。
- 当前没有 idle 状态检查，调用方应先等待 idle；不改变原 Harness 定义、模型或固定版本。
- 已归档对象返回 404。
- Session agent_loop 创建后固定，顶层或 agent 中更新该字段均被拒绝。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="archiveagentsessionrest-rest"></a>

## POST /v1/sessions/{session_id}/archive {#archiveagentsessionrest}

归档托管会话 · `ArchiveAgentSession`

### 请求参数

**路径参数**

| 参数 | 类型 | 是否必传 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| session_id | string | 是 | — | session_id 字段。必填；同账号、同授权范围的资源标识。示例：`"sesn_example"`。 |

请求体留空。

### 请求示例

```http
POST /v1/sessions/sesn_example/archive HTTP/1.1
```

### 响应参数

成功返回 HTTP `200`。

响应正文直接使用[公共对象定义](#session-rest-object)，不额外包装业务结果。

### 响应示例

```json
{
  "id": "sesn_example",
  "type": "session",
  "agent": {
    "id": "agent_example",
    "type": "agent",
    "name": "文档助手",
    "version": 1,
    "description": "文档示例",
    "model": {
      "id": "example-model",
      "base_url": "https://ark.cn-beijing.volces.com/api/v3",
      "effort": null,
      "speed": "standard",
      "inference_geo": null
    },
    "system": "请用中文回答。",
    "tools": [],
    "mcp_servers": [],
    "skills": [],
    "metadata": {
      "purpose": "documentation"
    },
    "created_at": "2026-10-12T08:00:00Z",
    "updated_at": "2026-10-12T08:00:00Z",
    "archived_at": null,
    "agent_loop": "adk",
    "knowledge_contexts": []
  },
  "environment_id": "env_example",
  "metadata": {
    "purpose": "documentation"
  },
  "status": "idle",
  "title": "文档问答",
  "created_at": "2026-10-12T08:00:00Z",
  "updated_at": "2026-10-12T08:00:00Z",
  "archived_at": "2026-10-12T08:00:00Z",
  "resources": [],
  "vault_ids": [],
  "outcome_evaluations": [],
  "stats": {
    "active_seconds": 0,
    "duration_seconds": 0
  },
  "usage": {},
  "budget": null,
  "deployment_id": null,
  "runtime_type": "agentkit_runtime",
  "credential_keys": [],
  "ark_api_key_name": "api-key-example",
  "agent_loop": "adk"
}
```

### 使用说明

- 停止 queued/claimed/running/paused Work，保留 Session/Event 和首次 archived_at。
- Get 可读、默认 List 排除；不是物理删除，没有取消归档。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="deleteagentsessionrest-rest"></a>

## DELETE /v1/sessions/{session_id} {#deleteagentsessionrest}

删除托管会话 · `DeleteAgentSession`

### 请求参数

**路径参数**

| 参数 | 类型 | 是否必传 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| session_id | string | 是 | — | session_id 字段。必填；同账号、同授权范围的资源标识。示例：`"sesn_example"`。 |

**查询参数**

| 参数 | 类型 | 是否必传 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| workspace_id | string | 否 | — | WorkspaceId 字段。示例：`"example"`。 |

请求体留空。

### 请求示例

```http
DELETE /v1/sessions/sesn_example HTTP/1.1
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是否必返 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| id | string | 是 | — | 资源标识。示例：`"example_id"`。 |
| type | string | 是 | — | 类型标识。固定 session_deleted。示例：`"session_deleted"`。 |

### 响应示例

```json
{
  "id": "sesn_example",
  "type": "session_deleted"
}
```

### 使用说明

- 先持久化删除意图并终态化 Work。
- 有输出配置时最多等待 30 秒，Provider 删除成功且 Session 记录已删除才返回 HTTP 200 session_deleted；没有输出配置时仍可在清理完成前返回受理成功。
- 有输出配置但无活动 Dispatch 时直接标记 succeeded。
- Provider 删除失败返回 HTTP 409，超时返回 HTTP 503；内部错误为 output_persistence_failed/pending，但当前 Service 转换为 Action Conflict/ServiceUnavailable 或 REST reason Conflict/Service_unavailable，原机器码尚未透出。
- 保留 Session ID 供清理重试，已物理删除后重试返回 404，不是成功结果重放。
- Provider 删除成功不等于已核验 TOS flush 或对象落盘。
- workspace_id 可增加范围校验；用户 Bucket 对象不随 Session 删除，不回收共享 Harness、Environment 或模板。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="sendsessioneventsrest-rest"></a>

## POST /v1/sessions/{session_id}/events {#sendsessioneventsrest}

发送会话事件 · `SendSessionEvents`

### 请求参数

**路径参数**

| 参数 | 类型 | 是否必传 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| session_id | string | 是 | — | session_id 字段。必填；同账号、同授权范围的资源标识。示例：`"sesn_example"`。 |

**请求体**

| 参数 | 类型 | 是否必传 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| events | object[] | 是 | — | 事件数组。单事件最多 1 MiB；服务字段不能重新提交。子字段在本表下方逐项列出。 |
| events[].id | string | 否 | 服务生成 | 客户端事件 ID。同 ID 同内容可重放；冲突 409；省略时由服务生成。示例：`"event_example"`。 |
| events[].type | string | 是 | — | 事件类型。只允许：agent.custom_tool_use、agent.mcp_tool_use、agent.mcp_tool_result、agent.message、agent.thinking、agent.tool_result、agent.tool_use、session.error、session.outcome_evaluation、session.status_idle、session.status_rescheduled、session.status_running、session.status_terminated、span.model_request_start、span.model_request_end、user.custom_tool_result、user.define_outcome、user.interrupt、user.message、user.tool_confirmation、user.tool_result；不能提交 _chunk、_stream_、event_start 或 event_delta。示例：`"user.message"`。 |
| events[].content | JSON | 否 | — | 事件内容。动态 JSON；user.message/agent.message 的字符串规范化为 text 内容块数组；其余 payload 由事件类型及执行器解释。允许 `null`。示例：`[{"type":"text","text":"请介绍项目。"}]`。 |
| events[].tool_use_id | string | 否 | — | 工具调用关联 ID。工具结果按协议关联原调用。示例：`"toolu_example"`。 |
| events[].is_error | boolean | 否 | — | 工具结果是否错误。示例：`false`。 |

### 请求示例

```http
POST /v1/sessions/sesn_example/events HTTP/1.1
Content-Type: application/json

{
  "events": [
    {
      "id": "event_example",
      "type": "user.message",
      "content": [
        {
          "type": "text",
          "text": "请介绍项目。"
        }
      ]
    }
  ]
}
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是否必返 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| data | object[] | 是 | — | 数据。当前页完整持久化事件，空结果为 []；元素定义见[持久化事件对象](#session-event-object)。字段定义见[公共对象](#session-event-object)。 |
| has_more | boolean | 是 | — | 是否还有事件。当前查询范围内还有下一页时为 true；不是本轮运行状态。示例：`false`。 |
| next_page | string | 是 | — | 下一页游标。有下一页时为末条事件的十进制 sequence 字符串；无下一页为 null。示例：`null`。 |

### 响应示例

```json
{
  "data": [
    {
      "id": "event_example",
      "type": "user.message",
      "content": [
        {
          "type": "text",
          "text": "请介绍项目。"
        }
      ],
      "sequence": 1,
      "seq": 1,
      "created_at": "2026-10-12T08:00:00Z",
      "processed_at": "2026-10-12T08:00:00Z"
    }
  ],
  "has_more": false,
  "next_page": null
}
```

### 使用说明

- events 中同一 ID/同内容可重放，内容冲突 409；单事件最多 1 MiB。
- 禁止提交 sequence、seq、account_id、session_id、processed_at、created_at 服务端字段；服务写入序号和时间。
- Event 与后继 Work 同事务。
- 503 调度交接繁忙时写入可能已提交，重试保持事件 ID/正文。
- 工具结果以原 tool_use_id 关联，不把普通事件写入当作任意 Work 写权限。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="listsessioneventsrest-rest"></a>

## GET /v1/sessions/{session_id}/events {#listsessioneventsrest}

查询事件历史 · `ListSessionEvents`

### 请求参数

**路径参数**

| 参数 | 类型 | 是否必传 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| session_id | string | 是 | — | session_id 字段。必填；同账号、同授权范围的资源标识。示例：`"sesn_example"`。 |

**查询参数**

| 参数 | 类型 | 是否必传 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| after_sequence | integer | 否 | `0` | AfterSequence 字段。非负整数，默认 0；读取此序号之后的事件。示例：`0`。 |
| limit | integer | 否 | `100` | 每页条数。省略或 0 默认 100；1～1000；负数或超过 1000 拒绝。示例：`100`。 |
| order | string | 否 | `asc` | Order 字段。asc 或 desc（忽略大小写）；默认 asc。示例：`"asc"`。 |
| types | string | 否 | 不筛选 | Types 字段。逗号分隔的事件类型筛选；空值不筛选；列表层不验证类型枚举，未知类型可返回空列表。示例：`"user.message,agent.message"`。 |
| page | string | 否 | 首屏 | 分页游标。十进制非负序号字符串；首屏省略，后续原样返回 NextPage/next_page。示例：`"1"`。 |

请求体留空。

### 请求示例

```http
GET /v1/sessions/sesn_example/events?limit=100&order=asc HTTP/1.1
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是否必返 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| data | object[] | 是 | — | 数据。当前页完整持久化事件，空结果为 []；元素定义见[持久化事件对象](#session-event-object)。字段定义见[公共对象](#session-event-object)。 |
| has_more | boolean | 是 | — | 是否还有事件。当前查询范围内还有下一页时为 true；不是本轮运行状态。示例：`false`。 |
| next_page | string | 是 | — | 下一页游标。有下一页时为末条事件的十进制 sequence 字符串；无下一页为 null。示例：`null`。 |

### 响应示例

```json
{
  "data": [
    {
      "id": "event_example",
      "type": "user.message",
      "content": [
        {
          "type": "text",
          "text": "请介绍项目。"
        }
      ],
      "sequence": 1,
      "seq": 1,
      "created_at": "2026-10-12T08:00:00Z",
      "processed_at": "2026-10-12T08:00:00Z"
    }
  ],
  "has_more": false,
  "next_page": null
}
```

### 使用说明

- 列表按 sequence 查询，after_sequence 为排除式下界；page/has_more/next_page 规则见[分页与筛选](#session-pagination)。
- 列表查询不推进模型轮次，也不证明本轮已完成。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="sessioneventsstreamrest-rest"></a>

## GET /v1/sessions/{session_id}/events/stream {#sessioneventsstreamrest}

订阅事件流 · `SessionEventsStream`

### 请求参数

**路径参数**

| 参数 | 类型 | 是否必传 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| session_id | string | 是 | — | 会话 ID。同账号会话。示例：`"sesn_example"`。 |

**查询参数**

| 参数 | 类型 | 是否必传 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| after_sequence | integer | 否 | Last-Event-ID<br>无有效值则 `0` | AfterSequence 字段。正数优先；省略或显式 0 回退 Last-Event-ID；两者均无有效值从 0 开始。恢复与历史回放规则见[SSE](#session-events-sse)。示例：`0`。 |
| event_deltas[] | string[] | 否 | 不返回预览增量 | EventDeltas 字段。重复查询参数，最多 100 项；每项只能 agent.message 或 agent.thinking；前者支持文本增量，后者仅开始事件。示例：`["agent.message"]`。 |

**请求头**

| 参数 | 类型 | 是否必传 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| Last-Event-ID | string | 否 | `0` | LastEventId 字段。十进制序号字符串；正的 after_sequence 优先，否则读取此请求头。无有效值从 0 开始。示例：`"1"`。 |

请求体留空。

### 请求示例

```http
GET /v1/sessions/sesn_example/events/stream HTTP/1.1
Accept: text/event-stream
```

### 响应参数

成功返回 HTTP `200`。

响应类型为 `text/event-stream`。`id` 是持久化事件序号，`event` 是事件类型，`data` 为事件 JSON；预览没有 `id`。重连规则见[事件流](conventions.md#sse)。

#### 持久化事件字段

以下字段位于每帧的 `data` JSON 中。

| 字段 | 类型 | 是否必返 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| data.id | string | 是 | — | 持久化事件 ID。字符串标识。示例：`"event_example"`。 |
| data.type | string | 是 | — | 事件类型。只允许：agent.custom_tool_use、agent.mcp_tool_use、agent.mcp_tool_result、agent.message、agent.thinking、agent.tool_result、agent.tool_use、session.error、session.outcome_evaluation、session.status_idle、session.status_rescheduled、session.status_running、session.status_terminated、span.model_request_start、span.model_request_end、user.custom_tool_result、user.define_outcome、user.interrupt、user.message、user.tool_confirmation、user.tool_result；持久化事件不包含 _chunk、_stream_、event_start 或 event_delta。示例：`"user.message"`。 |
| data.sequence | integer | 是 | — | 持久化序号。Session 内单调递增；用于分页和 SSE 恢复。示例：`1`。 |
| data.created_at | string | 是 | — | 创建时间。UTC RFC3339 时间。示例：`"2026-10-12T08:00:00Z"`。 |
| data.content | JSON | 否 | — | 内容。按原事件类型保留原始 JSON。允许 `null`。示例：`[{"type":"text","text":"请介绍项目。"}]`。可能省略。 |
| data.seq | integer | 是 | — | 序号兼容字段。与 sequence 相同。示例：`1`。 |
| data.processed_at | string | 是 | — | 服务处理时间。事件受理并规范化时由服务写入 UTC RFC3339 时间；不是模型处理完成标志，也不按该字段排序。示例：`"2026-10-12T08:00:00Z"`。 |

### 响应示例

```text
id: 1
event: user.message
data: {"id":"event_example","type":"user.message","content":[{"type":"text","text":"请介绍项目。"}],"sequence":1,"seq":1,"created_at":"2026-10-12T08:00:00Z","processed_at":"2026-10-12T08:00:00Z"}

```

### 使用说明

预览帧沿用执行器事件格式；持久化事件结构与预览事件不能混用。

- 持久化事件按 sequence 回放并继续订阅，预览不持久化且不带 id。
- after_sequence 与 Last-Event-ID 优先级、心跳、5 分钟关闭和重连规则见[事件与 SSE](#session-events-sse)。
- 断流不表示本轮完成。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="listsessionresourcesrest-rest"></a>

## GET /v1/sessions/{session_id}/resources {#listsessionresourcesrest}

查询会话资源 · `ListSessionResources`

### 请求参数

**路径参数**

| 参数 | 类型 | 是否必传 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| session_id | string | 是 | — | session_id 字段。必填；同账号、同授权范围的资源标识。示例：`"sesn_example"`。 |

请求体留空。

### 请求示例

```http
GET /v1/sessions/sesn_example/resources HTTP/1.1
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是否必返 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| data | JSON[] | 是 | — | 数据。会话保存的 resources JSON 声明数组，空值返回 []；OpenViking Context 只返回创建时冻结的非敏感绑定快照，不查询或创建云实例。示例：`[]`。 |
| has_more | boolean | 是 | — | 是否还有事件。当前固定 false，不分页。示例：`false`。 |

### 响应示例

```json
{
  "data": [],
  "has_more": false
}
```

### 使用说明

- 返回会话已保存的 resources JSON 数组，不代表部署了全部资源，也不是查询云 Sandbox 实例列表。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<!-- api-contracts:end -->
