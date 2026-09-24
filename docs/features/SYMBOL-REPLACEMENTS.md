# 符号自动替换

Notdown 的 `symbol_replacements` 编辑器插件默认启用，在页面的扩展设置中可关闭 **Symbol replacements**，对应 YAML `syntax.extensions.symbol_replacements: false`。只有 `syntax.variant: notdown` 生效；其他方言即使显式设为 `true` 也不启用。

这是正文可视编辑器的输入辅助，不是新的 Markdown 语法。输入最后一个字符时替换，保存普通 Unicode；源码视图、加载文件、粘贴及导入不会执行本插件。原文保留、未知字段与 CAS 保存仍沿用既有机制。

| 输入 | 结果 |
| --- | --- |
| `->` | → |
| `<-` | ← |
| `<->` | ↔ |
| `=>` | ⇒ |
| `<=>` | ⇔ |
| `<=` | ≤ |
| `>=` | ≥ |
| `!=` | ≠ |
| `+/-` | ± |
| `...` | … |
| `(c)` | © |
| `(r)` | ® |
| `(tm)` | ™ |

替换后立即按 Backspace，恢复上一次替换前的字符。双向箭头逐字输入经过两次替换：`<-` → `←`，再输入 `>` → `↔`（`<=` → `≤`，再输入 `>` → `⇔`）；立即退格恢复为 `←>` / `≤>`，也可关闭开关后输入完整 ASCII。`←>` / `≤>` 本身也作为双向箭头的输入别名。

插件避开代码块、行内代码、链接格式、反斜杠转义、URL、较长运算符，以及含尚未解析的反引号或美元符号的前文。公式与原始源码节点不参与替换。保留原有粗体等格式，不跨内联原子替换，不抢占 `---` 分隔线。规则区分大小写；智能引号、破折号和 emoji 不在此插件范围内，已有 `smart` / `emoji` 扩展继续独立控制。

## Notion 参考与边界

截至 2026-09-23，查阅的 [Notion 官方快捷键文档](https://www.notion.com/help/keyboard-shortcuts)列出了粗体、斜体、行内代码、删除线、列表、待办、标题、折叠、引用和 emoji 输入快捷方式，但未提供完整的 ASCII → Unicode 符号替换表。因此上表是 Notdown 明确实现的规则，不能视为 Notion 官方完整规则或 Enhanced Markdown 规范。

验证覆盖：`tests/unit/symbol-replacements.test.ts` 与 `tests/e2e/symbol-replacements.spec.ts`。浏览器验证使用隔离的临时知识库和 Chrome。
