# 页面与位置链接

Notion 页面提及、Obsidian Wiki 链接及 Typora／普通 Markdown 内链共用 `InternalReference` 语义模型，Block Explorer 中统一归入 `inline.internal_link`。页面和位置是该对象的两种目标范围；数据库／数据源提及仍独立，不表示页面或数据库所有权。

`/` 菜单提供两个入口：

- **Page link（页面链接）**：引用完整页面，包括 `[[Example]]` 和 `<mention-page>`。
- **Location link（位置链接）**：选择当前页或其他页面的标题、已有块 ID 或锚点，包括 `[[Example#Details]]`、`[[Example#Overview#Details]]`、`[[Example#^item]]` 及 `[详情](Example.md#details)`。

插入器允许填写显示文字。显式 Wiki 别名和普通 Markdown 链接文字保持不变；自动页面标签随已解析页面的标题显示。Markdown 仍是正文真相，未修改的原文、未知属性与原有写法保留，不批量转换既有文件。普通链接继续使用富文本 mark，Wiki／mention 使用行内引用节点；两者共享分类、目标解析、导航与反向链接。

## 输入时补全

可视正文输入 `[[`、`+页面名` 实时搜索页面；`@页面名` 在已有联系人／日期菜单中提供页面候选。按 ↑/↓ 选择，Enter/Tab 或点击插入，Escape 取消且保留输入。重名页面通过父位置与短 ID 区分，选择后写稳定页面 ID，不猜测重名目标。回收站页面及其后代不列入候选。

`[[` 菜单优先列出已有页面，`+` 优先创建；可选择当前页、其他页面或知识库顶层作为创建位置。创建调用既有页面 API／createVault，不切换当前编辑页。异步返回前发生编辑、取消、视图切换或页面导航时，不再向旧位置插入；已成功创建的页面保留在侧栏。失败不清除输入或强制重试。撤销引用插入不删除创建的页面。

Wiki 启用时沿用 Wiki 编码，官方页面提及可用时沿用 `<mention-page>`，其余方言使用普通 Markdown 内链。既有 `[[目标|别名]]` 与位置源码不被实时页面菜单截走；`+` + 空格仍是无序列表。转义、代码、链接及 IME 组合输入期间不触发菜单。`(@` 继续由示例引用菜单处理。这里不扩展全库标题／块搜索，也不增加新的正文协议。

## 位置与方言

- Wiki 标题引用按标题文本与可选父标题链定位；Markdown fragment 优先匹配方言生成的标题 ID 或显式锚点。
- Obsidian／Notdown 接受段落末尾 ` ^block-id`、列表项末尾 ` ^item-id`，以及结构化块后空行分隔的独立 `^block-id`。代码围栏、行内代码和转义内容不被当成块 ID。
- Obsidian 文档的“特定行”是带块 ID 的列表项，不是任意源码行号。未增加 `#L42` 私有协议，也不支持引用表格单元格、引用块或 callout 的内部片段。
- 位置选择器列出已有目标；暂不为无 ID 的块自动写入 ID。未知或重复块 ID 不自动选取目标。
- HTML 的 `id` 和 `<a name>` 在安全投影中使用 `md-` 命名空间，保留原始锚点身份；脚本、事件处理器和应用操作属性仍被移除。
- 官方 `notion-markdown` 不解释 Wiki 或 Obsidian 块 ID 源码。输入快捷键可转成官方页面提及或普通链接；模型统一不会越过方言边界。

跨页跳转沿用页面保存与 CAS 冲突流程，URL 保留目标片段，支持刷新与历史导航。反向链接和关系图按解析后的页面归并，不把标题／块片段拼进页面身份。重名且无法确定身份的页面保持未解析；这里没有实现完整 Obsidian 文件路径、别名索引、自动重命名修复或全库 `[[##`／`[[^^` 自动补全。

来源：[Obsidian Internal links](https://obsidian.md/help/links)、[Typora Links](https://support.typora.io/Links/)、[Notion Enhanced Markdown](https://developers.notion.com/guides/data-apis/enhanced-markdown)。
