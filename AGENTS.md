# Notdown

- 仓库目录职责与新增文件归属见 `docs/architecture/REPOSITORY.md`，文档入口为 `docs/README.md`。单元/服务测试放 `tests/unit/`，浏览器测试放 `tests/e2e/`；本地执行日志放 `.run/logs/`，不要写到仓库根目录。

本项目独立于父目录的上游 clone。思源是本地内核参考，AFFiNE/AppFlowy 是块交互参考。实际编辑器为单一 ProseMirror 文档与自有 Markdown codec；不要把实现描述成任何完整上游 fork。

- 正文真相是 `vault/pages/*.md`，不是缓存的块 JSON；通用页面属性集中写 `vault/metadata.json`，文档内 YAML / Pandoc title block 覆盖 JSON 默认值。源码模式包含完整文件，不自动添加应用 YAML。目录中已有文件及未知字段必须保留。
- 写入走 `createVault`，所有更新使用 `baseRevision`，冲突必须保留两份可恢复内容。不要因版本不匹配自动强制重试。
- `vault/` 是用户内容。测试使用临时知识库；默认演示只由 `seedNewDefaultVault` 在首次启动时创建。
- 编辑器视图切换前必须收取 pending 输入。后台外部刷新不得将旧 DOM 正文与新 revision 混合；不同窗口草稿不得互相覆盖。
- Markdown 扩展规则见 `docs/FORMAT.md`；避免正则全局改写代码围栏或未知语法。结构化编辑必须有原文保留及异常边界验证。
- Notdown 集合已有 Markdown 方言与 Notion。自定义正文语法仅用于补足官方 Enhanced Markdown 不支持的 Notion block、已有 block 的属性、inline 和 style，且只能在 `syntax.variant: notdown` 启用；`notion-markdown` 仅启用官方文档定义的语法，显式扩展开关也不能越过此边界。能用已有方言表达的内容复用该方言，不能另造重复协议。旧文件和未知字段必须可恢复保留，不批量迁移用户内容。 详见 docs/audits/CUSTOM-SYNTAX-AUDIT-2026-09-23.md。
- MyBase 规范来源是 `D:/Workspace/mybase`。未经用户明确要求，不写入该主库、不分配其 LQ/LP ID；导出按 `src/integrations/mybase.ts` 的稳定 UUID 身份与真实 datatype 规则。
- 安装使用 `npm ci`；运行 `npm run dev`；验证 `npm test` 与 `npm run build`，编辑交互改动运行 `npm run test:e2e`。浏览器测试用独立临时知识库和 Chrome，不连接用户浏览器。
- 修改功能时更新 README 中的已实现/尚未实现边界。当前仅本地 CAS 与冲突分支，不宣称完成跨端同步。
