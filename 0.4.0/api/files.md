# 文件操作接口

本页记录 **0.4.0（`release/v0.4` 实现，待发布）** 的 Harness App 会话文件接口。路径相对于已授权的 Runtime 地址；示例使用应用 `harness_agent`、用户 `reader-1`、会话 `report-1`。三个接口操作的是该会话绑定的 **AIO 沙箱文件**，不创建 ADK 产物，也不返回对象存储 URL。

先[创建会话](app.md#post-createsession)，并为会话配置 Sandbox Tool。绑定会话使用其固定版本的 Harness 快照中的 `sandbox.tool_id`；未绑定会话使用部署的 `HARNESS_SANDBOX_TOOL_ID` 或 `AGENTKIT_TOOL_ID`。没有 Tool ID 时返回 409。请求使用 Runtime 的认证方式；示例中的 Bearer Token 仅表示一种部署方式。认证身份与路径中的用户不匹配、会话不存在或应用名不符时返回 404。若 Runtime 返回 `X-Session-Id`，后续请求原样回传以维持路由亲和性。

相对文件路径以沙箱工作目录为基准，默认是 `/home/gem`；绝对路径原样使用并规范化。路径中不能包含 NUL 或控制字符。文件接口会在首次操作时取得沙箱 Endpoint；实例重启后会按会话标识查找仍有效的物理沙箱并重新附着。沙箱已过期时可能创建新沙箱，旧文件随旧沙箱失效。同一会话正在执行其他沙箱操作时，文件接口返回 409。

## POST /apps/{appName}/users/{userId}/sessions/{sessionId}/files {#post-uploadsessionfile}

上传文件 · `UploadSessionFile`

发送一个 `multipart/form-data` 文件，将其写入沙箱中的已有目录。上传先写临时文件，再以不覆盖方式移动到目标路径；同名文件已存在时返回 409，原文件内容保留。成功返回 HTTP 201。

### 请求参数

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | 按 Runtime 认证模式提供。Bearer 部署使用 `Bearer <token>`。 |
| `X-Session-Id` | string | Header | 否 | Runtime 返回过该值时原样回传。 |
| `Content-Type` | string | Header | 是 | `multipart/form-data`，含客户端生成的 boundary。 |
| `Content-Length` | integer | Header | 是 | 整个请求体长度，最大 9 MiB；缺失返回 411。 |
| `appName` | string | Path | 是 | `harness_agent`。 |
| `userId` | string | Path | 是 | 会话所属用户。 |
| `sessionId` | string | Path | 是 | 已存在的会话 ID。 |
| `file` | binary | Body（multipart） | 是 | 恰好一个文件，内容最大 8 MiB。文件名须为单个路径段，最长 255 字符，不得包含路径分隔符或控制字符。 |
| `path` | string | Body（multipart） | 否 | 默认 `.`。已存在的目标目录；相对路径以沙箱工作目录为基准，也可传绝对路径。至多一个值。 |

### 请求示例

```bash
curl --fail-with-body -X POST \
  -H "Authorization: Bearer $RUNTIME_TOKEN" \
  -F 'path=/home/gem' \
  -F 'file=@./note.txt;filename=note.txt;type=text/plain' \
  "$RUNTIME_URL/apps/harness_agent/users/reader-1/sessions/report-1/files"
```

`curl -F` 会生成 `Content-Type`、boundary 和 `Content-Length`。假设本地 `note.txt` 内容为 `hello`，响应示例为：

### 响应字段

| 字段 | 类型 | 位置 | 必返 | 说明 |
|-|-|-|-|-|
| `name` | string | Body | 是 | 上传文件名。 |
| `path` | string | Body | 是 | 沙箱中的绝对目标路径。 |
| `size` | integer | Body | 是 | 文件内容字节数。 |
| `sha256` | string | Body | 是 | 文件内容的 SHA-256 十六进制摘要。 |
| `toolId` | string | Body | 是 | 本会话使用的 Sandbox Tool ID。 |

### 响应示例

```json
{
  "name": "note.txt",
  "path": "/home/gem/note.txt",
  "size": 5,
  "sha256": "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  "toolId": "tool-example"
}
```

## GET /apps/{appName}/users/{userId}/sessions/{sessionId}/files {#get-listsessionfiles}

列出文件 · `ListSessionFiles`

查询沙箱目录。成功返回 HTTP 200，最多返回 1000 个条目；`truncated: true` 表示底层列表已截断或结果超过该上限。接口没有分页参数。

### 请求参数

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | 按 Runtime 认证模式提供。Bearer 部署使用 `Bearer <token>`。 |
| `X-Session-Id` | string | Header | 否 | Runtime 返回过该值时原样回传。 |
| `appName` | string | Path | 是 | `harness_agent`。 |
| `userId` | string | Path | 是 | 会话所属用户。 |
| `sessionId` | string | Path | 是 | 已存在的会话 ID。 |
| `path` | string | Query | 否 | 默认 ``.``。 要列出的目录；相对路径以沙箱工作目录为基准。 |
| `recursive` | `true` / `false` | Query | 否 | 默认 ``false``。 是否递归列出；大小写不敏感。 |
| `show_hidden` | `true` / `false` | Query | 否 | 默认 ``false``。 是否包含隐藏项；大小写不敏感。 |
| `max_depth` | integer | Query | 否 | `0`–`20`；仅在 `recursive=true` 时传给沙箱。 |

请求体留空。

### 请求示例

```http
GET /apps/harness_agent/users/reader-1/sessions/report-1/files?path=%2Fhome%2Fgem&recursive=false
Authorization: Bearer <token>
```

### 响应字段

| 字段 | 类型 | 位置 | 必返 | 说明 |
|-|-|-|-|-|
| `path` | string | Body | 是 | 规范化后的绝对目录路径。 |
| `files` | object[] | Body | 是 | 文件与目录条目数组，可能为空。 |
| `files[].name` | string 或 null | Body | 是 | 条目名称，取自沙箱列表。 |
| `files[].path` | string | Body | 是 | 规范化后的绝对路径。 |
| `files[].isDirectory` | boolean 或 null | Body | 是 | 是否为目录。 |
| `files[].size` | integer 或 null | Body | 是 | 字节大小，由沙箱返回；目录或未知时可为空。 |
| `files[].modifiedTime` | string 或 null | Body | 是 | 沙箱返回的修改时间；未知时为 null。 |
| `fileCount` | integer | Body | 是 | 本次返回条目中的非目录数。 |
| `directoryCount` | integer | Body | 是 | 本次返回条目中的目录数。 |
| `totalCount` | integer | Body | 是 | 本次返回条目数，最多 1000。 |
| `truncated` | boolean | Body | 是 | 是否有条目未包含在本次结果中。 |

### 响应示例

```json
{
  "path": "/home/gem",
  "files": [
    {
      "name": "note.txt",
      "path": "/home/gem/note.txt",
      "isDirectory": false,
      "size": 5,
      "modifiedTime": null
    }
  ],
  "fileCount": 1,
  "directoryCount": 0,
  "totalCount": 1,
  "truncated": false
}
```

## GET /apps/{appName}/users/{userId}/sessions/{sessionId}/files/download {#get-downloadsessionfile}

下载文件 · `DownloadSessionFile`

从沙箱流式下载一个文件。成功时返回 `application/octet-stream`，默认 HTTP 200；单段 Range 请求可返回 HTTP 206。响应体是文件字节，不是 JSON。下载不受上传的 8 MiB 文件大小限制。

### 请求参数

| 字段 | 类型 | 位置 | 必填 | 说明 |
|-|-|-|-|-|
| `Authorization` | string | Header | 是 | 按 Runtime 认证模式提供。Bearer 部署使用 `Bearer <token>`。 |
| `X-Session-Id` | string | Header | 否 | Runtime 返回过该值时原样回传。 |
| `appName` | string | Path | 是 | `harness_agent`。 |
| `userId` | string | Path | 是 | 会话所属用户。 |
| `sessionId` | string | Path | 是 | 已存在的会话 ID。 |
| `path` | string | Query | 是 | 文件路径；相对路径以沙箱工作目录为基准，不可为根目录 `/`。 |
| `Range` | string | Header | 否 | 只接受一个 `bytes=start-end`、`bytes=start-` 或 `bytes=-suffix` 区间。多段 Range 返回 400。 |
| `If-Range` | string | Header | 否 | 原样转发给沙箱；仅与 Range 一起使用时有意义。 |

请求体留空。

### 请求示例

```bash
curl --fail-with-body -L \
  -H "Authorization: Bearer $RUNTIME_TOKEN" \
  -H 'Range: bytes=0-2' \
  -o note.part \
  "$RUNTIME_URL/apps/harness_agent/users/reader-1/sessions/report-1/files/download?path=%2Fhome%2Fgem%2Fnote.txt"
```

### 响应字段

| 字段 | 类型 | 位置 | 必返 | 说明 |
|-|-|-|-|-|
| `Content-Type` | string | Header | 是 | `application/octet-stream`。 |
| `Content-Disposition` | string | Header | 是 | `attachment`，文件名取路径最后一段并进行 UTF-8 编码。 |
| `Content-Length` | integer | Header | 否 | 沙箱返回时透传。 |
| `Content-Range` | string | Header | 否 | 部分内容响应时由沙箱返回。 |
| `Accept-Ranges` | string | Header | 否 | 沙箱返回时透传。 |
| `ETag` | string | Header | 否 | 沙箱返回时透传。 |
| `Last-Modified` | string | Header | 否 | 沙箱返回时透传。 |

对上文的 `hello` 文件，示例返回 HTTP 206、`Content-Range: bytes 0-2/5`，响应体为 `hel`。完整下载时省略 `Range`。

## 错误与生命周期

| HTTP 状态 | 触发条件 | 处理方式 |
|---|---|---|
| 400 | 路径、布尔参数、深度、Range 或 multipart 文件/文件名无效；上传目录不是目录。 | 修正参数；上传前可列出目标目录。 |
| 404 | 会话不存在、用户身份不匹配，或沙箱中的路径不存在。 | 核对会话、身份与绝对路径；确认沙箱仍是原来的实例。 |
| 409 | 会话没有 Sandbox Tool、同会话沙箱操作正在进行、绑定的 Tool/Skill 与现有沙箱冲突、沙箱暂停或上传同名文件。 | 核对配置与沙箱状态；同名文件改名后上传。 |
| 411 | 上传缺少 `Content-Length`。 | 使用能发送长度的 multipart 客户端。 |
| 413 | 上传文件超过 8 MiB，或整个请求超过 9 MiB。 | 缩小文件及 multipart 请求。 |
| 416 | Range 超出文件范围，沙箱返回该状态。 | 按文件实际长度重新选择范围。 |
| 422 | Sandbox 配置不合法。 | 检查 Tool ID、工作目录及 Skill 配置。 |
| 502、503 | 沙箱数据面响应异常、不可用，或控制面暂时不可用。 | 核对沙箱和 Runtime 状态，再决定是否重试。 |

这些接口不提供删除或覆盖操作。若需要面向调用方长期保存的下载地址，请使用[产物服务](../app/artifacts.md)；沙箱文件依赖物理沙箱的有效期。
