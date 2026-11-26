---
toc_max_heading_level: 2
---
# Env 管理接口

本页收录环境管理、镜像构建与 Devbox 实例操作。取得 `EnvironmentId` 后，可在 [Harness 管理接口](harness.md) 中设置默认环境，也可在[创建托管会话](session.md#createagentsessionrest)时指定环境。各 Action 的适配与验证状态见对应小节。

<!-- api-contracts:start -->
<a id="全字段参考"></a>

接口的请求参数、嵌套字段和响应示例均在本页列出。认证方式见[调用约定](conventions.md#认证与请求地址)。

统一响应中的 `ResponseMetadata` 复用[公共字段定义](conventions.md#响应元信息)，本页只展开各接口的业务结果。

| 接口 | 分面 | 功能 |
| --- | --- | --- |
| [CreateEnvironment](#createenvironment-top) | 控制面 | 创建环境 |
| [CreateEnvironmentWithImageBuild](#createenvironmentwithimagebuild-top) | 控制面 | 创建 EnvironmentWithImageBuild |
| [GetEnvironmentBuildStatus](#getenvironmentbuildstatus-top) | 控制面 | 查询 EnvironmentBuildStatus |
| [CreateDevboxInstance](#createdevboxinstance-top) | 控制面 | 创建 DevboxInstance |
| [ExecuteDevboxInstanceCommand](#executedevboxinstancecommand-top) | 控制面 | ExecuteDevboxInstanceCommand |
| [GetDevboxInstanceCommandResult](#getdevboxinstancecommandresult-top) | 控制面 | 查询 DevboxInstanceCommandResult |
| [GetDevboxInstance](#getdevboxinstance-top) | 控制面 | 查询 DevboxInstance |
| [ListDevboxInstances](#listdevboxinstances-top) | 控制面 | 列出 DevboxInstances |
| [StartDevboxInstance](#startdevboxinstance-top) | 控制面 | StartDevboxInstance |
| [StopDevboxInstance](#stopdevboxinstance-top) | 控制面 | StopDevboxInstance |
| [RebootDevboxInstance](#rebootdevboxinstance-top) | 控制面 | RebootDevboxInstance |
| [DeleteDevboxInstance](#deletedevboxinstance-top) | 控制面 | 删除 DevboxInstance |
| [GetEnvironment](#getenvironment-top) | 控制面 | 查询环境 |
| [ListEnvironments](#listenvironments-top) | 控制面 | 列出环境 |
| [UpdateEnvironment](#updateenvironment-top) | 控制面 | 更新环境 |
| [DeleteEnvironment](#deleteenvironment-top) | 控制面 | 删除环境 |

控制面固定字段使用 PascalCase，分页使用 MaxResults/NextToken。

<a id="environment-errors"></a>

## 常见错误码

错误响应统一格式见[公共错误响应](conventions.md#错误响应)。下列错误涵盖常用请求校验、资源状态与幂等冲突；依赖服务失败还可能返回 5xx。

| 错&#8288;误&#8288;码 | 触&#8288;发&#8288;条&#8288;件&#8288;与&#8288;处&#8288;理 |
| --- | --- |
| `MissingParameter.<字段>` | 缺少必传字段或必传字符串为空，补齐后重试。 |
| `InvalidParameter.<字段>` | 参数格式、枚举或资源配置不合法；按字段表修正。 |
| `InvalidParameter.Body` | 正文不是有效对象或字段类型不匹配；检查 JSON。 |
| `InvalidParameter.NextToken` | 游标无效，或账号、接口、筛选条件与上一页不一致；保持筛选条件或重新从首屏查询。 |
| `InvalidParameterCombination` | 归档状态更新与其他修改字段同时提供；拆分请求。 |
| `OperationDenied.CloudConfigUpdate` | 为 Cloud 环境提交 Config 对象更新；通过资源组接口更新支持的规格。 |
| `OperationDenied.EnvironmentTypeImmutable` | 修改环境配置 Type；类型不可变，需要新建环境。 |
| `OperationDenied.EnvironmentHasSessions` | 删除环境时仍有会话；先删除关联会话。 |
| `OperationDenied.DeleteEnvironmentResourceFirst` | 删除 SelfHosted 环境时仍有关联资源组；先删除资源组。 |
| `InvalidEnvironment.NotFound` | 环境不存在、已删除或不属于当前账号；核对 ID 与账号。 |
| `IdempotentParameterMismatch` | 同账号、同接口、同 ClientToken 的请求参数改变；恢复原请求。 |
| `OperationInProgress` | 同幂等键的原请求尚未完成，或 Cloud 环境关联资源仍在创建/更新；稍后用原 ClientToken 重试。删除因资源创建/更新被拒绝时，环境保持未归档，token 不会固化为失败。 |
| `IdempotencyResultUncertain` | 原请求结果暂不能确认；先查询资源，避免直接换 token 重建。 |
| `ClientTokenExpired` | 幂等结果快照超过 24 小时；先查询确认实际结果，再决定后续操作。 |

| 补&#8288;充&#8288;错&#8288;误&#8288;码 | 触&#8288;发&#8288;条&#8288;件 |
| --- | --- |
| `InvalidRequest` | 嵌套环境配置、软件包声明或部署安装能力不支持所提供参数，按 Message 确认具体原因。 |
| `EndpointRequired` / `EndpointNotReady` | HTTP 409。创建专属 Cloud Tool 要求账号 Endpoint 已就绪。检查路由和 APIG 凭据引用。 |
| `DefaultImageUnavailable` | HTTP 503。省略镜像时，数据库缺少生效的 Cloud Tool 默认镜像。登记默认镜像后可用原 ClientToken 重试。改用显式镜像时提交新请求。 |
| `DefaultImageLookupFailed` | HTTP 503。默认镜像目录查询失败或镜像记录无效。保留原 ClientToken 对应的幂等占位。 |
| `RuntimePackagesRequireDedicatedTool` | 账号只使用共享预置执行资源，无法定制软件包安装；确认执行资源配置后再提交 Packages。 |
| AgentKit 拒绝码（HTTP 400） | Cloud 环境取得 ToolID 前收到 AgentKit 明确拒绝时，保留实际 HTTP 状态、Code 和脱敏原因。ToolID 持久化后即成功返回，不等待 Tool Ready；之后启动失败通过 GetEnvironment 的 Failed/StatusMessage 和 GetEnvironmentResource 查询，保留资源组、环境与 Tool 现场。成功创建的 ClientToken 重放首次受理快照，不重新创建，也不代表当前已就绪；使用 Get 查询当前状态。 |

<a id="environment-idempotency"></a>

## 幂等与状态注意事项

ClientToken 的格式、24 小时结果快照、重放及重试规则见[公共幂等规则](conventions.md#幂等调用)。

新建 Cloud 自动创建 EnvironmentResource，等待 Tool 就绪后返回 Active，并保存内部执行绑定。Environment 的 Status 反映关联 AgentKit Tool 资源的准备状态：Creating、Updating、Failed、Deleting、DeleteFailed；只有关联资源 ready 或没有受管资源组时返回 Active。Archived 优先于准备状态。具体失败原因仍通过资源组及 LastOperation 查询。未就绪资源继续阻止创建新 Session。

<a id="environment-capabilities"></a>

## 环境类型、网络与安装能力

**Config.Networking 仅保存，不执行网络策略。** Cloud 的公网/私网控制使用 `Config.AgentKit.Networking`；SelfHosted 的网络和安装过程由用户机器与执行器管理。不能因为返回了 `Networking.Type=limited` 或 `AllowedHosts` 就认为访问已受限。

| Cloud 网&#8288;络&#8288;配&#8288;置 | 实&#8288;际&#8288;默&#8288;认&#8288;与&#8288;校&#8288;验 |
| --- | --- |
| 省略或 null `AgentKit.Networking` | 启用公网，禁用私网。 |
| 提供 `Networking` 对象，省略 `EnablePublicNetwork` | 公网为 false，不沿用“整个对象省略”的 true 默认。 |
| 显式对象的公网和私网都未启用 | 返回 InvalidRequest。空对象 `{}` 也会被拒绝。 |
| `EnablePrivateNetwork=true` | 必须同时提供非空 VpcId 和 1～10 个非空 SubnetIds；不能在未启用私网时传 VpcConfiguration。 |

**SelfHosted 的 CPU、内存、镜像、Packages 和 InitScript 仅作为配置声明保存；不支持固定 TOS 挂载。** `Storage.TosInput` 已移除，携带即返回 400 未知字段错误；`Storage.TosMounts` 为历史占位字段，任何类型非空均返回 400 `InvalidRequest`（提示当前运行时不支持存储挂载），省略/null/空列表允许，SelfHosted 也不再保存无效声明。更新 Config 的 patch 可省略 Type，仍按锁定的实际环境类型校验。本接口不会部署用户执行器或调整用户机器资源。查询对已有 Resources 对象补齐的 2000/4096 默认数字不等于资源已分配；Config.Resources 整体省略时查询也可省略该对象。

Cloud 的 Packages 由服务安装能力决定：镜像模式在创建时构建镜像；启动安装模式在每次 Sandbox 创建或替换时安装，默认支持 pip/npm/gem/go，cargo 需服务开启，apt 不支持。调用方不能通过本 API 选择安装模式，也没有安装能力查询字段；调用前应向服务管理员确认部署启用的模式和管理器范围。启动安装模式遇到不支持的管理器或缺少执行入口时返回 `400 InvalidRequest`；账号只使用共享预置执行资源时，Packages 返回 `409 RuntimePackagesRequireDedicatedTool`。参数校验通过不代表安装完成，仍需检查执行资源与工具启动结果。

<a id="environment-update-values"></a>

## 更新字段的省略、null 与空值

下表适用于 UpdateEnvironment；没有 UpdateMask，按请求中提供的字段处理。

| 字段 | 省略 | null | 空&#8288;值&#8288;或&#8288;对&#8288;象 |
| --- | --- | --- | --- |
| Name | 保留 | 保留 | 空字符串或仅空白返回 InvalidParameter.Name。 |
| Description | 保留 | 清除 | 空字符串作为描述保存。 |
| Metadata | 保留 | 保留 | `{}` 不改已有键；按键合并，子键值 null 删除该键，空字符串保留。 |
| Config | 保留 | 保留 | Cloud 的任意对象更新（含 `{}`）均拒绝；SelfHosted 和 Cloud-ECS 按一级键合并，嵌套对象整体替换。 |
| Config.Type | 保留 | 禁止 | 只要请求携带该字段就返回 OperationDenied.EnvironmentTypeImmutable。 |
| Config.ImageId | 保留 | 禁止 | 只要请求携带该字段就返回 OperationDenied.EnvironmentImageImmutable。 |
| Config.Resources（SelfHosted/Cloud-ECS） | 保留原对象 | 保存 null，查询返回 null | `{}` 替换原资源声明，查询在对象存在时补齐默认 CPU/内存；SelfHosted 不调整实际机器规格。 |
| Status | 保留 | InvalidParameterCombination | 只能 Archived，且请求中不能出现 Name、Description、Config 或 Metadata，即使它们为 null。 |

Archived 环境仍可 Get，List 默认隐藏；不允许普通名称、描述、配置或元数据修改（按不存在返回 InvalidEnvironment.NotFound）。再次单独归档保留首次归档时间；仍可执行 DeleteEnvironment。删除前必须清理关联会话；Cloud 的资源组由环境删除流程自动清理下游组件并保留历史记录，SelfHosted 的资源组仍需先手工删除；删除成功后 Get 返回 404。

<a id="environment-official-reference"></a>

## 与 Claude Managed Agents 的关系

Claude 官方 [Cloud environment setup](https://platform.claude.com/docs/en/managed-agents/environments) 与 [Self-hosted sandboxes](https://platform.claude.com/docs/en/managed-agents/self-hosted-sandboxes) 用于对照环境、包安装和生命周期概念。Claude 官方的 limited 网络策略及其软件包网络条件在该平台生效；本服务 Config.Networking 只保存，不具备同等效果。

本页是账号签名、PascalCase、Version=2025-10-30 的 TOP 接口。CpuMilli、MemoryMb、DiskSize、AgentKit 网络开关及资源组是本服务扩展，不应当作 Claude REST 请求字段。Claude 官方 REST 的方法、路径、大小写和认证要求以官方文档为准。

<a id="environment-object"></a>

## Environment 对象

CreateEnvironment、GetEnvironment、UpdateEnvironment 的 Result 与 ListEnvironments.Result.Items 的元素复用该对象；DeleteEnvironment 返回单独的删除结果。必返列在成功正常查询或首次变更响应中适用；幂等重放返回原结果快照。

| 字段 | 类型 | 是&#8288;否&#8288;必&#8288;返 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| EnvironmentId | string | 是 | — | 环境 ID。返回该环境的环境 ID。示例：`"env_example"`。 |
| Name | string | 是 | — | 名称。返回该环境的名称。示例：`"documentation"`。 |
| Description | string | 否 | — | 描述。已设置时返回（包括空字符串）；null 或未设置时省略。示例：`"文档示例"`。 |
| Config | object | 是 | — | Sandbox 环境配置。返回该环境的环境配置。子字段在本表下方逐项列出。 |
| Config.Type | string | 是 | — | 类型标识。返回已保存的环境配置类型：Cloud、Cloud-ECS 或 SelfHosted。示例：`"Cloud-ECS"`。 |
| Config.ImageUrl | string | 否 | — | Sandbox 容器镜像地址。返回 Sandbox 使用的镜像地址；未配置时可能省略。示例：`"registry.example.com/sandbox:v1"`。 |
| Config.Resources | object | 否 | — | Sandbox 资源配置。返回保存的资源声明；对象存在时补齐 CPU/内存默认值，SelfHosted 中该返回值不代表实际资源分配。允许 `null`。子字段在本表下方逐项列出。 |
| Config.Resources.CpuMilli | integer | 是 | — | CPU 毫核数。返回 CPU 毫核整数；Resources 对象存在且未声明 CPU 时返回 2000。示例：`2000`。 |
| Config.Resources.MemoryMb | integer | 是 | — | 内存容量（MiB）。返回内存整数，单位 MiB；Resources 对象存在且未声明内存时返回 4096。示例：`4096`。 |
| Config.Resources.DiskSize | string | 否 | — | 磁盘容量。返回磁盘容量字符串。示例：`"20Gi"`。 |
| Config.EnvVars | object | 否 | — | Sandbox 环境变量字典。返回已保存的环境变量字典。字典值类型为 `string`。示例：`{"LOG_LEVEL":"info"}`。 |
| Config.AgentKit | object | 否 | — | AgentKit 工具配置。返回已保存的 AgentKit 配置。子字段在本表下方逐项列出。 |
| Config.AgentKit.Networking | object | 否 | — | Tool 网络配置。返回已保存的网络声明。普通 Config.Networking 不设置网络策略；AgentKit.Networking 表示网络开关。子字段在本表下方逐项列出。 |
| Config.AgentKit.Networking.EnablePublicNetwork | boolean | 否 | — | 启用公网。返回公网访问开关。示例：`true`。 |
| Config.AgentKit.Networking.EnablePrivateNetwork | boolean | 否 | — | 启用私网。返回私网访问开关。示例：`false`。 |
| Config.AgentKit.Networking.VpcConfiguration | object | 否 | — | 私网配置。返回私网配置。子字段在本表下方逐项列出。 |
| Config.AgentKit.Networking.VpcConfiguration.VpcId | string | 否 | — | VPC ID。返回 VPC ID。示例：`"vpc_example"`。 |
| Config.AgentKit.Networking.VpcConfiguration.SubnetIds | string[] | 否 | — | 子网 ID。返回子网 ID 数组。示例：`["subnet_example"]`。 |
| Config.AgentKit.Networking.VpcConfiguration.SecurityGroupIds | string[] | 否 | — | 安全组 ID。返回安全组 ID 数组。示例：`["sg_example"]`。 |
| Config.AgentKit.Networking.VpcConfiguration.EnableSharedInternetAccess | boolean | 否 | — | 共享公网访问。返回共享公网访问开关。示例：`false`。 |
| Config.Packages | object | 否 | — | 软件包声明。返回环境配置中的软件包声明，包管理器字段使用 PascalCase，例如 Pip、Npm、Apt。子字段在本表下方逐项列出。 |
| Config.Packages.Apt | string[] | 否 | — | apt 安装规格。返回已保存的 apt 软件包规格数组。示例：`["jq"]`。 |
| Config.Packages.Cargo | string[] | 否 | — | cargo 安装规格。返回已保存的 cargo 软件包规格数组。示例：`["ripgrep"]`。 |
| Config.Packages.Gem | string[] | 否 | — | gem 安装规格。返回已保存的 gem 软件包规格数组。示例：`["rake"]`。 |
| Config.Packages.Go | string[] | 否 | — | go 安装规格。返回已保存的 go 软件包规格数组。示例：`["gotest.tools/gotestsum@latest"]`。 |
| Config.Packages.Npm | string[] | 否 | — | npm 安装规格。返回已保存的 npm 软件包规格数组。示例：`["lodash@4.17.21"]`。 |
| Config.Packages.Pip | string[] | 否 | — | pip 安装规格。返回已保存的 pip 软件包规格数组。示例：`["requests==2.32.5"]`。 |
| Config.Packages.Type | string | 否 | — | 历史依赖声明标识。历史软件包标识；环境规范化后可能省略。示例：`"packages"`。 |
| Config.InitScript | string | 否 | — | Sandbox 初始化脚本。返回环境配置中的初始化脚本。示例：`"echo ready"`。 |
| Config.Storage | object | 否 | — | Sandbox 存储配置。返回已保存的存储声明。子字段在本表下方逐项列出。 |
| Config.Storage.TosMounts | JSON[] | 否 | — | Session 输出目标。TOS 存储挂载能力已移除：字段保留在 proto 契约中但不再生效。环境创建/更新时任何类型携带非空 TosMounts 均返回 400（Action InvalidRequest，提示当前运行时不支持存储挂载）；省略/null/[] 允许，不冻结也不创建挂载。示例：`[{"bucket":"output-bucket","prefix":"sessions/"}]`。 |
| Config.Iam | object | 否 | — | IAM 角色配置。返回已保存的角色配置。子字段在本表下方逐项列出。 |
| Config.Iam.RoleArn | string | 否 | — | Tool IAM 角色 ARN。返回 IAM 角色 ARN。示例：`"arn:iam::123456789012:role/ExampleRole"`。 |
| Config.Networking | object | 否 | — | 网络配置。返回保存的网络声明；Config.Networking 的域名白名单和 allow 开关未生效，SelfHosted 不由本服务设置网络。示例：`{}`。 |
| Config.ImageId | string | 否 | — | ECS 镜像 ID。Cloud-ECS 返回创建时冻结的镜像 ID；其他类型省略。示例：`"image-example"`。 |
| Config.DockerComposePayload | string | 否 | — | Docker Compose YAML 的标准 Base64 编码。Cloud-ECS 已配置 Compose 时原样返回；其他类型省略。示例：`"c2VydmljZXM6CiAgYXBwOgogICAgaW1hZ2U6IGV4YW1wbGUvYXBwOnYxCg=="`。 |
| Config.Lifecycle | object | 否 | — | Devbox 首次创建生命周期。Cloud-ECS 已配置 Lifecycle 时返回；仅与 DockerComposePayload 同时存在。子字段在本表下方逐项列出。 |
| Config.Lifecycle.PreUp | object | 否 | — | Compose 启动前 Hook。Devbox 首次创建时在第一次 Compose Up 前执行。子字段在本表下方逐项列出。可能省略。 |
| Config.Lifecycle.PreUp.Script | string | 否 | — | 内联脚本。与 ScriptRef 二选一；UTF-8、无 NUL，最大 64 KiB。示例：`"set -eu"`。可能省略。 |
| Config.Lifecycle.PreUp.ScriptRef | string | 否 | — | 可版本化脚本引用。与 Script 二选一；必须为非空引用。示例：`"config://post-up"`。可能省略。 |
| Config.Lifecycle.PreUp.Shell | string | 否 | — | 脚本解释器。/bin/bash 或 /bin/sh。示例：`"/bin/bash"`。可能省略。 |
| Config.Lifecycle.PreUp.WorkingDirectory | string | 否 | — | 工作目录。安全的绝对路径，不能为根目录或包含上级跳转。示例：`"/workspace"`。可能省略。 |
| Config.Lifecycle.PreUp.TimeoutSeconds | integer | 否 | — | 超时秒数。1～1800。示例：`300`。可能省略。 |
| Config.Lifecycle.PreUp.FailurePolicy | string | 否 | — | 失败策略。fail 或 continue。示例：`"fail"`。可能省略。 |
| Config.Lifecycle.PreUp.Environment | object | 否 | — | Hook 专用非敏感环境变量。名称和值沿用 Environment 非敏感变量约束，不接受平台保留或敏感前缀。字典值类型为 `string`。示例：`{"LOG_LEVEL":"info"}`。可能省略。 |
| Config.Lifecycle.PostUp | object | 否 | — | Compose 首次健康后 Hook。Devbox 首次创建时在全部必需 Service 首次就绪后执行。子字段在本表下方逐项列出。可能省略。 |
| Config.Lifecycle.PostUp.Script | string | 否 | — | 内联脚本。与 ScriptRef 二选一；UTF-8、无 NUL，最大 64 KiB。示例：`"set -eu"`。可能省略。 |
| Config.Lifecycle.PostUp.ScriptRef | string | 否 | — | 可版本化脚本引用。与 Script 二选一；必须为非空引用。示例：`"config://post-up"`。可能省略。 |
| Config.Lifecycle.PostUp.Shell | string | 否 | — | 脚本解释器。/bin/bash 或 /bin/sh。示例：`"/bin/bash"`。可能省略。 |
| Config.Lifecycle.PostUp.WorkingDirectory | string | 否 | — | 工作目录。安全的绝对路径，不能为根目录或包含上级跳转。示例：`"/workspace"`。可能省略。 |
| Config.Lifecycle.PostUp.TimeoutSeconds | integer | 否 | — | 超时秒数。1～1800。示例：`300`。可能省略。 |
| Config.Lifecycle.PostUp.FailurePolicy | string | 否 | — | 失败策略。fail 或 continue。示例：`"fail"`。可能省略。 |
| Config.Lifecycle.PostUp.Environment | object | 否 | — | Hook 专用非敏感环境变量。名称和值沿用 Environment 非敏感变量约束，不接受平台保留或敏感前缀。字典值类型为 `string`。示例：`{"LOG_LEVEL":"info"}`。可能省略。 |
| Metadata | object | 否 | — | 业务元数据。返回已保存的业务元数据对象；未设置时可能省略。示例：`{}`。 |
| Status | string | 是 | — | 状态。Active 表示没有未就绪的关联受管资源；资源准备中为 Creating/Updating，失败为 Failed/DeleteFailed，删除中为 Deleting；Archived 表示已归档。失败不能显示为 Active，具体原因查询资源组 LastOperation。示例：`"Active"`。 |
| ToolId | string | 否 | — | 云 Tool ID。成功解析或准备 Tool 后返回；SelfHosted 可省略。示例：`"tool_example"`。 |
| CreatedAt | string | 是 | — | 创建时间。UTC RFC3339 时间。示例：`"2026-10-12T08:00:00Z"`。 |
| UpdatedAt | string | 是 | — | 最后更新时间。UTC RFC3339 时间。示例：`"2026-10-12T08:00:00Z"`。 |
| ArchivedAt | string | 否 | — | 首次归档时间。仅 Archived 环境返回首次归档时间，UTC RFC3339。示例：`"2026-10-12T08:00:00Z"`。 |
| Replayed | boolean | 否 | — | 是否幂等重放。仅幂等重放为 true 时返回；false 时省略。示例：`true`。 |
| WorkspaceId | string | 是 | — | 创建时固定的 Workspace 归属。取原资源持久化归属或真实标签；历史无归属资源返回空字符串，不读取调用方 metadata。示例：`"workspace-example"`。 |
| StatusMessage | string | 否 | — | 最近一次资源准备失败的安全诊断。详情返回后台保存的底层服务错误码、请求 ID 或启动失败原因。疑似敏感内容整条隐藏；无诊断时省略。历史失败不补造原因，成功恢复后清除。Tool 详情无启动原因时仅返回已有错误码。示例：`"ProviderTerminalState: function process failed to start: exit status 1"`。 |

<a id="createenvironment-top"></a>

## CreateEnvironment

创建环境。


```http
POST /?Action=CreateEnvironment&Version=2025-10-30
```

### 请求参数

| 参数 | 类型 | 是&#8288;否&#8288;必&#8288;传 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| Name | string | 是 | — | 名称。去首尾空白后 1～256 字节。示例：`"documentation"`。 |
| Description | string | 否 | — | 描述。字符串描述；可省略或 null。示例：`"文档示例"`。 |
| Config | object | 否 | `{"Type":"Cloud"}` | Sandbox 环境配置。省略或 null 默认 {"Type":"Cloud"}；显式对象必须含 Type。子字段在本表下方逐项列出。 |
| Config.Type | string | 是 | — | 类型标识。Cloud、Cloud-ECS 或 SelfHosted；显式 Config 对象中必填；创建后不可改变，UpdateEnvironment 不接受该字段。示例：`"Cloud-ECS"`。 |
| Config.ImageUrl | string | 否 | Cloud：数据库默认镜像；SelfHosted：仅保存 | Sandbox 容器镜像地址。Cloud 省略时使用数据库中生效的 Cloud Tool 默认镜像。SelfHosted 创建环境时仅保存镜像声明。示例：`"registry.example.com/sandbox:v1"`。 |
| Config.Resources | object | 否 | — | Sandbox 资源配置。Cloud 中省略资源对象或单项时，实际创建默认 CPU 2000 毫核、内存 4096 MiB。SelfHosted 仅保存资源声明，不分配资源或设置实际机器规格；查询对已保存 Resources 对象补齐默认 CPU/内存仅用于统一返回结构。子字段在本表下方逐项列出。 |
| Config.Resources.CpuMilli | integer | 否 | 2000（Cloud） | CPU 毫核数。单位为毫核，1000 毫核等于 1 核；Cloud 环境只支持 2000、4000、8000、16000，其他值返回 400；省略默认 2000。示例：`2000`。 |
| Config.Resources.MemoryMb | integer | 否 | 4096（Cloud） | 内存容量（MiB）。单位为 MiB；Cloud 环境须与 CpuMilli 配对，取每核 2 GiB 或 4 GiB，例如 2000 配 4096 或 8192，4000 配 8192 或 16384，不匹配返回 400；省略默认 4096，只改 CpuMilli 时需同时显式指定内存。示例：`4096`。 |
| Config.Resources.DiskSize | string | 否 | — | 磁盘容量。正整数加 Gi/Ti（单位忽略大小写）；换算 GiB 后不超过 int64。示例：`"20Gi"`。 |
| Config.EnvVars | object | 否 | — | Sandbox 环境变量字典。Cloud：字符串字典，名称匹配 [A-Za-z_][A-Za-z0-9_]*，单值最多 8192 字节；忽略大小写拒绝 SECRET_、PASSWORD_、TOKEN_ 前缀，并禁止覆盖模型认证、模型服务地址、磁盘配置和软件包安装控制等平台保留变量。对应能力使用专门请求字段配置，不通过 EnvVars 覆盖系统参数。SelfHosted 仅保存声明，不向用户机器注入变量。字典值类型为 `string`。示例：`{"LOG_LEVEL":"info"}`。 |
| Config.AgentKit | object | 否 | — | AgentKit 工具配置。子字段在本表下方逐项列出。 |
| Config.AgentKit.Networking | object | 否 | — | Tool 网络配置。子字段在本表下方逐项列出。 |
| Config.AgentKit.Networking.EnablePublicNetwork | boolean | 否 | 对象省略：`true`<br>仅字段省略：`false` | 启用公网。整个 AgentKit.Networking 对象省略时默认 true；显式对象内省略 EnablePublicNetwork 时为 false；显式对象至少启用一种网络。示例：`true`。 |
| Config.AgentKit.Networking.EnablePrivateNetwork | boolean | 否 | `false` | 启用私网。true 时必须提供 VpcConfiguration。示例：`false`。 |
| Config.AgentKit.Networking.VpcConfiguration | object | 否 | — | 私网配置。仅启用私网时提供。子字段在本表下方逐项列出。 |
| Config.AgentKit.Networking.VpcConfiguration.VpcId | string | 是 | — | VPC ID。启用私网时非空。示例：`"vpc_example"`。 |
| Config.AgentKit.Networking.VpcConfiguration.SubnetIds | string[] | 是 | — | 子网 ID。启用私网时 1～10 项，每项非空。示例：`["subnet_example"]`。 |
| Config.AgentKit.Networking.VpcConfiguration.SecurityGroupIds | string[] | 否 | — | 安全组 ID。可选字符串数组。示例：`["sg_example"]`。 |
| Config.AgentKit.Networking.VpcConfiguration.EnableSharedInternetAccess | boolean | 否 | `false` | 共享公网访问。示例：`false`。 |
| Config.Packages | object | 否 | — | 软件包声明。Cloud 的安装模式与可用管理器受服务部署配置约束，见[安装能力](#environment-capabilities)。Cloud-ECS 支持 apt、pip、npm；CreateEnvironment 保存 Packages，并在每个 Devbox 首次启动时安装；CreateEnvironmentWithImageBuild 仅在构建镜像时使用 Packages，最终 Environment 会删除该字段。SelfHosted 仅保存声明。子字段在本表下方逐项列出。 |
| Config.Packages.Apt | string[] | 否 | — | apt 安装规格。所有管理器合计去重后 1～200 项；每项去空白后 1～256 字节，匹配 ^[A-Za-z0-9@][A-Za-z0-9@._+:/=<>!~,%\[\]-]*$；空数组可提供，但总数不能为 0。示例：`["jq"]`。 |
| Config.Packages.Cargo | string[] | 否 | — | cargo 安装规格。所有管理器合计去重后 1～200 项；每项去空白后 1～256 字节，匹配 ^[A-Za-z0-9@][A-Za-z0-9@._+:/=<>!~,%\[\]-]*$；空数组可提供，但总数不能为 0。示例：`["ripgrep"]`。 |
| Config.Packages.Gem | string[] | 否 | — | gem 安装规格。所有管理器合计去重后 1～200 项；每项去空白后 1～256 字节，匹配 ^[A-Za-z0-9@][A-Za-z0-9@._+:/=<>!~,%\[\]-]*$；空数组可提供，但总数不能为 0。示例：`["rake"]`。 |
| Config.Packages.Go | string[] | 否 | — | go 安装规格。所有管理器合计去重后 1～200 项；每项去空白后 1～256 字节，匹配 ^[A-Za-z0-9@][A-Za-z0-9@._+:/=<>!~,%\[\]-]*$；空数组可提供，但总数不能为 0。示例：`["gotest.tools/gotestsum@latest"]`。 |
| Config.Packages.Npm | string[] | 否 | — | npm 安装规格。所有管理器合计去重后 1～200 项；每项去空白后 1～256 字节，匹配 ^[A-Za-z0-9@][A-Za-z0-9@._+:/=<>!~,%\[\]-]*$；空数组可提供，但总数不能为 0。示例：`["lodash@4.17.21"]`。 |
| Config.Packages.Pip | string[] | 否 | — | pip 安装规格。所有管理器合计去重后 1～200 项；每项去空白后 1～256 字节，匹配 ^[A-Za-z0-9@][A-Za-z0-9@._+:/=<>!~,%\[\]-]*$；空数组可提供，但总数不能为 0。示例：`["requests==2.32.5"]`。 |
| Config.Packages.Type | string | 否 | — | 历史依赖声明标识。可省略；提供时只允许 packages，不改变软件包安装行为。示例：`"packages"`。 |
| Config.InitScript | string | 否 | — | Sandbox 初始化脚本。Cloud：非空时最多 65536 字节、无 NUL，超时 300 秒；SelfHosted 仅保存脚本，本服务不执行。示例：`"echo ready"`。 |
| Config.Storage | object | 否 | — | Sandbox 存储配置。TosMounts 为历史占位字段：TOS 存储挂载能力已移除，环境创建/更新时任何类型携带非空 TosMounts 均返回 400（Action InvalidRequest，提示当前运行时不支持存储挂载），省略/null/[] 允许，不冻结也不创建挂载。TosInput 已随能力移除（proto 字段号与名称 reserved，携带即返回 400 未知字段错误）。子字段在本表下方逐项列出。 |
| Config.Storage.TosMounts | JSON[] | 否 | — | TOS 挂载。TOS 存储挂载能力已移除：字段保留在 proto 契约中但不再生效。环境创建/更新时任何类型携带非空 TosMounts 均返回 400（Action InvalidRequest，提示当前运行时不支持存储挂载）；省略/null/[] 允许，不冻结也不创建挂载。示例：`[{"bucket":"output-bucket","prefix":"sessions/"}]`。 |
| Config.Iam | object | 否 | — | IAM 角色配置。子字段在本表下方逐项列出。 |
| Config.Iam.RoleArn | string | 否 | — | Tool IAM 角色 ARN。arn:iam::<账号>:role/<角色名>；不能包含角色路径。示例：`"arn:iam::123456789012:role/ExampleRole"`。 |
| Config.Networking | object | 否 | — | 网络配置。**仅保存，未生效**：不会设置域名白名单，也不会执行 allow_package_managers、allow_mcp_servers 等开关。Cloud 实际网络访问开关使用 Config.AgentKit.Networking；SelfHosted 网络由自有基础设施配置。示例：`{}`。 |
| Config.ImageId | string | 条件 | — | ECS 镜像 ID。仅 Cloud-ECS 使用且创建时必填；服务按当前账号和部署地域校验镜像可见、available、Linux、Cloud-Init 及 amd64/x86_64。UpdateEnvironment 不接受该字段。示例：`"image-example"`。 |
| Config.DockerComposePayload | string | 否 | — | Docker Compose YAML 的标准 Base64 编码。仅 Cloud-ECS 使用；标准 Base64 解码后须为非空且不超过 1 MiB 的合法 YAML，services 必须为包含 1～20 项的对象；不额外限制其他 Compose 字段。示例：`"c2VydmljZXM6CiAgYXBwOgogICAgaW1hZ2U6IGV4YW1wbGUvYXBwOnYxCg=="`。 |
| Config.Lifecycle | object | 否 | — | Devbox 首次创建生命周期。仅 Cloud-ECS 且同时提供 DockerComposePayload 时允许；PreUp/PostUp 只在 Devbox 首次创建流程执行。子字段在本表下方逐项列出。 |
| Config.Lifecycle.PreUp | object | 否 | — | Compose 启动前 Hook。Devbox 首次创建时在第一次 Compose Up 前执行。子字段在本表下方逐项列出。 |
| Config.Lifecycle.PreUp.Script | string | 否 | — | 内联脚本。与 ScriptRef 二选一；UTF-8、无 NUL，最大 64 KiB。示例：`"set -eu"`。 |
| Config.Lifecycle.PreUp.ScriptRef | string | 否 | — | 可版本化脚本引用。与 Script 二选一；必须为非空引用。示例：`"config://post-up"`。 |
| Config.Lifecycle.PreUp.Shell | string | 否 | /bin/bash | 脚本解释器。/bin/bash 或 /bin/sh。示例：`"/bin/bash"`。 |
| Config.Lifecycle.PreUp.WorkingDirectory | string | 否 | Compose Project 目录 | 工作目录。安全的绝对路径，不能为根目录或包含上级跳转。示例：`"/workspace"`。 |
| Config.Lifecycle.PreUp.TimeoutSeconds | integer | 否 | 300 | 超时秒数。1～1800。示例：`300`。 |
| Config.Lifecycle.PreUp.FailurePolicy | string | 否 | fail | 失败策略。fail 或 continue。示例：`"fail"`。 |
| Config.Lifecycle.PreUp.Environment | object | 否 | — | Hook 专用非敏感环境变量。名称和值沿用 Environment 非敏感变量约束，不接受平台保留或敏感前缀。字典值类型为 `string`。示例：`{"LOG_LEVEL":"info"}`。 |
| Config.Lifecycle.PostUp | object | 否 | — | Compose 首次健康后 Hook。Devbox 首次创建时在全部必需 Service 首次就绪后执行。子字段在本表下方逐项列出。 |
| Config.Lifecycle.PostUp.Script | string | 否 | — | 内联脚本。与 ScriptRef 二选一；UTF-8、无 NUL，最大 64 KiB。示例：`"set -eu"`。 |
| Config.Lifecycle.PostUp.ScriptRef | string | 否 | — | 可版本化脚本引用。与 Script 二选一；必须为非空引用。示例：`"config://post-up"`。 |
| Config.Lifecycle.PostUp.Shell | string | 否 | /bin/bash | 脚本解释器。/bin/bash 或 /bin/sh。示例：`"/bin/bash"`。 |
| Config.Lifecycle.PostUp.WorkingDirectory | string | 否 | Compose Project 目录 | 工作目录。安全的绝对路径，不能为根目录或包含上级跳转。示例：`"/workspace"`。 |
| Config.Lifecycle.PostUp.TimeoutSeconds | integer | 否 | 300 | 超时秒数。1～1800。示例：`300`。 |
| Config.Lifecycle.PostUp.FailurePolicy | string | 否 | fail | 失败策略。fail 或 continue。示例：`"fail"`。 |
| Config.Lifecycle.PostUp.Environment | object | 否 | — | Hook 专用非敏感环境变量。名称和值沿用 Environment 非敏感变量约束，不接受平台保留或敏感前缀。字典值类型为 `string`。示例：`{"LOG_LEVEL":"info"}`。 |
| Config.BuildScript | string | 否 | — | 异步镜像构建脚本。普通 CreateEnvironment 和 UpdateEnvironment 禁止；仅后续 CreateEnvironmentWithImageBuild 源配置使用，最终 Environment 不保存。示例：`"c2V0IC1ldQo="`。 |
| Metadata | object | 否 | — | 业务元数据。任意 JSON 值字典，保存为环境业务元数据；不存放凭据。允许 `null`。示例：`{"purpose":"documentation"}`。 |
| ClientToken | string | 否 | 不启用幂等重放 | 幂等键。省略、null 或空串不启用重放；非空格式见[公共幂等调用](conventions.md#幂等调用)。示例：`"documentation-001"`。 |
| WorkspaceId | string | 否 | 开启开关时解析唯一默认 Workspace，关闭时忽略 | Workspace 选择器，受 Workspace 开关控制。可选字符串，去首尾空白；兼容 workspace_id，与 anthropic-workspace-id 请求头及兼容字段同时提供时须一致。Data.Resource.Workspace.Enabled 开启时，省略或空字符串解析唯一默认 Workspace；列表仅查询选中空间，详情及版本操作的目标必须归属该空间，否则返回不存在；非字符串及 null 返回 400。关闭开关时忽略该选择器。示例：`"workspace-example"`。 |

### 请求示例

```http
POST /?Action=CreateEnvironment&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "Name": "documentation",
  "Description": "自托管文档环境",
  "Config": {
    "Type": "SelfHosted"
  },
  "Metadata": {
    "purpose": "documentation"
  },
  "ClientToken": "env-create-001",
  "WorkspaceId": "workspace-example"
}
```

**创建 Cloud 环境，配置资源与网络**

```http
POST /?Action=CreateEnvironment&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "Name": "cloud-documentation",
  "Config": {
    "Type": "Cloud",
    "ImageUrl": "registry.example.com/sandbox:v1",
    "Resources": {
      "DiskSize": "20Gi",
      "CpuMilli": 2000,
      "MemoryMb": 4096
    },
    "EnvVars": {
      "LOG_LEVEL": "info"
    },
    "AgentKit": {
      "Networking": {
        "EnablePublicNetwork": true,
        "EnablePrivateNetwork": false
      }
    },
    "Packages": {
      "Pip": [
        "httpx==0.28.1"
      ],
      "Npm": [
        "lodash@4.17.21"
      ]
    },
    "InitScript": "echo ready"
  },
  "Metadata": {
    "purpose": "documentation"
  },
  "ClientToken": "env-create-cloud-001"
}
```

**Cloud 仅启用私网，省略公网字段即关闭公网**

```http
POST /?Action=CreateEnvironment&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "Name": "private-environment",
  "Config": {
    "Type": "Cloud",
    "AgentKit": {
      "Networking": {
        "EnablePrivateNetwork": true,
        "VpcConfiguration": {
          "VpcId": "vpc_example",
          "SubnetIds": [
            "subnet_example"
          ]
        }
      }
    }
  },
  "ClientToken": "environment-private-001"
}
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是&#8288;否&#8288;必&#8288;返 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| ResponseMetadata | object | 是 | — | 公共响应元信息，字段定义见[公共 ResponseMetadata](conventions.md#响应元信息)。 |
| Result | object | 是 | — | 成功结果。仅成功响应必返；失败时省略，错误格式见公共约定。字段定义见[公共对象](#environment-object)。 |

### 响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "req_example",
    "Action": "CreateEnvironment",
    "Version": "2025-10-30",
    "Service": "ma",
    "Region": "cn-beijing"
  },
  "Result": {
    "EnvironmentId": "env_example",
    "Name": "documentation",
    "Description": "文档示例",
    "Config": {
      "Type": "SelfHosted"
    },
    "Metadata": {
      "purpose": "documentation"
    },
    "Status": "Active",
    "CreatedAt": "2026-10-12T08:00:00Z",
    "UpdatedAt": "2026-10-12T08:00:00Z",
    "WorkspaceId": "workspace-example"
  }
}
```

### 使用说明

- 省略 Config 或传 null 创建 Cloud 环境；显式 Config 对象必须包含 Type。
- Cloud 创建在 ToolID 持久化后返回，状态通常为 Creating，不等待 Tool Ready；后台持久化操作继续检查就绪，成功后为 Active，失败后为 Failed。
- GetEnvironment 和 ListEnvironments 在创建期间也返回 ToolID，只有就绪绑定可用于执行。
- 成功响应沿用现有结构与 HTTP 状态码。
- Tool 创建前的软件包镜像构建等前置步骤仍在请求内执行；SelfHosted 保存用户执行器配置，不部署物理实例。
- CreateAgentSession.resources 中的 TOS 资源不再解析或挂载，仅保存并返回。
- 接口不预查 Bucket 归属和 IAM 权限，调用方须授权同账号同地域 Bucket。
- ImageUrl 与 Packages 可同时提供；省略 ImageUrl 时从数据库读取当前生效的 Cloud Tool 默认镜像。
- 软件包可在镜像构建时安装，也可在每次沙箱启动时安装，取决于服务配置；后者默认支持 pip/npm/gem/go，apt 不支持，cargo 需服务开启。
- 安装完成后执行 InitScript，再启动执行器；资源就绪不代表软件包安装完成。
- 实际网络控制使用 AgentKit.Networking；Config.Networking 只保存声明。
- ClientToken 的格式、24 小时结果快照、重放及重试规则见[公共幂等规则](conventions.md#幂等调用)。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="createenvironmentwithimagebuild-top"></a>

## CreateEnvironmentWithImageBuild

创建 EnvironmentWithImageBuild。


```http
POST /?Action=CreateEnvironmentWithImageBuild&Version=2025-10-30
```

### 请求参数

| 参数 | 类型 | 是&#8288;否&#8288;必&#8288;传 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| Name | string | 是 | — | 目标 Environment 名称。去除首尾空白后 1～128 字符。示例：`"devbox"`。 |
| Description | string | 否 | null | 目标 Environment 描述。可省略或 null。示例：`"Devbox 环境"`。 |
| Config | object | 是 | — | 镜像构建源配置。Type 必须为 Cloud-ECS，ImageId 和非空 Packages 必填；DockerComposePayload 解码为镜像构建配置中的顶层 Compose，EnvVars 传入镜像构建并保留到目标 Environment。Base64 编码后的镜像构建载荷不得超过 64 KiB。子字段在本表下方逐项列出。 |
| Config.Type | string | 是 | — | 类型标识。Cloud、Cloud-ECS 或 SelfHosted；显式 Config 对象中必填；创建后不可改变，UpdateEnvironment 不接受该字段。示例：`"Cloud-ECS"`。 |
| Config.ImageUrl | string | 否 | Cloud：数据库默认镜像；SelfHosted：仅保存 | Sandbox 容器镜像地址。Cloud 省略时使用数据库中生效的 Cloud Tool 默认镜像。SelfHosted 创建环境时仅保存镜像声明。示例：`"registry.example.com/sandbox:v1"`。 |
| Config.Resources | object | 否 | — | Sandbox 资源配置。Cloud 中省略资源对象或单项时，实际创建默认 CPU 2000 毫核、内存 4096 MiB。SelfHosted 仅保存资源声明，不分配资源或设置实际机器规格；查询对已保存 Resources 对象补齐默认 CPU/内存仅用于统一返回结构。子字段在本表下方逐项列出。 |
| Config.Resources.CpuMilli | integer | 否 | 2000（Cloud） | CPU 毫核数。单位为毫核，1000 毫核等于 1 核；Cloud 环境只支持 2000、4000、8000、16000，其他值返回 400；省略默认 2000。示例：`2000`。 |
| Config.Resources.MemoryMb | integer | 否 | 4096（Cloud） | 内存容量（MiB）。单位为 MiB；Cloud 环境须与 CpuMilli 配对，取每核 2 GiB 或 4 GiB，例如 2000 配 4096 或 8192，4000 配 8192 或 16384，不匹配返回 400；省略默认 4096，只改 CpuMilli 时需同时显式指定内存。示例：`4096`。 |
| Config.Resources.DiskSize | string | 否 | — | 磁盘容量。正整数加 Gi/Ti（单位忽略大小写）；换算 GiB 后不超过 int64。示例：`"20Gi"`。 |
| Config.EnvVars | object | 否 | — | Sandbox 环境变量字典。Cloud：字符串字典，名称匹配 [A-Za-z_][A-Za-z0-9_]*，单值最多 8192 字节；忽略大小写拒绝 SECRET_、PASSWORD_、TOKEN_ 前缀，并禁止覆盖模型认证、模型服务地址、磁盘配置和软件包安装控制等平台保留变量。对应能力使用专门请求字段配置，不通过 EnvVars 覆盖系统参数。SelfHosted 仅保存声明，不向用户机器注入变量。字典值类型为 `string`。示例：`{"LOG_LEVEL":"info"}`。 |
| Config.AgentKit | object | 否 | — | AgentKit 工具配置。子字段在本表下方逐项列出。 |
| Config.AgentKit.Networking | object | 否 | — | Tool 网络配置。子字段在本表下方逐项列出。 |
| Config.AgentKit.Networking.EnablePublicNetwork | boolean | 否 | 对象省略：`true`<br>仅字段省略：`false` | 启用公网。整个 AgentKit.Networking 对象省略时默认 true；显式对象内省略 EnablePublicNetwork 时为 false；显式对象至少启用一种网络。示例：`true`。 |
| Config.AgentKit.Networking.EnablePrivateNetwork | boolean | 否 | `false` | 启用私网。true 时必须提供 VpcConfiguration。示例：`false`。 |
| Config.AgentKit.Networking.VpcConfiguration | object | 否 | — | 私网配置。仅启用私网时提供。子字段在本表下方逐项列出。 |
| Config.AgentKit.Networking.VpcConfiguration.VpcId | string | 是 | — | VPC ID。启用私网时非空。示例：`"vpc_example"`。 |
| Config.AgentKit.Networking.VpcConfiguration.SubnetIds | string[] | 是 | — | 子网 ID。启用私网时 1～10 项，每项非空。示例：`["subnet_example"]`。 |
| Config.AgentKit.Networking.VpcConfiguration.SecurityGroupIds | string[] | 否 | — | 安全组 ID。可选字符串数组。示例：`["sg_example"]`。 |
| Config.AgentKit.Networking.VpcConfiguration.EnableSharedInternetAccess | boolean | 否 | `false` | 共享公网访问。示例：`false`。 |
| Config.Packages | object | 否 | — | 软件包声明。Cloud 的安装模式与可用管理器受服务部署配置约束，见[安装能力](#environment-capabilities)。Cloud-ECS 支持 apt、pip、npm；CreateEnvironment 保存 Packages，并在每个 Devbox 首次启动时安装；CreateEnvironmentWithImageBuild 仅在构建镜像时使用 Packages，最终 Environment 会删除该字段。SelfHosted 仅保存声明。子字段在本表下方逐项列出。 |
| Config.Packages.Apt | string[] | 否 | — | apt 安装规格。所有管理器合计去重后 1～200 项；每项去空白后 1～256 字节，匹配 ^[A-Za-z0-9@][A-Za-z0-9@._+:/=<>!~,%\[\]-]*$；空数组可提供，但总数不能为 0。示例：`["jq"]`。 |
| Config.Packages.Cargo | string[] | 否 | — | cargo 安装规格。所有管理器合计去重后 1～200 项；每项去空白后 1～256 字节，匹配 ^[A-Za-z0-9@][A-Za-z0-9@._+:/=<>!~,%\[\]-]*$；空数组可提供，但总数不能为 0。示例：`["ripgrep"]`。 |
| Config.Packages.Gem | string[] | 否 | — | gem 安装规格。所有管理器合计去重后 1～200 项；每项去空白后 1～256 字节，匹配 ^[A-Za-z0-9@][A-Za-z0-9@._+:/=<>!~,%\[\]-]*$；空数组可提供，但总数不能为 0。示例：`["rake"]`。 |
| Config.Packages.Go | string[] | 否 | — | go 安装规格。所有管理器合计去重后 1～200 项；每项去空白后 1～256 字节，匹配 ^[A-Za-z0-9@][A-Za-z0-9@._+:/=<>!~,%\[\]-]*$；空数组可提供，但总数不能为 0。示例：`["gotest.tools/gotestsum@latest"]`。 |
| Config.Packages.Npm | string[] | 否 | — | npm 安装规格。所有管理器合计去重后 1～200 项；每项去空白后 1～256 字节，匹配 ^[A-Za-z0-9@][A-Za-z0-9@._+:/=<>!~,%\[\]-]*$；空数组可提供，但总数不能为 0。示例：`["lodash@4.17.21"]`。 |
| Config.Packages.Pip | string[] | 否 | — | pip 安装规格。所有管理器合计去重后 1～200 项；每项去空白后 1～256 字节，匹配 ^[A-Za-z0-9@][A-Za-z0-9@._+:/=<>!~,%\[\]-]*$；空数组可提供，但总数不能为 0。示例：`["requests==2.32.5"]`。 |
| Config.Packages.Type | string | 否 | — | 历史依赖声明标识。可省略；提供时只允许 packages，不改变软件包安装行为。示例：`"packages"`。 |
| Config.InitScript | string | 否 | — | Sandbox 初始化脚本。Cloud：非空时最多 65536 字节、无 NUL，超时 300 秒；SelfHosted 仅保存脚本，本服务不执行。示例：`"echo ready"`。 |
| Config.Storage | object | 否 | — | Sandbox 存储配置。TosMounts 为历史占位字段：TOS 存储挂载能力已移除，环境创建/更新时任何类型携带非空 TosMounts 均返回 400（Action InvalidRequest，提示当前运行时不支持存储挂载），省略/null/[] 允许，不冻结也不创建挂载。TosInput 已随能力移除（proto 字段号与名称 reserved，携带即返回 400 未知字段错误）。子字段在本表下方逐项列出。 |
| Config.Storage.TosMounts | JSON[] | 否 | — | TOS 挂载。TOS 存储挂载能力已移除：字段保留在 proto 契约中但不再生效。环境创建/更新时任何类型携带非空 TosMounts 均返回 400（Action InvalidRequest，提示当前运行时不支持存储挂载）；省略/null/[] 允许，不冻结也不创建挂载。示例：`[{"bucket":"output-bucket","prefix":"sessions/"}]`。 |
| Config.Iam | object | 否 | — | IAM 角色配置。子字段在本表下方逐项列出。 |
| Config.Iam.RoleArn | string | 否 | — | Tool IAM 角色 ARN。arn:iam::<账号>:role/<角色名>；不能包含角色路径。示例：`"arn:iam::123456789012:role/ExampleRole"`。 |
| Config.Networking | object | 否 | — | 网络配置。**仅保存，未生效**：不会设置域名白名单，也不会执行 allow_package_managers、allow_mcp_servers 等开关。Cloud 实际网络访问开关使用 Config.AgentKit.Networking；SelfHosted 网络由自有基础设施配置。示例：`{}`。 |
| Config.ImageId | string | 条件 | — | ECS 镜像 ID。仅 Cloud-ECS 使用且创建时必填；服务按当前账号和部署地域校验镜像可见、available、Linux、Cloud-Init 及 amd64/x86_64。UpdateEnvironment 不接受该字段。示例：`"image-example"`。 |
| Config.DockerComposePayload | string | 否 | — | Docker Compose YAML 的标准 Base64 编码。仅 Cloud-ECS 使用；标准 Base64 解码后须为非空且不超过 1 MiB 的合法 YAML，services 必须为包含 1～20 项的对象；不额外限制其他 Compose 字段。示例：`"c2VydmljZXM6CiAgYXBwOgogICAgaW1hZ2U6IGV4YW1wbGUvYXBwOnYxCg=="`。 |
| Config.Lifecycle | object | 否 | — | Devbox 首次创建生命周期。仅 Cloud-ECS 且同时提供 DockerComposePayload 时允许；PreUp/PostUp 只在 Devbox 首次创建流程执行。子字段在本表下方逐项列出。 |
| Config.Lifecycle.PreUp | object | 否 | — | Compose 启动前 Hook。Devbox 首次创建时在第一次 Compose Up 前执行。子字段在本表下方逐项列出。 |
| Config.Lifecycle.PreUp.Script | string | 否 | — | 内联脚本。与 ScriptRef 二选一；UTF-8、无 NUL，最大 64 KiB。示例：`"set -eu"`。 |
| Config.Lifecycle.PreUp.ScriptRef | string | 否 | — | 可版本化脚本引用。与 Script 二选一；必须为非空引用。示例：`"config://post-up"`。 |
| Config.Lifecycle.PreUp.Shell | string | 否 | /bin/bash | 脚本解释器。/bin/bash 或 /bin/sh。示例：`"/bin/bash"`。 |
| Config.Lifecycle.PreUp.WorkingDirectory | string | 否 | Compose Project 目录 | 工作目录。安全的绝对路径，不能为根目录或包含上级跳转。示例：`"/workspace"`。 |
| Config.Lifecycle.PreUp.TimeoutSeconds | integer | 否 | 300 | 超时秒数。1～1800。示例：`300`。 |
| Config.Lifecycle.PreUp.FailurePolicy | string | 否 | fail | 失败策略。fail 或 continue。示例：`"fail"`。 |
| Config.Lifecycle.PreUp.Environment | object | 否 | — | Hook 专用非敏感环境变量。名称和值沿用 Environment 非敏感变量约束，不接受平台保留或敏感前缀。字典值类型为 `string`。示例：`{"LOG_LEVEL":"info"}`。 |
| Config.Lifecycle.PostUp | object | 否 | — | Compose 首次健康后 Hook。Devbox 首次创建时在全部必需 Service 首次就绪后执行。子字段在本表下方逐项列出。 |
| Config.Lifecycle.PostUp.Script | string | 否 | — | 内联脚本。与 ScriptRef 二选一；UTF-8、无 NUL，最大 64 KiB。示例：`"set -eu"`。 |
| Config.Lifecycle.PostUp.ScriptRef | string | 否 | — | 可版本化脚本引用。与 Script 二选一；必须为非空引用。示例：`"config://post-up"`。 |
| Config.Lifecycle.PostUp.Shell | string | 否 | /bin/bash | 脚本解释器。/bin/bash 或 /bin/sh。示例：`"/bin/bash"`。 |
| Config.Lifecycle.PostUp.WorkingDirectory | string | 否 | Compose Project 目录 | 工作目录。安全的绝对路径，不能为根目录或包含上级跳转。示例：`"/workspace"`。 |
| Config.Lifecycle.PostUp.TimeoutSeconds | integer | 否 | 300 | 超时秒数。1～1800。示例：`300`。 |
| Config.Lifecycle.PostUp.FailurePolicy | string | 否 | fail | 失败策略。fail 或 continue。示例：`"fail"`。 |
| Config.Lifecycle.PostUp.Environment | object | 否 | — | Hook 专用非敏感环境变量。名称和值沿用 Environment 非敏感变量约束，不接受平台保留或敏感前缀。字典值类型为 `string`。示例：`{"LOG_LEVEL":"info"}`。 |
| Config.BuildScript | string | 否 | — | 异步镜像构建脚本。普通 CreateEnvironment 和 UpdateEnvironment 禁止；仅后续 CreateEnvironmentWithImageBuild 源配置使用，最终 Environment 不保存。示例：`"c2V0IC1ldQo="`。 |
| Metadata | object | 否 | {} | 业务元数据。不承载凭据。允许 `null`。示例：`{}`。 |
| Architecture | string | 否 | amd64 | 镜像架构。首期只允许 amd64。示例：`"amd64"`。 |
| WorkspaceId | string | 否 | 开启开关时解析唯一默认 Workspace，关闭时忽略 | Workspace 选择器，受 Workspace 开关控制。可选字符串，去首尾空白；兼容 workspace_id，与 anthropic-workspace-id 请求头及兼容字段同时提供时须一致。Data.Resource.Workspace.Enabled 开启时，省略或空字符串解析唯一默认 Workspace；列表仅查询选中空间，详情及版本操作的目标必须归属该空间，否则返回不存在；非字符串及 null 返回 400。关闭开关时忽略该选择器。示例：`"workspace-example"`。 |
| ClientToken | string | 否 | 不启用幂等 | 幂等令牌。同账号同参数重放返回同一 EnvironmentId。示例：`"env-build-001"`。 |

### 请求示例

```http
POST /?Action=CreateEnvironmentWithImageBuild&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "Name": "devbox",
  "Config": {
    "Type": "Cloud-ECS",
    "ImageId": "image-base",
    "Packages": {
      "Apt": [
        "sl"
      ],
      "Pip": [
        "humanize==4.13.0"
      ],
      "Npm": [
        "is-odd@3.0.1"
      ]
    },
    "DockerComposePayload": "bmFtZTogZXhhbXBsZS1wcm9qZWN0CnNlcnZpY2VzOgogIGFwcDoKICAgIGltYWdlOiBidXN5Ym94OjEuMzYK",
    "EnvVars": {
      "AGENTKIT_TEST_ENV": "small-compose-ok"
    }
  },
  "Architecture": "amd64",
  "ClientToken": "env-build-001",
  "WorkspaceId": "workspace-example"
}
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是&#8288;否&#8288;必&#8288;返 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| ResponseMetadata | object | 是 | — | 公共响应元信息，字段定义见[公共 ResponseMetadata](conventions.md#响应元信息)。 |
| Result | object | 是 | — | 创建结果。只返回 EnvironmentId。子字段在本表下方逐项列出。 |
| Result.EnvironmentId | string | 是 | — | 预分配 Environment ID。构建成功前 GetEnvironment 仍返回不存在。示例：`"env_example"`。 |

### 响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "req_example",
    "Action": "CreateEnvironmentWithImageBuild",
    "Version": "2025-10-30",
    "Service": "ma",
    "Region": "cn-beijing"
  },
  "Result": {
    "EnvironmentId": "env_example"
  }
}
```

### 使用说明

- 异步构建 ECS 镜像；只返回预分配 EnvironmentId。
- 相同 ClientToken 同参返回相同 ID。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="getenvironmentbuildstatus-top"></a>

## GetEnvironmentBuildStatus

查询 EnvironmentBuildStatus。


```http
GET /?Action=GetEnvironmentBuildStatus&Version=2025-10-30
POST /?Action=GetEnvironmentBuildStatus&Version=2025-10-30
```

### 请求参数

| 参数 | 类型 | 是&#8288;否&#8288;必&#8288;传 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| EnvironmentId | string | 是 | — | Environment ID。当前账号可见的构建 ID。示例：`"env_example"`。 |
| WorkspaceId | string | 否 | 开启开关时解析唯一默认 Workspace，关闭时忽略 | Workspace 选择器，受 Workspace 开关控制。可选字符串，去首尾空白；兼容 workspace_id，与 anthropic-workspace-id 请求头及兼容字段同时提供时须一致。Data.Resource.Workspace.Enabled 开启时，省略或空字符串解析唯一默认 Workspace；默认 Workspace 的列表、详情和版本查询兼容同账号未记录 Workspace 的旧资源，其他 Workspace 仅查询精确归属；旧资源响应 WorkspaceId 仍为空；跨空间目标返回不存在；显式选择时通过 GetWorkspace 的 WorkspaceType=DEFAULT 确认默认空间，查询失败不放宽范围；非字符串及 null 返回 400。关闭开关时忽略该选择器。示例：`"workspace-example"`。 |

### 请求示例

```http
POST /?Action=GetEnvironmentBuildStatus&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "EnvironmentId": "env_example",
  "WorkspaceId": "workspace-example"
}
```

也可以上传文件集合：

```http
GET /?Action=GetEnvironmentBuildStatus&Version=2025-10-30&EnvironmentId=env_example HTTP/1.1
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是&#8288;否&#8288;必&#8288;返 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| ResponseMetadata | object | 是 | — | 公共响应元信息，字段定义见[公共 ResponseMetadata](conventions.md#响应元信息)。 |
| Result | object | 是 | — | 构建状态。当前状态快照。子字段在本表下方逐项列出。 |
| Result.EnvironmentId | string | 是 | — | Environment ID。预分配 ID。示例：`"env_example"`。 |
| Result.Status | string | 是 | — | 构建状态。Pending、BuildingImage、CreatingEnvironment、Ready 或 Failed。示例：`"BuildingImage"`。 |
| Result.Step | string | 是 | — | 当前步骤。SubmitImageBuild、WaitImageBuild、CommitEnvironment 或 Complete。示例：`"WaitImageBuild"`。 |
| Result.Region | string | 是 | — | 构建地域。受理时固定。示例：`"cn-beijing"`。 |
| Result.Architecture | string | 是 | — | 镜像架构。首期为 amd64。示例：`"amd64"`。 |
| Result.ImageId | string | 否 | — | 构建后的镜像 ID。镜像构建成功后返回。允许 `null`。示例：`"image-example"`。 |
| Result.ComposeImagePreloadStatus | string | 是 | — | Compose 镜像预热状态。NotRequested、Pending、Succeeded 或 Failed。示例：`"Pending"`。 |
| Result.ComposeImageCount | integer | 是 | — | Compose 镜像数量。Compose services 中去重后的非空 image 数量。示例：`1`。 |
| Result.ErrorCode | string | 否 | — | 稳定错误码。仅失败时返回。允许 `null`。示例：`"ImageBuildFailed"`。 |
| Result.CreateTime | string | 是 | — | 创建时间。RFC3339。示例：`"2026-11-11T00:00:00Z"`。 |
| Result.UpdateTime | string | 是 | — | 更新时间。RFC3339。示例：`"2026-11-11T00:01:00Z"`。 |

### 响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "req_example",
    "Action": "GetEnvironmentBuildStatus",
    "Version": "2025-10-30",
    "Service": "ma",
    "Region": "cn-beijing"
  },
  "Result": {
    "EnvironmentId": "env_example",
    "Status": "BuildingImage",
    "Step": "WaitImageBuild",
    "Region": "cn-beijing",
    "Architecture": "amd64",
    "ImageId": null,
    "ComposeImagePreloadStatus": "Pending",
    "ComposeImageCount": 1,
    "ErrorCode": null,
    "CreateTime": "2026-11-11T00:00:00Z",
    "UpdateTime": "2026-11-11T00:01:00Z"
  }
}
```

### 使用说明

- 返回 Pending、BuildingImage、CreatingEnvironment、Ready 或 Failed；Ready/Failed 为终态。
- 同一 Action/协议 Version 支持 GET 和 POST；GET 业务参数全部放在查询串，POST 支持 JSON 正文或查询串，不能在两处重复提供同一业务字段。
- 字段名区分大小写，重复查询键、非法整数/布尔值及 GET 正文返回 400。
- 两种方法使用相同账号认证、授权、校验、分页、成功与错误响应。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="createdevboxinstance-top"></a>

## CreateDevboxInstance

创建 DevboxInstance。


```http
POST /?Action=CreateDevboxInstance&Version=2025-10-30
```

### 请求参数

| 参数 | 类型 | 是&#8288;否&#8288;必&#8288;传 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| Name | string | 是 | — | 实例名称。1～128 字符。示例：`"devbox"`。 |
| EnvironmentId | string | 是 | — | Cloud-ECS Environment ID。必须可见且 Active。示例：`"env_example"`。 |
| ClientToken | string | 否 | 不启用幂等 | 幂等令牌。最长 64 个可打印 ASCII 字符。示例：`"devbox-create-001"`。 |

### 请求示例

```http
POST /?Action=CreateDevboxInstance&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "Name": "devbox",
  "EnvironmentId": "env_example",
  "ClientToken": "devbox-create-001"
}
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是&#8288;否&#8288;必&#8288;返 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| ResponseMetadata | object | 是 | — | 公共响应元信息，字段定义见[公共 ResponseMetadata](conventions.md#响应元信息)。 |
| Result | object | 是 | — | 实例 ID。写操作只返回 ID。子字段在本表下方逐项列出。 |
| Result.DevboxInstanceId | string | 是 | — | Devbox 实例 ID。服务生成。示例：`"di_example"`。 |

### 响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "req_example",
    "Action": "CreateDevboxInstance",
    "Version": "2025-10-30",
    "Service": "ma",
    "Region": "cn-beijing"
  },
  "Result": {
    "DevboxInstanceId": "di_example"
  }
}
```

### 使用说明

首次创建在 ECS Running 后等待云助手，依次执行 PackageInstall、PreUp、ComposeUp 和 PostUp；Start/Reboot 不重跑。Packages 支持 apt、pip、npm；请求包含 Npm 且镜像未预装 npm 时先通过 apt-get 安装 npm。Environment 包含 DockerCompose 时，PackageInstall 先复用已有 Docker 与 Compose，只补齐缺失的 docker.io 或 Compose 组件，不安装 docker-cli，也不替换已有 Docker CE。Docker registry mirror 默认不由平台接管；部署方显式启用后保留已有配置并去重追加可信 mirror。ComposeUp 优先使用 docker compose；回落 docker-compose v1 时将顶层 name 转为 -p 项目名，并等待容器运行或健康检查成功后再执行 PostUp。安装或就绪等待失败会终止首次启动。当前 Lifecycle 只支持内联 Script，ScriptRef 返回 DevboxLifecycleScriptRefUnsupported。目标镜像需提供云助手；仅在缺少运行依赖时需要 apt-get 和 systemctl 或 service。

- WorkspaceId 不接受租户输入；Devbox 继承 EnvironmentId 对应 Environment 的 WorkspaceId。
- Region 和 ZoneId 同样不接受租户输入；Region 使用 Controller 配置，ZoneId 由 Environment 首个 Subnet 查询。
- 系统盘大小取创建时 Environment 的 Config.Resources.DiskSize，省略时为 80Gi，支持 20～2048Gi；Devbox 冻结创建时的系统盘和 Packages，后续 Environment 更新只影响新 Devbox。
- CreateEnvironmentWithImageBuild 生成的 Environment 不含 Packages，因此不会在 Devbox 启动时重复安装。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="executedevboxinstancecommand-top"></a>

## ExecuteDevboxInstanceCommand

ExecuteDevboxInstanceCommand。


```http
POST /?Action=ExecuteDevboxInstanceCommand&Version=2025-10-30
```

### 请求参数

| 参数 | 类型 | 是&#8288;否&#8288;必&#8288;传 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| DevboxInstanceId | string | 是 | — | Devbox 实例 ID。必须属于当前账号且状态为 Running。示例：`"di_example"`。 |
| Command | string | 是 | — | Shell 命令正文。UTF-8、无 NUL，最多 64 KiB；服务以标准 Base64 保存并提交云助手。敏感值，仅在运行时提供。示例：`"echo hello"`。 |
| TimeoutSeconds | integer | 否 | 300 | 命令超时秒数。1～1800。示例：`300`。 |
| ClientToken | string | 否 | 不启用幂等 | 可选幂等令牌。最长 64 个可打印 ASCII 字符；省略时不启用幂等。示例：`"exec-001"`。 |

### 请求示例

```http
POST /?Action=ExecuteDevboxInstanceCommand&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "DevboxInstanceId": "di_example",
  "Command": "echo hello",
  "TimeoutSeconds": 300,
  "ClientToken": "exec-001"
}
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是&#8288;否&#8288;必&#8288;返 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| ResponseMetadata | object | 是 | — | 公共响应元信息，字段定义见[公共 ResponseMetadata](conventions.md#响应元信息)。 |
| Result | object | 是 | — | 命令执行 ID。只返回 CommandExecutionId。子字段在本表下方逐项列出。 |
| Result.CommandExecutionId | string | 是 | — | 命令执行 ID。服务生成。示例：`"dce_example"`。 |

### 响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "req_example",
    "Action": "ExecuteDevboxInstanceCommand",
    "Version": "2025-10-30",
    "Service": "ma",
    "Region": "cn-beijing"
  },
  "Result": {
    "CommandExecutionId": "dce_example"
  }
}
```

### 使用说明

通过 ECS 云助手异步执行单次 root Shell 命令；不等待命令结束。

- Devbox 必须为 Running 且云助手可用。
- ClientToken 可选；提供时启用账号级幂等，省略时每次请求创建新执行。
- 命令正文和云助手合并 Output 分别以标准 Base64 落库，均不写普通日志；Base64 不提供加密保护。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="getdevboxinstancecommandresult-top"></a>

## GetDevboxInstanceCommandResult

查询 DevboxInstanceCommandResult。


```http
GET /?Action=GetDevboxInstanceCommandResult&Version=2025-10-30
POST /?Action=GetDevboxInstanceCommandResult&Version=2025-10-30
```

### 请求参数

| 参数 | 类型 | 是&#8288;否&#8288;必&#8288;传 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| CommandExecutionId | string | 是 | — | 命令执行 ID。必须属于当前可信账号。示例：`"dce_example"`。 |

### 请求示例

```http
POST /?Action=GetDevboxInstanceCommandResult&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "CommandExecutionId": "dce_example"
}
```

也可以上传文件集合：

```http
GET /?Action=GetDevboxInstanceCommandResult&Version=2025-10-30&CommandExecutionId=dce_example HTTP/1.1
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是&#8288;否&#8288;必&#8288;返 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| ResponseMetadata | object | 是 | — | 公共响应元信息，字段定义见[公共 ResponseMetadata](conventions.md#响应元信息)。 |
| Result | object | 是 | — | 命令执行结果。Pending/Running 时部分终态字段为空。子字段在本表下方逐项列出。 |
| Result.CommandExecutionId | string | 是 | — | 命令执行 ID。服务生成。示例：`"dce_example"`。 |
| Result.DevboxInstanceId | string | 是 | — | 关联 Devbox 实例 ID。执行创建时固定。示例：`"di_example"`。 |
| Result.Status | string | 是 | — | 归一化执行状态。Pending、Running、Succeeded、Failed、TimedOut、Cancelled 或 Unknown。示例：`"Succeeded"`。 |
| Result.ExitCode | integer | 否 | — | 进程退出码。云助手返回后提供。允许 `null`。示例：`0`。 |
| Result.Output | string | 否 | — | 命令标准输出与标准错误合并结果。云助手结果解码后的 UTF-8 文本，最多 64 KiB。允许 `null`。敏感值，仅在运行时提供。示例：`"hello\n"`。可能省略。 |
| Result.OutputTruncated | boolean | 是 | — | 输出是否被接口截断。Output 超过 64 KiB 时为 true。示例：`false`。 |
| Result.ErrorCode | string | 否 | — | 稳定错误码或云助手错误码。失败或结果不确定时返回。允许 `null`。示例：`null`。 |
| Result.StartTime | string | 否 | — | 命令开始时间。RFC3339。允许 `null`。示例：`"2026-11-12T10:00:00Z"`。可能省略。 |
| Result.EndTime | string | 否 | — | 命令结束时间。RFC3339。允许 `null`。示例：`"2026-11-12T10:00:01Z"`。可能省略。 |

### 响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "req_example",
    "Action": "GetDevboxInstanceCommandResult",
    "Version": "2025-10-30",
    "Service": "ma",
    "Region": "cn-beijing"
  },
  "Result": {
    "CommandExecutionId": "dce_example",
    "DevboxInstanceId": "di_example",
    "Status": "Succeeded",
    "ExitCode": 0,
    "Output": "hello\n",
    "OutputTruncated": false,
    "ErrorCode": null,
    "StartTime": "2026-11-12T10:00:00Z",
    "EndTime": "2026-11-12T10:00:01Z"
  }
}
```

### 使用说明

接口不阻塞等待，Pending/Running 时由调用方继续轮询。

- 只接收 CommandExecutionId，并按可信账号及执行记录归属查询。
- 命令非零退出仍返回 200，以 Status、ExitCode 和 ErrorCode 表达。
- 云助手合并 Output 以标准 Base64 落库且不写普通日志；接口解码后最多返回 64 KiB，超出部分仅在响应中截断。
- 同一 Action/协议 Version 支持 GET 和 POST；GET 业务参数全部放在查询串，POST 支持 JSON 正文或查询串，不能在两处重复提供同一业务字段。
- 字段名区分大小写，重复查询键、非法整数/布尔值及 GET 正文返回 400。
- 两种方法使用相同账号认证、授权、校验、分页、成功与错误响应。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="getdevboxinstance-top"></a>

## GetDevboxInstance

查询 DevboxInstance。


```http
GET /?Action=GetDevboxInstance&Version=2025-10-30
POST /?Action=GetDevboxInstance&Version=2025-10-30
```

### 请求参数

| 参数 | 类型 | 是&#8288;否&#8288;必&#8288;传 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| DevboxInstanceId | string | 是 | — | Devbox 实例 ID。当前账号可见。示例：`"di_example"`。 |
| WorkspaceId | string | 否 | 默认 Workspace | Workspace 标识。省略使用默认 Workspace。示例：`"workspace"`。 |

### 请求示例

```http
POST /?Action=GetDevboxInstance&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "DevboxInstanceId": "di_example"
}
```

也可以上传文件集合：

```http
GET /?Action=GetDevboxInstance&Version=2025-10-30&DevboxInstanceId=di_example HTTP/1.1
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是&#8288;否&#8288;必&#8288;返 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| ResponseMetadata | object | 是 | — | 公共响应元信息，字段定义见[公共 ResponseMetadata](conventions.md#响应元信息)。 |
| Result | object | 是 | — | 实例对象。完整状态快照。子字段在本表下方逐项列出。 |
| Result.DevboxInstanceId | string | 是 | — | Devbox 实例 ID。服务生成。示例：`"di_example"`。 |
| Result.Name | string | 是 | — | 名称。创建时固定。示例：`"devbox"`。 |
| Result.UserId | string | 是 | — | 创建用户。来自认证主体。示例：`"user"`。 |
| Result.WorkspaceId | string | 是 | — | Workspace。归属快照。示例：`"workspace"`。 |
| Result.EnvironmentId | string | 是 | — | Environment ID。创建时固定。示例：`"env_example"`。 |
| Result.ImageId | string | 是 | — | ECS 镜像 ID。创建时固定。示例：`"image_example"`。 |
| Result.Region | string | 是 | — | 地域。来自 Controller 配置。示例：`"cn-beijing"`。 |
| Result.ZoneId | string | 是 | — | 可用区。从 Subnet 查询。示例：`"cn-beijing-a"`。 |
| Result.SubnetId | string | 是 | — | 子网。Environment 首个 Subnet。示例：`"subnet_example"`。 |
| Result.InstanceTypeId | string | 是 | — | ECS 规格。映射解析结果。示例：`"ecs.g3i.xlarge"`。 |
| Result.CpuMilli | integer | 是 | — | CPU 毫核。正整数。示例：`4000`。 |
| Result.MemoryMb | integer | 是 | — | 内存 MiB。正整数。示例：`16384`。 |
| Result.MappingId | string | 是 | — | 映射 ID。创建时固定。示例：`"dim_example"`。 |
| Result.MappingVersion | integer | 是 | — | 映射版本。正整数。示例：`1`。 |
| Result.ProviderInstanceId | string | 否 | — | 云实例 ID。创建成功后返回。允许 `null`。示例：`"i-example"`。 |
| Result.Status | string | 是 | — | 公开状态。Preparing/Starting/Running/Stopping/Stopped/Rebooting/Deleting/Deleted/Failed/Unknown。示例：`"Running"`。 |
| Result.DesiredState | string | 是 | — | 期望状态。Running/Stopped/Deleted。示例：`"Running"`。 |
| Result.ObservedState | string | 是 | — | Provider 观测状态。最近一次观测值。示例：`"Running"`。 |
| Result.Revision | integer | 是 | — | 并发版本。正整数。示例：`1`。 |
| Result.Generation | integer | 是 | — | 期望代次。正整数。示例：`1`。 |
| Result.ObservedGeneration | integer | 是 | — | 已观测代次。非负整数。示例：`1`。 |
| Result.Endpoint | string | 否 | — | 脱敏连接入口。实例私网 HTTP 地址，格式为 http://{private_ip}:6768，不含长期凭据。允许 `null`。示例：`"http://10.0.0.2:6768"`。可能省略。 |
| Result.ExpireTime | string | 否 | — | 到期时间。RFC3339。允许 `null`。示例：`"2026-11-11T01:00:00Z"`。可能省略。 |
| Result.ErrorCode | string | 否 | — | 稳定错误码。失败时返回。允许 `null`。示例：`"DevboxCreateFailed"`。 |
| Result.StartupStage | string | 是 | — | 首次启动阶段。空值、WaitingAssistant、PackageInstall、PreUp、ComposeUp、PostUp 或 Complete。示例：`"Complete"`。 |
| Result.PackageInstallStatus | string | 是 | — | 软件包安装状态。NotRequested、Pending、Running、Succeeded 或 Failed。示例：`"Succeeded"`。 |
| Result.PackageCount | integer | 是 | — | 冻结的软件包数量。非负整数。示例：`3`。 |
| Result.CreateTime | string | 是 | — | 创建时间。RFC3339。示例：`"2026-11-11T00:00:00Z"`。 |
| Result.UpdateTime | string | 是 | — | 更新时间。RFC3339。示例：`"2026-11-11T00:01:00Z"`。 |

### 响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "req_example",
    "Action": "GetDevboxInstance",
    "Version": "2025-10-30",
    "Service": "ma",
    "Region": "cn-beijing"
  },
  "Result": {
    "DevboxInstanceId": "di_example",
    "Name": "devbox",
    "UserId": "user",
    "WorkspaceId": "workspace",
    "EnvironmentId": "env_example",
    "ImageId": "image_example",
    "Region": "cn-beijing",
    "ZoneId": "cn-beijing-a",
    "SubnetId": "subnet_example",
    "InstanceTypeId": "ecs.g3i.xlarge",
    "CpuMilli": 4000,
    "MemoryMb": 16384,
    "MappingId": "dim_example",
    "MappingVersion": 1,
    "Status": "Running",
    "DesiredState": "Running",
    "ObservedState": "Running",
    "Revision": 1,
    "Generation": 1,
    "ObservedGeneration": 1,
    "StartupStage": "Complete",
    "PackageInstallStatus": "Succeeded",
    "PackageCount": 3,
    "CreateTime": "2026-11-11T00:00:00Z",
    "UpdateTime": "2026-11-11T00:01:00Z"
  }
}
```

### 使用说明

- 按账号和 Workspace 隔离查询。
- 同一 Action/协议 Version 支持 GET 和 POST；GET 业务参数全部放在查询串，POST 支持 JSON 正文或查询串，不能在两处重复提供同一业务字段。
- 字段名区分大小写，重复查询键、非法整数/布尔值及 GET 正文返回 400。
- 两种方法使用相同账号认证、授权、校验、分页、成功与错误响应。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="listdevboxinstances-top"></a>

## ListDevboxInstances

列出 DevboxInstances。


```http
GET /?Action=ListDevboxInstances&Version=2025-10-30
POST /?Action=ListDevboxInstances&Version=2025-10-30
```

### 请求参数

| 参数 | 类型 | 是&#8288;否&#8288;必&#8288;传 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| EnvironmentId | string | 否 | 全部 | Environment 筛选。精确匹配。示例：`"env_example"`。 |
| ImageId | string | 否 | 全部 | 镜像筛选。精确匹配。示例：`"image_example"`。 |
| UserId | string | 否 | 全部 | 创建用户筛选。精确匹配。示例：`"user"`。 |
| Region | string | 否 | 全部 | 地域筛选。精确匹配。示例：`"cn-beijing"`。 |
| Status | string[] | 否 | 全部非 Deleted 状态 | 状态筛选。公开状态数组；列表始终不返回 Deleted 记录。示例：`["Running"]`。 |
| WorkspaceId | string | 否 | 默认 Workspace | Workspace 精确筛选。显式值经 Workspace 可见性校验；省略时使用默认 Workspace。示例：`"workspace"`。 |
| MaxResults | integer | 否 | 20 | 每页数量。1～100。示例：`20`。 |
| NextToken | string | 否 | 首屏 | 分页游标。不透明游标。示例：`"opaque"`。 |

### 请求示例

```http
POST /?Action=ListDevboxInstances&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "MaxResults": 20
}
```

也可以上传文件集合：

```http
GET /?Action=ListDevboxInstances&Version=2025-10-30&MaxResults=20 HTTP/1.1
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是&#8288;否&#8288;必&#8288;返 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| ResponseMetadata | object | 是 | — | 公共响应元信息，字段定义见[公共 ResponseMetadata](conventions.md#响应元信息)。 |
| Result | object | 是 | — | 列表结果。Items 与 NextToken。子字段在本表下方逐项列出。 |
| Result.Items | object[] | 是 | — | 实例列表。可为空数组。子字段在本表下方逐项列出。 |
| Result.Items[].DevboxInstanceId | string | 是 | — | Devbox 实例 ID。服务生成。示例：`"di_example"`。 |
| Result.Items[].Name | string | 是 | — | 名称。创建时固定。示例：`"devbox"`。 |
| Result.Items[].UserId | string | 是 | — | 创建用户。来自认证主体。示例：`"user"`。 |
| Result.Items[].WorkspaceId | string | 是 | — | Workspace。归属快照。示例：`"workspace"`。 |
| Result.Items[].EnvironmentId | string | 是 | — | Environment ID。创建时固定。示例：`"env_example"`。 |
| Result.Items[].ImageId | string | 是 | — | ECS 镜像 ID。创建时固定。示例：`"image_example"`。 |
| Result.Items[].Region | string | 是 | — | 地域。来自 Controller 配置。示例：`"cn-beijing"`。 |
| Result.Items[].ZoneId | string | 是 | — | 可用区。从 Subnet 查询。示例：`"cn-beijing-a"`。 |
| Result.Items[].SubnetId | string | 是 | — | 子网。Environment 首个 Subnet。示例：`"subnet_example"`。 |
| Result.Items[].InstanceTypeId | string | 是 | — | ECS 规格。映射解析结果。示例：`"ecs.g3i.xlarge"`。 |
| Result.Items[].CpuMilli | integer | 是 | — | CPU 毫核。正整数。示例：`4000`。 |
| Result.Items[].MemoryMb | integer | 是 | — | 内存 MiB。正整数。示例：`16384`。 |
| Result.Items[].MappingId | string | 是 | — | 映射 ID。创建时固定。示例：`"dim_example"`。 |
| Result.Items[].MappingVersion | integer | 是 | — | 映射版本。正整数。示例：`1`。 |
| Result.Items[].ProviderInstanceId | string | 否 | — | 云实例 ID。创建成功后返回。允许 `null`。示例：`"i-example"`。 |
| Result.Items[].Status | string | 是 | — | 公开状态。Preparing/Starting/Running/Stopping/Stopped/Rebooting/Deleting/Deleted/Failed/Unknown。示例：`"Running"`。 |
| Result.Items[].DesiredState | string | 是 | — | 期望状态。Running/Stopped/Deleted。示例：`"Running"`。 |
| Result.Items[].ObservedState | string | 是 | — | Provider 观测状态。最近一次观测值。示例：`"Running"`。 |
| Result.Items[].Revision | integer | 是 | — | 并发版本。正整数。示例：`1`。 |
| Result.Items[].Generation | integer | 是 | — | 期望代次。正整数。示例：`1`。 |
| Result.Items[].ObservedGeneration | integer | 是 | — | 已观测代次。非负整数。示例：`1`。 |
| Result.Items[].Endpoint | string | 否 | — | 脱敏连接入口。实例私网 HTTP 地址，格式为 http://{private_ip}:6768，不含长期凭据。允许 `null`。示例：`"http://10.0.0.2:6768"`。可能省略。 |
| Result.Items[].ExpireTime | string | 否 | — | 到期时间。RFC3339。允许 `null`。示例：`"2026-11-11T01:00:00Z"`。可能省略。 |
| Result.Items[].ErrorCode | string | 否 | — | 稳定错误码。失败时返回。允许 `null`。示例：`"DevboxCreateFailed"`。 |
| Result.Items[].StartupStage | string | 是 | — | 首次启动阶段。空值、WaitingAssistant、PackageInstall、PreUp、ComposeUp、PostUp 或 Complete。示例：`"Complete"`。 |
| Result.Items[].PackageInstallStatus | string | 是 | — | 软件包安装状态。NotRequested、Pending、Running、Succeeded 或 Failed。示例：`"Succeeded"`。 |
| Result.Items[].PackageCount | integer | 是 | — | 冻结的软件包数量。非负整数。示例：`3`。 |
| Result.Items[].CreateTime | string | 是 | — | 创建时间。RFC3339。示例：`"2026-11-11T00:00:00Z"`。 |
| Result.Items[].UpdateTime | string | 是 | — | 更新时间。RFC3339。示例：`"2026-11-11T00:01:00Z"`。 |
| Result.NextToken | string | 否 | — | 下一页游标。末页为 null。示例：`null`。可能省略。 |

### 响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "req_example",
    "Action": "ListDevboxInstances",
    "Version": "2025-10-30",
    "Service": "ma",
    "Region": "cn-beijing"
  },
  "Result": {
    "Items": [],
    "NextToken": null
  }
}
```

### 使用说明

- 按实例 ID 降序分页，默认每页 20，始终排除 Deleted。
- 显式 WorkspaceId 先校验可见性；省略时使用默认 Workspace。
- 同一 Action/协议 Version 支持 GET 和 POST；GET 业务参数全部放在查询串，POST 支持 JSON 正文或查询串，不能在两处重复提供同一业务字段。
- 字段名区分大小写，重复查询键、非法整数/布尔值及 GET 正文返回 400。
- 两种方法使用相同账号认证、授权、校验、分页、成功与错误响应。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="startdevboxinstance-top"></a>

## StartDevboxInstance

StartDevboxInstance。


```http
POST /?Action=StartDevboxInstance&Version=2025-10-30
```

### 请求参数

| 参数 | 类型 | 是&#8288;否&#8288;必&#8288;传 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| DevboxInstanceId | string | 是 | — | Devbox 实例 ID。当前账号可见。示例：`"di_example"`。 |
| ExpectedRevision | integer | 否 | 不检查 | 期望 revision。提供时必须等于当前 Revision。示例：`1`。 |
| ClientToken | string | 否 | 不启用幂等 | 幂等令牌。最长 64 个可打印 ASCII 字符。示例：`"mutation-001"`。 |

### 请求示例

```http
POST /?Action=StartDevboxInstance&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "DevboxInstanceId": "di_example",
  "ExpectedRevision": 1,
  "ClientToken": "start-001"
}
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是&#8288;否&#8288;必&#8288;返 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| ResponseMetadata | object | 是 | — | 公共响应元信息，字段定义见[公共 ResponseMetadata](conventions.md#响应元信息)。 |
| Result | object | 是 | — | 实例 ID。写操作只返回 ID。子字段在本表下方逐项列出。 |
| Result.DevboxInstanceId | string | 是 | — | Devbox 实例 ID。服务生成。示例：`"di_example"`。 |

### 响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "req_example",
    "Action": "StartDevboxInstance",
    "Version": "2025-10-30",
    "Service": "ma",
    "Region": "cn-beijing"
  },
  "Result": {
    "DevboxInstanceId": "di_example"
  }
}
```

### 使用说明

- 仅 Stopped 可启动。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="stopdevboxinstance-top"></a>

## StopDevboxInstance

StopDevboxInstance。


```http
POST /?Action=StopDevboxInstance&Version=2025-10-30
```

### 请求参数

| 参数 | 类型 | 是&#8288;否&#8288;必&#8288;传 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| DevboxInstanceId | string | 是 | — | Devbox 实例 ID。当前账号可见。示例：`"di_example"`。 |
| ExpectedRevision | integer | 否 | 不检查 | 期望 revision。提供时必须等于当前 Revision。示例：`1`。 |
| ClientToken | string | 否 | 不启用幂等 | 幂等令牌。最长 64 个可打印 ASCII 字符。示例：`"mutation-001"`。 |

### 请求示例

```http
POST /?Action=StopDevboxInstance&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "DevboxInstanceId": "di_example",
  "ExpectedRevision": 1,
  "ClientToken": "stop-001"
}
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是&#8288;否&#8288;必&#8288;返 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| ResponseMetadata | object | 是 | — | 公共响应元信息，字段定义见[公共 ResponseMetadata](conventions.md#响应元信息)。 |
| Result | object | 是 | — | 实例 ID。写操作只返回 ID。子字段在本表下方逐项列出。 |
| Result.DevboxInstanceId | string | 是 | — | Devbox 实例 ID。服务生成。示例：`"di_example"`。 |

### 响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "req_example",
    "Action": "StopDevboxInstance",
    "Version": "2025-10-30",
    "Service": "ma",
    "Region": "cn-beijing"
  },
  "Result": {
    "DevboxInstanceId": "di_example"
  }
}
```

### 使用说明

- 仅 Running 可停止。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="rebootdevboxinstance-top"></a>

## RebootDevboxInstance

RebootDevboxInstance。


```http
POST /?Action=RebootDevboxInstance&Version=2025-10-30
```

### 请求参数

| 参数 | 类型 | 是&#8288;否&#8288;必&#8288;传 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| DevboxInstanceId | string | 是 | — | Devbox 实例 ID。当前账号可见。示例：`"di_example"`。 |
| ExpectedRevision | integer | 否 | 不检查 | 期望 revision。提供时必须等于当前 Revision。示例：`1`。 |
| ClientToken | string | 否 | 不启用幂等 | 幂等令牌。最长 64 个可打印 ASCII 字符。示例：`"mutation-001"`。 |

### 请求示例

```http
POST /?Action=RebootDevboxInstance&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "DevboxInstanceId": "di_example",
  "ExpectedRevision": 1,
  "ClientToken": "reboot-001"
}
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是&#8288;否&#8288;必&#8288;返 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| ResponseMetadata | object | 是 | — | 公共响应元信息，字段定义见[公共 ResponseMetadata](conventions.md#响应元信息)。 |
| Result | object | 是 | — | 实例 ID。写操作只返回 ID。子字段在本表下方逐项列出。 |
| Result.DevboxInstanceId | string | 是 | — | Devbox 实例 ID。服务生成。示例：`"di_example"`。 |

### 响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "req_example",
    "Action": "RebootDevboxInstance",
    "Version": "2025-10-30",
    "Service": "ma",
    "Region": "cn-beijing"
  },
  "Result": {
    "DevboxInstanceId": "di_example"
  }
}
```

### 使用说明

- 仅 Running 可重启。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="deletedevboxinstance-top"></a>

## DeleteDevboxInstance

删除 DevboxInstance。


```http
POST /?Action=DeleteDevboxInstance&Version=2025-10-30
```

### 请求参数

| 参数 | 类型 | 是&#8288;否&#8288;必&#8288;传 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| DevboxInstanceId | string | 是 | — | Devbox 实例 ID。当前账号可见。示例：`"di_example"`。 |
| Force | boolean | 否 | false | 强制提交删除意图。默认 false。示例：`false`。 |
| ExpectedRevision | integer | 否 | 不检查 | 期望 revision。提供时必须等于当前 Revision。示例：`1`。 |
| ClientToken | string | 否 | 不启用幂等 | 幂等令牌。最长 64 个可打印 ASCII 字符。示例：`"delete-001"`。 |

### 请求示例

```http
POST /?Action=DeleteDevboxInstance&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "DevboxInstanceId": "di_example",
  "Force": false,
  "ExpectedRevision": 1,
  "ClientToken": "delete-001"
}
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是&#8288;否&#8288;必&#8288;返 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| ResponseMetadata | object | 是 | — | 公共响应元信息，字段定义见[公共 ResponseMetadata](conventions.md#响应元信息)。 |
| Result | object | 是 | — | 实例 ID。写操作只返回 ID。子字段在本表下方逐项列出。 |
| Result.DevboxInstanceId | string | 是 | — | Devbox 实例 ID。服务生成。示例：`"di_example"`。 |

### 响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "req_example",
    "Action": "DeleteDevboxInstance",
    "Version": "2025-10-30",
    "Service": "ma",
    "Region": "cn-beijing"
  },
  "Result": {
    "DevboxInstanceId": "di_example"
  }
}
```

### 使用说明

- 删除为终止意图，重复删除 Deleted 实例幂等。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="getenvironment-top"></a>

## GetEnvironment

查询环境。


```http
GET /?Action=GetEnvironment&Version=2025-10-30
POST /?Action=GetEnvironment&Version=2025-10-30
```

### 请求参数

| 参数 | 类型 | 是&#8288;否&#8288;必&#8288;传 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| EnvironmentId | string | 是 | — | 环境 ID。必填；非空、同账号且调用方可见的资源 ID；不以示例前缀代替权限校验。示例：`"env_example"`。 |
| WorkspaceId | string | 否 | 开启开关时解析唯一默认 Workspace，关闭时忽略 | Workspace 选择器，受 Workspace 开关控制。可选字符串，去首尾空白；兼容 workspace_id，与 anthropic-workspace-id 请求头及兼容字段同时提供时须一致。Data.Resource.Workspace.Enabled 开启时，省略或空字符串解析唯一默认 Workspace；默认 Workspace 的列表、详情和版本查询兼容同账号未记录 Workspace 的旧资源，其他 Workspace 仅查询精确归属；旧资源响应 WorkspaceId 仍为空；跨空间目标返回不存在；显式选择时通过 GetWorkspace 的 WorkspaceType=DEFAULT 确认默认空间，查询失败不放宽范围；非字符串及 null 返回 400。关闭开关时忽略该选择器。示例：`"workspace-example"`。 |

### 请求示例

```http
POST /?Action=GetEnvironment&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "EnvironmentId": "env_example",
  "WorkspaceId": "workspace-example"
}
```

也可以上传文件集合：

```http
GET /?Action=GetEnvironment&Version=2025-10-30&EnvironmentId=env_example HTTP/1.1
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是&#8288;否&#8288;必&#8288;返 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| ResponseMetadata | object | 是 | — | 公共响应元信息，字段定义见[公共 ResponseMetadata](conventions.md#响应元信息)。 |
| Result | object | 是 | — | 成功结果。仅成功响应必返；失败时省略，错误格式见公共约定。字段定义见[公共对象](#environment-object)。 |

### 响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "req_example",
    "Action": "GetEnvironment",
    "Version": "2025-10-30",
    "Service": "ma",
    "Region": "cn-beijing"
  },
  "Result": {
    "EnvironmentId": "env_example",
    "Name": "documentation",
    "Description": "文档示例",
    "Config": {
      "Type": "SelfHosted"
    },
    "Metadata": {
      "purpose": "documentation"
    },
    "Status": "Active",
    "CreatedAt": "2026-10-12T08:00:00Z",
    "UpdatedAt": "2026-10-12T08:00:00Z",
    "WorkspaceId": "workspace-example"
  }
}
```

### 使用说明

- 仅查询当前账号可见的环境；不存在或跨账号返回 404。
- Status 仅表示环境生命周期，不保证关联执行资源就绪。
- 同一 Action/协议 Version 支持 GET 和 POST；GET 业务参数全部放在查询串，POST 支持 JSON 正文或查询串，不能在两处重复提供同一业务字段。
- 字段名区分大小写，重复查询键、非法整数/布尔值及 GET 正文返回 400。
- 两种方法使用相同账号认证、授权、校验、分页、成功与错误响应。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="listenvironments-top"></a>

## ListEnvironments

列出环境。


```http
GET /?Action=ListEnvironments&Version=2025-10-30
POST /?Action=ListEnvironments&Version=2025-10-30
```

### 请求参数

| 参数 | 类型 | 是&#8288;否&#8288;必&#8288;传 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| MaxResults | integer | 否 | `100` | 每页条数。省略或 0 使用 100；正整数 1～100，负数、超过 100 或非整数返回 HTTP 400。允许 `null`。示例：`100`。 |
| NextToken | string | 否 | 首屏 | 分页游标。首屏省略或空字符串；后续原样使用上一页 NextToken，不自行拼接，游标无效或与账号/筛选条件不匹配时返回 HTTP 400。允许 `null`。示例：`"opaque_page_cursor"`。 |
| IncludeArchived | boolean | 否 | `false` | 包含归档对象。省略默认 false。允许 `null`。示例：`false`。 |
| Metadata | object | 否 | 不按元数据筛选 | 元数据筛选。按 JSONB 包含关系匹配所有条件；保留键名大小写及 JSON 类型。空对象不筛选；GET 参数传 URL 编码后的 JSON 对象。示例：`{"team":"search"}`。 |
| Filters | object[] | 否 | 不筛选 | 过滤条件。最多 10 条；不同条件按且组合，分页前应用。省略或空数组不筛选。子字段在本表下方逐项列出。 |
| Filters[].Name | string | 否 | 无 | 过滤字段名。支持 Id 精确匹配、Name 包含匹配（大小写敏感，% 和 _ 按普通字符处理）；多个字段以 & 分隔，按或匹配。示例：`"Id&Name"`。 |
| Filters[].Values | string[] | 否 | 无 | 匹配值。非空字符串数组，多个值按或匹配。示例：`["example"]`。 |
| ProjectName | string | 否 | 无 | 按项目名选择 Workspace。精确匹配当前组织内唯一的 ACTIVE Workspace；与 WorkspaceId 同时提供时须指向同一 Workspace。关闭 Workspace 开关时忽略。示例：`"project-example"`。 |
| WorkspaceId | string | 否 | 开启开关时解析唯一默认 Workspace，关闭时忽略 | Workspace 选择器，受 Workspace 开关控制。可选字符串，去首尾空白；兼容 workspace_id，与 anthropic-workspace-id 请求头及兼容字段同时提供时须一致。Data.Resource.Workspace.Enabled 开启时，省略或空字符串解析唯一默认 Workspace；默认 Workspace 的列表、详情和版本查询兼容同账号未记录 Workspace 的旧资源，其他 Workspace 仅查询精确归属；旧资源响应 WorkspaceId 仍为空；跨空间目标返回不存在；显式选择时通过 GetWorkspace 的 WorkspaceType=DEFAULT 确认默认空间，查询失败不放宽范围；非字符串及 null 返回 400。关闭开关时忽略该选择器。示例：`"workspace-example"`。 |
| PageNumber | integer | 否 | 仅 Console 场景返回或生效 | 仅 Console 场景使用的分页字段。X-Top-Client-Type 为 Console 时使用。PageNumber 默认 1，范围 1 到 2147483647；PageSize 默认 100，范围 1 到 100；TotalCount 为相同筛选条件下的总数。普通 OpenAPI 保留游标分页。示例：`1`。 |
| PageSize | integer | 否 | 仅 Console 场景返回或生效 | 仅 Console 场景使用的分页字段。X-Top-Client-Type 为 Console 时使用。PageNumber 默认 1，范围 1 到 2147483647；PageSize 默认 100，范围 1 到 100；TotalCount 为相同筛选条件下的总数。普通 OpenAPI 保留游标分页。示例：`1`。 |

### 请求示例

```http
POST /?Action=ListEnvironments&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "MaxResults": 100,
  "IncludeArchived": false,
  "WorkspaceId": "workspace-example"
}
```

也可以上传文件集合：

```http
GET /?Action=ListEnvironments&Version=2025-10-30&MaxResults=100&IncludeArchived=false HTTP/1.1
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是&#8288;否&#8288;必&#8288;返 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| ResponseMetadata | object | 是 | — | 公共响应元信息，字段定义见[公共 ResponseMetadata](conventions.md#响应元信息)。 |
| Result | object | 是 | — | 成功结果。仅成功响应必返；失败时省略，错误格式见公共约定。子字段在本表下方逐项列出。 |
| Result.Items | object[] | 是 | — | 环境数组。本页结果；无匹配项时为空数组。字段定义见[公共对象](#environment-object)。 |
| Result.NextToken | string | 是 | — | 下一页游标。有后续结果时返回不透明游标，末页返回 null；下一次请求将其传为 NextToken。示例：`null`。 |
| Result.PageNumber | integer | 否 | — | 仅 Console 场景使用的分页字段。X-Top-Client-Type 为 Console 时使用。PageNumber 默认 1，范围 1 到 2147483647；PageSize 默认 100，范围 1 到 100；TotalCount 为相同筛选条件下的总数。普通 OpenAPI 保留游标分页。示例：`1`。可能省略。 |
| Result.PageSize | integer | 否 | — | 仅 Console 场景使用的分页字段。X-Top-Client-Type 为 Console 时使用。PageNumber 默认 1，范围 1 到 2147483647；PageSize 默认 100，范围 1 到 100；TotalCount 为相同筛选条件下的总数。普通 OpenAPI 保留游标分页。示例：`1`。可能省略。 |
| Result.TotalCount | integer | 否 | — | 仅 Console 场景使用的分页字段。X-Top-Client-Type 为 Console 时使用。PageNumber 默认 1，范围 1 到 2147483647；PageSize 默认 100，范围 1 到 100；TotalCount 为相同筛选条件下的总数。普通 OpenAPI 保留游标分页。示例：`1`。可能省略。 |

### 响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "req_example",
    "Action": "ListEnvironments",
    "Version": "2025-10-30",
    "Service": "ma",
    "Region": "cn-beijing"
  },
  "Result": {
    "Items": [
      {
        "EnvironmentId": "env_example",
        "Name": "documentation",
        "Description": "文档示例",
        "Config": {
          "Type": "SelfHosted"
        },
        "Metadata": {
          "purpose": "documentation"
        },
        "Status": "Active",
        "CreatedAt": "2026-10-12T08:00:00Z",
        "UpdatedAt": "2026-10-12T08:00:00Z",
        "WorkspaceId": "workspace-example"
      }
    ],
    "NextToken": null
  }
}
```

### 使用说明

分页使用 MaxResults/NextToken；返回 Items 数组及 NextToken，末页 NextToken=null。

- 首屏省略 NextToken。
- 按环境 ID 降序，默认排除 Archived；IncludeArchived=true 可包含归档环境。
- 没有结果返回 Items=[]；末页 NextToken=null。
- 下一页保持 IncludeArchived 等筛选值不变，可改变 MaxResults；无效或不匹配的游标返回 InvalidParameter.NextToken。
- 同一 Action/协议 Version 支持 GET 和 POST；GET 业务参数全部放在查询串，POST 支持 JSON 正文或查询串，不能在两处重复提供同一业务字段。
- 字段名区分大小写，重复查询键、非法整数/布尔值及 GET 正文返回 400。
- 两种方法使用相同账号认证、授权、校验、分页、成功与错误响应。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="updateenvironment-top"></a>

## UpdateEnvironment

更新环境。


```http
POST /?Action=UpdateEnvironment&Version=2025-10-30
```

### 请求参数

| 参数 | 类型 | 是&#8288;否&#8288;必&#8288;传 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| EnvironmentId | string | 是 | — | 环境 ID。必填；非空、同账号且调用方可见的资源 ID；不以示例前缀代替权限校验。示例：`"env_example"`。 |
| Name | string | 否 | 保留原值 | 名称。去首尾空白后 1～256 字节；省略或 null 保留原值。示例：`"documentation"`。 |
| Description | string | 否 | 保留原值 | 描述。省略保留原值；null 清除描述；字符串替换原值。示例：`"文档示例"`。 |
| Config | object | 否 | 保留原值 | Sandbox 环境配置。SelfHosted 和 Cloud-ECS 按一级键合并；省略或 null 保留原值。Type 和 ImageId 禁止提供；Cloud 传对象返回 OperationDenied.CloudConfigUpdate。子字段在本表下方逐项列出。 |
| Config.Type | string | 否 | 保留原类型 | 类型标识。禁止提供；Environment 类型不可更新，即使值与现有类型相同也返回 OperationDenied.EnvironmentTypeImmutable。示例：`"Cloud-ECS"`。 |
| Config.ImageUrl | string | 否 | 保留原值 | Sandbox 容器镜像地址。可提供镜像引用，未提供时保留原值。示例：`"registry.example.com/sandbox:v1"`。 |
| Config.Resources | object | 否 | 省略对象时保留 | Sandbox 资源配置。提供 Resources 时整体替换资源声明，不逐项合并；未指定的子字段不继承旧值。Cloud 环境的 Config 更新仍不支持，Cloud-ECS 可更新。子字段在本表下方逐项列出。 |
| Config.Resources.CpuMilli | integer | 否 | 未指定则不保存该项 | CPU 毫核数。正整数，单位为 毫核；提供 Resources 时未指定此项不会保留旧值。示例：`2000`。 |
| Config.Resources.MemoryMb | integer | 否 | 未指定则不保存该项 | 内存容量（MiB）。正整数，单位为 MiB；提供 Resources 时未指定此项不会保留旧值。示例：`4096`。 |
| Config.Resources.DiskSize | string | 否 | — | 磁盘容量。正整数加 Gi/Ti（单位忽略大小写）；换算 GiB 后不超过 int64。示例：`"20Gi"`。 |
| Config.EnvVars | object | 否 | — | Sandbox 环境变量字典。Cloud：字符串字典，名称匹配 [A-Za-z_][A-Za-z0-9_]*，单值最多 8192 字节；忽略大小写拒绝 SECRET_、PASSWORD_、TOKEN_ 前缀，并禁止覆盖模型认证、模型服务地址、磁盘配置和软件包安装控制等平台保留变量。对应能力使用专门请求字段配置，不通过 EnvVars 覆盖系统参数。SelfHosted 仅保存声明，不向用户机器注入变量。字典值类型为 `string`。示例：`{"LOG_LEVEL":"info"}`。 |
| Config.AgentKit | object | 否 | — | AgentKit 工具配置。子字段在本表下方逐项列出。 |
| Config.AgentKit.Networking | object | 否 | — | Tool 网络配置。子字段在本表下方逐项列出。 |
| Config.AgentKit.Networking.EnablePublicNetwork | boolean | 否 | 对象省略：`true`<br>仅字段省略：`false` | 启用公网。整个 AgentKit.Networking 对象省略时默认 true；显式对象内省略 EnablePublicNetwork 时为 false；显式对象至少启用一种网络。示例：`true`。 |
| Config.AgentKit.Networking.EnablePrivateNetwork | boolean | 否 | `false` | 启用私网。true 时必须提供 VpcConfiguration。示例：`false`。 |
| Config.AgentKit.Networking.VpcConfiguration | object | 否 | — | 私网配置。仅启用私网时提供。子字段在本表下方逐项列出。 |
| Config.AgentKit.Networking.VpcConfiguration.VpcId | string | 是 | — | VPC ID。启用私网时非空。示例：`"vpc_example"`。 |
| Config.AgentKit.Networking.VpcConfiguration.SubnetIds | string[] | 是 | — | 子网 ID。启用私网时 1～10 项，每项非空。示例：`["subnet_example"]`。 |
| Config.AgentKit.Networking.VpcConfiguration.SecurityGroupIds | string[] | 否 | — | 安全组 ID。可选字符串数组。示例：`["sg_example"]`。 |
| Config.AgentKit.Networking.VpcConfiguration.EnableSharedInternetAccess | boolean | 否 | `false` | 共享公网访问。示例：`false`。 |
| Config.Packages | object | 否 | — | 软件包声明。Cloud 的安装模式与可用管理器受服务部署配置约束，见[安装能力](#environment-capabilities)。Cloud-ECS 支持 apt、pip、npm；CreateEnvironment 保存 Packages，并在每个 Devbox 首次启动时安装；CreateEnvironmentWithImageBuild 仅在构建镜像时使用 Packages，最终 Environment 会删除该字段。SelfHosted 仅保存声明。子字段在本表下方逐项列出。 |
| Config.Packages.Apt | string[] | 否 | — | apt 安装规格。所有管理器合计去重后 1～200 项；每项去空白后 1～256 字节，匹配 ^[A-Za-z0-9@][A-Za-z0-9@._+:/=<>!~,%\[\]-]*$；空数组可提供，但总数不能为 0。示例：`["jq"]`。 |
| Config.Packages.Cargo | string[] | 否 | — | cargo 安装规格。所有管理器合计去重后 1～200 项；每项去空白后 1～256 字节，匹配 ^[A-Za-z0-9@][A-Za-z0-9@._+:/=<>!~,%\[\]-]*$；空数组可提供，但总数不能为 0。示例：`["ripgrep"]`。 |
| Config.Packages.Gem | string[] | 否 | — | gem 安装规格。所有管理器合计去重后 1～200 项；每项去空白后 1～256 字节，匹配 ^[A-Za-z0-9@][A-Za-z0-9@._+:/=<>!~,%\[\]-]*$；空数组可提供，但总数不能为 0。示例：`["rake"]`。 |
| Config.Packages.Go | string[] | 否 | — | go 安装规格。所有管理器合计去重后 1～200 项；每项去空白后 1～256 字节，匹配 ^[A-Za-z0-9@][A-Za-z0-9@._+:/=<>!~,%\[\]-]*$；空数组可提供，但总数不能为 0。示例：`["gotest.tools/gotestsum@latest"]`。 |
| Config.Packages.Npm | string[] | 否 | — | npm 安装规格。所有管理器合计去重后 1～200 项；每项去空白后 1～256 字节，匹配 ^[A-Za-z0-9@][A-Za-z0-9@._+:/=<>!~,%\[\]-]*$；空数组可提供，但总数不能为 0。示例：`["lodash@4.17.21"]`。 |
| Config.Packages.Pip | string[] | 否 | — | pip 安装规格。所有管理器合计去重后 1～200 项；每项去空白后 1～256 字节，匹配 ^[A-Za-z0-9@][A-Za-z0-9@._+:/=<>!~,%\[\]-]*$；空数组可提供，但总数不能为 0。示例：`["requests==2.32.5"]`。 |
| Config.Packages.Type | string | 否 | — | 历史依赖声明标识。可省略；提供时只允许 packages，不改变软件包安装行为。示例：`"packages"`。 |
| Config.InitScript | string | 否 | — | Sandbox 初始化脚本。Cloud：非空时最多 65536 字节、无 NUL，超时 300 秒；SelfHosted 仅保存脚本，本服务不执行。示例：`"echo ready"`。 |
| Config.Storage | object | 否 | — | Sandbox 存储配置。TosMounts 为历史占位字段：TOS 存储挂载能力已移除，环境创建/更新时任何类型携带非空 TosMounts 均返回 400（Action InvalidRequest，提示当前运行时不支持存储挂载），省略/null/[] 允许，不冻结也不创建挂载。TosInput 已随能力移除（proto 字段号与名称 reserved，携带即返回 400 未知字段错误）。子字段在本表下方逐项列出。 |
| Config.Storage.TosMounts | JSON[] | 否 | — | TOS 挂载。TOS 存储挂载能力已移除：字段保留在 proto 契约中但不再生效。环境创建/更新时任何类型携带非空 TosMounts 均返回 400（Action InvalidRequest，提示当前运行时不支持存储挂载）；省略/null/[] 允许，不冻结也不创建挂载。示例：`[{"bucket":"output-bucket","prefix":"sessions/"}]`。 |
| Config.Iam | object | 否 | — | IAM 角色配置。子字段在本表下方逐项列出。 |
| Config.Iam.RoleArn | string | 否 | — | Tool IAM 角色 ARN。arn:iam::<账号>:role/<角色名>；不能包含角色路径。示例：`"arn:iam::123456789012:role/ExampleRole"`。 |
| Config.Networking | object | 否 | — | 网络配置。**仅保存，未生效**：不会设置域名白名单，也不会执行 allow_package_managers、allow_mcp_servers 等开关。Cloud 实际网络访问开关使用 Config.AgentKit.Networking；SelfHosted 网络由自有基础设施配置。示例：`{}`。 |
| Config.ImageId | string | 否 | 保留原镜像 | ECS 镜像 ID。禁止提供；Cloud-ECS 镜像不可更新，即使值与现有镜像相同也返回 OperationDenied.EnvironmentImageImmutable。示例：`"image-example"`。 |
| Config.DockerComposePayload | string | 否 | — | Docker Compose YAML 的标准 Base64 编码。仅 Cloud-ECS 使用；标准 Base64 解码后须为非空且不超过 1 MiB 的合法 YAML，services 必须为包含 1～20 项的对象；不额外限制其他 Compose 字段。示例：`"c2VydmljZXM6CiAgYXBwOgogICAgaW1hZ2U6IGV4YW1wbGUvYXBwOnYxCg=="`。 |
| Config.Lifecycle | object | 否 | — | Devbox 首次创建生命周期。仅 Cloud-ECS 且同时提供 DockerComposePayload 时允许；PreUp/PostUp 只在 Devbox 首次创建流程执行。子字段在本表下方逐项列出。 |
| Config.Lifecycle.PreUp | object | 否 | — | Compose 启动前 Hook。Devbox 首次创建时在第一次 Compose Up 前执行。子字段在本表下方逐项列出。 |
| Config.Lifecycle.PreUp.Script | string | 否 | — | 内联脚本。与 ScriptRef 二选一；UTF-8、无 NUL，最大 64 KiB。示例：`"set -eu"`。 |
| Config.Lifecycle.PreUp.ScriptRef | string | 否 | — | 可版本化脚本引用。与 Script 二选一；必须为非空引用。示例：`"config://post-up"`。 |
| Config.Lifecycle.PreUp.Shell | string | 否 | /bin/bash | 脚本解释器。/bin/bash 或 /bin/sh。示例：`"/bin/bash"`。 |
| Config.Lifecycle.PreUp.WorkingDirectory | string | 否 | Compose Project 目录 | 工作目录。安全的绝对路径，不能为根目录或包含上级跳转。示例：`"/workspace"`。 |
| Config.Lifecycle.PreUp.TimeoutSeconds | integer | 否 | 300 | 超时秒数。1～1800。示例：`300`。 |
| Config.Lifecycle.PreUp.FailurePolicy | string | 否 | fail | 失败策略。fail 或 continue。示例：`"fail"`。 |
| Config.Lifecycle.PreUp.Environment | object | 否 | — | Hook 专用非敏感环境变量。名称和值沿用 Environment 非敏感变量约束，不接受平台保留或敏感前缀。字典值类型为 `string`。示例：`{"LOG_LEVEL":"info"}`。 |
| Config.Lifecycle.PostUp | object | 否 | — | Compose 首次健康后 Hook。Devbox 首次创建时在全部必需 Service 首次就绪后执行。子字段在本表下方逐项列出。 |
| Config.Lifecycle.PostUp.Script | string | 否 | — | 内联脚本。与 ScriptRef 二选一；UTF-8、无 NUL，最大 64 KiB。示例：`"set -eu"`。 |
| Config.Lifecycle.PostUp.ScriptRef | string | 否 | — | 可版本化脚本引用。与 Script 二选一；必须为非空引用。示例：`"config://post-up"`。 |
| Config.Lifecycle.PostUp.Shell | string | 否 | /bin/bash | 脚本解释器。/bin/bash 或 /bin/sh。示例：`"/bin/bash"`。 |
| Config.Lifecycle.PostUp.WorkingDirectory | string | 否 | Compose Project 目录 | 工作目录。安全的绝对路径，不能为根目录或包含上级跳转。示例：`"/workspace"`。 |
| Config.Lifecycle.PostUp.TimeoutSeconds | integer | 否 | 300 | 超时秒数。1～1800。示例：`300`。 |
| Config.Lifecycle.PostUp.FailurePolicy | string | 否 | fail | 失败策略。fail 或 continue。示例：`"fail"`。 |
| Config.Lifecycle.PostUp.Environment | object | 否 | — | Hook 专用非敏感环境变量。名称和值沿用 Environment 非敏感变量约束，不接受平台保留或敏感前缀。字典值类型为 `string`。示例：`{"LOG_LEVEL":"info"}`。 |
| Config.BuildScript | string | 否 | — | 异步镜像构建脚本。禁止提供；BuildScript 仅供 CreateEnvironmentWithImageBuild 使用。示例：`"c2V0IC1ldQo="`。 |
| Metadata | object | 否 | 保留原值 | 业务元数据。省略或 null 保留原值；对象按键合并，其中值为 null 的键被删除。更新时忽略服务端保留键，允许客户端整体写回 GetEnvironment 返回的 Metadata。示例：`{"purpose":"documentation"}`。 |
| Status | string | 否 | — | 状态。仅允许 Archived，且必须单独修改状态，不能同时传 Name、Description、Config、Metadata（包括 null）。归档不可撤销。示例：`"Archived"`。 |
| ClientToken | string | 否 | 不启用幂等重放 | 幂等键。省略、null 或空串不启用重放；非空格式见[公共幂等调用](conventions.md#幂等调用)。示例：`"documentation-001"`。 |

### 请求示例

```http
POST /?Action=UpdateEnvironment&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "EnvironmentId": "env_example",
  "Name": "documentation-v2",
  "Metadata": {
    "purpose": "review"
  },
  "ClientToken": "env-update-001"
}
```

**单独归档环境**

```http
POST /?Action=UpdateEnvironment&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "EnvironmentId": "env_example",
  "Status": "Archived",
  "ClientToken": "env-archive-001"
}
```

**更新 SelfHosted 配置并清理元数据键**

```http
POST /?Action=UpdateEnvironment&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "EnvironmentId": "env_example",
  "Description": null,
  "Config": {
    "ImageUrl": "registry.example.com/worker:v2",
    "EnvVars": {
      "LOG_LEVEL": "info"
    },
    "Resources": {
      "CpuMilli": 4000,
      "MemoryMb": 8192,
      "DiskSize": "20Gi"
    }
  },
  "Metadata": {
    "purpose": "review",
    "obsolete": null
  },
  "ClientToken": "env-update-config-001"
}
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是&#8288;否&#8288;必&#8288;返 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| ResponseMetadata | object | 是 | — | 公共响应元信息，字段定义见[公共 ResponseMetadata](conventions.md#响应元信息)。 |
| Result | object | 是 | — | 成功结果。仅成功响应必返；失败时省略，错误格式见公共约定。字段定义见[公共对象](#environment-object)。 |

### 响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "req_example",
    "Action": "UpdateEnvironment",
    "Version": "2025-10-30",
    "Service": "ma",
    "Region": "cn-beijing"
  },
  "Result": {
    "EnvironmentId": "env_example",
    "Name": "documentation-v2",
    "Description": "文档示例",
    "Config": {
      "Type": "SelfHosted"
    },
    "Metadata": {
      "purpose": "review"
    },
    "Status": "Active",
    "CreatedAt": "2026-10-12T08:00:00Z",
    "UpdatedAt": "2026-10-12T08:00:00Z",
    "WorkspaceId": "workspace-example"
  }
}
```

### 使用说明

- 省略字段保留原值；Description=null 清除描述，Name=null 保留名称。
- Metadata 按键合并，值为 null 删除键，空串保留。
- Config 在 SelfHosted 和 Cloud-ECS 中按一级键合并；请求禁止携带 Type 和 ImageId，Cloud 配置更新仍使用资源组接口。
- Cloud-ECS 也禁止加入 Packages、BuildScript 或 InitScript。
- Status=Archived 必须单独提交，归档不可撤销；重复归档保留首次时间。
- 归档禁止新会话，不自动停止已有会话或执行资源。
- ClientToken 的格式、24 小时结果快照、重放及重试规则见[公共幂等规则](conventions.md#幂等调用)。
- 更新时省略、null、空对象的区别见[更新值语义](#environment-update-values)。
- Archived 环境不接受普通字段修改；单独重复归档和删除仍支持。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<a id="deleteenvironment-top"></a>

## DeleteEnvironment

删除环境。


```http
POST /?Action=DeleteEnvironment&Version=2025-10-30
```

### 请求参数

| 参数 | 类型 | 是&#8288;否&#8288;必&#8288;传 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| EnvironmentId | string | 是 | — | 环境 ID。必填；非空、同账号且调用方可见的资源 ID；不以示例前缀代替权限校验。示例：`"env_example"`。 |
| ClientToken | string | 否 | 不启用幂等重放 | 幂等键。省略、null 或空串不启用重放；非空格式见[公共幂等调用](conventions.md#幂等调用)。示例：`"documentation-001"`。 |

### 请求示例

```http
POST /?Action=DeleteEnvironment&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{
  "EnvironmentId": "env_example"
}
```

### 响应参数

成功返回 HTTP `200`。

| 字段 | 类型 | 是&#8288;否&#8288;必&#8288;返 | 默&#8288;认&#8288;值 | 说明 |
| --- | --- | --- | --- | --- |
| ResponseMetadata | object | 是 | — | 公共响应元信息，字段定义见[公共 ResponseMetadata](conventions.md#响应元信息)。 |
| Result | object | 是 | — | 成功结果。仅成功响应必返；失败时省略，错误格式见公共约定。子字段在本表下方逐项列出。 |
| Result.EnvironmentId | string | 是 | — | 环境 ID。返回该环境的环境 ID。示例：`"env_example"`。 |
| Result.WorkspaceId | string | 是 | — | 创建时固定的 Workspace 归属。取原资源持久化归属或真实标签；历史无归属资源返回空字符串，不读取调用方 metadata。示例：`"workspace-example"`。 |

### 响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "req_example",
    "Action": "DeleteEnvironment",
    "Version": "2025-10-30",
    "Service": "ma",
    "Region": "cn-beijing"
  },
  "Result": {
    "EnvironmentId": "env_example",
    "WorkspaceId": "workspace-example"
  }
}
```

### 使用说明

- 仅支持单个 EnvironmentId。
- 必须先删除所有关联会话，否则返回 OperationDenied.EnvironmentHasSessions。
- Cloud 创建继续自动生成 EnvironmentResource；删除时自动清理关联资源组的 Tool/Runtime，兼容存量 Cloud，无需先手工删除资源组。
- 资源组、组件标识和操作历史保留，资源组标记为 Deleted；等待下游组件删除后再完成环境删除。
- SelfHosted 关联的资源组仍须先删除，否则返回 OperationDenied.DeleteEnvironmentResourceFirst。
- 删除会先归档环境，再清理关联密钥与资源绑定；清理失败时可能保留 Archived，可查询核对后重试。
- 成功结果仅返回 EnvironmentId，随后 GetEnvironment 返回 404。
- ClientToken 的格式、24 小时结果快照、重放及重试规则见[公共幂等规则](conventions.md#幂等调用)。
- 已归档环境也可删除；未使用 ClientToken 时，成功删除后再次删除同一 ID 返回 404 InvalidEnvironment.NotFound；原 token 同参重放返回原删除结果。

错误体字段见[错误响应](conventions.md#错误响应)。

---

<!-- api-contracts:end -->
