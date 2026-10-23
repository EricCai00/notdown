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
- 本地 CAS 与冲突分支继续保护所有写入。跨端同步为需配置 Supabase 或 WebDAV 的实验性前台功能；没有完成真实云端及真机验收时，不宣称具备生产同步或后台同步保证。范围见 `docs/features/CLOUD-SYNC.md`。功能文档与 README 的更新按下述规则执行。

## README 维护规则

- `README.md`（英文）与 `README.zh-CN.md`（中文）是面向新用户的产品入口。阅读顺序保持为：项目图标、名称与一句话介绍 → 主要功能 → 快速开始 → 文件存储 → 当前状态与关键限制 → 文档入口 → 开发入口与致谢。首屏必须让用户知道这是什么、能做什么、如何开始。
- 保持简短、易扫读，两版结构和能力边界同步维护；单版以约 100–150 行为参考，不用超长段落、巨型表格或折叠区规避篇幅控制。主要功能只写少量用户收益，每项一两句话。使用仓库已有的 `src/assets/notdown-icon.png`，保留语言切换和有效导航，不虚构下载链接、徽章或截图。
- 禁止把 README 当作 changelog、工作日志、验收报告或实现备忘录；不要在简介前、功能表格中、限制章节内或文件末尾追加本次修复的细节。菜单逐项说明、交互状态、像素/延迟参数、节点类型、序列化语法、迁移命令、API、测试配置和逐次验证结果不放在根 README。
- 细节优先更新已有专题：用户操作放 `docs/features/`，架构和开发配置放 `docs/architecture/`，语法与接口参考放 `docs/reference/`（正文契约仍为 `docs/FORMAT.md`），审计放 `docs/audits/`，有日期和范围的验收记录放 `docs/verification/`；本地日志放 `.run/logs/`。确需新增专题时在 `docs/README.md` 登记，不另建重复说明。
- 每次功能修改先更新对应专题。只有用户价值、首次使用步骤或关键能力边界改变时，才精简修改中英文 README 的对应条目；普通修复无需改首页。历史修复不能逐条累积为功能介绍，不把计划中、部分实现或未经验证的能力写成已完成。
- 移出 README 的有效使用说明要归入对应文档，去掉重复和已过时内容；同时修复站内链接与章节锚点。提交前通读两版，检查图标、相对链接、启动命令和语言一致性；排版变动应查看渲染结果，确保首页仍是可读的产品入口。
