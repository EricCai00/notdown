# 仓库组织约定

[English](REPOSITORY.md) · **简体中文**

本项目是一个 TypeScript 应用，包含 Vite 多页面前端与本地 Node 服务。按职责组织源码，继续使用一份依赖和构建配置；目前不拆成 monorepo 或发布包。目录归位保留既有模块关系，不代表已经消除跨模块依赖或完成严格分层。

Android 与桌面共用本仓库和 npm 依赖，通过同一 Vite 配置的 `mobile` mode 构建独立入口。共用文档与知识库逻辑留在 `src/`；Android 原生工程和系统能力适配分开维护。

## 入口

| 入口 | 源码 | 用途 |
| --- | --- | --- |
| `index.html` | [src/app/main.ts](../../src/app/main.ts) | 主应用 |
| `block-catalog.html` | [src/catalog/block-catalog.ts](../../src/catalog/block-catalog.ts) | Block Explorer |
| `markdown-lab.html` | [src/markdown-lab/main.ts](../../src/markdown-lab/main.ts) | 渲染器与 HTML 输出对照 |
| `npm run dev` / `npm start` | [server/index.ts](../../server/index.ts) | 本地知识库与 HTTP API |
| `npm run mcp` | [server/mcp.ts](../../server/mcp.ts) | MCP 桥接 |
| `npm run desktop` | [src/desktop/main.ts](../../src/desktop/main.ts) | Electron 主进程、知识库选择与本地服务生命周期 |
| `npm run mobile:dev` / `npm run android:build` | [src/mobile/main.ts](../../src/mobile/main.ts) | 手机浏览器预览 / Capacitor Android 应用 |

三个 HTML 入口留在仓库根目录，保持现有 URL。构建、测试和启动配置也留在根目录，维护脚本放 `scripts/`。

## 源码归属

| 目录 | 放什么 |
| --- | --- |
| `src/app/` | 页面装配、应用生命周期、侧栏与全局样式 |
| `src/desktop/` | Electron 主进程、受限 preload 桥接及欢迎页；构建脚本为 `scripts/build-desktop.mjs`，安装配置为根目录 `electron-builder.yml` |
| `src/mobile/` | 手机界面、草稿恢复、ZIP 导入导出、Android 与浏览器预览存储适配；HTML 入口为本目录 `index.html` |
| `src/vault/` | 平台无关的知识库核心、存储接口、版本校验、历史与冲突、数据库及联系人存储 |
| `src/sync/` | 共用同步协议、队列、Supabase 和 WebDAV 认证与传输；经 `src/vault/sync-store.ts` 写回，Supabase SQL 在 `server/sync/` |
| `android/` | Capacitor 原生工程、受限私有文件插件、同步 HTTPS 传输与系统文件保存；构建配置为根目录 `capacitor.config.ts` |
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
| `server/` | Node 知识库装配与文件系统适配、服务端抓取与集成、HTTP API 和 MCP |

新增代码优先放到所属功能目录，功能专属 CSS 与实现放在一起。只有被多个功能实际共用的基础工具才进入 `shared/`。导入直接指向实现文件，不增加仅用于转发的旧路径文件或汇总导出。现有跨目录依赖仍需谨慎处理，服务端不得因为复用数据模型而执行浏览器入口。

## 测试与产物

- `tests/unit/`：Node 测试，包含纯模型测试与使用临时知识库的服务集成测试。运行 `npm test`。
- `tests/e2e/`：Playwright 测试及独立测试服务器。运行 `npm run test:e2e`；使用独立 Chrome，不连接用户浏览器。
- `npm run test:desktop`：同目录的独立 Electron 测试配置，使用临时知识库和独立用户配置；`desktop-dist/` 为桌面入口构建，`.run/desktop-release/` 为安装包及解包产物。
- `npm run test:mobile`：独立 Chrome 触屏预览测试，使用临时浏览器存储；与普通浏览器测试分开配置。移动端构建在 `.run/android-frontend/`，调试 APK 在 `.run/android-release/`，原生 JVM 测试位于 `tests/unit/android/`，由 Android Gradle 配置读取。
- `docs/fixtures/`：共享 Markdown 语料、附件和手工验收页面生成器。
- `docs/data/`：进入版本管理的语法来源快照和审计数据。
- `.run/logs/`：本地运行日志；`.run/` 也可存放临时分析和工具文件。
- `test-results/`：Playwright 报告、trace、截图及隔离构建；`dist/`：默认生产构建。

定向运行示例：`npx tsx --test tests/unit/markdown-engine.test.ts`；先构建后运行 `npx playwright test tests/e2e/markdown-lab.spec.ts`。端口与隔离构建配置见[运行与开发指南](DEVELOPMENT.zh-CN.md#隔离浏览器测试)。

`vault/` 是用户数据，不参与源码整理、测试或清理。未知字段、原文与 CAS 冲突保留规则仍按 [AGENTS.md](../../AGENTS.zh-CN.md) 和 [格式契约](../FORMAT.zh-CN.md) 执行。

`src/vault/database-files.ts` 管理 `databases/*.json` 的文件契约、归属与兼容投影；`databases.ts` 管理数据库操作与资源版本。`page-batch.ts` 负责 Markdown、数据库和 metadata 的联合 CAS／恢复，不在 UI 或 HTTP 路由直接拼写规范文件。旧格式迁移入口为 `scripts/migrate-database-files.ts`，规则见[数据库存储](../features/DATABASES.zh-CN.md#独立数据库文件)。

## 文档

根目录 `README.md` 为英文主入口，`README.zh-CN.md` 为对应中文版；两者面向新用户，只保留简短的产品介绍、主要功能、上手步骤、关键边界和文档链接。维护规则见 [AGENTS.md](../../AGENTS.zh-CN.md#readme-维护规则)。普通修复不追加到首页，详细操作、实现和验收内容进入对应专题，运行配置与测试命令集中在[开发指南](DEVELOPMENT.zh-CN.md)。当前正文契约保留在 `docs/FORMAT.md`。设计放 `architecture/`，格式和接口参考放 `reference/`，功能说明放 `features/`，审计放 `audits/`，历史验收放 `verification/`，已被替代的文档快照放 `archive/`。新增文档同时更新[文档导航](../README.zh-CN.md)，历史结果注明日期与范围。

英文是文档主语言。默认 `.md` 文件使用英文，中文译本使用相同文件名并加 `.zh-CN.md` 后缀。两种语言的索引分别为 `docs/README.md` 和 `docs/README.zh-CN.md`。两版同步维护并提供语言切换，普通文档链接保持当前语言；命令、标识符、代码示例与测试语料保持不变。运行 `npm run docs:check` 校验文档配对、本地目标、标题锚点和语言路由。
