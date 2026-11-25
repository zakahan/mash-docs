# 文档维护约定

本仓库面向在 AgentKit Runtime 上使用或二次开发 VeADK Agent Loop 镜像的工程师。安装、预览、构建和创建版本快照的命令见 [README.md](README.md)。

编辑前按 [SPEC.md](SPEC.md) 确定组件归属、页面类型和展示方式。

## 版本与来源

- `docs/` 维护 latest，目前跟踪 0.5.0。`versioned_docs/` 保存 0.5.0、0.4.0、0.3.1 和 0.2.0 的版本快照。按功能实际进入的版本更新；未发布行为需要明确注明开发状态。
- 镜像行为按对应 release/tag 的入口、请求模型和执行代码核实。控制面接口按对应版本的接口定义和实现核实。说明请求字段时分别核实控制面是否接受、运行时是否消费。说明权限时写清哪个功能会触发对应 Action。

## 编辑入口

- 环境变量表使用设计规范中的三列表头，`env-tables.js` 据此应用样式。
- 新增 REST 操作时，在 Markdown 二级标题末尾写显式锚点，并在 [rest-navigation.json](rest-navigation.json) 中核对目录名称。
- 使用字段表时先列父对象，再列完整子字段路径，供 `plugins/api-fields.js` 生成折叠层级。

## 验证

- 修改页面或构建逻辑后运行 `npm run build`，在产物中检查受影响版本的页面、侧边栏和接口锚点。
- 调整排版时，用桌面和手机宽度检查实际页面。长路径应在路径段之间换行，变量表中的长 URL 应能换行，说明列应在正文宽度内可读。
- 修改 API 字段或导出逻辑时，从受影响版本的 `llms.txt` 打开对应 Markdown，确认嵌套字段和示例完整。导出文件由构建生成，维护入口是文档源文件及导出插件。

## 源码与发布

- 本地、Codebase（`origin`）和 GitHub（`github`）使用同一套源码；两个远程的 `main` 保持同一提交。
- 构建产物不提交到 `main`。GitHub Pages 由 `.github/workflows/pages.yml` 构建并发布。
- 在 `main` 提交并验证后使用 `npm run sync` 同步两个远程；不要在临时目录维护另一套源码或手工覆盖发布分支。
