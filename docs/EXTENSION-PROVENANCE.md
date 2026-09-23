# 扩展的方言依据与默认状态

2026-09-22 核对。编辑页 Extensions、Block Explorer 的扩展卡片及方言详情共用 `src/extension-provenance.ts`。此数据只影响标注与排列，不修改方言默认值、开关、Markdown 编码或页面文件。

## 顺序

1. **Specified syntax**：当前方言的规范／官方文档明确描述、未归为基础解析器内置规则的语法。Required 在前，Optional 在后；同级中 GFM Spec 在 GFM Docs 之前。
2. **Built-in syntax**：已核实由基础解析器处理、没有对应扩展开关的语法，只读显示规范链接和内置状态。当前覆盖 CommonMark／GFM／CommonMark X 的九项基础规则，包括反斜杠换行、代码围栏等；HTML 有独立开关，仍在第一组。
3. **Others**：其余可列出的扩展，按 Pandoc extensions、Notdown Notion extensions、Notdown Markdown extensions 三类来源依次分区排列；Pandoc 默认开启状态仅作标签，不再另设优先组。
4. **Outside Markdown scope**：目录中的非 Markdown 参考项，继续单列在最后。

所有条目的来源仅使用上述三类，与方言语法归属独立。Notdown Notion extensions 同时包含官方 NFM 语法适配和有官方产品/API 依据的 Notion 功能适配；后者由 `src/extension-feature-origins.ts` 显式映射，不能凭 `local_*` 前缀归入 Markdown 类。当前九个本地块扩展有 Notion 功能对应，正式 ID 使用 notion_*，旧 local_* 为兼容别名；local_figure 保留通用 Markdown 分类，显示官方链接及 local encoding 提示；其本地标签未被核实为官方 NFM 语法，仍放在 Others。Notdown Markdown extensions 保留其他 Markdown 产品语法扩展。分类表示适配来源，不表示 Notion 发明了图片等通用功能。目录来源过滤键及扩展 ID 保持不变。

空组不显示；搜索和来源过滤后仍按相同规则排列。切换方言重新分组，修改当前勾选状态不改变规范归属和排序。

内置规则使用明确的 CommonMark 核心规则集合，并核对 Pandoc flag 快照和本地基础解析路径，不将所有缺少 flag 的扩展标为内置。[Pandoc 的方言说明](https://pandoc.org/MANUAL.html#markdown-variants)明确指出 CommonMark 系列的扩展是相对基础语法列出的，以 backtick_code_blocks 为例，其默认启用且不能通过扩展开关关闭。这里展示的是扩展名对应的基础语法，不是另一组待启用的插件。Typora 等没有 Pandoc preset 的产品也不会因此被归入内置组。

Required 表示该方言的基线语法，不表示每篇文章必须使用、不表示 Notdown 锁定这个开关，也不等于完整兼容认证。Optional 表示上游可选功能；Typora 的设置项额外标为 Optional setting，悬停可见设置位置。一个本地开关包含多种行为时，用说明限定规范覆盖范围。

## 两套独立依据

- 语法依据来自官方规范／文档，标签链接到来源。GFM 采用 [0.29-gfm Spec](https://github.github.com/gfm/)；Alerts、脚注、Emoji 和标题锚点另据 [GitHub Docs](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax)，数学和图表链接对应专页。
- Typora 的高亮、上下标、行内数学和 Alerts 按 [Markdown Reference](https://support.typora.io/Markdown-Reference/) 标注设置可选；图表依据 [Diagrams 的启用条件](https://support.typora.io/Draw-Diagrams-With-Markdown/#precondition)，智能标点及换行依据各自设置文档。数学开关同时控制显示公式和行内公式，只有行内部分受该设置说明约束。
- 其他方言分别依据 [CommonMark](https://spec.commonmark.org/0.31.2/)、[Original Markdown](https://daringfireball.net/projects/markdown/syntax)、[PHP Extra](https://michelf.ca/projects/php-markdown/extra/)、[MultiMarkdown 6](https://fletcher.github.io/MultiMarkdown-6/syntax/)、[Obsidian](https://help.obsidian.md/syntax)、[Notion Enhanced Markdown](https://developers.notion.com/guides/data-apis/enhanced-markdown) 和 [Pandoc manual](https://pandoc.org/MANUAL.html#markdown-variants)。Legacy GitHub 是已弃用的 Pandoc reader，不借用当前 GFM Spec 身份。
- Pandoc 状态采用现有 [Pandoc 3.11 快照](data/pandoc-3.11-extensions.json)，分别显示默认开启、默认关闭、无扩展开关、无该产品方言。缺少扩展开关可能因为语法已内建，不能解释成默认关闭。Typora／Obsidian／Notion 的本地预设不冒充 Pandoc 默认。
- `No documented syntax mapping` 表示此开关没有在当前映射中找到相应官方依据，不断言上游绝不支持。工作簿来源分类、本地支持状态、当前开关状态继续单独保留。比如 MultiMarkdown 的受限 metadata 不因为支持 `---` 就将完整 YAML 扩展标成它的规范语法。

验证包含全部 115 项在 11 个方言中的不重不漏分组、GFM Spec／Docs、Typora 可选设置、核心语法没有 Pandoc flag、旧名称兼容，以及浏览器切换方言、覆盖开关、来源筛选和往返导航。
