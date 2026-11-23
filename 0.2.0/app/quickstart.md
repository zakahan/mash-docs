# 接入一个两轮对话客户端

下面的 Python 客户端创建一个新会话，连续询问两次，然后从服务端重新读取历史。准备可访问的 AgentKit Runtime 地址、该入口要求的认证头和已配置的模型。示例仅使用 Python 标准库；将网关提供的请求头放入 `RUNTIME_HEADERS_JSON`，需要动态签名的入口应在发请求时通过自己的认证客户端签名。

```bash
export RUNTIME_URL='https://your-runtime.example.com'
# RUNTIME_HEADERS_JSON 由调用环境注入，例如包含此 Runtime 接受的 Authorization 头。
```

```python
import json
import os
from urllib.parse import quote
from urllib.request import Request, urlopen

base = os.environ["RUNTIME_URL"].rstrip("/")
headers = json.loads(os.environ.get("RUNTIME_HEADERS_JSON", "{}"))
user = "reader-1"

def request(path, body=None, stream=False):
    data = None if body is None else json.dumps(body).encode()
    return urlopen(Request(base + path, data=data, headers={
        **headers, "Content-Type": "application/json",
        "Accept": "text/event-stream" if stream else "application/json",
    }), timeout=120)

def read_json(path, body=None):
    with request(path, body) as response:
        return json.load(response)

apps = read_json("/list-apps")
app = os.environ.get("HARNESS_APP_NAME") or apps[0]
sessions = f"/apps/{quote(app, safe='')}/users/{quote(user, safe='')}/sessions"
session = read_json(sessions, {})["id"]

def ask(text):
    body = {"app_name": app, "user_id": user, "session_id": session,
            "new_message": {"role": "user", "parts": [{"text": text}]},
            "streaming": True}
    with request("/run_sse", body, stream=True) as response:
        for line in response:
            # 这个入口把一次 ADK 事件编码为一行 data JSON。
            if not line.startswith(b"data:"):
                continue
            event = json.loads(line[5:])
            if "error" in event:
                raise RuntimeError(event["error"])
            if not event.get("partial"):
                for part in (event.get("content") or {}).get("parts", []):
                    if part.get("text") and not part.get("thought"):
                        print(part["text"])

ask("我们把这个项目命名为青竹。请确认项目名。")
ask("刚才定下的项目名是什么？")
history = read_json(sessions + "/" + quote(session, safe=""))
print("会话", history["id"], "历史事件数", len(history.get("events", [])))
```

第一轮取得服务器分配的会话 ID，第二轮使用同一个 ID。示例只打印完整文本事件，适合先验证调用链路。聊天界面若要实时呈现文字，可以按[事件消费方式](features.md)处理临时文本和工具活动。运行环境有多个应用时，请显式设置示例变量 `HARNESS_APP_NAME` 为目标应用。
