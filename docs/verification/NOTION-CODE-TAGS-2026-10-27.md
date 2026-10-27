# Notion v2 行内代码兼容读取（2026-10-27）

## 原因与证据

核对了截图页面的本地 Markdown 与导入时归档的原始 Markdown，两者均包含 `<code>rdkit.Chem.BRICS.BRICSDecompose</code>`。这项表示来自当时的 API 响应，未由 Notdown 把反引号改成标签。本次只读检查了该页及其归档，没有修改用户知识库。

当前[官方 v2 格式说明](https://developers.notion.com/guides/data-apis/notion-flavored-markdown)以 CommonMark 为基础，反引号行内代码仍适用；其允许的标签列表没有列出 `<code>`。因此不能据此宣称 v2 弃用反引号，或把该标签列为已文档化的官方语法。

## 修复与边界

仅 `syntax.variant: notdown` 且 `notionVersion: v2` 时兼容无属性、同一行闭合的 `<code>…</code>`，映射为已有 code mark，显示为行内代码。兼容普通段落、属性段落、标题、列表、Callout、分栏与表格。标签里的 XML 实体解码，其他 Markdown、链接及标签均作为字面代码；不生成新的代码对象或重复写入协议。

未编辑或只编辑相邻正文时保留原始标签与字节；直接编辑代码后使用标准反引号保存。已有文件重新打开即可读取，不批量迁移。官方 Notion Markdown 模式不启用该兼容，未知属性、缺失闭合与未知容器的原文仍保留。

来源扫描跳过完整 code-tag 正文，避免其中的未配对反引号或标签示例干扰外层闭合识别，也避免触发子页面、附件、提及等额外读取。代码围栏与反引号内的标签示例继续保留为代码内容。

## 验证

- `npm test`：1,088 通过、5 跳过、0 失败。
- `npm run build -- --outDir .run/notion-code-tags-frontend`：通过，包含 TypeScript 检查。
- `tests/unit/notion-v2.test.ts`：覆盖容器与表格、实体、嵌套样式、代码中的标签和未配对反引号、相邻编辑原文保留、编辑后反引号回读，以及官方模式与旧版本边界。
- `tests/unit/notion-v2-import.test.ts`：更新模拟 API 正文包含 `<code>` 后，8 项通过，验证导入产生真实 code mark 且归档保持原文。
- 独立 Chrome 与临时知识库浏览器测试：17 项通过。范围为 `notion-v2-import`、`notion-boundary`、`notion-format`、`notion-child-presentation`、`notion-block-import`；验证已有页面显示、代码编辑与保存重开、相邻编辑原文保留、新导入及此前多行 Child page 修复。已检查截图中的行内代码显示。
- `npm run desktop:dist -- --config.artifactName=Notdown-Setup-0.1.3-code-tags-x64.exe`：通过。安装包位于 `.run/desktop-release/Notdown-Setup-0.1.3-code-tags-x64.exe`（205,175,281 bytes），包含前一项多行 Child page 修复；未自动替换正在运行的安装版。

本次没有重新执行全部浏览器测试；上一份[多行块验证记录](NOTION-MULTILINE-BLOCKS-2026-10-26.md)中的扩展套件失败不因此视为已解决。未使用真实 token 重新请求 Notion。

执行日志位于 `.run/logs/notion-code-tags-*.log`，浏览器产物位于 `test-results/notion-code-tags/`。
