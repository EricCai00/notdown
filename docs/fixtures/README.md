# Markdown 测试文档入口

2026-09-26 新增 [Pandoc 引文测试](pandoc-citations.md)：包含文档内 YAML 文献数据、组合引用、复杂定位、作者式引用和脚注内引用。在 Markdown Lab 选择 **Pandoc Markdown** 可直接预览作者年份与参考文献列表。

2026-09-24 新增 [R Markdown 示例](rmarkdown.Rmd)：包含 YAML 参数、顺序代码块、行内 R、表格、图形、`eval=FALSE` 和中文结果。需选择 R Markdown 方言后手动运行；配置见 [R Markdown](../features/R-MARKDOWN.md)。它不属于下方 2026-09-23 的历史 HTML 审计快照。

## 每个方言一份：官方语法测试

针对“对照官方文档，检查 Notdown 对各方言语法的支持”，优先使用 [dialect-audit](dialect-audit/README.md)。已经生成以下 **11 份 Markdown 测试文档**，不包含自定义 Notdown 方言：

| 方言 | Markdown 文档 | 独立用例数 |
| --- | --- | ---: |
| CommonMark | [commonmark.md](dialect-audit/commonmark.md) | 686 |
| GFM（含单独标记的 GitHub Docs 用例） | [gfm.md](dialect-audit/gfm.md) | 750 |
| 原始 Markdown | [markdown_strict.md](dialect-audit/markdown_strict.md) | 34 |
| PHP Markdown Extra | [markdown_phpextra.md](dialect-audit/markdown_phpextra.md) | 62 |
| MultiMarkdown | [markdown_mmd.md](dialect-audit/markdown_mmd.md) | 103 |
| Pandoc Markdown | [markdown.md](dialect-audit/markdown.md) | 121 |
| Pandoc CommonMark X | [commonmark_x.md](dialect-audit/commonmark_x.md) | 77 |
| Pandoc 旧 GitHub Markdown | [markdown_github.md](dialect-audit/markdown_github.md) | 121 |
| Typora | [typora.md](dialect-audit/typora.md) | 70 |
| Obsidian | [obsidian.md](dialect-audit/obsidian.md) | 103 |
| Notion Enhanced Markdown | [notion-markdown.md](dialect-audit/notion-markdown.md) | 52 |

合计 2,179 个独立输入。各例的官方来源、输入范围、配置和规范预期在 [cases.json](dialect-audit/cases.json) 中；这些例子不会因为 Notdown 尚未识别就被省略。用例数不等于已支持数，也不代表穷尽所有语法组合。

## 与原有样本的区别

| 样本 | 依据和用途 | 更适合做什么 | 局限 |
| --- | --- | --- | --- |
| `dialect-audit/*.md` | 官方文档、规范例子和方言边界 | 检查是否漏掉语法、逐例比较解析与输出；本次需求的主要材料 | 边界用例之间可能互相影响，不适合只看整篇渲染就判定兼容性 |
| [typora-comparison.md](typora-comparison.md)、[obsidian-comparison.md](obsidian-comparison.md) | 先前按用户清单整理的人工对照样本，附操作说明、记录栏及资源 | 在原应用与 Notdown 中打开副本，直观看显示、链接和编辑保存 | 覆盖范围比本次官方语料窄；Obsidian 主要围绕原清单中的八项扩展 |
| [manual-test-pages.ts](manual-test-pages.ts) 生成的 Tests 验收页 | 当前应用的方言配置、对象目录和扩展开关 | 测试类 Notion 界面的编辑、拖动、撤销、视图切换和保存重开 | 默认方言页会参考当前解析结果选择可识别对象，不能独立证明上游语法完整性 |

**选择建议：以新官方语料作为语法覆盖的主测试集，保留旧样本做交互验收。** 旧样本中的操作说明和资源准备仍有用，不需要删除或用新文档覆盖。Tests 页的具体组成见[手工验收说明](../verification/MANUAL-ACCEPTANCE-PAGES.md)。

## 如何打开测试

1. 使用副本；原件包含用于测试的 Tab、尾随空格和特定换行，自动格式化可能改变测试输入。
2. 在 Notdown 临时知识库中，将正文粘贴到源码视图，选择与文件名对应的方言，先用默认扩展配置。不要把所有文件都按 Notion 或 Notdown 方言解释。
3. 普通语法可先浏览整篇。精确检查时，按 `CASE` 编号单独复制该例输入到临时页面；需要保持精确边界时以 `cases.json` 的 `start/end` 为准。分隔注释和文档说明不属于用例输入。
4. **未闭合围栏、未闭合 HTML/注释、文首元数据和同名引用必须单独测试。** 一份普通 Markdown 文件无法为这些用例提供彼此隔离的解析环境。后面整段被显示成代码不一定是后续语法失败。
5. 需开启扩展的用例按清单中的 `extensions` 单独设置；Typora 还需记录原应用偏好。图片、引入文件及笔记目标使用配套资源，资源定位失败单独记录。
6. 记录“内容与层级是否正确”和“编辑保存是否正确”。Notdown 的类 Notion 外观与原应用字体、间距不同，应与语法问题区分。

本目录提供文件和生成器，不会自动向用户知识库安装页面。`rendered/` 是先前的 HTML 对照产物，不是另一套 Markdown 测试源。
