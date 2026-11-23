# VeADK Agent Loop 文档

使用 Node.js 22，在本目录运行 `npm ci` 和 `npm start`。生产构建运行 `npm run build`，本地查看产物使用 `npm run serve`。部署时设置 `DOCS_URL` 和可选的 `DOCS_BASE_URL`。

`docs/` 对应 latest，目前跟踪待发布的 0.4.0 实现。`versioned_docs/version-0.4.0/`、`versioned_docs/version-0.3.1/` 和 `versioned_docs/version-0.2.0/` 保存对应发布版本的快照。按变更实际适用的版本维护文档。发布下一版本时先更新 latest，执行 `npm run snapshot -- <版本号>`，再检查新快照、侧边栏与版本切换。

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
