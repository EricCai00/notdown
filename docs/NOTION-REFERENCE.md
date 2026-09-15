# Notion 交互参考

记录日期：2026-09-12。当前编辑器为单一 ProseMirror 文档，已经替换早期逐块 Vditor。以下区分参考、实现及测试范围。

## 依据

本轮通过 Computer Use 只读查看了本机 Notion「Notion vs Markdown」页面，核对实际正文、嵌套列表、侧栏和留白；没有编辑该 Notion 页面。同时重新读取了 [Notion 编辑基础](https://www.notion.com/help/writing-and-editing-basics) 和 [键盘操作](https://www.notion.com/help/keyboard-shortcuts)。

采用其正文内输入、块菜单、列表项层级、页面链接节点的交互方式。按用户明确要求，块左侧只在悬停时显示六点手柄，没有加号；Ctrl+E 用于页面/源码切换。没有复制 Notion 品牌资源或声称完整产品的所有交互都已实现。

## 本地 clone 的具体参考

下列路径相对于 `D:/Workspace/note-app`，上游目录未修改。

| 文件 | 读到的实现 | 本项目对应 |
| --- | --- | --- |
| `AFFiNE/blocksuite/affine/blocks/list/src/commands/indent-list.ts`、`dedent-list.ts` | 每个列表项独立，持有 children；缩进和提升改变树结构并恢复选区 | `editor-blocks.ts` 使用独立 list_item，Tab/Shift+Tab 移动子树 |
| `AFFiNE/blocksuite/affine/blocks/note/src/commands/indent-block.ts` | 父子块操作是文档结构更新 | 拖动父项携带子树，子项独立定位；禁止移入后代 |
| `AFFiNE/blocksuite/affine/widgets/slash-menu/src/widget.ts`、`slash-menu-popover.ts` | 真实选区、查询筛选、IME 防护、消耗命令文本、监听清理 | `editor-slash.ts` 从 PM transaction/selection 读取查询；`main.ts` 展示不抢焦点的菜单 |
| `AppFlowy/frontend/appflowy_flutter/lib/plugins/document/presentation/editor_plugins/mention/mention_page_block.dart` | 页面提及是有 pageId 的节点，显示标题和图标 | `editor-links.ts` 页面 atom NodeView，保持视觉显示，按稳定 ID 导航 |
| `anytype-ts/src/ts/component/menu/block/add.tsx`、`context.tsx` | 查询和键盘活动项，操作前处理选区 | 本地斜杠菜单、六点转换/复制/删除菜单 |
| `anytype-ts/src/ts/component/menu/search/object.tsx` | 集中搜索、活动结果、关闭解绑 | `page-search.ts` 本地匹配与 `main.ts` 搜索弹窗 |

这些是交互和结构参考，不引入上游 CRDT/对象存储，不把其数据库当作 Markdown 的第二个权威来源。

## 当前实现

- `prosemirror-editor.ts`：一个连续 EditorView，选区、文字编辑、结构变更共用 history。正文没有逐块挂载的编辑框。
- `editor-schema.ts` / `editor-markdown.ts`：文件解析为临时编辑树，每次修改序列化回 Markdown。未改顶层内容保留源切片，未知语法安全保留。
- `editor-slash.ts`：单独 `/` 即有空查询菜单，支持 `、`、筛选、取消和组合输入状态。旧版把 Vditor 整个 pre 编辑区当代码块的问题已消除。
- `editor-links.ts`：行内页面提及显示图标和当前页面名；链接到页面显示整行入口。光标经过不展开 Markdown；普通外链也始终为带 mark 的文字。Ctrl+K 显式编辑 URL。
- `editor-blocks.ts`：每个 todo/bullet 都是独立 list_item；父项整体拖动，嵌套项独立拖动；禁止形成父子循环。按下手柄后固定其位置，避免快速拖动时 hover 抢先切换行。
- `editor-convert.ts` / `editor-input-rules.ts`：转换当前项不改变其兄弟；Markdown 输入和菜单转换保持同样的嵌套规则；代码转换保留页面/附件原子节点的可读内容。
- `main.ts`：Ctrl+E 切换源码前捕获输入；页内斜杠菜单、页面入口及搜索。`/link` 插入页面块，`/mention` 插入行内提及。

## 实测与边界

独立 Chrome E2E 覆盖：单 `/` 补全及焦点、Markdown 标题和列表输入、Enter、Tab/Shift+Tab、逐项 todo、快速父项拖动与子树/撤销、独立子项拖动/保存/刷新、链接不展开、嵌套项复制删除、单项类型转换。截图在 `test-results/slash-menu.png`、`test-results/page-links.png`，已查看。测试使用临时知识库，不连接用户浏览器。

表格和未知扩展目前安全展示并保留源码，修改需 Ctrl+E。Tab 支持列表项和普通文本父子块；所有块类型的通用缩进、多块框选、跨页拖动、完整数据库块、系统级中文 IME、触控和大文档性能尚未全面验收。没有完成云同步或 MyBase Query。