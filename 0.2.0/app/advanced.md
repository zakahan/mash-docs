# 高级配置与环境变量

在 AgentKit 的 Runtime 环境变量里设置下列参数。镜像启动器先按组件开关选择进程，Harness App 再组装默认 Harness Agent、会话服务和已启用的能力。调整部署配置后，让新的 Runtime 实例使用更新后的环境。对单轮消息生效的字段见[调用配置](config.md)。

## Harness App 开关

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `HARNESS_APP_ENABLED` | `true` | 在 Runtime 中启动 Harness App。接受 true 或 false，忽略大小写和首尾空白。 |

共享镜像至少启用一个组件。普通 HTTP 请求路由到 Harness App；在代理运行且 Harness App 被关闭时，访问该目标返回 503。

## 配置工具控制面

配置 AgentKit 沙箱、按 ID 引用 MCP 工具集或访问 Skill Space 时，Runtime 会向 Tool 控制面发起签名请求。签名中的服务名和实际连接的域名是两个参数。服务名用于请求签名，主机名决定请求发往哪里；修改其中一项不会自动保证另一项与目标入口匹配。

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `AGENTKIT_TOOL_SERVICE_CODE` | `agentkit` | Tool 控制面的签名服务名。 |
| `AGENTKIT_TOOL_HOST` | 按客户端和地域推导 | Tool 控制面主机名。跨环境时显式指定。 |
| `REGION` | 未设置 | MCP 查询在未指定工具地域时读取的回退地域。 |
| `AGENTKIT_TOOL_REGION` | 依客户端与云环境 | 工具所在地域；MCP 工具集查询可回退到 REGION，再取 cn-beijing。 |

### 默认入口

在火山引擎环境中，不设置这组变量且地域使用默认的 `cn-beijing` 时，服务名为 `agentkit`，主机名为 `agentkit.cn-beijing.volcengineapi.com`。显式设置工具地域后，默认主机名按服务名和地域推导；自定义服务名不一定能直接作为域名前缀，因此自定义入口建议同时填写两项。

北京地域示例：

| 目标环境 | `AGENTKIT_TOOL_SERVICE_CODE` | `AGENTKIT_TOOL_HOST` |
|---|---|---|
| 生产 | `agentkit`（默认） | `agentkit.cn-beijing.volcengineapi.com` |

例如为北京地域的 MCP 工具集设置：

```dotenv
AGENTKIT_TOOL_REGION=cn-beijing
AGENTKIT_TOOL_SERVICE_CODE=agentkit
AGENTKIT_TOOL_HOST=agentkit.cn-beijing.volcengineapi.com
MCP_TOOLSET_ID=<本环境的工具集 ID>
```

### 自定义入口

从目标服务的部署配置取得签名服务名、控制面主机名和地域，再设置：

```dotenv
AGENTKIT_TOOL_REGION=<目标地域>
AGENTKIT_TOOL_SERVICE_CODE=<目标入口要求的签名服务名>
AGENTKIT_TOOL_HOST=<目标控制面主机名>
```

`AGENTKIT_TOOL_HOST` 只填写主机名，不带 `https://` 或请求路径；这里不需要修改操作系统的 hosts 文件。`AGENTKIT_TOOL_SERVICE_CODE` 必须与目标入口的签名配置一致，不能仅从域名猜测。更新 Runtime 环境变量后，让新实例加载配置，并使用同一目标环境下有权限访问的工具或技能资源验证调用。

- 变量名只有一段 `AGENTKIT_` 前缀。v0.2.0 的 Harness 工具调用读取 **`AGENTKIT_TOOL_SERVICE_CODE`**；写成 `AGENTKIT_AGENTKIT_TOOL_SERVICE_CODE` 时，此处仍按有效变量或默认值签名。
- `AGENTKIT_TOOL_HOST` 填主机名。默认地址由各客户端根据服务名、地域和云环境拼接。使用自定义入口时，应按部署配置填写匹配的服务名和主机名。切换模型的 API 地址使用另一组模型参数。
- `AGENTKIT_TOOL_REGION` 选工具所在地域。MCP 工具集查询依次取该变量、`REGION`、`cn-beijing`。Skill Space 和 AIO 沙箱在 BytePlus 环境有自己的地域和域名默认值。显式指定 region 和 host 可让多个客户端指向同一环境。
- MCP 工具集查询使用 Runtime IAM 身份调用 `GetMCPToolset`，再连接返回的工具集地址。沙箱控制面支持 Runtime IAM 或临时云凭据。切换服务名和主机时，所引用的资源 ID 与调用身份也应属于对应环境。

## 会话存储与 PostgreSQL

`SHORT_TERM_MEMORY_TYPE` 决定用户和会话对应的历史事件存在哪里。只设置数据库地址时，该选择项仍然使用默认值 `local`。

| 后端 | 行为与配套配置 |
|---|---|
| `local` | 默认进程内存。适合短期会话；其他副本有各自的会话空间。 |
| `sqlite` | 存放在实例本地的 SQLite 文件，默认路径为 `/tmp/veadk_local_database.db`。文件生命周期取决于实例存储。 |
| `postgresql` | 使用 `DATABASE_POSTGRESQL_*` 连接共享数据库。多个副本可访问同一组会话表。 |
| `mysql` | 使用 `DATABASE_MYSQL_HOST`、`DATABASE_MYSQL_USER`、`DATABASE_MYSQL_PASSWORD`、`DATABASE_MYSQL_DATABASE`。自定义端口可写入 `HOST` 的 `host:port`。 |

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `SHORT_TERM_MEMORY_TYPE` | `local` | 选择上表所列的会话后端。 |
| `DATABASE_MYSQL_HOST` | 空 | MySQL 主机，自定义端口可写成 host:port。 |
| `DATABASE_MYSQL_USER` | 空 | MySQL 用户名。 |
| `DATABASE_MYSQL_PASSWORD` | 空 | MySQL 密码。 |
| `DATABASE_MYSQL_DATABASE` | 空 | 保存会话的 MySQL 数据库名。 |
| `DATABASE_POSTGRESQL_HOST` | 空 | 数据库主机，可含端口。 |
| `DATABASE_POSTGRESQL_PORT` | 5432 | 主机未指定端口时使用。 |
| `DATABASE_POSTGRESQL_USER` | 空 | 数据库用户名。 |
| `DATABASE_POSTGRESQL_PASSWORD` | 空 | 数据库连接密码。 |
| `DATABASE_POSTGRESQL_DATABASE` | 空 | 共享会话数据库名。 |
| `DATABASE_POSTGRESQL_SCHEMA` | 空 | 可选的会话表 schema。 |

### 为多个副本配置同一份会话历史

```dotenv
SHORT_TERM_MEMORY_TYPE=postgresql
DATABASE_POSTGRESQL_HOST=db.example.com
DATABASE_POSTGRESQL_PORT=5432
DATABASE_POSTGRESQL_USER=harness_app
DATABASE_POSTGRESQL_PASSWORD=<由 Runtime 注入的数据库密码>
DATABASE_POSTGRESQL_DATABASE=agent_sessions
DATABASE_POSTGRESQL_SCHEMA=harness_app
```

连接参数填实际主机、用户名、密码和数据库名；端口默认 `5432`。如果主机值已经写成 `host:port`，其中的端口优先。`DATABASE_POSTGRESQL_SCHEMA` 是可选项，默认留空，使用数据库连接的默认 schema。显式指定时仅允许字母、数字、下划线，首字符为字母或下划线。后端执行 `CREATE SCHEMA IF NOT EXISTS`，并在事务中设置和验证 `search_path`。数据库账号需要相应的建表和 schema 权限。同一个应用的副本应指向相同数据库和 schema；切换后端或 schema 时，需要另行处理已有历史的迁移。

启动时 Harness App 使用 PostgreSQL advisory lock 协调 ADK 会话表初始化，等待锁默认最多 60 秒。实例连接不到指定的共享库或锁超时时，启动失败，便于在接收业务流量前发现配置问题。

### 连接池

以下数值按**每个服务进程**配置，适用于 PostgreSQL 和 MySQL 会话后端。规划连接数时应考虑副本数。例如 4 个进程均使用默认值时，这些会话连接池允许的并发连接合计上限为 `4 × (5 + 3) = 32`，还需给初始化连接和其他业务预留容量。

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `HARNESS_SESSION_DB_POOL_SIZE` | 5 | 池内可保留的连接数。允许范围为 1–100。 |
| `HARNESS_SESSION_DB_MAX_OVERFLOW` | 3 | 池满后额外允许的连接数。允许范围为 0–100。 |
| `HARNESS_SESSION_DB_POOL_TIMEOUT_SECONDS` | 10 秒 | 等待可用连接的时限。允许范围为 1–120。 |
| `HARNESS_SESSION_DB_POOL_RECYCLE_SECONDS` | 300 秒 | 借出连接时检查的连接回收年龄。允许范围为 30–3600。 |

## 模型、指令与单轮预算

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `RUNTIME` | `adk` | `adk`。请求模型也声明了 `codex` 后端；实际可用能力取决于该后端。下文 AIO 和托管模型配置适用于 ADK。 |
| `MODEL_NAME` | 空 | 推理模型名称；直接凭据模式下可由 VeADK 的模型配置解析。 |
| `MODEL_PROVIDER` | `openai` | 模型提供方。 |
| `MODEL_API_BASE` | 空 | 模型服务的请求地址，托管模型身份模式下必填。 |
| `MODEL_API_KEY` | 空 | 注入直接访问模型所需的密钥。启用 `obo_broker` 身份换取模式时应留空。 |
| `SYSTEM_PROMPT` | 空 | 部署级系统指令。 |
| `DESCRIPTION` | 空 | 部署级 Agent 描述。 |
| `MAX_LLM_CALLS` | 未设置 | 本轮可发起的最大模型调用次数，正整数，默认留空并沿用底层设置。兼容调用依次使用 `run_agent_request.max_llm_calls`、`harness.max_llm_calls`、部署默认值。工具执行后的下一次模型推理也占用调用预算。 |
| `STRUCTURED_TOOL_CALLS` | false | 启用结构化工具调用。 |
| `INCLUDE_TOOLS_EVERY_TURN` | true | 每轮向模型提供工具定义。 |
| `HARNESS_NAME` | `harness_app` | 配置默认 Harness 的名称，也用来组装部署级知识库或长期记忆的应用名。客户端创建会话时，应用名以 `GET /list-apps` 返回值为准。 |

在支持请求级覆盖的入口，Runtime 从部署 Harness Agent 克隆本次调用使用的 Harness Agent，只应用显式提供的覆盖字段。仅在这次请求需要另一组工具时，参考[调用配置](config.md)和[运行时接口](../api/app.md)。

## 工具、技能和 AIO 沙箱

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `TOOLS` | 空 | 内置工具名称，多个用逗号分隔。组装时逐个解析，无法加载的工具记入日志并跳过。 |
| `MCP_TOOLSET_ID` | 空 | 指向 AgentKit 工具集；由 Runtime 身份查询网关信息。 |
| `MCP_SERVERS` | 空列表 | JSON 数组，每项填写 `endpoint` 与可选 `protocol`（默认 `streamable-http`，另支持 `sse`）。有认证的服务还可配置 `api_key` 以及 `api_key_header`（`Authorization` 或 `X-Api-Key`）。 |
| `SKILLS` | 空 | 逗号分隔的技能引用。在普通模式可使用 Skill Hub slug、空间 ID、空间内技能引用。AIO 模式接受 `ss-...` 或 `ss-...:s-...`。 |
| `SKILL_HUB_DOWNLOAD_URL` | `https://skills.volces.com/v1/skills/download` | Skill Hub 下载地址前缀，运行时在末尾追加技能名。 |
| `REGISTRY_TYPE` | 空 | 设为 `agentkit_a2a` 启用注册中心搜索与任务工具。 |
| `REGISTRY_SPACE_ID` | 空 | 注册中心的目标空间。 |
| `REGISTRY_ENDPOINT` | 空 | 覆盖注册中心的访问地址。 |
| `REGISTRY_REGION` | 空 | 覆盖注册中心的访问地域。 |
| `REGISTRY_TOP_K` | 3 | 搜索返回的最大条目数，最小为 1。 |

### 指定工具执行的沙箱

ADK 选择沙箱 Tool 后提供 `Execute`、`ReadFile`、`EditFile` 和 `WriteFile`。首次实际执行沙箱工具时才创建沙箱。Tool ID 的读取顺序是本次请求的 `harness.sandbox.tool_id`、部署的 `HARNESS_SANDBOX_TOOL_ID`、部署的 `AGENTKIT_TOOL_ID`。

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `HARNESS_SANDBOX_TOOL_ID` | 空 | 选择部署使用的沙箱 Tool，本轮请求可覆盖。 |
| `AGENTKIT_TOOL_ID` | 空 | 部署未指定 Harness 沙箱 Tool 时的回退值。 |
| `HARNESS_SANDBOX_TOOL_ID_ALLOWLIST` | 空 | 逗号分隔的允许列表，用于校验传入的请求级 Tool ID。 |
| `VEADK_AIO_WORKSPACE` | `/home/gem` | 使用沙箱内已存在的绝对目录。 |
| `VEADK_AIO_SESSION_TTL_SECONDS` | 28800 秒 | 请求级 `harness.sandbox.ttl` 可覆盖，允许 60–86400 秒。 |
| `SANDBOX_API_KEY` | 空 | 可选，沙箱数据面需要时提供。 |
| `VEADK_AIO_STORE_URL` | 本地 SQLite | 默认 SQLite 文件位于 `~/.veadk/aio/lifecycle.db`。跨副本共享沙箱控制面限流状态时，填写共同的 `postgresql+psycopg2://...` 地址。 |

AIO 限流库与前述 ADK 会话数据库各自配置。沙箱绑定保存在服务进程内；共享 ADK 会话库可恢复对话历史，跨副本复用原沙箱还涉及会话粘性路由。同一对话变更沙箱 Tool 或 Skill Space 时需要新建会话。

## 知识库与长期记忆

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `KNOWLEDGEBASE_TYPE` | 空 | 选择知识检索后端；留空时跳过部署级知识库的创建。 |
| `LONG_TERM_MEMORY_TYPE` | 空 | 选择长期记忆后端；留空时跳过部署级长期记忆的创建。 |
| `HARNESS_KB_CACHE_SIZE` | 64 | 缓存的知识库实例数上限，按后端与索引区分。必须为正整数；使用中的实例持有租约，待释放后可回收。 |

后端从部署配置读取连接参数和凭据。本轮调用可通过 `harness.knowledgebase.index` 和 `harness.knowledgebase.type` 选择索引和后端。

## 共享身份与托管模型

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `AGENTKIT_HARNESS_IDENTITY_ENABLED` | false | 启用共享身份验证。 |
| `AGENTKIT_HARNESS_IDENTITY_RUNTIME_ID` | 空 | 身份绑定的 Runtime ID。启用身份且尚未绑定时，服务只提供引导健康路由。 |
| `AGENTKIT_HARNESS_IDENTITY_DISCOVERY_URL` | 空 | 身份验证的发现地址，绑定后必填。 |
| `AGENTKIT_HARNESS_IDENTITY_ISSUER` | 空 | 期望的身份签发方，绑定后必填。 |
| `AGENTKIT_HARNESS_IDENTITY_ALLOWED_CLIENTS` | 空 | 允许的客户端标识，逗号分隔，绑定后至少填写一个。 |

### 托管模型凭据

使用 `obo_broker` 需要 ADK 后端、有效的 Runtime 身份和显式的模型名称、提供方与地址。

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `MODEL_CREDENTIAL_MODE` | 空 | 设为 `obo_broker` 时，通过当前身份换取模型凭据。 |
| `MODEL_TARGET_ALIAS` | 未设置 | 受保护模型目标的别名，托管模型身份校验要求显式填写。 |
| `MODEL_TARGET_AUDIENCE` | 未设置 | 模型目标的 audience，托管模式必填。 |
| `MODEL_WORKLOAD_DISCOVERY_URL` | 未设置 | 工作负载身份发现地址，托管模式必填。 |
| `MODEL_WORKLOAD_ISSUER` | 未设置 | 工作负载身份签发方，托管模式必填。 |
| `MODEL_WORKLOAD_POOL` | `default` | 工作负载身份池。 |
| `MODEL_IDENTITY_REGION` | `cn-beijing` | 模型身份服务地域。 |

### 并发与生成上限

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `HARNESS_MODEL_MAX_INFLIGHT` | 12 | 单进程并发，范围 1–1000。 |
| `HARNESS_MODEL_MAX_INFLIGHT_PER_USER` | 1 | 单用户并发，范围 1–100。 |
| `HARNESS_MODEL_QUEUE_TIMEOUT_SECONDS` | 45 秒 | 排队时限，范围 1–600。 |
| `HARNESS_MODEL_REQUEST_TIMEOUT_SECONDS` | 120 秒 | 单次请求时限，范围 1–900。 |
| `HARNESS_MODEL_MAX_OUTPUT_TOKENS` | 1024 | 生成上限，范围 128–16384。 |

共享身份模式对 POST、PUT、PATCH 有 128 KiB 请求体限制，客户端需提供有效的 `Content-Length`。缺少有效长度返回 411，超限返回 413。

## 产物与定时任务

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `HARNESS_ARTIFACT_ADK_ENABLED` | false | 启用 ADK 产物存储。 |
| `HARNESS_ARTIFACT_ADK_MAX_FILE_BYTES` | 524288000 | ADK 单文件大小上限（字节）。 |
| `HARNESS_ARTIFACT_PUBLISH_ENABLED` | false | 启用文件发布工具。 |
| `HARNESS_ARTIFACT_PUBLISH_ALLOWED_ROOTS` | 空 | 额外允许的目录，默认可读取当前会话的技能输出目录。 |
| `HARNESS_ARTIFACT_PUBLISH_MAX_FILES_PER_RUN` | 10 | 单轮可发布文件数。 |
| `HARNESS_ARTIFACT_PUBLISH_MAX_FILE_BYTES` | 104857600 | 单个发布文件上限（字节）。 |
| `HARNESS_ARTIFACT_PUBLISH_MAX_RUN_BYTES` | 524288000 | 单轮发布总量上限（字节）。 |
| `HARNESS_ARTIFACT_TOS_BUCKET` | 空 | 产物桶名，启用任一产物来源时必填。 |
| `HARNESS_ARTIFACT_TOS_REGION` | 空 | 产物桶地域，启用时必填。 |
| `HARNESS_ARTIFACT_TOS_PREFIX` | 空 | 对象前缀，启用时必填。 |
| `HARNESS_ARTIFACT_TOS_ENDPOINT` | 按地域推导 | 自定义对象存储端点。 |
| `HARNESS_ARTIFACT_MAX_SESSION_BYTES` | 2147483648 | 单会话产物总量上限（字节）。 |
| `HARNESS_ARTIFACT_LINK_TTL_SECONDS` | 604800 | 下载链接有效期（秒），允许 60–604800。 |
| `HARNESS_CRONJOB_ENABLED` | false | 在服务身份、直接模型凭据模式下启用调度器。 |
| `HARNESS_CRONJOB_TOS_BUCKET` | 空 | 调度任务存储桶，启用时必填。 |
| `HARNESS_CRONJOB_TOS_REGION` | 空 | 调度存储地域，启用时必填。 |
| `HARNESS_CRONJOB_TOS_PREFIX` | 空 | 任务与执行记录的对象前缀，启用时必填。 |
| `HARNESS_CRONJOB_CONCURRENCY` | 8 | 调度并发数。 |
| `HARNESS_CRONJOB_LEASE_SECONDS` | 60 | 执行租约时长（秒）。 |
| `HARNESS_CRONJOB_POLL_SECONDS` | 5 | 调度轮询间隔（秒）。 |

如需关闭所有产物功能，移除整组 `HARNESS_ARTIFACT_*` 配置；设置了该组任一字段但两个来源均关闭时，应用会在配置校验时报错。定时任务使用单独的对象存储前缀与调度器，启用前确认目标 Runtime 的身份模式。

## 运行身份需要哪些 IAM 权限

先确定**谁发起云 API 调用**。例如应用向 Harness App 发送消息后，若 Agent 引用了 `MCP_TOOLSET_ID`，运行时会使用自己的身份调用 `GetMCPToolset`，随后连接返回的 MCP 地址。前一步需要给 Runtime 的执行角色授权，后一步使用工具服务要求的认证。直接填写 `MCP_SERVERS` 地址时可以省去工具集查询。

| 已启用的能力 | 执行角色涉及的 Action | 触发时机 |
|---|---|---|
| 按 ID 连接 MCP 工具集 | `agentkit:GetMCPToolset` | 发现工具时查询服务地址和连接信息。 |
| Skill Space | `agentkit:ListSkillsBySpaceId` | 从空间选择技能或准备沙箱技能。只挂载已有技能的路径无需创建技能。 |
| AIO 沙箱 | `agentkit:CreateSession`、`agentkit:GetSession`、`agentkit:ListSessions` | 创建沙箱会话、查询其状态及回查已有会话。这里的 Session 是工具沙箱资源。 |
| 沙箱内 Skill 下载（临时 URL 方案） | `agentkit:ListSkillsBySpaceId`、`agentkit:GenTempTosObjectDownloadUrl`；空列表诊断分支可用 `agentkit:GetSkillSpace` | 沙箱加载器使用本次加载获得的临时身份查询、下载技能。实际下载授权取决于沙箱镜像的加载器。 |
| A2A 注册中心搜索 | `agentkit:SearchAgentCards` | Agent 使用已配置的注册中心搜索工具时。直接调用已知 A2A 地址走该服务自身的认证。 |
| 网页搜索、APMPlus | `volc_torchlight_api:WebSearch`、`apmplus_server:GetAppKey` | 分别对应使用云端网页搜索和通过云 API 获取观测服务 AppKey。按实际启用项选择。 |
| TOS 产物 | 桶级 `tos:HeadBucket`、`tos:ListBucket`；对象级 `tos:GetObject`、`tos:PutObject`、`tos:DeleteObject` | 初始化检查桶、列出和读写产物；清理或删除对象的路径需要删除权限。定时任务使用单独的存储前缀，应对相应桶和前缀授权。 |

文件操作与 Bash 命令通过已分配沙箱的 Endpoint 执行。这段数据面调用使用沙箱网关要求的认证，无需为每次文件操作调用 AgentKit 控制面的 InvokeTool。[调用沙箱](sandbox.md)

### 策略示例：已有 MCP 工具集和产物桶

下面示例供同一个 Harness App 读取已有 MCP 工具集，并在桶 `agentkit-platform-example` 的 `harness/` 前缀下管理产物。替换为本环境实际的桶和前缀。仅启用 MCP 工具集时，取第一条 Statement 即可。桶级授权作用于桶，文件操作作用于对象路径；配置中的 TOS 前缀应与授权路径一致。[TOS 策略与资源范围](https://docs.volcengine.com/docs/torch-object-storage/access-control-iam-policy?lang=zh)

```json
{
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["agentkit:GetMCPToolset"],
      "Resource": ["*"]
    },
    {
      "Effect": "Allow",
      "Action": ["tos:HeadBucket", "tos:ListBucket"],
      "Resource": ["trn:tos:::agentkit-platform-example"]
    },
    {
      "Effect": "Allow",
      "Action": ["tos:GetObject", "tos:PutObject", "tos:DeleteObject"],
      "Resource": ["trn:tos:::agentkit-platform-example/harness/*"]
    }
  ]
}
```

### 平台集成与资源预置权限

已有的平台角色策略可能还覆盖下列操作。配置角色前，按实际 SDK、认证方式与资源准备流程确认调用方；把相应语句放到执行该操作的角色上。

| 操作范围 | 策略中常见的 Action | 角色与适用条件 |
|---|---|---|
| 方舟模型密钥与端点管理 | `ark:GetApiKey`、`ark:ListApiKeys`、`ark:GetRawApiKey`、`ark:GetEndpoint`、`ark:DescribeModelEndpoints` | 按所用模型凭据解析器或端点管理流程授权，直接注入模型 API Key 时调用模型使用该凭据。Worker 按 Key Name 取密钥的链路见 [Worker 配置](../managed/config.md)。 |
| 平台资源发现与管理 | `agentkit:GetA2aAgent`、`agentkit:ListA2aSpaces`、`agentkit:GetTool`、`agentkit:InvokeTool`、`agentkit:GetSkillInfo`、`agentkit:CreateSkill` | 对应资源查询、调用或创建方。部署阶段创建 Skill 的身份和运行阶段读取 Skill 的身份可各自授权。 |
| 记忆、身份和知识库集成 | `mem0:Get*`、`mem0:List*`、`mem0:Describe*`；`id:Get*`、`id:List*`、`id:Check*`；`ml_platform:GetCollectionInfo`、`ml_platform:SearchKnowledge`、`ml_platform:AddDoc` | 根据选用的后端确定读写范围。只检索已有知识库时应单独核对查询权限；写入文档的流程再考虑 AddDoc。通配项属于平台策略示例，实际授权可按调用收窄。 |
| 准备 TOS 桶与浏览器访问 | `tos:CreateBucket`、`tos:PutBucketCORS` | 由建桶和配置跨域规则的预置流程使用；Harness App 使用已经准备好的产物桶。 |
