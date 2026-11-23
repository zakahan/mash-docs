# 文件与会话产物

当报告助手生成 `summary.csv`，应用通常需要两种结果：能直接阅读的回答和能下载的文件。文件进入产物服务后，Runtime 可以将名称、地址、来源和版本随结果返回。工具临时目录中的文件需要经过发布或 ADK 产物保存流程，才能被调用方作为产物读取。

沿用[已绑定会话](flow.md)时，可按文件所在位置选择读取方式。发送消息时，`new_message.parts[].fileData` 可以提供输入文件 URI。由 AIO `WriteFile` 生成的工作文件保存在物理沙箱，可在沙箱仍有效时由 `ReadFile` 读回。0.4.0 起，调用方可用[会话文件接口](../api/files.md)直接上传、列出和下载仍有效的沙箱文件；需要长期可用的下载地址时，应经产物服务保存。App 的 `publish_artifact` 只能读取其允许目录中可见的文件；仅有远端沙箱路径而要发布为长期产物时，须先将内容交给具备相应存储访问能力的发布流程。刷新会话配置只重新读取 Harness 和 Environment，文件内容另由沙箱或产物服务管理。[沙箱文件生命周期](sandbox.md)

## 从文件到可下载结果

1. Runtime 根据配置初始化 TOS 产物服务并校验存储桶。启用显式发布时，Agent 会获得 `publish_artifact` 工具。
2. 执行工具或 Skill 在当前会话允许的目录中生成文件；模型通过 `publish_artifact(path, filename)` 发布。路径必须是允许根目录中的现有文件，大小和本轮配额也参与校验。
3. 发布成功时工具得到 `status: saved` 和文件条目。同步调用结束时服务从本轮收集器整理 `artifacts`；应用可以渲染文本回答，并为每个条目生成下载入口。
4. 如果发布失败，读取工具结果中的 `error`。路径越界、敏感路径和超出配额都可能在这里被拒绝。整轮模型仍可能给出文本回复，应用应以实际返回的文件条目判断文件是否生成成功。

示意响应使用虚构的下载地址。实际地址形态取决于服务的链接配置。

```json
{"harness_name":"report","overwrite":false,"output":"摘要已生成。","error":null,
 "artifacts":[{"name":"summary.csv","url":"https://files.example.com/summary.csv",
 "mime_type":"text/csv","size":128,"source":"published","version":1}]}
```

## 流式界面如何展示

同步接口有独立的 `artifacts` 字段；流式路径按 ADK 事件交付。启用相应插件后，最终文本可以带有 `agentkit-artifacts` 标记，列出文件名、来源和 TOS URI。前端应按所用入口解析实际返回格式，并区分对象存储标识与可直接打开的下载地址。

## 在已有会话中重新查询文件

请求 `GET /harness/artifacts?user_id=reader-1&session_id=reading-1`，从 `artifacts` 数组读取结果。可用 `invocation_id` 限定某次调用，或用 `since` 指定 Unix 秒时间戳，最多返回 50 条。已启用的服务要求提供会话 ID；无效时间戳返回 400。共享身份模式从认证上下文确定用户。生成预签名 URL 失败时会回退为 TOS URI，界面应根据实际地址决定打开方式。
