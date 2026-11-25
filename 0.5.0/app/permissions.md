# 权限配置

Harness App 使用 Runtime 的执行身份访问模型、AgentKit 控制面、Skill、MCP、知识库和对象存储等云服务。部署 Runtime 时，需要把相应 IAM 策略授予该执行身份；调用 Harness App 的业务用户不需要直接持有这些云 API 权限。

## 汇总策略

下面的策略合并了 Harness App 运行及平台集成所需的 Action，可作为配置执行角色的起点。未启用某项能力时，对应 Action 不会被调用；生产环境可以按实际使用的能力进一步收窄权限。

```json
{
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ark:GetApiKey",
        "ark:ListApiKeys",
        "ark:GetEndpoint",
        "ark:DescribeModelEndpoints",
        "ark:GetRawApiKey"
      ],
      "Resource": [
        "trn:iam::*:project/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "agentkit:GetA2aAgent",
        "agentkit:SearchAgentCards",
        "agentkit:ListA2aSpaces",
        "agentkit:GetMCPToolset",
        "agentkit:GetTool",
        "agentkit:ListSessions",
        "agentkit:CreateSession",
        "agentkit:GetSession",
        "agentkit:CreateSkill",
        "agentkit:ListSkillsBySpaceId",
        "agentkit:GetSkillInfo",
        "agentkit:InvokeTool",
        "agentkit:GetHarness",
        "agentkit:GetEnvironment",
        "agentkit:PauseSession",
        "agentkit:ResumeSession",
        "agentkit:DeleteSession",
        "agentkit:GenTempTosObjectDownloadUrl",
        "apmplus_server:GetAppKey",
        "mem0:Get*",
        "mem0:List*",
        "mem0:Describe*",
        "volc_torchlight_api:WebSearch",
        "id:Get*",
        "id:List*",
        "id:Check*",
        "ml_platform:GetCollectionInfo",
        "ml_platform:AddDoc",
        "ml_platform:SearchKnowledge"
      ],
      "Resource": [
        "*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "tos:HeadBucket",
        "tos:CreateBucket",
        "tos:PutBucketCORS",
        "tos:GetObject",
        "tos:PutObject",
        "tos:ListBucket"
      ],
      "Resource": [
        "trn:tos:::agentkit-platform-*"
      ]
    }
  ]
}
```

TOS 资源范围中的 `agentkit-platform-*` 表示名称以 `agentkit-platform-` 开头的 Bucket。使用其他命名规则时，需要把该 Resource 替换为实际范围。

## 权限与功能对应关系

| 功能 | Action | 触发时机 |
| --- | --- | --- |
| 读取 Harness 配置和执行环境 | `agentkit:GetHarness`、`agentkit:GetEnvironment` | 创建绑定 Session、显式刷新配置，或实例按 Session 固定版本恢复快照时。 |
| 管理沙箱 Session | `agentkit:ListSessions`、`agentkit:CreateSession`、`agentkit:GetSession`、`agentkit:PauseSession`、`agentkit:ResumeSession`、`agentkit:DeleteSession` | 创建、查询、暂停、恢复或删除工具沙箱 Session 时；会话文件接口首次访问或重启后重新附着也会查询现有沙箱。这里的 Session 是 AgentKit 工具沙箱资源。 |
| 读取 MCP 和工具 | `agentkit:GetMCPToolset`、`agentkit:GetTool`、`agentkit:InvokeTool` | 按 ID 获取 MCP 工具集、查询工具或通过 AgentKit 调用工具时。直接连接已知 MCP 地址时不触发工具集查询。 |
| 读取和准备 Skill | `agentkit:CreateSkill`、`agentkit:ListSkillsBySpaceId`、`agentkit:GetSkillInfo`、`agentkit:GenTempTosObjectDownloadUrl` | 查询 Skill 目录、读取详情、创建 Skill 或为沙箱生成临时下载地址时。 |
| 发现 A2A Agent | `agentkit:GetA2aAgent`、`agentkit:SearchAgentCards`、`agentkit:ListA2aSpaces` | 查询 A2A Agent、搜索 Agent Card 或列出 A2A Space 时。 |
| 读取模型密钥和端点 | `ark:GetApiKey`、`ark:ListApiKeys`、`ark:GetRawApiKey`、`ark:GetEndpoint`、`ark:DescribeModelEndpoints` | 通过方舟资源解析模型凭证或端点时。直接注入模型 API Key 时，模型调用使用该凭证。 |
| 网页搜索和观测 | `volc_torchlight_api:WebSearch`、`apmplus_server:GetAppKey` | 使用云端网页搜索，或通过云 API 获取 APMPlus AppKey 时。 |
| 记忆、身份和知识库 | `mem0:Get*`、`mem0:List*`、`mem0:Describe*`、`id:Get*`、`id:List*`、`id:Check*`、`ml_platform:GetCollectionInfo`、`ml_platform:AddDoc`、`ml_platform:SearchKnowledge` | 使用对应的记忆、身份校验或知识库集成时。 |
| TOS 存储 | `tos:HeadBucket`、`tos:CreateBucket`、`tos:PutBucketCORS`、`tos:GetObject`、`tos:PutObject`、`tos:ListBucket` | 准备 Bucket、配置跨域规则，以及列出、读取或写入对象时。 |

会话文件上传、列出、下载以及工具文件操作和 Bash 命令通过已分配沙箱的 Endpoint 执行。这些数据面请求使用沙箱网关要求的认证，不会为每次文件操作调用 AgentKit 控制面。能力的具体配置入口见[高级配置与环境变量](advanced.md)，沙箱调用链路见[在沙箱中执行任务](sandbox.md)。
