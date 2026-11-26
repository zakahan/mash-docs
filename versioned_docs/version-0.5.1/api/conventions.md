---
toc_max_heading_level: 2
---
# API 调用约定

本页适用于 [Harness 管理接口](harness.md)、[环境管理接口](environment.md) 和 [Managed Agents Session API](session.md)。控制面接口契约版本为 `2025-10-30`。Harness App 的 Runtime HTTP 接口使用自己的请求与响应协议，见 [会话管理接口](app.md)、[对话调用接口](chat.md)和[文件操作接口](files.md)。

## 认证与请求地址

控制面管理接口使用账号 AK/SK 签名。由 SDK 按目标入口提供的签名服务名和地域生成认证头，不能从响应的 `Service` 推断签名服务名。示例省略 SDK 生成的认证头，凭据应在运行时提供。

```http
POST /?Action=CreateHarness&Version=2025-10-30 HTTP/1.1
Content-Type: application/json

{"Name":"example-agent","Model":{"Id":"model-example"}}
```

示例中的模型标识需替换为目标环境可用值；`Action` 必须与接口名称完全一致。

| 参数 | 类型 | 位置 | 是否必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- | --- |
| Action | string | Query | 是 | — | 控制面接口名称。 |
| Version | string | Query | 是 | — | API 日期版本 `2025-10-30`，与 Harness 配置修订号不同。 |
| Content-Type | string | Header | 有 JSON 正文时必填 | — | `application/json`。 |
| x-api-key | string | Header | Session 数据面按入口认证方式提供 | — | 环境访问密钥，不是模型 API Key。其他入口支持的认证方式以部署说明为准。 |
| x-ark-key-name | string | Header | 按 Session 接口要求 | — | 模型 API Key Name，不替代环境访问密钥或账号签名。 |

Session 数据面使用分配的 Endpoint 和环境访问密钥；HTTP 方法、路径与额外请求头见各接口。控制面身份由认证入口确定，不能通过自行填写账号头获得其他账号权限。

## 响应元信息

控制面成功响应包含 `ResponseMetadata` 和 `Result`，失败时省略 `Result`。Session REST 成功响应直接返回业务对象，不套用该包装。

| 参数 | 类型 | 是否必返 | 说明 |
| --- | --- | --- | --- |
| ResponseMetadata | object | 是 | 公共响应元信息。 |
| ResponseMetadata.RequestId | string | 是 | 请求跟踪 ID。 |
| ResponseMetadata.Action | string | 是 | 本次接口名称。 |
| ResponseMetadata.Version | string | 是 | 请求的 API 版本。 |
| ResponseMetadata.Service | string | 是 | 服务标识，不作为签名服务名的配置依据。 |
| ResponseMetadata.Region | string | 是 | 入口提供的地域；未提供时为空字符串。 |
| ResponseMetadata.Error | object | 失败时返回 | 错误信息，成功时省略。 |
| ResponseMetadata.Error.HTTPCode | integer | 错误对象存在时 | HTTP 错误状态。 |
| ResponseMetadata.Error.Code | string | 错误对象存在时 | 稳定的业务错误码。 |
| ResponseMetadata.Error.Message | string | 错误对象存在时 | 错误描述，不作为稳定的机器判断条件。 |
| ResponseMetadata.Error.Data | JSON | 错误对象存在时 | 附加数据，普通业务错误为 null。 |
| Result | object | 成功时返回 | 结构见具体接口，失败时省略。 |

## 错误响应

控制面使用 `ResponseMetadata.Error`。调用方根据 HTTP 状态和 `Code` 处理错误，保留 `RequestId` 供排查。

```json
{
  "ResponseMetadata": {
    "RequestId": "req_example",
    "Action": "CreateHarness",
    "Version": "2025-10-30",
    "Service": "ma",
    "Region": "cn-beijing",
    "Error": {
      "HTTPCode": 400,
      "Code": "InvalidParameter.Body",
      "Message": "The request is invalid.",
      "Data": null
    }
  }
}
```

Session REST 使用自己的错误结构；网关在请求进入服务前拒绝请求时，遵循入口的错误协议。

```json
{
  "code": 409,
  "reason": "Conflict",
  "message": "The version does not match the current version.",
  "bizCode": 5
}
```

| 参数 | 类型 | 是否必返 | 说明 |
| --- | --- | --- | --- |
| code | integer | 以具体接口为准 | HTTP 状态码。 |
| reason | string | 以具体接口为准 | 错误类别。 |
| message | string | 以具体接口为准 | 错误说明。 |
| bizCode | integer | 否 | 业务错误编号，零值可省略。 |

各资源的错误码、触发条件和重试方式见对应 API 页，不混用控制面和数据面的响应解析器。

## 幂等调用

仅在接口明确支持时提供 `ClientToken`。非空令牌为 1～64 个可打印 ASCII 字符，格式为 `[!-~]{1,64}`；是否允许省略、null 或空串以字段表为准。

重试保持同账号、同接口、同令牌和相同业务参数。适用 24 小时结果快照的接口会重放首次结果；参数变化返回 `IdempotentParameterMismatch`，过期返回 `ClientTokenExpired`。进行中返回 `OperationInProgress`，结果不确定返回 `IdempotencyResultUncertain`。

结果不确定时先查询资源或联系支持，不更换令牌盲目重做操作。幂等成功不代表异步资源已就绪，当前状态通过查询接口确认。Session 创建的 `Idempotency-Key` 与事件去重遵循 [Session API](session.md)，不套用控制面令牌规则。

## SSE

Managed Agents 事件流成功时返回 HTTP `200` 和 `Content-Type: text/event-stream`。REST 的 `data:` 包含事件 JSON；持久化事件的 `id:` 是十进制 sequence，预览事件没有持久化 ID。

保存最后消费的持久化 sequence，按 [Session 事件流](session.md#session-events-sse)传递 `after_sequence` 或 `Last-Event-ID` 恢复。预览事件不能作为重连游标，连接关闭也不代表本轮执行结束；以业务终态事件判断。
