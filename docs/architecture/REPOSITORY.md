# 仓库组织约定

本项目是一个 TypeScript 应用，包含 Vite 多页面前端与本地 Node 服务。按职责组织源码，继续使用一份依赖和构建配置；目前不拆成 monorepo 或发布包。目录归位保留既有模块关系，不代表已经消除跨模块依赖或完成严格分层。

## 入口

| 入口 | 源码 | 用途 |
| --- | --- | --- |
| `index.html` | [src/app/main.ts](../../src/app/main.ts) | 主应用 |
| `block-catalog.html` | [src/catalog/block-catalog.ts](../../src/catalog/block-catalog.ts) | Block Explorer |
| `markdown-lab.html` | [src/markdown-lab/main.ts](../../src/markdown-lab/main.ts) | 渲染器与 HTML 输出对照 |
| `npm run dev` / `npm start` | [server/index.ts](../../server/index.ts) | 本地知识库与 HTTP API |
| `npm run mcp` | [server/mcp.ts](../../server/mcp.ts) | MCP 桥接 |

三个 HTML 入口留在仓库根目录，保持现有 URL。构建、测试和启动配置也留在根目录，维护脚本放 `scripts/`。

## 源码归属

| 目录 | 放什么 |
| --- | --- |
| `src/app/` | 页面装配、应用生命周期、侧栏与全局样式 |
| `src/document/` | 文档 schema、内容对象与 Markdown / Notion 编解码 |
| `src/editor/` | ProseMirror 编辑器、命令、选区、菜单与通用节点视图 |
| `src/blocks/` | 分栏、Tabs、按钮、嵌入等具体块的视图和操作 |
| `src/features/` | 按书签、链接、联系人、日期、页面、元数据组织的模型、交互及样式 |
| `src/markdown-engine/` | 方言、扩展、解析与序列化、源码保留和编辑工作区 |
| `src/markdown-lab/` | Lab 专属界面、请求契约及滚动映射 |
| `src/catalog/` | 内容目录、语法条目、关系和来源说明 |
| `src/shared/` | 共用类型、API 客户端、图标与文本工具 |
| `src/integrations/` | 外部格式集成，目前为 MyBase 导出 |
| `src/assets/` | Vite 构建时引用的图片、光标等静态资源 |
| `public/page-covers/` | 内置封面 Gallery 的图片与缩略图；使用稳定 URL，以便页面 YAML 中的封面路径在重新构建后仍有效 |
| `server/` | 文件知识库、服务端抓取与集成、HTTP API 和 MCP |

新增代码优先放到所属功能目录，功能专属 CSS 与实现放在一起。只有被多个功能实际共用的基础工具才进入 `shared/`。导入直接指向实现文件，不增加仅用于转发的旧路径文件或汇总导出。现有跨目录依赖仍需谨慎处理，服务端不得因为复用数据模型而执行浏览器入口。

## 测试与产物

- `tests/unit/`：Node 测试，包含纯模型测试与使用临时知识库的服务集成测试。运行 `npm test`。
- `tests/e2e/`：Playwright 测试及独立测试服务器。运行 `npm run test:e2e`；使用独立 Chrome，不连接用户浏览器。
- `docs/fixtures/`：共享 Markdown 语料、附件和手工验收页面生成器。
- `docs/data/`：进入版本管理的语法来源快照和审计数据。
- `.run/logs/`：本地运行日志；`.run/` 也可存放临时分析和工具文件。
- `test-results/`：Playwright 报告、trace、截图及隔离构建；`dist/`：默认生产构建。

定向运行示例：`npx tsx --test tests/unit/markdown-engine.test.ts`；先构建后运行 `npx playwright test tests/e2e/markdown-lab.spec.ts`。端口与隔离构建配置见 [README](../../README.md#验证)。

`vault/` 是用户数据，不参与源码整理、测试或清理。未知字段、原文与 CAS 冲突保留规则仍按 [AGENTS.md](../../AGENTS.md) 和 [格式契约](../FORMAT.md) 执行。

## 文档

当前正文契约保留在 `docs/FORMAT.md`。设计放 `architecture/`，格式和接口参考放 `reference/`，功能说明放 `features/`，审计放 `audits/`，历史验收放 `verification/`。新增文档同时更新 [文档导航](../README.md)，历史结果注明日期与范围。
