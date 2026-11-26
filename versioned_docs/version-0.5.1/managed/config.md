# 配置 Harness 与会话

通过控制面的 `CreateHarness` 提供模型和指令，按需关联工具、技能和 MCP 服务。保存返回的 Harness ID。创建 Session 时，字符串形式的 `agent` 会固定当时的版本；需要复现某次运行时，可以显式指定修订号。

```json
{"type":"agent","id":"agent_example","version":1}
```

把这个对象作为创建 Session 请求的 `agent` 字段。若需为特定会话调整配置，可使用 `agent_with_overrides`，选择性提供 `system`、`tools` 等字段。数组覆盖会整体替换原值，构造请求时应包含要保留的条目。

## 更新后何时生效

假设 Session A 创建时固定版本 1。随后调用 `UpdateHarness` 修改指令，产生版本 2。Session A 的后续轮次继续使用版本 1；此时按 Harness ID 创建的 Session B 使用版本 2。比较两个版本时，可创建两个独立会话，使用相同输入和相同资源绑定。

模型 Key Name 通过会话创建请求头传递。环境、运行时与模型凭据分别决定执行位置和模型访问身份。具体继承顺序及条件必填字段见[Session API](../api/session.md)。

## Worker 开关

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `MANAGED_AGENT_WORKER_ENABLED` | `true` | 在共享镜像中启动负责领取与执行托管任务的 Worker。 |

## 方舟模型凭据权限

当 Worker 按会话的方舟 Key Name 解析模型凭据时，运行身份需要 `ark:ListApiKeys` 按项目枚举匹配项，再用 `ark:GetRawApiKey` 获取选中条目的密钥。授权项目、地域和会话指定的模型身份应相符。模型端点的查询管理由实际调用该接口的组件负责。
