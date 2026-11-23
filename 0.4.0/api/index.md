# API 参考

认证、响应包装、错误和幂等规则见[API 调用约定](conventions.md)。

| 调用目标 | 资源或接口 | 协议与响应 |
|---|---|---|
| [AgentKit 控制面：Harness](harness.md) | 创建、查询、修改 Harness，读取配置修订 | 签名 Action 请求；从 `Result` 和 `ResponseMetadata` 读取结果。 |
| [AgentKit 控制面：Env](environment.md) | 管理环境、构建镜像、操作 Devbox 实例 | 签名 Action 请求，响应包含 `Result` 和 `ResponseMetadata`。 |
| [会话管理接口](app.md) | 创建、查询、更新和删除 Harness App 会话 | Runtime HTTP JSON。 |
| [对话调用接口](chat.md) | 运行 Agent、消费 SSE、A2A 消息调用 | Runtime HTTP JSON 与 SSE。 |
| [文件操作接口](files.md) | 上传、列出和下载会话沙箱文件 | Runtime HTTP multipart、JSON 与二进制流。 |
| [Managed Agents API](session.md) | 创建 Session、写入输入、订阅或回看事件 | Session Endpoint REST / SSE；直接返回资源对象、列表或事件。 |

本页对应 0.4.0。控制面 Action 使用单独的 API 版本 `2025-10-30`，目标环境需提供相应接口。
