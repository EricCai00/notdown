# Notion v2 行内文字色与背景色（2026-10-27）

## 问题与修复

使用 `<span color="red"><span color="yellow_bg">Both</span></span>` 复现了 Notion Markdown v2 的颜色覆盖问题：内外层共用一个 color mark，原解析会用外层替换内层，丢失背景通道。Notdown 的原生内联适配器已有按通道合并，但不同解析路径和 v2 保存结果不一致。颜色菜单还仅允许 Notdown 保留两个通道，官方模式设置第二项时会清除第一项。

修复后嵌套 span 分别合并文字色与背景色，同通道由内层优先，保留未知属性。v2 的两种模式均可分别设置、清除两个通道；事务过滤和序列化边界接受内部的双通道表示。保存时使用嵌套的既有 `color` 标签，不新增自定义属性。`bg_color` 源属性仍仅在 Notdown 中解释，官方模式继续保留为不支持的可恢复源码。

未修改的原文继续复用；没有批量改写文件、迁移旧版本或修改用户知识库。未标记 v2 的官方模式保留原来的单通道编辑限制，旧 Notdown 自定义双颜色继续兼容。

## 官方来源与能力边界

- [Notion-flavored Markdown](https://developers.notion.com/guides/data-apis/notion-flavored-markdown) 定义了 `span color`、颜色的 `_bg` 形式和标签嵌套规则。本地读取器按两个颜色通道保存嵌套语义。
- [Rich text](https://developers.notion.com/reference/rich-text) 的 `annotations` 仍只有一个 `color` 枚举；[Block](https://developers.notion.com/reference/block) 另有块颜色。因此块背景加行内文字色与同一行内范围的独立双颜色不是同一存储结构。

这里验证的是本地 Markdown 的显示和读写，没有用真实 Notion Markdown 写接口验证嵌套双颜色是否被完整接受与返还。不能把本地无损保存表述为 Notion 云端往返保证，也不能补造原始 API 未返回的颜色。

## 验证

- 定向单元测试：`notion-v2`、`inline-colors`、`notion-markdown` 共 48 项通过。覆盖两种嵌套顺序、同通道覆盖、局部范围、未知属性、编辑后回读、分别清除与禁用扩展；官方模式的显式自定义 `bg_color` 仍保留源码。
- `npm test`：最终运行 1,091 通过、5 跳过、1 失败。失败为 `browser-vaults` 的临时 HTTP 服务被 Node fetch 报 `bad port`，没有颜色断言失败；单独复测该文件两项均通过。没有把失败运行记作全绿。
- `npm run build -- --outDir .run/notion-dual-colors-frontend`：通过，包含 TypeScript 检查。
- 独立 Chrome 与临时知识库：`selection-menu`、`notion-v2-import`、`notion-boundary` 共 20 项通过。验证红字黄底的计算样式、修改颜色、分别清除、撤销、保存重开和既有语法边界；已检查生成截图。
- `npm run desktop:dist -- --config.artifactName=Notdown-Setup-0.1.3-colors-x64.exe`：通过。修复包位于 `.run/desktop-release/Notdown-Setup-0.1.3-colors-x64.exe`（205,176,769 bytes），包括之前的子页面和 code-tag 修复；未自动替换运行中的安装版。

本次未执行完整浏览器套件。执行日志位于 `.run/logs/notion-dual-colors-*.log`，截图位于 `test-results/notion-dual-colors/`。
