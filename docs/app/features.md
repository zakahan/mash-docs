# 流式响应与事件消费

`POST /run_sse` 接收 ADK 消息，返回 `text/event-stream`。对已有会话发送下面的请求，将标识替换为当前应用和会话的实际值。

```json
{"appName":"harness_agent","userId":"reader-1","sessionId":"reading-1",
 "newMessage":{"role":"user","parts":[{"text":"概括这份报告。"}]},"streaming":true}
```

## 临时文本和完整消息

仓库使用受控模型验证了以下顺序。为方便阅读，示例只保留与展示有关的字段。每个空行分隔一个 SSE 帧。

```text
data: {"partial":true,"content":{"parts":[{"text":"甲"}]}}

data: {"partial":true,"content":{"parts":[{"text":"乙"}]}}

data: {"partial":false,"content":{"parts":[{"text":"甲乙"}]}}

```

界面先在临时气泡显示「甲」，再追加「乙」。收到完整消息后，用「甲乙」替换该气泡的预览文本并保存一次。若把三帧一律追加，用户会看到「甲乙甲乙」。当一轮包含多个模型步骤时，每条完整消息结算对应的预览；继续读取后续事件，直到响应流结束。

## 工具活动与异常

遍历 `content.parts`，文本放入消息区，函数调用及结果放入工具活动区。一个事件可能没有可展示的文本。消费原始 ADK JSON 时检查结构化的 `functionCall` 和 `functionResponse`；某些后端还会发送带有 thought 标志的内容，应用应按自己的展示约定处理。工具是否成功需要结合其返回值判断。

绑定会话已存在但当前实例缺少快照时，服务在建连前返回 HTTP 409。可为同一条消息加上顶层 `refresh_snapshot: true` 重试。已开始返回事件时，重新提交消息会发起另一轮执行。[会话快照与刷新](flow.md)

建连前的 HTTP 422 表示请求参数或 JSON 校验失败。请求级流处理器在首个文本增量之后也可能发出 `data: {"error":"..."}`；界面应保留已显示的临时文本，并标明这一轮执行失败。网络连接中断后可读取会话详情核对已记录的事件。该入口是一次 POST 执行，重新发送同一个请求会触发新的运行。

[客户端示例](quickstart.md)
