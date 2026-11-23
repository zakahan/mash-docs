# 使用 Skill 完成任务

本篇是[实战教学](flow.md)的 Skill 分支。继续使用主教程中的 Runtime、Harness 和 Session，只更新 Harness 的 Skill 列表并显式刷新快照，再通过一个具有明确格式约束的任务验证技能是否生效。

| 相对基础流程 | 本篇做什么 |
| --- | --- |
| 配置 | 将 Skill 引用写入已有 Harness，而不是重新创建会话 |
| 生效 | 在下一次 `/run_sse` 请求中设置 `refresh_snapshot: true` |
| 任务 | 要求模型生成只有使用该 Skill 才能稳定满足的结构 |
| 验收 | 核对加载或工具错误，并检查最终结果是否满足技能中的可区分约束 |

Skill 为模型提供完成特定任务的说明和配套资源。将 Skill 配到 Harness 后，创建会话或显式刷新会读取技能引用；准备本轮 Agent 时再加载对应内容。

## 把技能登记到 Harness

准备一份可通过 HTTPS 下载的公开 Skill zip 包，包内应有合法的 `SKILL.md`。示例采用报告格式技能，要求报告按“结论、依据、待确认事项”组织。你可以用已有技能替换示例 URL，并相应修改后面的验证任务。

在签名客户端调用 `UpdateHarness`，`HarnessVersion` 填当前修订号。

```json
{
  "WorkspaceId": "<WORKSPACE_ID>",
  "HarnessId": "<HARNESS_ID>",
  "HarnessVersion": 1,
  "Skills": [
    {
      "Type": "external_skill_package",
      "Source": "public_url",
      "Url": "https://skills.example.com/report-format.zip"
    }
  ]
}
```

更新成功后，响应中的 `HarnessVersion` 应增加，并回显新的 `Skills` 列表。

```json
{
  "Result": {
    "HarnessId": "<HARNESS_ID>",
    "HarnessVersion": 2,
    "Skills": [
      {
        "Type": "external_skill_package",
        "Source": "public_url",
        "Url": "https://skills.example.com/report-format.zip"
      }
    ]
  }
}
```

**验收配置：** 新版本号大于更新前的版本号，响应中的 Skill 引用与请求一致。此时只能证明控制面保存成功，还不能证明 Runtime 已读取或模型已使用 Skill。`Skills` 是完整列表，更新时提交你希望保留的所有技能。新建 Harness 时，也可以直接把这个数组放进 `CreateHarness` 请求体。[控制面 Skill 字段](../api/harness.md#harness-element-details)

已经将技能发布到 AgentKit 时，使用空间与技能的完整 ID。

```json
{
  "Skills": [
    {
      "Type": "custom",
      "SkillId": "ss-example/s-report",
      "Version": "v1"
    }
  ]
}
```

0.3.1 的 Harness App 按空间和 Skill ID 选择技能，使用加载时可见的最新版本。即使控制面保存了示例中的 `Version: "v1"`，运行时也不会固定到 v1。

构建技能目录时，Runtime 先按空间 ID 分组，每个空间调用一次 `agentkit:ListSkillsBySpaceId`，再按所选 Skill ID 筛选。相同引用与工作目录命中实例缓存时复用目录。沙箱在首次使用时加载技能文件，后续轮次可复用已安装的内容。显式刷新会话会重新读取 Harness 里的引用列表；同一引用的目录和已安装文件仍受缓存及沙箱生命周期影响。

## 在对话中使用技能

刷新快照，同时发起一个需要技能格式的任务。

```bash
jq '.refresh_snapshot = true | .newMessage.parts = [{text:"请使用报告格式技能，总结本周120笔、上周100笔订单的变化，按技能指定的结构输出。"}]' \
  message.json > skill-message.json
curl --fail-with-body -sS -N \
  -H "Authorization: Bearer $RUNTIME_TOKEN" "${ROUTE_HEADERS[@]}" \
  -H 'Content-Type: application/json' \
  --data-binary @skill-message.json "$RUNTIME_URL/run_sse"
```

若示例 Skill 规定报告必须包含“结论、依据、待确认事项”，最终完整事件应具有下面的结果。具体措辞可以不同。

```text
data: {"partial":false,"finishReason":"STOP","content":{"role":"model","parts":[{"text":"结论\n本周订单较上周增长 20%。\n\n依据\n本周 120 笔，上周 100 笔，增长率为 (120-100)/100。\n\n待确认事项\n当前数据未区分订单状态。"}]}}
```

**验收运行：** 流中没有 Skill 下载、解析或沙箱加载错误，最终完整消息同时包含 Skill 规定的三个章节，计算结果为 20%。Skill 不保证产生一个名称固定的 `functionCall`；如果技能要求执行脚本或读取资源，再继续核对相应的工具调用和结果。模型仅声称“使用了技能”不能证明加载成功。

公开包由 Harness App 下载并解析；AgentKit 自定义 Skill 经空间筛选后由沙箱加载。技能中若包含脚本或数据，还要确认执行工具能访问这些文件。App 进程中的文件与远端沙箱中的文件各有存储位置，引用技能并不会自动证明配套脚本已部署到沙箱。

## 理解覆盖与刷新

| 来源 | 选择规则与有效期 |
| --- | --- |
| 本轮顶层 `resources` | 优先于 `harness.resources`，显式空数组也生效，仅作用于本轮 |
| 本轮 `harness.resources` | 显式指定时替换本轮资源列表 |
| 创建会话的 `skills` | 非空时随 Session state 保存，优先于 Harness 技能 |
| 创建会话的兼容字段 `resources` | `skills` 为空时使用其中的非空列表 |
| Harness 快照的 `Skills` | 创建阶段没有非空覆盖且本轮未覆盖时使用，刷新会重新读取 |

创建时 `skills: []` 沿用兼容回退规则。若你希望持续跟随 Harness 的配置，创建时省略这两个兼容字段。`harness.skills` 是另一种字符串引用，供下节的沙箱 Skill Space 路径使用。[完整请求字段](../api/chat.md#post-runagentsse)

## 使用沙箱 Skill Space

需要沙箱加载器准备空间技能时，在本轮 `harness.skills` 中指定引用。AIO 模式支持整个空间 `ss-…` 和空间中的技能 `ss-…:s-…`。下面是应合入消息请求的字段。

```json
{"harness":{"skills":"ss-example:s-report"}}
```

加载过程分为三个阶段。

1. 准备工具声明时可查询空间里的技能名称和说明。
2. 首次使用物理沙箱时，通过 Bash 执行固定加载命令 `/usr/local/bin/ve-load-skills`，传入技能引用与临时 STS。
3. 加载器受理后继续后台下载，完成后技能文件才可读。

`VE_SKILLS_LOAD_ACCEPTED` 表示加载请求已被受理。第一次读文件可能早于下载完成，需要结合加载器输出确认。该路径依赖目标沙箱镜像提供匹配的加载器。[沙箱生命周期](sandbox.md)

## 定位加载失败

| 现象 | 检查位置 |
| --- | --- |
| 创建或刷新拒绝 Skill 配置 | 检查 Type 和包含空间 ID 的完整 SkillId |
| 流中报公开包下载失败 | 检查 Runtime 到 HTTPS 地址的网络、下载响应及 zip 内容 |
| 空间查询或沙箱下载失败 | 检查部署身份的 agentkit:ListSkillsBySpaceId 权限、技能的空间归属和下载授权 |
| 刷新后仍用会话指定的技能 | 检查创建时是否保存了非空 skills 或 resources |
| 能看到技能说明，沙箱里却没有文件 | 确认选择的是哪条加载路径，检查沙箱加载器与下载进度 |

Skill 字段及兼容入口的完整约束见 [对话调用接口](../api/chat.md)。
