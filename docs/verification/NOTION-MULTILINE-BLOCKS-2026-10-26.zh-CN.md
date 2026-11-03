# Notion v2 多行子页面与引用块（2026-10-26）

[English](NOTION-MULTILINE-BLOCKS-2026-10-26.md) · **简体中文**

## 原因与范围

`<page>` 原先回落到旧读取器，只接受同一行闭合或自闭合的形式。Notion v2 的多行 Child page 因而被保留成不支持块，分栏中的子页面也受影响。核查发现 `<folder>`、`<database>` 的旧读取器还显式拒绝带换行的标题正文。

v2 现在直接读取这三种块的完整标签范围，保留其类型、目标 URL、未知属性及数据库的 data-source、inline、wiki、icon 字段。标题按富文本解析后取得可读名称；未编辑的原始正文由既有源码保留机制保存。读取不创建、重设或迁移页面归属；导入仍由 Block API 确认真实父子关系。

已导入且带 `syntax.notionVersion: "v2"` 的文件重新打开即可恢复显示，无需重新导入或改写知识库文件。此变更没有修改用户知识库或运行中的安装版。

## 官方规范核对

来源：[Notion-flavored Markdown format](https://developers.notion.com/guides/data-apis/notion-flavored-markdown)。这是 `markdown_version: "v2"` 的格式说明，包含单行标签示例和多行容器示例。不能据此假定接口始终返回单行，也不能声称每种块始终返回多行。

## 验证

- `npm test`：1,087 通过，5 跳过，0 失败。
- `npm run build -- --outDir .run/notion-child-pages-frontend`：通过，包含 TypeScript 检查。
- `tests/unit/notion-v2.test.ts`：两种方言分别覆盖 30 种块标签的多行正文、分栏内嵌套、原样保存和相邻正文编辑；Child page 另外覆盖 CRLF、格式化中文标题、代码示例、未知容器、缺失闭合和关闭扩展。
- `tests/unit/notion-v2-import.test.ts`：模拟 v2 API 返回顶层及分栏中的多行 Child page，检查本地目标、标签、页面归属和保存后源码。
- `tests/e2e/notion-v2-import.spec.ts`：6 项通过；使用独立 Chrome 和临时知识库，验证新导入以及已有 v2 文件的显示、相邻编辑、保存重开、跳转及 revision 不因读取改变。检查了生成的分栏截图。
- 扩展浏览器回归（Notion、内部引用与子页面删除，排除已单独完成的 v2 测试）：35 通过、6 失败。失败详情：示例编号插入未出现预期标签；两种方言的图片题注用例仍断言旧 XML 输出，实际保存为 v2 支持的 Markdown 图片；导入进度用例的总页数期望 52、实际 49；两个旧 MCP 用例期望未导入数据库显示来源名称，实际显示 `Unknown database`。本次没有修改这些行为或断言，且未进行修复前完整基线复测，因此不能将扩展回归称为全绿。
- `npm run desktop:dist -- --config.artifactName=Notdown-Setup-0.1.3-child-pages-x64.exe`：通过。修复安装包位于 `.run/desktop-release/Notdown-Setup-0.1.3-child-pages-x64.exe`（205,173,131 bytes）；未自动安装或关闭正在运行的应用。

本次未使用真实 Notion token 请求线上页面；自动化覆盖的是官方语法及模拟 API。它验证多行解析问题，不代表所有远端块配置或交互均已完整复现。

执行日志位于 `.run/logs/notion-child-pages-*.log`，浏览器产物位于 `test-results/notion-child-pages/` 与 `test-results/notion-child-pages-regressions/`。
