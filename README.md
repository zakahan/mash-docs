# VeADK Agent Loop 文档

本地、Codebase 和 GitHub 使用同一套源码，两个远程的 `main` 保持同一提交。日常只在本仓库修改 `docs/`、样式及构建插件，不直接编辑生成的网页。GitHub Pages 由 Actions 从源码构建并发布。

## 本地预览与提交

使用 Node.js 22，在仓库根目录执行：

```bash
npm ci
npm start -- --host 0.0.0.0 --port 38421
```

访问 `http://localhost:38421/`，修改文档后自动刷新。如果旧的 Docker 预览容器占用端口，先运行 `docker stop mash-docs`。Docker 静态预览方式见下文。

修改完成后运行构建检查，提交，再同步两个远程：

```bash
npm run build
git add <修改的源文件>
git commit -m "docs: 描述修改内容"
npm run sync
```

`origin` 指向 Codebase，`github` 指向 GitHub。`npm run sync` 只在工作区干净的 `main` 分支执行，先检查两个远程是否都能快进，再依次推送同一个提交；远程有未合入的提交时停止，不强制覆盖。中途网络失败可以修复连接后重试。

GitHub `main` 更新后，Actions 自动发布到 <https://zakahan.github.io/mash-docs/>，无需提交 `build/` 或手动复制产物。本地使用 `/`，Pages 使用 `/mash-docs/`，由构建环境变量控制；文档源码完全相同。Actions 状态可在 GitHub 仓库的 Actions 页面查看。

## 版本与公开内容

`docs/` 对应 latest，目前跟踪 0.5.1；开发中的目标契约在对应页面单独标注。`versioned_docs/version-0.5.1/`、`versioned_docs/version-0.4.0/`、`versioned_docs/version-0.3.1/` 和 `versioned_docs/version-0.2.0/` 保存对应发布版本的快照。按变更实际适用的版本维护文档。发布下一版本时先更新 latest，执行 `npm run snapshot -- <版本号>`，再检查新快照、侧边栏与版本切换。

控制面接口使用独立的 API 版本；开发中能力在对应页面明确标注。Harness App 请求与响应按镜像版本维护。

文档与历史版本均按可公开内容维护，不包含内部源码或设计稿链接、个人路径、真实凭据和未获准公开的实测数据。`npm run build` 会检查文档、静态资源及构建产物；也可执行 `npm run check:public` 单独检查已有产物。规则扫描不能替代对新内容及图片的人工审查。发布时只上传本次成功构建的 `build/`，不混入旧产物。

## Docker 启动

在仓库根目录构建静态页面，再打包并启动 Nginx 容器。默认对外监听 `0.0.0.0:38421`，同一网络的机器可通过 `http://<宿主机地址>:38421/` 访问。

```bash
npm ci
DOCS_URL="${DOCS_URL:-http://localhost:38421}" npm run build
docker build -t mash-docs .
docker run -d --name mash-docs --restart unless-stopped -p 0.0.0.0:38421:80 mash-docs
```

使用域名时，在 `npm run build` 前设置 `DOCS_URL`。如果挂载到子路径（例如 `/docs/`），还需设置 `export DOCS_BASE_URL=/docs/`，并在镜像构建命令中加入 `--build-arg DOCS_BASE_URL="$DOCS_BASE_URL"`。
