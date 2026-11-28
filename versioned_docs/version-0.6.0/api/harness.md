---
toc_max_heading_level: 2
---
# AgentKit:Agent 管理接口

本页描述 **0.6.0** 与 Runtime 配套的控制面 Agent（Harness）管理接口契约。

## 在 Runtime 使用流程中选择接口

| 使用场景 | 控制面接口 | 结果怎么用 |
|---|---|---|
| 定义 Agent | `CreateAgent`、`GetAgent`、`ListAgents` | 保存 `AgentID`，确认模型、指令、工具、Skills、MCP 与资源配置。字段和示例见下文。 |
| 发布配置修订 | `UpdateAgent`、`ListAgentVersions` | 更新产生新修订 `AgentVersion`。创建会话时，可按 ID 取当前修订，或显式指定版本；已有会话使用原固定版本。 |
| 停止后续使用 | `ArchiveAgent`、`DeleteAgent` | 根据下文的归档和删除语义处理。应用要清理单个对话时，应调用所属组件的 Session 接口。 |
| 为会话准备环境 | [CreateEnvironment、GetEnvironment、ListEnvironments](environment.md) | 取得可访问的 `EnvironmentId`，配置为 Agent 默认环境或在创建会话时指定。 |
| 为托管会话绑定长期记忆 | `CreateMemoryStore`、`GetMemoryStore`、`ListMemoryStores` | 在 Session 的 `resources` 中引用已有存储 ID；服务校验后冻结绑定信息供执行器消费。 |
| 按部署触发托管运行 | `CreateDeployment`、`RunDeployment`、`GetDeploymentRun` | 需要部署级运行时绑定时，用 `AgentID` 和选定 `AgentVersion` 创建 Deployment；触发后按运行 ID 查询。 |

Harness App 可在创建绑定会话时通过 `GetAgent` 读取这里保存的配置。调用方取得 `Result.AgentID` 后，在创建会话请求中以 `agentId` 与同一工作区的 `workspaceId`（及可选 Cloud `environmentId`）一起交给 Runtime；后续消息可显式刷新配置。可用字段与运行时映射见[完整调用链路](../app/flow.md)。

直接调用 Harness App 时，用户、会话和运行接口属于 Runtime HTTP 服务。使用 Worker 的应用则通过托管 Session 数据面读写事件。两种入口分别见 [Harness App 接口](index.md) 和 [Managed Agents API](session.md)。上表关联资源的可用状态以对应 AgentKit 契约及目标环境为准。

<!-- api-contracts:start -->
<a id="全字段参考"></a>

接口的请求参数、嵌套字段和响应示例均在本页列出。认证方式见[调用约定](conventions.md#认证与请求地址)。

统一响应中的 `ResponseMetadata` 复用[公共字段定义](conventions.md#响应元信息)，本页只展开各接口的业务结果。

| 接口 | 分面 | 功能 |
| --- | --- | --- |
| [CreateAgent](#createagent-top) | 控制面 | 创建 Agent |
| [GetAgent](#getagent-top) | 控制面 | 查询 Agent |
| [ListAgents](#listagents-top) | 控制面 | 列出 Agent |
| [UpdateAgent](#updateagent-top) | 控制面 | 更新 Agent |
| [ArchiveAgent](#archiveagent-top) | 控制面 | 归档 Agent |
| [DeleteAgent](#deleteagent-top) | 控制面 | 删除 Agent |
| [ListAgentVersions](#listagentversions-top) | 控制面 | 列出 Agent 历史版本 |

控制面固定字段使用 PascalCase，分页使用 MaxResults/NextToken。

<a id="harness-versions"></a>

## 版本、归档与 Session

创建后的 `AgentVersion` 为 `1`。每次成功更新都会生成下一版本，包括空补丁和相同值赋值；可传当前版本号防止并发覆盖。`AgentVersion>0` 获取该历史版本，省略或非正数获取当前对象。已有 Session 使用创建时固定的配置快照，后续更新不会改变它。

`Status` 为 Active 或 Archived；合法转换为 Active → Archived，Archived 为终态。ArchivedAt 保留首次归档时间；Get/List 当前对象返回当前状态，指定历史版本返回快照当时的状态。归档不增加版本，重复归档保留首次时间；已归档对象可查询，但不能更新或用于创建新 Session。归档不会删除已有 Session。历史版本保存当时的字段值，归档当前对象不会回写历史版本。

Agent 不提供取消归档。`DeleteAgent` 软删除当前对象并隐藏版本入口，但保留版本快照和既有 Session 固定的快照。

<a id="harness-pagination"></a>

## 分页

对象列表按 ID 降序，版本列表按版本号降序。MaxResults 默认 100，0 也按 100；有效范围 1～100，负数、超过 100 或非整数返回 HTTP 400。首屏省略 NextToken，后续将 NextToken 原样传入；末页 NextToken=null，空结果 Items=[]，不返回 PrevPage。NextToken 是不透明字符串，不能与其他接口的游标混用。

无效 Base64、空解码值、非法 UTF-8 或带首尾空白的游标内容返回 400；版本列表游标内容必须为规范的正整数版本号。查询不存在或其他账号的对象版本列表时，若没有匹配快照，返回空列表。

<a id="harness-errors"></a>

## 错误与重试

| HTTP 状态 | Action 错误码 | 条件与处理 |
| --- | --- | --- |
| 400 | MissingParameter.Name / MissingParameter.AgentID | 必填字段缺失；补齐参数。 |
| 400 | InvalidParameter.<字段路径> | 字段类型、范围、枚举、Model/McpServers 配置不合法；路径为公开字段名，如 Name、AgentLoop、Model.Id、McpServers.Headers、MaxResults、NextToken、AgentVersion、Status、ClientToken。修正参数。 |
| 400 | InvalidParameter.UnknownField | 未声明的顶层字段，包括小写或下划线拼写、旧 `HarnessId`/`HarnessVersion` 字段、UpdateAgent 中传入 Type 或 AgentLoop，以及 AdditionalFields 写入；自定义键值使用 Metadata。 |
| 404 | InvalidHarness.NotFound | 当前账号下对象或指定历史版本不存在；不暴露跨账号存在性。 |
| 404 | ResourceNotFound.Environment | 设置的环境不存在、已归档或不可访问。 |
| 404 | ResourceNotFound.RuntimeTemplate | 设置的默认模板不在调用方可访问的 Ready 模板中。 |
| 409 | Conflict.RuntimeId | 创建或更新默认 RuntimeTemplateId 时，目标 RuntimeId 已被同账号下其他未删除的 Agent 使用，且任一方类型为 `dedicated-runtime`。 |
| 409 | RevisionConflict | 更新 `AgentVersion` 不等于当前版本；Get 当前对象后重新确认修改。 |
| 409 | OperationDenied.HarnessArchived | 对已归档对象发起更新；Archived 为终态。 |

公开 Error.Code 使用点分 PascalCase：每段以大写字母开头，只包含英文字母和数字；无主题时允许单段类别。不返回 Err 前缀、下划线或内部 Proto reason。参数分段使用公开字段名，分页统一为 MaxResults/NextToken；内部错误在 HTTP 输出边界转换，数据面保留原协议。

错误体位于 ResponseMetadata.Error，失败无 Result。创建、更新、归档和删除支持可选 ClientToken，遵循 24 小时账号/Action 隔离重放；同令牌不同参数返回 409 IdempotentParameterMismatch，执行中返回 OperationInProgress，过期返回 ClientTokenExpired，结果不确定返回 409/503 IdempotencyResultUncertain。先查询对象或联系支持，不得换令牌盲目重试。

<a id="harness-claude-boundary"></a>

## 支持边界

本页仅描述控制面 Agent 管理 Action，版本为 2025-10-30。数据面 Session 使用创建时固定的配置快照，字段和认证按[Session API](session.md)处理。

Agent 更新生成新版本，Session 更新只改变会话允许修改的字段。模型和工具 JSON 的执行能力由运行环境决定；本服务不承诺完整兼容外部 SDK，详见[SDK 接口边界](session.md#session-config-support)。

控制面按版本保存 MultiAgent 配置。线程执行和结果回传见[子 Agent 与线程](../managed/resources.md#子-agent-与线程)；配置保存不代表目标运行环境已支持多 Agent 执行。

<a id="harness-element-details"></a>

## Tools、Skills 与 McpServers 元素详情

对 Harness App，绑定会话时 Runtime 从 `GetAgent` 响应的 `McpServers` 元素读取 `MCPServiceId`，再调用 `GetMCPService` 查询连接配置。单轮配置见[对话接口](chat.md#post-runagentsse)。

本节说明 `CreateAgent`、`UpdateAgent` 请求及 Agent 响应中 `Tools`、`Skills`、`McpServers` 的元素结构。请求字段表只描述数组层级的约束，元素结构以本节为准。

字段被接受或回显不代表执行器已按该配置执行，权限策略、工具启用状态和技能加载的实际效果由运行环境决定。

### 键名规则

- 顶层字段名须为 `Tools`、`Skills`、`McpServers`。元素内及嵌套对象的结构键接受 PascalCase、lowerCamel、snake_case 及混用，服务端转发前递归转为 snake_case：`Type`、`SkillId`、`McpServerName`、`DefaultConfig`、`PermissionPolicy`、`AllowedDomains`、`InputSchema` 分别落到 `type`、`skill_id`、`mcp_server_name`、`default_config`、`permission_policy`、`allowed_domains`、`input_schema`；`mcpServerName` 与 `mcp_server_name` 同样落到 `mcp_server_name`。
- 响应键按现有规则转回 PascalCase；字符串值（工具名、类型取值、域名等）不改写。
- 同一对象中归一后重名的键一律返回 400 `InvalidParameter.<字段路径>`，即使值相同也拒绝。例如 `McpServerName` 和 `mcp_server_name` 同时出现返回 `InvalidParameter.Tools.McpServerName`；`DefaultConfig.PermissionPolicy` 中的 `Type` 和 `type` 同时出现返回 `InvalidParameter.Tools.DefaultConfig.PermissionPolicy.Type`。错误路径使用 PascalCase，不含数组下标；不能用于公开错误码的属性名（如含连字符）省略该路径段，返回可表示的父路径。不同数组元素中的同名字段不冲突。
- `Tools[].InputSchema` 的值整体原样透传：外层 `InputSchema`、`inputSchema`、`input_schema` 归一为 `input_schema`，响应外层键为 `InputSchema`；值中的所有键和值保持原样，包括 `properties`/`Properties` 下的属性名、`required`/`Required`、嵌套 schema、`$defs` 和 `$ref`。例如 `TicketId` 保持 `TicketId`，不会变成 `ticket_id`。服务端不会把 schema 内的 `Type`、`Properties`、`Required` 自动修正为小写，调用方应使用标准 JSON Schema 关键字。InputSchema 内部不做归一冲突检查，`TicketId` 和 `ticket_id` 可以作为两个独立属性同时存在；外层同时提供 `InputSchema` 和 `input_schema` 仍因重名返回 400 `InvalidParameter.Tools.InputSchema`。
- `Metadata`、`Meta`、`EnvVars`、`Headers`、`AdditionalFields`、`Networking`、`System` 的内部内容沿用原样保留规则，不做归一冲突检查。

### Skills 元素

`Skills` 元素按 `Type` 区分：

| `Type` | 说明 |
| --- | --- |
| `anthropic` | Anthropic 托管技能，`SkillId` 为官方技能标识，例如 `"xlsx"`。 |
| `custom` | 自定义技能。`SkillId` 可传裸技能 ID，如 `"skill_example"`，也可传 `"技能空间ID/技能ID"`，如 `"ss-example/s-example"`。 |
| `external_skill_package` | 公开技能包。填写 `Url`；`Source` 省略时运行时使用 `public_url`。 |

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| Type | string | 是 | — | `anthropic`、`custom` 或 `external_skill_package`。 |
| SkillId | string | `anthropic` 或 `custom` 时必填 | — | 技能标识；公开技能包不填写。 |
| Version | string | 见说明 | 裸技能 ID 省略时使用最新版本 | 自定义技能版本。完整自定义技能 ID 在创建或更新 Harness 时必填，不能传空值或 `latest`。 |
| Source | string | 否 | `public_url` | 仅公开技能包使用；当前运行时支持 `public_url`。 |
| Url | string | `external_skill_package` 时必填 | — | 公开技能包的 URL。 |

- `Skills` 最多 20 项。完整 `custom` 引用要求恰好两段，每段由字母、数字、下划线或连字符组成。REST 和 TOP 共用校验，ID 或版本不合法时返回 400，TOP 错误码分别为 `InvalidParameter.Skills.SkillId` 和 `InvalidParameter.Skills.Version`。合法引用按原值保存并回显。
Harness App 0.3.1 使用空间中加载时可见的最新版本；以下版本固定规则适用于 Managed Agents Session。

- `技能空间ID/技能ID` 是 Harness 的完整 `SkillId`。创建 Session 时，斜杠和点号两种完整引用均以当前账号查询技能空间成员关系和指定版本。校验通过后，Session 快照使用 `技能空间ID.技能ID`，版本保持原值。
- 裸技能 ID 沿用 Workspace 默认技能空间。裸 ID 的版本在**创建 Session 时**解析并固定：`Version` 省略、为空字符串或为 `latest` 时取当前最新版本 ID，其他取值必须是该账号下存在的版本；解析失败或版本不可用时拒绝创建 Session。固定结果只写入 Session 快照，不回写 Harness。`anthropic` 及其他取值的引用原样透传，本服务不解析、不校验，也没有 Anthropic 内置技能库。
- 未配置技能注册中心时，只要 Harness 含 `custom` 技能引用，创建 Session 返回 503 `api_error`（`Skill registry is not configured.`）；`custom` 引用无法解析返回 400。

### Tools 元素

`Tools` 元素按 `Type` 区分，本服务不校验该取值：

| `Type` | 用途 | 必填字段 |
| --- | --- | --- |
| `agent_toolset_20260401` | 内置 Agent 工具集，按组启用或禁用工具 | `Type` |
| `mcp_toolset` | 引用 `McpServers` 中某个 MCP 服务提供的工具 | `Type`、`McpServerName` |
| `custom` | 由 API 客户端执行的自定义工具 | `Type`、`Name`、`Description`、`InputSchema` |

`agent_toolset_20260401`：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| Type | string | 是 | — | 固定 `"agent_toolset_20260401"`。 |
| Configs | array | 否 | 不设置 | 单个工具的覆盖配置，见下表。 |
| DefaultConfig | object | 否 | 不设置 | 工具集内全部工具的默认配置，可为 null。 |

`Configs` 元素：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| Name | string | 是 | — | 工具名，取 `bash`、`edit`、`read`、`write`、`glob`、`grep`、`web_fetch`、`web_search`。 |
| Type | string | 否 | 与 `Name` 相同 | 工具名的冗余副本，取值与同一元素的 `Name` 一致。 |
| Enabled | boolean | 否 | 覆盖 `DefaultConfig.Enabled` | 该工具是否启用。 |
| PermissionPolicy | object | 否 | 见 [PermissionPolicy](#harness-permission-policy) | 该工具的执行权限策略，可为 null。 |
| AllowedDomains | string[] | 否 | 不设置 | 仅 `web_fetch` / `web_search`；只允许这些域名及其子域，最多 64 项，空数组被拒绝，不能与 `BlockedDomains` 同时使用。 |
| BlockedDomains | string[] | 否 | 不设置 | 仅 `web_fetch` / `web_search`；禁止这些域名及其子域，其余约束同上。 |
| MaxContentTokens | integer | 否 | 不设置 | 仅 `web_fetch`；单次调用注入上下文的抓取正文 token 上限，不影响 PDF 等二进制内容。 |
| UserLocation | object | 否 | 不设置 | 仅 `web_search`；搜索结果本地化用的近似位置，字段见下表。 |
| UrlSources | object | 否 | 全来源 | 仅 `web_fetch`；Tools JSON 透传的 loop 扩展，归一为 `url_sources`，控制面不逐项校验；来源规则与支持范围见[网页工具的执行边界](#web-tool-boundaries)。 |

域名条目按工具区分：`web_fetch` 要求纯主机名（如 `docs.example.com`，不含协议、端口或路径），`web_search` 允许在主机名后带可选路径后缀；两者都匹配该域名及其子域。

启用工具前，应确认目标运行环境支持对应工具及其网络和凭据配置。Session 覆盖和事件读取见 [Session API](session.md)，模型、凭据和访问限制见[网页工具的执行边界](#web-tool-boundaries)。配置回显不代表实际 Runtime 已加载对应 loop 镜像。

`UserLocation` 字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| Type | string | 是 | 只支持 `"approximate"`。 |
| City | string | 否 | 城市名。 |
| Country | string | 否 | 两位 ISO 3166-1 国家代码，大写。 |
| Region | string | 否 | 省/州名。 |
| Timezone | string | 否 | IANA 时区标识，例如 `"Asia/Shanghai"`。 |

`DefaultConfig` 字段（`agent_toolset_20260401` 与 `mcp_toolset` 相同）：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| Enabled | boolean | 否 | `true` | 工具集内工具是否默认启用。 |
| PermissionPolicy | object | 否 | 见 [PermissionPolicy](#harness-permission-policy) | 工具集内工具的执行权限策略，可为 null。 |

`mcp_toolset`：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| Type | string | 是 | — | 固定 `"mcp_toolset"`。 |
| McpServerName | string | 是 | — | 应匹配 `McpServers` 中的某个 `Name`，1～255 个字符。 |
| Configs | array | 否 | 不设置 | 单个 MCP 工具的覆盖配置。 |
| DefaultConfig | object | 否 | 不设置 | 该 MCP 服务全部工具的默认配置，字段同上。 |

`mcp_toolset` 的 `Configs` 元素字段为 `Name`（MCP 工具名，1～128 个字符，必填）、`Enabled`、`PermissionPolicy`，语义同上，没有 `Type`。

`custom`：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| Type | string | 是 | 固定 `"custom"`。 |
| Name | string | 是 | 工具唯一名，1～128 个字符，只允许字母、数字、下划线和连字符。 |
| Description | string | 是 | 工具用途说明，展示给模型以决定何时调用。 |
| InputSchema | object | 是 | 入参 JSON Schema，`type` 固定为 `"object"`，可含 `properties`、`required` 及其他 JSON Schema 关键字；值整体原样保留。 |

模型调用自定义工具时发出 `agent.custom_tool_use` 事件，会话进入 idle 等待客户端通过 `user.custom_tool_result` 事件回传结果。

<a id="harness-permission-policy"></a>

`PermissionPolicy` 只含 `Type` 一个字段，可省略或传 null，没有默认值：

| `Type` | 语义 |
| --- | --- |
| `always_allow` | 工具调用自动放行，不需要用户确认。 |
| `always_ask` | 工具调用执行前需要用户确认。 |
| `auto` | 服务端按工具、入参和会话上下文逐次判断：安全则放行，高风险则拒绝，无法判断时转为询问。 |

本服务对 `Tools` 的限制与差异：

- 只校验数组长度上限 128，且按数组元素个数计算，不展开 `Configs`。
- 除上述键名冲突检查外，不按 `Type` 做判别式校验，也不校验 `Configs`、`DefaultConfig`、`PermissionPolicy`、`InputSchema` 的子字段；元素按键名规则保存并回显。配置语义由执行侧校验，本仓库不承诺这些配置已生效。
- 创建 Harness 时不校验 `mcp_toolset` 是否引用了 `McpServers` 中的服务，也不要求每个 MCP 服务都被引用。Session 的 `agent_with_overrides` 路径校验 `mcp_toolset.mcp_server_name` 必须命中 `mcp_servers` 中的 `name`（不校验反向的未引用服务）。
- `McpServers` 元素必须是 JSON 对象，非空 `Name` 不得重复，最多 20 项；元素内禁止 `ApiKey`、`AuthorizationToken`、`Authorization`、`Headers` 字段，凭据通过 Session 的 `credential_keys` 引用。
- 本服务不解析 `PermissionPolicy`：工具确认（`user.tool_confirmation`）与自定义工具事件在会话事件白名单内，但策略判断和确认流程由执行器实现。
- Session 覆盖路径会识别 `read` 工具：Harness 含 `Skills` 时，必须能识别到 `read`（顶层元素 `Name` 为 `read`，或 `agent_toolset_20260401` 的 `Configs` 未把 `read` 置为 `Enabled: false`），否则返回 400 `agent.tools`。

### 网页工具的执行边界 {#web-tool-boundaries}

以下字段用于配置 Managed Agents 网页工具。

- **配置与覆盖。** 在 `agent_toolset_20260401` 中启用 `web_search` 或 `web_fetch`。更新 Harness 的 Tools 会整体替换配置，已有 Session 仍使用固定快照；新 Session 可通过 `agent_with_overrides` 提供自己的工具配置。
- **模型与凭据。** 搜索复用当前 Session Agent 的模型 ID、有效 Base URL 和 Runner 已解析的模型凭据；协议由 Worker 配置决定，快照中的 provider 不覆盖它。该搜索后端要求 `openai` 协议和受支持的方舟 HTTPS 入口，不支持任意 OpenAI 兼容地址。云 Session 的 `x-ark-key-name` 是当前账号下的方舟 API Key Name，不是明文 Key；它也不替代环境访问密钥。
- **URL 来源。** `UrlSources` 包含 `user_input`、`client_tool_results`、`server_tool_results`，省略或 null 表示 `all`，也可选 `none`。工具结果来源支持 `type=only` 或 `type=except` 并指定工具名单；三种来源不能全部禁用。抓取 URL 必须已出现在允许来源的持久化 Session 历史中，缺少历史或读取失败时拒绝抓取。
- **网络限制。** `web_fetch` 只接受无内嵌凭据的绝对 HTTP(S) URL，拒绝回环、私网、链路本地和云元数据地址。DNS 解析和每次重定向都需要通过网络与域名检查；加入域名白名单不能豁免私网限制。
- **结果校验。** 用 `agent.tool_use.id` 与 `agent.tool_result.tool_use_id` 关联调用，检查 `is_error` 和实际结果。搜索读取 `results[].url`，抓取读取 `content`；HTTP 200 或模型声称已搜索均不能代替工具结果。事件读取和恢复见 [Session API](session.md#session-events-sse)。

### 调用示例

下面的示例创建一个同时配置 Skills、Tools 与 MCP 的 Agent，再按返回的 `AgentID` 查询。`$HARNESS_BASE_URL` 为部署提供的控制面入口；账号签名与认证头由 SDK 或网关按[调用约定](conventions.md#认证与请求地址)生成，示例省略这些头，`Model.Id` 替换为运行环境可访问的模型，不要把 API Key 写入请求。

```bash
curl -sS -X POST "$HARNESS_BASE_URL/?Action=CreateAgent&Version=2025-10-30" \
  -H "Content-Type: application/json" \
  -d '{
    "Name": "订单助手",
    "Model": {"Id": "example-model"},
    "McpServers": [
      {"Name": "orders", "Type": "url", "Url": "https://mcp.example.com/orders"}
    ],
    "Tools": [
      {
        "Type": "agent_toolset_20260401",
        "DefaultConfig": {"Enabled": true, "PermissionPolicy": {"Type": "always_ask"}},
        "Configs": [
          {"Name": "bash", "Enabled": false},
          {"Name": "web_fetch", "Enabled": true, "AllowedDomains": ["docs.example.com"]}
        ]
      },
      {
        "Type": "mcp_toolset",
        "McpServerName": "orders",
        "Configs": [{"Name": "create_order", "PermissionPolicy": {"Type": "always_ask"}}]
      },
      {
        "Type": "custom",
        "Name": "lookup_ticket",
        "Description": "按工单号查询工单状态",
        "InputSchema": {
          "type": "object",
          "properties": {"TicketId": {"type": "string"}},
          "required": ["TicketId"]
        }
      }
    ],
    "Skills": [
      {"Type": "custom", "SkillId": "skill_example", "Version": "3"},
      {"Type": "anthropic", "SkillId": "xlsx"}
    ]
  }'
```

响应的 `Result` 回显提交的元素（省略 `Model`、`Metadata`、时间等无关字段），键名转回 PascalCase，`InputSchema` 内部保持 `TicketId` 原样（以下仅列相关字段）：

```json
{
  "ResponseMetadata": {"RequestId": "req_example", "Action": "CreateAgent", "Version": "2025-10-30", "Service": "ma", "Region": "cn-beijing"},
  "Result": {
    "AgentID": "agent_example",
    "AgentVersion": 1,
    "Status": "Active",
    "McpServers": [{"Name": "orders", "Type": "url", "Url": "https://mcp.example.com/orders"}],
    "Tools": [
      {
        "Type": "agent_toolset_20260401",
        "DefaultConfig": {"Enabled": true, "PermissionPolicy": {"Type": "always_ask"}},
        "Configs": [
          {"Name": "bash", "Enabled": false},
          {"Name": "web_fetch", "Enabled": true, "AllowedDomains": ["docs.example.com"]}
        ]
      },
      {
        "Type": "mcp_toolset",
        "McpServerName": "orders",
        "Configs": [{"Name": "create_order", "PermissionPolicy": {"Type": "always_ask"}}]
      },
      {
        "Type": "custom",
        "Name": "lookup_ticket",
        "Description": "按工单号查询工单状态",
        "InputSchema": {
          "type": "object",
          "properties": {"TicketId": {"type": "string"}},
          "required": ["TicketId"]
        }
      }
    ],
    "Skills": [
      {"Type": "custom", "SkillId": "skill_example", "Version": "3"},
      {"Type": "anthropic", "SkillId": "xlsx"}
    ]
  }
}
```

```bash
curl -sS "$HARNESS_BASE_URL/?Action=GetAgent&Version=2025-10-30&AgentID=agent_example"
```

更新时只提交要变更的字段：省略 `Tools`、`Skills`、`McpServers` 保留原值，传 null 或 `[]` 清空，传数组则整体替换。

### 错误

`Skills` 超过 20 项、`Tools` 超过 128 项或 `McpServers` 超过 20 项返回 400。控制面错误使用 TOP 错误信封 `ResponseMetadata.Error`，错误码为点分 PascalCase，例如 `InvalidParameter.Tools`、`InvalidParameter.Skills`、`InvalidParameter.McpServers`、`InvalidParameter.McpServers.Name`；请求体不是合法 JSON 对象时见[错误响应](conventions.md#错误响应)。

<a id="harness-object"></a>

## Agent 对象

创建、查询、更新、归档及列表元素复用以下对象。可为 null 的字段仍在响应中出现；可省略的字段另行标注。

| 字段 | 类型 | 是否必返 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| AgentID | string | 是 | — | 资源标识。服务生成，当前使用 `agent_` 前缀。示例：`"agent_example"`。 |
| Type | string | 是 | `"shared-runtime"` | Agent 类型。取值为 `shared-runtime` 或 `dedicated-runtime`，区分大小写；返回创建时选定的类型。未保存类型的存量资源返回 `shared-runtime`。示例：`"shared-runtime"`。 |
| Name | string | 是 | — | 名称。去首尾空白后 1～256 个 Unicode 字符；创建和更新均校验，空字符串和 null 不可用于清空。示例：`"文档助手"`。 |
| AgentVersion | integer | 是 | — | 版本。正整数；创建 1；更新递增；归档不增版本。示例：`1`。 |
| Description | string | 是 | — | 描述。字符串或 null；最多 2048 个 Unicode 字符，null 表示无描述。示例：`"文档示例"`。 |
| Model | JSON | 否 | — | 模型配置。非空模型 ID 字符串或含非空 Id 的对象；不能为 null。Effort 支持 low/medium/high/xhigh/max 字符串或 {Type:等级}，响应统一为对象或 null；Speed 为 standard/fast，默认 standard；InferenceGeo 为 us/global/null，默认 null。CompactThreshold 为可选的上下文压缩 token 阈值，必须为 1–9007199254740991 的整数（如 192000），不能为 null；省略时使用执行器环境配置，环境未设置时默认 192000。新 Session 固定此值，更新不改变已有 Session；当前仅 veadk-agent-loop ADK Chat 原生压缩路径应用该值。保留 BaseUrl 等执行器扩展字段；实际执行效果由执行器决定。示例见表后。 |
| AgentLoop | string | 是 | `"adk"` | Agent loop 实现。返回该版本保存的选择；取值为 adk、codex、dsh、piagent；创建时省略则为 adk。旧格式快照统一返回 adk，不把同名扩展字段解释为执行选择；新建 Agent 的显式选择按版本保存。示例：`"codex"`。 |
| System | string | 是 | — | 系统提示词。系统提示词字符串或 null；最多 100000 个 Unicode 字符，其他类型拒绝。示例：`"请用中文回答。"`。 |
| Tools | JSON[] | 是 | — | 工具配置。最多 128 项。工具配置数组；无配置时为 []。元素类型（agent_toolset_20260401、mcp_toolset、custom）、子字段与示例见[Tools 元素](#harness-element-details)。Tools[].InputSchema 的外层键归一为 input_schema，响应外层键为 InputSchema；其值整体原样保留，内部属性名、required/Required、嵌套 schema 和引用均不改写，也不做归一冲突校验。示例：`[]`。 |
| McpServers | JSON[] | 是 | — | MCP 服务配置。最多 20 项；提供的非空 Name 不得重复。MCP 服务定义数组；无配置时为 []。与 mcp_toolset 的引用关系见[Tools 元素](#harness-element-details)。示例：`[]`。 |
| Skills | JSON[] | 是 | — | 技能配置。最多 20 项。技能配置数组；此处是 Agent 定义，Session 创建时固定其技能版本；无配置时为 []。元素字段（Type、SkillId、Version）、版本固定规则与示例见[Skills 元素](#harness-element-details)。示例：`[]`。 |
| KnowledgeContexts | JSON[] | 是 | — | OpenViking Context 知识绑定。返回当前版本保存的 OpenViking Context 知识绑定；不返回任何密钥或登录态。示例见表后。 |
| MultiAgent | JSON | 否 | — | 固定子 Agent 委派清单。返回该版本固定的委派配置；未启用时为 null。示例：`{"Subagents":[{"Name":"researcher","Agent":{"Type":"agent","Id":"agent_researcher","Version":2}}]}`。 |
| Metadata | object | 是 | — | 业务元数据。最多 16 对自定义键值，不含系统标签；键最多 64 个 Unicode 字符，值须为字符串且最多 512 个 Unicode 字符。省略或 null 时仅返回服务端系统标签。不承载调用凭据。存在实际绑定时返回只读标记 `sys:agentkit:runtimeid`，值与 `RuntimeId` 一致；未绑定时省略该键。示例：`{"purpose":"documentation"}`。 |
| CreatedAt | string | 是 | — | 创建时间。UTC RFC3339 时间。示例：`"2026-10-12T08:00:00Z"`。 |
| UpdatedAt | string | 是 | — | 最后更新时间。UTC RFC3339 时间。示例：`"2026-10-12T08:00:00Z"`。 |
| ArchivedAt | string | 是 | — | 首次归档时间。当前对象归档后返回 UTC RFC3339 时间；未归档为 null；历史版本按当时的快照返回。示例：`"2026-10-12T08:00:00Z"`。 |
| AdditionalFields | object | 否 | — | 历史扩展字段。只读兼容历史快照的扩展字段；新建和更新拒绝未知顶层字段，自定义键值使用 Metadata。没有历史扩展时省略。字典值类型为 `JSON`。示例：`{}`。 |
| WorkspaceId | string | 是 | — | 创建时固定的 Workspace 归属。取原资源持久化归属或真实标签；历史无归属资源返回空字符串，不读取调用方 Metadata。示例：`"workspace-example"`。 |
| Payload | JSON | 否 | — | 自定义 JSON 数据。支持对象、数组、字符串、数字、布尔值和 null；对象键名保持原样。返回对应版本保存的值。示例：`{"RunOptions":["fast",false]}`。 |
| Status | string | 是 | — | 资源状态。Active 或 Archived；仅由当前结果的 ArchivedAt 派生。Active → Archived，Archived 为终态。历史版本显示快照当时的状态，不被当前归档回写。示例：`"Active"`。 |
| RuntimeId | string | 否 | — | 运行实例 ID。返回该版本保存的运行实例 ID。未配置时省略。示例：`"r-example"`。 |
| EnvironmentId | string | 否 | — | 默认 Environment ID。返回该版本保存的环境 ID。未配置时省略。示例：`"env_example"`。 |
| RuntimeTemplateId | string | 否 | — | 默认 RuntimeTemplate ID（即将过期）。返回该版本保存的模板 ID。未配置时省略。示例：`"rt_example"`。 |

**`Model` 示例**

```json
{
  "Id": "example-model",
  "BaseUrl": "https://ark.cn-beijing.volces.com/api/v3",
  "Effort": null,
  "Speed": "standard",
  "InferenceGeo": null
}
```

**`KnowledgeContexts` 示例**

```json
[
  {
    "type": "openviking_context",
    "usage": "knowledge",
    "context_id": "ov-example",
    "path": "resources",
    "resource_scope": {
      "mode": "root"
    },
    "credential_ref": {
      "type": "identity_api_key_provider",
      "Name": "openviking-user-key",
      "PoolName": "default"
    }
  }
]
```

<a id="createagent-top"></a>

## CreateAgent

创建 Agent。

```http
POST /?Action=CreateAgent&Version=2025-10-30
```

### 请求参数

| 参数 | 类型 | 是否必传 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| Name | string | 是 | — | 名称。去首尾空白后 1～256 个 Unicode 字符；创建和更新均校验，空字符串和 null 不可用于清空。示例：`"文档助手"`。 |
| Description | string | 否 | — | 描述。字符串或 null；最多 2048 个 Unicode 字符，null 表示无描述。示例：`"文档示例"`。 |
| Model | JSON | 否 | 省略 | 模型配置。可直接填写非空模型 ID 字符串，也可填写包含 `Id` 的对象；不能为 null。对象字段展开如下。 |
| Model.Id | string | Model 为对象时必填 | — | 非空模型 ID。也可将整个 `Model` 直接写成模型 ID 字符串。 |
| Model.BaseUrl | string | 否 | — | 模型服务地址，作为执行器扩展字段保存；实际执行效果由执行器决定。 |
| Model.Effort | string 或 object | 否 | null | 推理强度，可填 `low`、`medium`、`high`、`xhigh`、`max`，也可填含 `Type` 的对象；响应统一为对象或 null。 |
| Model.Effort.Type | string | Effort 为对象时必填 | — | 推理强度，取 `low`、`medium`、`high`、`xhigh`、`max`。 |
| Model.Speed | string | 否 | `standard` | 取 `standard` 或 `fast`。 |
| Model.InferenceGeo | string 或 null | 否 | null | 取 `us`、`global` 或 null。 |
| Model.CompactThreshold | integer | 否 | 执行器环境配置，未设置时为 `192000` | 上下文压缩 token 阈值，取 1～9007199254740991 的整数；不能为 null。新 Session 固定此值，已有 Session 不随更新改变；当前仅 veadk-agent-loop ADK Chat 原生压缩路径应用。 |
| AgentLoop | string | 否 | `"adk"` | Agent loop 实现。按 Agent 选择，允许不同 Agent 使用不同实现；取值为 adk、codex、dsh、piagent，区分大小写；省略时使用 adk，显式值必须是非空字符串，不接受 null。piagent 对应 Pi。示例：`"codex"`。 |
| System | string | 否 | — | 系统提示词。系统提示词字符串或 null；最多 100000 个 Unicode 字符，其他类型拒绝。示例：`"请用中文回答。"`。 |
| Tools | JSON[] | 否 | `[]` | 工具定义，最多 128 项。省略或传 null 时返回空数组。元素类型（agent_toolset_20260401、mcp_toolset、custom）、子字段与示例见[Tools 元素](#harness-element-details)。Tools[].InputSchema 的外层键归一为 input_schema，响应外层键为 InputSchema；其值整体原样保留，内部属性名、required/Required、嵌套 schema 和引用均不改写，也不做归一冲突校验。文档示例使用 PascalCase；元素键也接受 lowerCamel、snake_case 及混用，服务端统一转为 snake_case。同一对象内归一后重名的键返回 400 InvalidParameter.<字段路径>，即使值相同也拒绝。 |
| Tools[].Type | string | 是 | — | 工具定义类型，取 `agent_toolset_20260401`、`mcp_toolset` 或 `custom`。 |
| Tools[].Configs | object[] | 否 | — | 对于 `agent_toolset_20260401`，每项覆盖一个内置工具的配置。 |
| Tools[].Configs[].Name | string | 是 | — | 内置工具名，取 `bash`、`edit`、`read`、`write`、`glob`、`grep`、`web_fetch` 或 `web_search`。 |
| Tools[].Configs[].Type | string | 否 | 与同一项的 `Name` 相同 | 可省略。填写时必须与同一项的 `Name` 完全一致，例如 `Name` 为 `bash` 时填 `bash`。 |
| Tools[].Configs[].Enabled | boolean | 否 | — | 是否启用该工具，覆盖工具集的 `DefaultConfig.Enabled`。 |
| Tools[].Configs[].PermissionPolicy | object | 否 | — | 单个工具的执行权限策略，可为 null。 |
| Tools[].Configs[].PermissionPolicy.Type | string | 是 | — | 策略类型，例如 `always_allow` 表示始终允许执行。见 [PermissionPolicy](#harness-permission-policy)。 |
| McpServers | JSON[] | 否 | `[]` | MCP 定义。最多 20 项；提供的非空 Name 不得重复。数组元素必须是 JSON 对象；禁止 ApiKey、AuthorizationToken、Authorization、Headers 字段。认证凭据通过 Session 的 credential_keys 引用；不得把密钥写入 Agent。省略或 null 返回 []。与 mcp_toolset 的引用关系见[Tools 元素](#harness-element-details)。文档示例使用 PascalCase；元素键也接受 lowerCamel、snake_case 及混用，服务端统一转为 snake_case。示例：`[]`。 |
| McpServers[].Type | string | 见说明 | — | MCP 服务类型；使用已注册服务时为 `custom`。 |
| McpServers[].MCPServiceId | string | `Type=custom` 时填写 | — | MCP 服务 ID。示例格式：`"mcp-service-example"`。 |
| Skills | JSON[] | 否 | `[]` | Skill 配置数组，最多 20 项。每个元素从下面两种来源中选择一种。省略或 null 返回 []。 |
| Skills[].来自 AgentKit Skill Space | 配置方式 | — | — | 这一层仅用于区分填写方式，不是请求字段。 |
| Skills[].来自 AgentKit Skill Space.Type | string | 是 | — | 填 `custom`。 |
| Skills[].来自 AgentKit Skill Space.SkillId | string | 是 | — | 填 Skill Space 中的技能引用，例如 `ss-demo/s-first`。 |
| Skills[].来自 AgentKit Skill Space.Version | string | 完整 SkillId 时必填 | — | 填要固定的技能版本；控制面要求完整 SkillId 同时提供版本，不能填 `latest`。 |
| Skills[].来自公共 Skill | 配置方式 | — | — | 这一层仅用于区分填写方式，不是请求字段。 |
| Skills[].来自公共 Skill.Type | string | 是 | — | 填 `external_skill_package`。 |
| Skills[].来自公共 Skill.Url | string | 是 | — | 填公开技能包的 URL，例如 `https://example.com/skills/demo.zip`。 |
| KnowledgeContexts | JSON[] | 否 | `[]` | OpenViking Context 知识绑定。每个元素必须为对象，且 type=openviking_context、usage=knowledge、context_id 以 ov- 开头；path 省略时为 resources，提供时只能为 resources。P0 最多一个知识 Context。每个 OpenViking 知识绑定必须包含 credential_ref，格式为 {type:identity_api_key_provider,Name,PoolName}，只保存 Identity provider 引用，不保存真实 OpenViking API Key。resource_scope 支持 mode=root 或 mode=alias；alias、description、retrieval_policy、resolved 可选；不得传 target_uri。resolved 与 retrieval_policy 只能保存非敏感配置，不得包含 API Key、AK/SK、Token、Cookie、CSRF 或明文凭据。同一个 context_id 可以同时被知识和记忆绑定使用，但知识绑定只用于 load_knowledgebase，不与记忆结果混用。允许 `null`。示例见表后。 |
| MultiAgent | JSON | 否 | null | 固定子 Agent 委派清单。省略时保留默认或已有配置，null 表示禁用委派。对象包含 1～8 个 Subagents，每项须有唯一 Name 与 Agent={Type:agent,Id,Version}；主 Agent 仅支持 AgentLoop=adk，子 Agent 不能再启用委派。示例：`{"Subagents":[{"Name":"researcher","Agent":{"Type":"agent","Id":"agent_researcher","Version":2}}]}`。 |
| Metadata | object | 否 | `{}` | 元数据。最多 16 对自定义键值，不含系统标签；键最多 64 个 Unicode 字符，值须为字符串且最多 512 个 Unicode 字符。省略或 null 时仅返回服务端系统标签。不承载调用凭据。`sys:agentkit:runtimeid` 为系统保留键，传入的值会被忽略。示例：`{"purpose":"documentation"}`。 |
| Type | string | 否 | `"shared-runtime"` | Agent 类型。仅支持 `shared-runtime` 和 `dedicated-runtime`，区分大小写；省略时使用 `shared-runtime`。`dedicated-runtime` 类型通过 `RuntimeId` 直接绑定运行实例，不能使用 `RuntimeTemplateId`。类型在创建后固定。示例：`"shared-runtime"`。 |
| Payload | JSON | 否 | 省略 | 自定义 JSON 数据。支持对象、数组、字符串、数字、布尔值和 null；对象键名保持原样。随首个版本保存。示例：`{"RunOptions":["fast",false]}`。 |
| RuntimeId | string | 否 | — | 运行实例 ID。允许省略、null 或空字符串，表示未配置 RuntimeId。`dedicated-runtime` 类型的非空值必须为有效的 `r-` 实例 ID，且同一 `RuntimeId` 只能绑定一个未删除的 `dedicated-runtime` Agent。仅 `shared-runtime` 之间可共享同一 `RuntimeId`。示例：`"r-example"`。 |
| EnvironmentId | string | 否 | — | 默认 Environment ID。保存同账号可访问的非空、未归档环境 ID。创建 Session 时，省略 environment_id 则继承所选 Agent 版本的环境。示例：`"env_example"`。 |
| RuntimeTemplateId | string | 否 | — | 默认 RuntimeTemplate ID（即将过期）。兼容旧客户端，即将过期，建议改传 RuntimeId。保存同账号可访问的 Ready 模板 ID，并解析对应 RuntimeId 固定到 Agent 版本；后续 Session 和 Work 使用 RuntimeId。示例：`"rt_example"`。 |
| ClientToken | string | 否 | 不启用幂等重放 | 幂等令牌。非空时为 1～64 个可打印 ASCII 字符（不含空格）。按账号和 Action 隔离；24 小时内同令牌同参数重放首次结果，不重复创建或增加版本。不同参数返回 409 IdempotentParameterMismatch；过期令牌拒绝复用。省略、null 或空字符串保留非幂等行为。示例：`"agent-request-1"`。 |
| ProjectName | string | 否 | default | 未指定 Workspace 时的项目名。缺少非空 `WorkspaceId` 时使用此项目名。示例：`"project-example"`。 |
| WorkspaceId | string | 否 | 空 | Workspace 选择器，受 Workspace 开关控制。可选字符串，去首尾空白；兼容 `workspace_id`，与 `anthropic-workspace-id` 请求头及兼容字段同时提供时须一致。示例：`"workspace-example"`。 |

**`KnowledgeContexts` 示例**

```json
[
  {
    "type": "openviking_context",
    "usage": "knowledge",
    "context_id": "ov-example",
    "path": "resources",
    "resource_scope": {
      "mode": "root"
    },
    "credential_ref": {
      "type": "identity_api_key_provider",
      "Name": "openviking-user-key",
      "PoolName": "default"
    }
  }
]
```

### 请求示例

```http
POST /?Action=CreateAgent&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "Name": "文档助手",
  "Description": "根据知识库回答问题",
  "Model": {
    "Id": "example-model",
    "BaseUrl": "https://ark.cn-beijing.volces.com/api/v3"
  },
  "AgentLoop": "adk",
  "System": "请用中文回答。引用资料时注明出处，不确定时明确说明。",
  "Tools": [
    {
      "Type": "agent_toolset_20260401",
      "Configs": [
        {"Name": "bash", "Type": "bash", "Enabled": true, "PermissionPolicy": {"Type": "always_allow"}},
        {"Name": "read", "Type": "read", "Enabled": true, "PermissionPolicy": {"Type": "always_allow"}}
      ]
    }
  ],
  "McpServers": [],
  "Skills": [],
  "Metadata": {
    "purpose": "knowledge-answering",
    "owner_team": "example-team"
  },
  "RuntimeId": "r-example",
  "EnvironmentId": "env_example",
  "Payload": {
    "RunOptions": [
      "fast",
      false
    ]
  },
  "WorkspaceId": "workspace-example"
}
```

**仅使用模型 ID 的最小创建请求**

```http
POST /?Action=CreateAgent&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "Name": "简易助手",
  "Model": "example-model"
}
```

**配置 Skills、Tools 与 MCP 的创建请求**

```http
POST /?Action=CreateAgent&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "Name": "订单助手",
  "Model": {
    "Id": "example-model"
  },
  "McpServers": [
    {
      "Name": "orders",
      "Type": "url",
      "Url": "https://mcp.example.com/orders"
    }
  ],
  "Tools": [
    {
      "Type": "agent_toolset_20260401",
      "DefaultConfig": {
        "Enabled": true,
        "PermissionPolicy": {
          "Type": "always_ask"
        }
      },
      "Configs": [
        {
          "Name": "bash",
          "Enabled": false
        },
        {
          "Name": "read",
          "Enabled": true
        }
      ]
    },
    {
      "Type": "mcp_toolset",
      "McpServerName": "orders",
      "Configs": [
        {
          "Name": "create_order",
          "PermissionPolicy": {
            "Type": "always_ask"
          }
        }
      ]
    },
    {
      "Type": "custom",
      "Name": "lookup_ticket",
      "Description": "按工单号查询工单状态",
      "InputSchema": {
        "type": "object",
        "properties": {
          "TicketId": {
            "type": "string"
          }
        },
        "required": [
          "TicketId"
        ]
      }
    }
  ],
  "Skills": [
    {
      "Type": "custom",
      "SkillId": "skill_example",
      "Version": "3"
    },
    {
      "Type": "anthropic",
      "SkillId": "xlsx"
    }
  ]
}
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是否必返 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| ResponseMetadata | object | 是 | — | 公共响应元信息，字段定义见[公共 ResponseMetadata](conventions.md#响应元信息)。 |
| Result | object | 是 | — | 业务结果。成功时返回，失败时省略。字段定义见[公共对象](#harness-object)。 |

### 响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "req_example",
    "Action": "CreateAgent",
    "Version": "2025-10-30",
    "Service": "ma",
    "Region": "cn-beijing"
  },
  "Result": {
    "AgentID": "agent_example",
    "Type": "shared-runtime",
    "Name": "文档助手",
    "AgentVersion": 1,
    "Description": "文档示例",
    "Model": {
      "Id": "example-model",
      "BaseUrl": "https://ark.cn-beijing.volces.com/api/v3",
      "Effort": null,
      "Speed": "standard",
      "InferenceGeo": null
    },
    "AgentLoop": "adk",
    "System": "请用中文回答。",
    "Tools": [],
    "McpServers": [],
    "Skills": [],
    "Metadata": {
      "purpose": "documentation"
    },
    "CreatedAt": "2026-10-12T08:00:00Z",
    "UpdatedAt": "2026-10-12T08:00:00Z",
    "ArchivedAt": null,
    "KnowledgeContexts": [],
    "WorkspaceId": "workspace-example",
    "RuntimeId": "r-example",
    "EnvironmentId": "env_example",
    "Payload": {
      "RunOptions": [
        "fast",
        false
      ]
    },
    "Status": "Active"
  }
}
```

### 使用说明

固定字段使用 PascalCase，未知顶层字段返回 InvalidParameter.UnknownField。自定义键值仅在 Metadata 内传入；AdditionalFields 只读兼容历史快照。

- AgentLoop 是本 Agent 的选择，不是环境级全局配置；不同 Agent 可分别指定 adk、codex、dsh 或 piagent。adk 使用 ADK 内置循环，codex 使用 Codex SDK，piagent 使用本地 Pi 的 RPC 模式。枚举沿用 VeADK 的 runtime 取值。
- 省略 AgentLoop 的最小请求使用 adk；Session 使用创建时固定的 Agent 版本及其 AgentLoop，后续版本不会改变已有 Session 的选择。
- Tools、Skills、McpServers 顶层字段名仍须使用 PascalCase。文档示例使用 PascalCase；元素键也接受 lowerCamel、snake_case 及混用，服务端统一转为 snake_case。同一对象内归一后重名的键返回 400 InvalidParameter.<字段路径>，即使值相同也拒绝。响应仍按现有规则转回 PascalCase；字符串值保持原样。Tools[].InputSchema 的外层键归一为 input_schema，响应外层键为 InputSchema；其值整体原样保留，内部属性名、required/Required、嵌套 schema 和引用均不改写，也不做归一冲突校验。Metadata、Meta、EnvVars、Headers、AdditionalFields、Networking、System 内部内容沿用原样保留规则。逐字段说明和限制见[Tools、Skills 与 McpServers 元素详情](#harness-element-details)。
- Model.Id 为示例占位值，调用时替换为运行环境可访问的模型；不要把 API Key 写入 Model 或 Metadata。
- 工具、技能与 MCP 元素须符合运行环境的协议；模型和工具的调用能力在 Session 运行时使用。
- 创建拒绝未知顶层字段；`AgentID`、`AgentVersion` 和时间字段由服务生成。
- 版本与重试规则见[版本说明](#harness-versions)和[错误与重试](#harness-errors)。
- 非空 ClientToken 启用账号与 Action 隔离的幂等重放；同令牌不同参数返回 409 IdempotentParameterMismatch。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="getagent-top"></a>

## GetAgent

查询 Agent。

```http
GET /?Action=GetAgent&Version=2025-10-30
POST /?Action=GetAgent&Version=2025-10-30
```

### 请求参数

| 参数 | 类型 | 是否必传 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| AgentID | string | 是 | — | Agent ID。同账号非空 ID。示例：`"agent_example"`。 |
| AgentVersion | integer | 否 | 当前版本 | 历史版本。正整数查询历史；省略或非正数查询当前。示例：`1`。 |
| ProjectName | string | 否 | default | 未指定 Workspace 时的项目名。缺少非空 `WorkspaceId` 时使用此项目名。示例：`"project-example"`。 |
| WorkspaceId | string | 否 | 空 | Workspace 选择器，受 Workspace 开关控制。可选字符串，去首尾空白；兼容 `workspace_id`，与 `anthropic-workspace-id` 请求头及兼容字段同时提供时须一致。示例：`"workspace-example"`。 |

### 请求示例

```http
POST /?Action=GetAgent&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "AgentID": "agent_example",
  "WorkspaceId": "workspace-example"
}
```

**查询指定历史版本**

```http
POST /?Action=GetAgent&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "AgentID": "agent_example",
  "AgentVersion": 1
}
```

**GET 查询示例**

```http
GET /?Action=GetAgent&Version=2025-10-30&AgentID=agent_example HTTP/1.1
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是否必返 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| ResponseMetadata | object | 是 | — | 公共响应元信息，字段定义见[公共 ResponseMetadata](conventions.md#响应元信息)。 |
| Result | object | 是 | — | 业务结果。成功时返回，失败时省略。字段定义见[公共对象](#harness-object)。 |

### 响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "req_example",
    "Action": "GetAgent",
    "Version": "2025-10-30",
    "Service": "ma",
    "Region": "cn-beijing"
  },
  "Result": {
    "AgentID": "agent_example",
    "Type": "shared-runtime",
    "Name": "文档助手",
    "AgentVersion": 1,
    "Description": "文档示例",
    "Model": {
      "Id": "example-model",
      "BaseUrl": "https://ark.cn-beijing.volces.com/api/v3",
      "Effort": null,
      "Speed": "standard",
      "InferenceGeo": null
    },
    "AgentLoop": "adk",
    "System": "请用中文回答。",
    "Tools": [],
    "McpServers": [],
    "Skills": [],
    "Metadata": {
      "purpose": "documentation"
    },
    "CreatedAt": "2026-10-12T08:00:00Z",
    "UpdatedAt": "2026-10-12T08:00:00Z",
    "ArchivedAt": null,
    "KnowledgeContexts": [],
    "WorkspaceId": "workspace-example",
    "RuntimeId": "r-example",
    "EnvironmentId": "env_example",
    "Status": "Active"
  }
}
```

### 使用说明

固定字段使用 PascalCase，未知顶层字段返回 InvalidParameter.UnknownField。自定义键值仅在 Metadata 内传入；AdditionalFields 只读兼容历史快照。

- 可查询已归档对象。
- 指定正整数 `AgentVersion` 查询历史，否则查询当前对象；历史版本不随后续修改变化。
- 不存在或跨账号返回 404。
- 同一 Action/协议 Version 支持 GET 和 POST；GET 业务参数全部放在查询串，POST 支持 JSON 正文或查询串，不能在两处重复提供同一业务字段。
- 字段名区分大小写（注意 `AgentID` 的 `ID` 为大写），重复查询键、非法整数/布尔值及 GET 正文返回 400。
- 两种方法使用相同账号认证、授权、校验、分页、成功与错误响应。
- 业务版本字段为 `AgentVersion`，JSON 正文和 GET/POST 查询串一致；查询串 `Version` 始终表示 API 协议版本，旧的正文 `Version` 返回 400 InvalidParameter.UnknownField。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="listagents-top"></a>

## ListAgents

列出 Agent。

```http
GET /?Action=ListAgents&Version=2025-10-30
POST /?Action=ListAgents&Version=2025-10-30
```

### 请求参数

| 参数 | 类型 | 是否必传 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| MaxResults | integer | 否 | `100` | 每页条数。正整数 1～100；省略或 0 按 100；负数、超过 100 或非整数返回 400。示例：`100`。 |
| NextToken | string | 否 | 首屏 | 分页游标。首屏省略；原样传入 NextToken，不得与其他接口的游标混用；无效 Base64 或空解码值返回 400。示例：`""`。 |
| IncludeArchived | boolean | 否 | `false` | 包含归档。默认 false。示例：`false`。 |
| Status | string | 否 | 由 IncludeArchived 决定 | 资源状态筛选。Active 或 Archived，区分大小写；显式提供时优先于 IncludeArchived。省略时沿用 IncludeArchived：默认只列出 Active。筛选在数据库分页前执行，续页必须保持该筛选值。示例：`"Active"`。 |
| RuntimeId | string | 否 | 不按运行实例筛选 | 已绑定的运行实例 ID。去除首尾空白后按当前快照中保存的 `RuntimeId` 精确匹配；显式空值返回 400。示例：`"r-example"`。 |
| ProjectName | string | 否 | 不按项目筛选 | 未指定 Workspace 时的项目名。不传 `ProjectName` 和 `WorkspaceId` 时按账号查询全部资源。示例：`"project-example"`。 |
| Metadata | object | 否 | 不按元数据筛选 | 元数据筛选。按 JSONB 包含关系匹配所有条件；保留键名大小写及 JSON 类型。空对象不筛选；GET 参数传 URL 编码后的 JSON 对象。可通过 `sys:agentkit:runtimeid` 匹配当前绑定。示例：`{"team":"search"}`。 |
| WorkspaceId | string | 否 | 空 | Workspace 选择器，受 Workspace 开关控制。可选字符串，去首尾空白；兼容 `workspace_id`。示例：`"workspace-example"`。 |
| Filters | object[] | 否 | 不筛选 | 过滤条件。最多 10 条；不同条件按且组合，分页前应用。省略或空数组不筛选。`ListAgents` 还接受 `Type`，区分大小写精确匹配 `shared-runtime` 或 `dedicated-runtime`。子字段在本表下方逐项列出。 |
| Filters[].Name | string | 否 | 无 | 过滤字段名。支持 `Id` 精确匹配、`Name` 包含匹配（大小写敏感，`%` 和 `_` 按普通字符处理）及 `Type`；多个字段以 `&` 分隔，按或匹配。示例：`"Id&Name"`。 |
| Filters[].Values | string[] | 否 | 无 | 匹配值。非空字符串数组，多个值按或匹配。示例：`["example"]`。 |
| PageNumber | integer | 否 | 仅 Console 场景返回或生效 | 仅 Console 场景使用的分页字段。X-Top-Client-Type 为 Console 时使用。PageNumber 默认 1，范围 1 到 2147483647；PageSize 默认 100，范围 1 到 100；TotalCount 为相同筛选条件下的总数。普通 OpenAPI 保留游标分页。示例：`1`。 |
| PageSize | integer | 否 | 仅 Console 场景返回或生效 | 仅 Console 场景使用的分页字段。X-Top-Client-Type 为 Console 时使用。示例：`1`。 |

### 请求示例

```http
POST /?Action=ListAgents&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "MaxResults": 100,
  "IncludeArchived": true,
  "WorkspaceId": "workspace-example"
}
```

**GET 查询示例**

```http
GET /?Action=ListAgents&Version=2025-10-30&MaxResults=100&IncludeArchived=true HTTP/1.1
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是否必返 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| ResponseMetadata | object | 是 | — | 公共响应元信息，字段定义见[公共 ResponseMetadata](conventions.md#响应元信息)。 |
| Result | object | 是 | — | 业务结果。成功时返回，失败时省略。子字段在本表下方逐项列出。 |
| Result.Items | object[] | 是 | — | 数据。结果数组；没有匹配项时为 []。字段定义见[公共对象](#harness-object)。 |
| Result.NextToken | string | 是 | — | 下一页游标。有下一页时返回游标，下次请求原样传入 NextToken；没有下一页时为 null。示例：`""`。 |
| Result.PageNumber | integer | 否 | — | 仅 Console 场景使用的分页字段。可能省略。 |
| Result.PageSize | integer | 否 | — | 仅 Console 场景使用的分页字段。可能省略。 |
| Result.TotalCount | integer | 否 | — | 仅 Console 场景使用的分页字段。可能省略。 |

### 响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "req_example",
    "Action": "ListAgents",
    "Version": "2025-10-30",
    "Service": "ma",
    "Region": "cn-beijing"
  },
  "Result": {
    "Items": [
      {
        "AgentID": "agent_example",
        "Type": "shared-runtime",
        "Name": "文档助手",
        "AgentVersion": 1,
        "Description": "文档示例",
        "Model": {
          "Id": "example-model",
          "BaseUrl": "https://ark.cn-beijing.volces.com/api/v3",
          "Effort": null,
          "Speed": "standard",
          "InferenceGeo": null
        },
        "AgentLoop": "adk",
        "System": "请用中文回答。",
        "Tools": [],
        "McpServers": [],
        "Skills": [],
        "Metadata": {
          "purpose": "documentation"
        },
        "CreatedAt": "2026-10-12T08:00:00Z",
        "UpdatedAt": "2026-10-12T08:00:00Z",
        "ArchivedAt": null,
        "KnowledgeContexts": [],
        "WorkspaceId": "workspace-example",
        "RuntimeId": "r-example",
        "EnvironmentId": "env_example",
        "Status": "Active"
      }
    ],
    "NextToken": null
  }
}
```

### 使用说明

固定字段使用 PascalCase，未知顶层字段返回 InvalidParameter.UnknownField。自定义键值仅在 Metadata 内传入；AdditionalFields 只读兼容历史快照。

- 默认不包含已归档对象；IncludeArchived=true 时包含。
- 排序、游标和末页行为见[分页](#harness-pagination)。
- 同一 Action/协议 Version 支持 GET 和 POST；GET 业务参数全部放在查询串，POST 支持 JSON 正文或查询串，不能在两处重复提供同一业务字段。
- 字段名区分大小写，重复查询键、非法整数/布尔值及 GET 正文返回 400。
- 两种方法使用相同账号认证、授权、校验、分页、成功与错误响应。
- Status 显式提供时优先于 IncludeArchived，在数据库分页前按 Active/Archived 筛选；续页必须保持筛选值。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="updateagent-top"></a>

## UpdateAgent

更新 Agent。

```http
POST /?Action=UpdateAgent&Version=2025-10-30
```

### 请求参数

| 参数 | 类型 | 是否必传 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| AgentID | string | 是 | — | Agent ID。同账号非空 ID。示例：`"agent_example"`。 |
| Name | string | 否 | 保留原值 | 名称。去首尾空白后 1～256 个 Unicode 字符；创建和更新均校验，空字符串和 null 不可用于清空。省略保留原值。示例：`"文档助手"`。 |
| Description | string | 否 | 保留原值 | 描述。字符串或 null；最多 2048 个 Unicode 字符，null 表示无描述。示例：`"文档示例"`。 |
| Model | JSON | 否 | 保留原值 | 模型配置。非空模型 ID 字符串或含非空 Id 的对象；不能为 null。省略保留模型；提供时整体替换，同 Id 的对象更新省略 Effort 时保留已有 Effort，其他字段不继承。示例：`{"Id":"example-model","BaseUrl":"https://ark.cn-beijing.volces.com/api/v3"}`。 |
| System | string | 否 | 保留原值 | 系统提示词。系统提示词字符串或 null；最多 100000 个 Unicode 字符，其他类型拒绝。示例：`"请用中文回答。"`。 |
| Tools | JSON[] | 否 | 保留原值 | 工具定义。最多 128 项。省略保留原值；null 或 [] 清空数组。元素类型（agent_toolset_20260401、mcp_toolset、custom）、子字段与示例见[Tools 元素](#harness-element-details)。示例：`[]`。 |
| McpServers | JSON[] | 否 | 保留原值 | MCP 定义。最多 20 项；提供的非空 Name 不得重复。省略保留原值；null 或 [] 清空数组。与 mcp_toolset 的引用关系见[Tools 元素](#harness-element-details)。示例：`[]`。 |
| Skills | JSON[] | 否 | 保留原值 | Skill 引用。最多 20 项。省略保留原值；null 或 [] 清空数组。元素字段与示例见[Skills 元素](#harness-element-details)。示例：`[]`。 |
| KnowledgeContexts | JSON[] | 否 | 保留原值 | OpenViking Context 知识绑定。更新时传空数组或 null 表示清空知识绑定；省略字段表示保留原值。示例见表后。 |
| MultiAgent | JSON | 否 | 保留原值 | 固定子 Agent 委派清单。省略时保留默认或已有配置，null 表示禁用委派。示例：`{"Subagents":[{"Name":"researcher","Agent":{"Type":"agent","Id":"agent_researcher","Version":2}}]}`。 |
| Metadata | object | 否 | 保留原值 | 元数据。最多 16 对自定义键值，不含系统标签；按键合并，null 删除对应键；省略、null 或 {} 保留原值。`sys:agentkit:runtimeid` 为系统保留键，传入的值会被忽略。示例：`{"purpose":"documentation"}`。 |
| AgentVersion | integer | 否 | 不校验版本 | 预期版本。提供时必须等于当前版本，否则返回 HTTP 409；建议读取当前 `AgentVersion` 后传入，避免覆盖并发更新。示例：`1`。 |
| Payload | JSON | 否 | 保留原值 | 自定义 JSON 数据。传入时整体替换，显式 null 保存为 JSON null。示例：`{"RunOptions":["fast",false]}`。 |
| EnvironmentId | string | 否 | 保留原值 | 默认 Environment ID。传入同账号可访问且未归档的环境 ID，或传空字符串清除。省略保留原值。更新产生新版本。示例：`"env_example"`。 |
| RuntimeTemplateId | string | 否 | 保留原值 | 默认 RuntimeTemplate ID（即将过期）。传入同账号可访问的 Ready 模板 ID 时补全并保存对应 RuntimeId；传空字符串仅清除模板字段，保留已固定的 RuntimeId。省略保留原值。示例：`"rt_example"`。 |
| ClientToken | string | 否 | 不启用幂等重放 | 幂等令牌。非空时为 1～64 个可打印 ASCII 字符（不含空格）。示例：`"agent-request-1"`。 |

**`KnowledgeContexts` 示例**

```json
[
  {
    "type": "openviking_context",
    "usage": "knowledge",
    "context_id": "ov-example",
    "path": "resources",
    "resource_scope": {
      "mode": "root"
    },
    "credential_ref": {
      "type": "identity_api_key_provider",
      "Name": "openviking-user-key",
      "PoolName": "default"
    }
  }
]
```

### 请求示例

```http
POST /?Action=UpdateAgent&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "AgentVersion": 1,
  "Name": "文档助手 v2",
  "Description": "更新后的文档助手",
  "System": "请先给结论，再列出证据。",
  "Tools": [],
  "McpServers": [],
  "Skills": [],
  "Metadata": {
    "purpose": "knowledge-answering-v2",
    "obsolete_tag": null
  },
  "AgentID": "agent_example",
  "Payload": {
    "RunOptions": [
      "fast",
      false
    ]
  }
}
```

**清空可选配置并删除元数据键**

```http
POST /?Action=UpdateAgent&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "AgentVersion": 2,
  "Description": null,
  "System": null,
  "Tools": null,
  "McpServers": [],
  "Skills": [],
  "Metadata": {
    "obsolete_tag": null
  },
  "AgentID": "agent_example"
}
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是否必返 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| ResponseMetadata | object | 是 | — | 公共响应元信息，字段定义见[公共 ResponseMetadata](conventions.md#响应元信息)。 |
| Result | object | 是 | — | 业务结果。成功时返回，失败时省略。字段定义见[公共对象](#harness-object)。 |

### 响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "req_example",
    "Action": "UpdateAgent",
    "Version": "2025-10-30",
    "Service": "ma",
    "Region": "cn-beijing"
  },
  "Result": {
    "AgentID": "agent_example",
    "Type": "shared-runtime",
    "Name": "新版文档助手",
    "AgentVersion": 2,
    "Description": "文档示例",
    "Model": {
      "Id": "example-model",
      "BaseUrl": "https://ark.cn-beijing.volces.com/api/v3",
      "Effort": null,
      "Speed": "standard",
      "InferenceGeo": null
    },
    "AgentLoop": "adk",
    "System": "请用中文回答。",
    "Tools": [],
    "McpServers": [],
    "Skills": [],
    "Metadata": {
      "purpose": "documentation"
    },
    "CreatedAt": "2026-10-12T08:00:00Z",
    "UpdatedAt": "2026-10-12T08:00:00Z",
    "ArchivedAt": null,
    "KnowledgeContexts": [],
    "WorkspaceId": "workspace-example",
    "Payload": {
      "RunOptions": [
        "fast",
        false
      ]
    },
    "Status": "Active"
  }
}
```

### 使用说明

固定字段使用 PascalCase，未知顶层字段返回 InvalidParameter.UnknownField。自定义键值仅在 Metadata 内传入；AdditionalFields 只读兼容历史快照。

- Tools、Skills、McpServers 顶层字段名仍须使用 PascalCase。逐字段说明和限制见[Tools、Skills 与 McpServers 元素详情](#harness-element-details)。
- 省略字段保留原值；除 Metadata 按键合并外，提供的配置整体替换；相同 Model.Id 的对象更新省略 Effort 时保留已有 Effort，其他模型字段不继承。
- 传 Description/System=null 清空配置；Tools/McpServers/Skills 传 null 或 [] 清空数组。
- Metadata 中普通键的值为 null 时删除该键，整个 Metadata=null 不会清空已有元数据。
- `workspaceid`、`ma-user-id`、`ma-workspace-id` 以及 `sys:agentkit:ws`、`sys:agentkit:creator`、`sys:agentkit:kind`、`sys:agentkit:runtimeid` 属于服务端保留键，更新时静默忽略并保留服务端写入值。
- 成功更新增加版本；空补丁也增加版本。已归档对象不可更新。
- 未知顶层字段返回 InvalidParameter.UnknownField；版本冲突和重试规则见[错误与重试](#harness-errors)。
- 非空 ClientToken 启用账号与 Action 隔离的幂等重放；同令牌不同参数返回 409 IdempotentParameterMismatch。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="archiveagent-top"></a>

## ArchiveAgent

归档 Agent。

```http
POST /?Action=ArchiveAgent&Version=2025-10-30
```

### 请求参数

| 参数 | 类型 | 是否必传 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| AgentID | string | 是 | — | Agent ID。同账号非空 ID。示例：`"agent_example"`。 |
| ClientToken | string | 否 | 不启用幂等重放 | 幂等令牌。非空时为 1～64 个可打印 ASCII 字符（不含空格）。示例：`"agent-request-1"`。 |

### 请求示例

```http
POST /?Action=ArchiveAgent&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "AgentID": "agent_example"
}
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是否必返 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| ResponseMetadata | object | 是 | — | 公共响应元信息，字段定义见[公共 ResponseMetadata](conventions.md#响应元信息)。 |
| Result | object | 是 | — | 业务结果。成功时返回，失败时省略。字段定义见[公共对象](#harness-object)。 |

### 响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "req_example",
    "Action": "ArchiveAgent",
    "Version": "2025-10-30",
    "Service": "ma",
    "Region": "cn-beijing"
  },
  "Result": {
    "AgentID": "agent_example",
    "Type": "shared-runtime",
    "Name": "文档助手",
    "AgentVersion": 1,
    "Description": "文档示例",
    "Model": {
      "Id": "example-model",
      "BaseUrl": "https://ark.cn-beijing.volces.com/api/v3",
      "Effort": null,
      "Speed": "standard",
      "InferenceGeo": null
    },
    "AgentLoop": "adk",
    "System": "请用中文回答。",
    "Tools": [],
    "McpServers": [],
    "Skills": [],
    "Metadata": {
      "purpose": "documentation"
    },
    "CreatedAt": "2026-10-12T08:00:00Z",
    "UpdatedAt": "2026-10-12T08:00:00Z",
    "ArchivedAt": "2026-10-12T08:00:00Z",
    "KnowledgeContexts": [],
    "WorkspaceId": "workspace-example",
    "Status": "Archived"
  }
}
```

### 使用说明

固定字段使用 PascalCase，未知顶层字段返回 InvalidParameter.UnknownField。自定义键值仅在 Metadata 内传入；AdditionalFields 只读兼容历史快照。

- 归档后返回当前对象；ArchivedAt 为首次归档时间。
- 重复归档保留该时间和版本，不物理删除对象。
- 归档对 Session 的影响见[版本、归档与 Session](#harness-versions)。
- 非空 ClientToken 启用账号与 Action 隔离的幂等重放；同令牌不同参数返回 409 IdempotentParameterMismatch。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="deleteagent-top"></a>

## DeleteAgent

删除 Agent。

```http
POST /?Action=DeleteAgent&Version=2025-10-30
```

### 请求参数

| 参数 | 类型 | 是否必传 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| AgentID | string | 是 | — | Agent ID。同账号非空 ID。示例：`"agent_example"`。 |
| ClientToken | string | 否 | 不启用幂等重放 | 幂等令牌。非空时为 1～64 个可打印 ASCII 字符（不含空格）。示例：`"agent-request-1"`。 |

### 请求示例

```http
POST /?Action=DeleteAgent&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "AgentID": "agent_example"
}
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是否必返 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| ResponseMetadata | object | 是 | — | 公共响应元信息，字段定义见[公共 ResponseMetadata](conventions.md#响应元信息)。 |
| Result | object | 是 | — | 业务结果。成功时返回，失败时省略。子字段在本表下方逐项列出。 |
| Result.AgentID | string | 是 | — | 已删除的 Agent ID。与请求中的 `AgentID` 相同。示例：`"agent_example"`。 |

### 响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "req_example",
    "Action": "DeleteAgent",
    "Version": "2025-10-30",
    "Service": "ma",
    "Region": "cn-beijing"
  },
  "Result": {
    "AgentID": "agent_example"
  }
}
```

### 使用说明

固定字段使用 PascalCase，未知顶层字段返回 InvalidParameter.UnknownField。自定义键值仅在 Metadata 内传入；AdditionalFields 只读兼容历史快照。

- 软删除当前 Agent；Get、List 和历史版本接口随后均返回不可见或 404，不删除已保存的版本快照，也不影响已创建 Session 固定的配置快照。
- 无需先归档。
- 未使用 ClientToken 时，成功删除后再次删除同一 ID 返回 404；原 token 同参重放返回首次删除结果。
- 非空 ClientToken 启用账号与 Action 隔离的幂等重放；同令牌不同参数返回 409 IdempotentParameterMismatch。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="listagentversions-top"></a>

## ListAgentVersions

列出 Agent 历史版本。

```http
GET /?Action=ListAgentVersions&Version=2025-10-30
POST /?Action=ListAgentVersions&Version=2025-10-30
```

### 请求参数

| 参数 | 类型 | 是否必传 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| AgentID | string | 是 | — | Agent ID。同账号非空 ID。示例：`"agent_example"`。 |
| MaxResults | integer | 否 | `100` | 每页条数。正整数 1～100；省略或 0 按 100；负数、超过 100 或非整数返回 400。示例：`100`。 |
| NextToken | string | 否 | 首屏 | 分页游标。首屏省略；原样传入 NextToken，不得与其他接口的游标混用；无效 Base64 或空解码值返回 400。示例：`""`。 |
| ProjectName | string | 否 | 不按项目筛选 | 未指定 Workspace 时的项目名。示例：`"project-example"`。 |
| WorkspaceId | string | 否 | 空 | Workspace 选择器，受 Workspace 开关控制。可选字符串，去首尾空白；兼容 `workspace_id`。示例：`"workspace-example"`。 |

### 请求示例

```http
POST /?Action=ListAgentVersions&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "AgentID": "agent_example",
  "MaxResults": 100,
  "WorkspaceId": "workspace-example"
}
```

**GET 查询示例**

```http
GET /?Action=ListAgentVersions&Version=2025-10-30&AgentID=agent_example&MaxResults=100 HTTP/1.1
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是否必返 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| ResponseMetadata | object | 是 | — | 公共响应元信息，字段定义见[公共 ResponseMetadata](conventions.md#响应元信息)。 |
| Result | object | 是 | — | 业务结果。成功时返回，失败时省略。子字段在本表下方逐项列出。 |
| Result.Items | object[] | 是 | — | 数据。结果数组；没有匹配项时为 []。字段定义见[公共对象](#harness-object)。 |
| Result.NextToken | string | 是 | — | 下一页游标。有下一页时返回游标，下次请求原样传入 NextToken；没有下一页时为 null。示例：`""`。 |

### 响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "req_example",
    "Action": "ListAgentVersions",
    "Version": "2025-10-30",
    "Service": "ma",
    "Region": "cn-beijing"
  },
  "Result": {
    "Items": [
      {
        "AgentID": "agent_example",
        "Type": "shared-runtime",
        "Name": "文档助手",
        "AgentVersion": 1,
        "Description": "文档示例",
        "Model": {
          "Id": "example-model",
          "BaseUrl": "https://ark.cn-beijing.volces.com/api/v3",
          "Effort": null,
          "Speed": "standard",
          "InferenceGeo": null
        },
        "AgentLoop": "adk",
        "System": "请用中文回答。",
        "Tools": [],
        "McpServers": [],
        "Skills": [],
        "Metadata": {
          "purpose": "documentation"
        },
        "CreatedAt": "2026-10-12T08:00:00Z",
        "UpdatedAt": "2026-10-12T08:00:00Z",
        "ArchivedAt": null,
        "KnowledgeContexts": [],
        "WorkspaceId": "workspace-example",
        "RuntimeId": "r-example",
        "EnvironmentId": "env_example",
        "Status": "Active"
      }
    ],
    "NextToken": null
  }
}
```

### 使用说明

固定字段使用 PascalCase，未知顶层字段返回 InvalidParameter.UnknownField。自定义键值仅在 Metadata 内传入；AdditionalFields 只读兼容历史快照。

- 返回历史版本数组，按版本号降序；对象不存在或跨账号时返回 404 InvalidHarness.NotFound；对象存在但首屏没有历史快照时返回空数组。
- 游标使用方式见[分页](#harness-pagination)。
- 同一 Action/协议 Version 支持 GET 和 POST；GET 业务参数全部放在查询串，POST 支持 JSON 正文或查询串，不能在两处重复提供同一业务字段。
- 字段名区分大小写，重复查询键、非法整数/布尔值及 GET 正文返回 400。
- 两种方法使用相同账号认证、授权、校验、分页、成功与错误响应。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<!-- api-contracts:end -->
