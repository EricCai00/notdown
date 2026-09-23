# 元数据与表外格式的依据

2026-09-21。对象身份与编码形式分开；官方语法依据不等于 Notdown 已接入相应服务。

## YAML front matter 与 MultiMarkdown metadata

MMD metadata **不是完整 YAML**。官方称可选分隔符用于改善 YAML 兼容性，而不是声明使用完整 YAML 数据模型。按内容语义，现将它归入 `metadata.yaml_front_matter`，不再单列 MultiMarkdown title block 对象；`mmd_title_block` 配置键仍保留。

MMD 编码遵循以下规则：

- 只能出现在正文文档最开头，前面不能有空行；首行可选 `---`，末行可选 `---` 或 `...`，空行结束元数据。
- 键必须顶格，以 ASCII 字母或数字开头，其余仅 ASCII 字母、数字、空格、连字符、下划线，以冒号结束。
- 处理时键忽略大小写并去除空格；`Base Header Level` 与 `baseheaderlevel` 是同一键。
- 值是纯文本字符串，可以多行。带冒号的续行必须缩进；空值也允许。数字、布尔量、列表写法和 Markdown 标记不自动转成 YAML 类型或富文本。
- MMD 预设在启用 `mmd_title_block` 时优先按 MMD 处理其分隔符；其他预设显式开启 YAML 时仍使用 YAML 解析。关闭扩展保留源码。

编码来源保存在编辑节点 `metadataForm`。编辑保持来源；文件原文及 CRLF 保留规则不变。Notdown 文件外层页面 YAML 和正文中的 metadata 是不同的存储范围，正文中的 Title/Icon 等不会自动覆盖页面属性。页面 YAML 继续使用原来的完整 YAML 处理，不施加 MMD 限制。

依据：[MultiMarkdown metadata](https://fletcher.github.io/MultiMarkdown-6/syntax/metadata.html)、[Pandoc YAML metadata](https://pandoc.org/MANUAL.html#extension-yaml_metadata_block)。

## Database reference

当前未实现数据库，所以已移除 `block.database_reference` 注册项及 `database` 专用节点。已有 `<database>` 标签保留为 Unsupported 原文，不批量改写文件。`notdown_databases` 暂留为旧配置兼容键，目录标明 source preservation；它不启用数据库对象或执行器。行内数据库提及属于既有 Mention page or data source，未在本次删除范围内。

## 2026-09-22 清理结果

Existing content 板块已移除。正式清单为 81 项；误拼别名 date ot reminder 已删除。

| 条目 | 当前归属与实际边界 | 依据 |
| --- | --- | --- |
| Inline file transclusion | 支持行内位置，但不是另一种引入语义；现并入 File transclusion，保留块级和行内两个载体。上游在解析 Markdown 前直接查找并替换源字符串中的标记，没有要求行首或独占一行。Notdown 的本地文本预览仍有许可路径、循环和越界限制，不宣称完整上游预处理语义。 | [MMD File Transclusion](https://fletcher.github.io/MultiMarkdown-6/syntax/transclusion.html)、[官方实现的标记查找](https://github.com/fletcher/MultiMarkdown-6/blob/master/src/transclude.c#L122-L139) |
| Inline raw source | 纳入 Content objects：inline.raw_source。Pandoc 行内代码跨度加 {=format} 表示目标格式原始内容；支持源码保留与源码编辑，HTML 使用过滤预览，其他格式不执行外部 writer 或 TeX。 | [Pandoc raw_attribute](https://pandoc.org/MANUAL.html#extension-raw_attribute) |
| Inline media | 已移除对象、节点及本地链接转播放器规则。普通音视频 Markdown 链接继续保留标签与路径；播放器使用 Audio / Video 的现有块级媒体标签。没有依据将原本“整段只有一个链接”的本地约定称为官方行内类型。 | [Notion Media blocks](https://developers.notion.com/guides/data-apis/enhanced-markdown#media-blocks) |
| Mention agent | 按用户要求移除产品对象和提及解析；已有标签按字面文本或原始 HTML 保留，未修改内容保留原文。编辑文本后允许转义角括号，重新打开保留标签及未知属性，不再产生 Agent 提及对象。 | 用户决定；不提供 Agent 服务 |

上述清理没有批量改写知识库。旧的目录链接回到 Content objects；inline.file_transclusion 链接转到 File transclusion。
