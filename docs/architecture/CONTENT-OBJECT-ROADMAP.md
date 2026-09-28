# Notdown 对象统一与实现 Roadmap

2026-09-27 修订：HTML embed 与 Web embed 合并为 `block.web_embed`，同时承载内嵌 HTML、URL 与 Typora iframe 编码。当前目录 79 项（41 block、2 metadata、32 inline、4 character）；以下历史数量以本次修订为准。

2026-09-23 修订：Raw Source 不再是独立对象。`{=html}` 合并到 HTML block / Inline HTML，其他格式和 raw TeX 归入 Unsupported；全部保留原编码和可恢复源码。当前目录共 78 项（41 block、2 metadata、31 inline、4 character），下文旧数量与归类以此为准。

2026-09-22。原 80 项对象清单加上用户要求的 Inline raw source，共 81 项：43 个 block、2 个 metadata、32 个 inline、4 个 character。对象身份独立于 Markdown 写法和 ProseMirror 节点；单一 ProseMirror 文档与原有 codec 继续工作，Markdown 文件仍是正文真相。

## 当前交付

- 全表语义注册、统一菜单、对象／方言／扩展双向链接；三种列表项各用独立底层节点，Heading 共享节点。仅保留有归属的子结构栏，字符类为文本能力。
- Callout 和 TOC 合并并保留编码来源；管道、Notion、MMD、网格、简单、多行表格共用模型，提供行列和跨度编辑。
- Tabs、手工书签／链接预览、Breadcrumb、HTML embed、图片题注、Example list、Native span、Small caps、Raw TeX；定义列表项操作、cover、元数据字段及行内属性编辑。
- AI block / Meeting notes 使用 Settings 配置的 OpenAI-compatible 服务。Button 提供本地动作；提醒在应用打开时运行；Synced block 支持本地刷新与 CAS 发布，本地编辑暂停自动刷新。
- 103 个 Markdown 扩展有本地执行路径；12 个 Outside Markdown scope 项排最后且不可启用。notdown_* 规范为 notion_*，旧键兼容，新键优先，不批量迁移页面。
- MMD / YAML 共用产品身份但编码不同；Mention agent、Inline media、Database reference 对象和 Existing content 已移除，Inline raw source 保留。旧数据库和未知输入仍保留原文。

## 能力与边界

status 表示逐项描述的本地契约；stage 保留 roadmap 实施分组，不表示仍待实施。direct = 直接编辑，source = 源码编辑，reference = 引用载荷，text = 文本规则，preserved = 原文回退。实际可用性取决于方言与扩展开关，不能由可解析推断所有属性都有表单。

没有第二份持久化 AST，Page / CAS / MyBase 契约不变。新增模型调用及本地 citeproc API，未新增远端同步。真实模型由用户配置，测试使用模拟端点。Raw TeX 不在浏览器执行，书签元信息手工填写，citeproc 需本机 Pandoc。详细格式及边界见 [本地对象与服务](../reference/LOCAL-OBJECTS.md)。

## 逐项清单

| ID | 名称与别名 | 现有载体 / 编辑能力 | 状态 / 阶段 | 边界 |
| --- | --- | --- | --- | --- |
| block.paragraph | Paragraph; text; empty block | paragraph (direct) | implemented / P0 | Empty paragraphs are content; spacing is not. Children use the nesting adapter. |
| block.heading | Heading; header; heading 1; heading 2; heading 3; heading 4; heading 5; heading 6 | heading (direct) | implemented / P0 |  |
| block.toggle_heading | Toggle heading; collapsible heading | heading.toggle (direct; notion_nesting) | implemented / P2 | Insert a toggle heading in the Notion preset; edit the shared heading and children, persist folding, move the subtree and undo. |
| block.divider | Divider; thematic break; horizontal_rule | horizontal_rule (direct) | implemented / P0 |  |
| block.quote | Quote; block quote; blockquote | blockquote (direct) | implemented / P0 |  |
| block.callout | Callout; alert; alerts; alerts and callouts; admonition; note; warning | callout.alert (direct; alerts); callout.notion (direct; notion_callouts) | implemented / P1 | One node; kind, title, icon, color, folding and source encoding are retained. |
| block.line_block | Line block; line group; line blocks | line_block (direct; line_blocks) | implemented / P0 |  |
| block.table | Table; simple table; MultiMarkdown table | table.pipe (direct; pipe_tables); table.notion (direct; notion_tables); table.mmd (direct; mmd_tables); table.grid (direct; grid_tables); table.simple (direct; simple_tables); table.multiline (direct; multiline_tables) | implemented / P2 | One model for pipe, Notion, MMD, grid, simple and multiline tables. Edit cells/captions, add/delete rows/columns, merge/split cells. Span commands require an enabled encoding that can retain geometry. |
| block.code_block | Code block; code; verbatim block | code_block (direct) | implemented / P0 |  |
| block.diagram | Diagram; Mermaid; sequence; flowchart | syntax.diagram (source; diagrams) | implemented / P2 | Mermaid, sequence and flow diagrams have local previews and a source editor. Rendering errors leave editable source intact. |
| block.math_block | Math block; block equation; equation | equation (direct; tex_math_dollars); equation (direct; tex_math_double_backslash) | implemented / P0 |  |
| block.html_block | HTML block; raw HTML | html_block (source; raw_html); syntax.raw.html (source; raw_attribute); syntax.html-markdown (source; markdown_attribute) | implemented / P2 | Sanitized HTML preview and a source editor; HTML embed remains a separate document object. |
| block.raw_tex | Raw TeX; raw latex | syntax.raw.tex (source; raw_attribute); syntax.raw.tex (source; raw_tex) | implemented / P3 | Bare TeX environments and commands, explicit raw TeX fences, source editing and Markdown round trips. TeX is not executed by the browser. |
| block.native_div | Native div; Div container; Div containers; fenced div; fenced_div | fenced_div (direct; fenced_divs); fenced_div (direct; native_divs) | implemented / P3 | Fenced and native HTML Div share editable children and a properties form; original encoding and unknown attributes are retained. |
| block.image_block | Image block; image; figure; image and caption | image_block (direct); paragraph.image (direct); syntax.figure (source; implicit_figures) | implemented / P2 | Editable image URL, alternative text, title and separate caption. |
| block.video | Video; media video | media_block.video (reference; notion_media) | implemented / P2 | Local playback and editable attachment URL/caption; undo and Markdown persistence. |
| block.audio | Audio; media audio | media_block.audio (reference; notion_media) | implemented / P2 | Local playback and editable attachment URL/caption; undo and Markdown persistence. |
| block.pdf | PDF; PDF file | media_block.pdf (reference; notion_media) | implemented / P2 | Editable PDF attachment URL/caption, an embedded browser PDF viewer for local files and an Open PDF fallback link. |
| block.file | File; attachment | media_block.file (reference; notion_media) | implemented / P2 | Editable attachment URL and caption with a download link; binary contents stay in the attachment. |
| block.file_transclusion | File transclusion; file inclusion; embedded file; inline file transclusion | syntax.transclusion (source; transclusion); syntax_inline.transclusion (source; transclusion) | implemented / P2 | Editable block/inline inclusion references and recursive local previews, with file-change refresh and cycle/path/size checks. Included source remains a separate file. |
| block.web_embed | Embed contents; web embed; HTML embed; HTML document embed; iframe | web_embed / html_embed (direct); syntax.embed (source) | implemented / P2 | One PM node retaining URL, saved HTML and Typora iframe encodings. HTML scripts are disabled; remote previews depend on the destination's embedding policy. |
| block.link_preview | Link preview | link_preview (direct) | implemented / P3 | Editable URL, title, description and image metadata. Local card content is preserved with the page. |
| block.web_bookmark | Web bookmark; bookmark | web_bookmark (direct) | implemented / P3 | Editable URL, title, description and image metadata. Local card content is preserved with the page. |
| block.bullet_list_item | Bullet list item; unordered list item; bulleted list | bullet_list_item (direct) | implemented / P0 |  |
| block.numbered_list_item | Numbered list item; ordered list item; numbered list | numbered_list_item (direct) | implemented / P0 |  |
| block.task_list_item | Task list item; to-do list item; to-do list; todo; checkbox | task_list_item (direct; task_lists) | implemented / P0 | Task state and ordered/bullet markers are independent; dialect restrictions still apply. |
| block.toggle | Toggle; collapsed section; toggle list item; toggle list | toggle_block (direct; notion_toggles) | implemented / P0 |  |
| block.definition_list_item | Definition list item; definition list; definition lists | definition_list (direct; definition_lists) | implemented / P2 | Edit terms and bodies; add, remove and move term/definition groups independently with undo. |
| block.example_list_item | Example list item; example list | example_list_item (direct; example_lists) | implemented / P3 | Native editable structure with source-preserving parsing and serialization. |
| block.table_of_contents | Table of contents; TOC; table of contents directive | table_of_contents.notion (direct; notion_toc); table_of_contents.directive (direct; toc_directives) | implemented / P1 | One generated directory with source-specific encoding and heading ranges. |
| block.block_comment | Block comment; hidden comment; hidden comments | syntax.comment (source; comments) | implemented / P2 | Editable Markdown source comments, retained on disk and omitted from rendered output. |
| block.link_to_page | Link to page; page reference | child_page (reference; notion_pages) | implemented / P2 | Notdown-only page-link tag; can target a direct child without becoming a Child page block. Does not change ownership. |
| block.child_page | Child page; page | child_page (reference; notion_pages) | implemented / P2 | Official page tag. Creation also creates a page resource; parsing existing source never moves resources. Tag identity does not derive from parent metadata. |
| block.breadcrumb | Breadcrumb | breadcrumb (direct) | implemented / P3 | Editable ordered page references with titles resolved from the local page list. |
| block.columns | Columns; column list; two columns | columns (direct; notion_columns) | implemented / P0 |  |
| block.tabs | Tabs; tab group | tabs (direct) | implemented / P3 | Editable tab titles and bodies, active tab selection, adding, removing and reordering tabs; all changes are undoable. |
| block.synced_block | Synced block; synced block snapshot | synced_block (direct; notion_synced) | implemented / P4 | Local source block ID and snapshot, explicit refresh/publish, optional live refresh that pauses on local edits. Publishing uses the captured source revision and preserves CAS conflicts. No cross-device sync. |
| block.button | Button | button (direct) | implemented / P4 | Direct execution, inline name/icon/style settings and ordered actions: insert Markdown blocks at four positions, show confirmation, open a page/URL. Atomic local changes and one undo per run; legacy actions preserved. Database/cloud actions not supported. |
| block.meeting_notes | Meeting notes; transcription | meeting_notes (direct) | implemented / P4 | Editable meeting notes and audio path; Transcribe uses the configured OpenAI-compatible service and stores the editable transcript. |
| block.ai_block | AI block | ai_block (direct) | implemented / P4 | Editable prompt and result; Generate calls the configured OpenAI-compatible service. Delayed results never replace concurrent edits. |
| block.unsupported | Unsupported; unknown; unknown block; preserved source; opaque block | opaque_block (preserved); opaque_block.database (preserved; notion_databases); unknown_block (reference) | implemented / P0 | Unknown source can be edited through properties; reference-only placeholders have separate URL/description fields. Unchanged raw content is retained. |
| metadata.yaml_front_matter | YAML front matter; icon; cover; page property; page properties; MultiMarkdown title block; MMD metadata | page.yaml (direct); syntax.metadata.yaml (source; yaml_metadata_block + metadata_values); opaque_block.metadata.yaml (preserved; yaml_metadata_block); syntax.metadata.mmd (source; mmd_title_block + metadata_values); opaque_block.metadata.mmd (preserved; mmd_title_block) | implemented / P2 | Page properties include a cover field. Body YAML/MMD have field and source editors and never overwrite page YAML. MMD remains restricted plain-text metadata, not full YAML. |
| metadata.pandoc_title_block | Pandoc title block | syntax.metadata.pandoc (source; pandoc_title_block + metadata_values); opaque_block.metadata.pandoc (preserved; pandoc_title_block) | implemented / P2 | Title, author and date fields, continuation lines and source editing retain the Pandoc title-block encoding separately from page YAML. |
| inline.code_span | Code span; verbatim; inline code | mark.code (direct) | implemented / P0 |  |
| inline.emphasis | Emphasis; italic; em | mark.em (direct) | implemented / P0 |  |
| inline.strong_emphasis | Strong emphasis; bold; strong | mark.strong (direct) | implemented / P0 |  |
| inline.strikethrough | Strikethrough; strikeout; strike | mark.strike (direct; strikeout) | implemented / P0 |  |
| inline.link | Link | mark.link (direct) | implemented / P0 |  |
| inline.image | Image; inline image | image (direct) | implemented / P2 | Inline images have editable URL, alternative text and title through double-click properties. |
| inline.autolink | Autolink; automatic link | mark.link (text) | implemented / P0 | Shares the link mark; the original spelling is source provenance, not a separate node. |
| inline.inline_html | Inline HTML; html_inline | html_inline (source; raw_html) | implemented / P2 | Double-click to edit one HTML fragment as source; preview stays sanitized. |
| inline.internal_link | Internal link; page link; page mention; location link; wikilink | page_link (reference; notion_pages or wikilinks_title_after_pipe); mark.link (direct) | implemented / P2 | Unified page and location references; headings, existing Obsidian block/list-item IDs and anchors. Original syntax and explicit display labels are retained; references do not establish ownership. |
| inline.emoji | Emoji | text (text); text (text; emoji) | implemented / P2 | Unicode text and enabled shortcode expansion; follows normal text insertion, selection, movement and undo. |
| inline.inline_math | Inline math; inline equation | inline_math (direct; tex_math_dollars) | implemented / P0 |  |
| inline.subscript | Subscript | mark.subscript (direct; subscript) | implemented / P0 |  |
| inline.superscript | Superscript | mark.superscript (direct; superscript) | implemented / P0 |  |
| inline.highlight | Highlight | mark.highlight (direct; highlight); mark.critic.highlight (direct; critic_markup) | implemented / P0 |  |
| inline.inline_comment | Inline comment; CriticMarkup comment | syntax_inline.comment (source; comments); mark.critic.comment (direct; critic_markup) | implemented / P2 | Comments remain distinct from visible text; inline source can be edited through properties and CriticMarkup text stays editable. |
| inline.footnote | Footnote; footnotes; footnote reference | footnote_reference (reference; footnotes); inline_note (direct; inline_notes) | implemented / P2 | Editable references, definition bodies and inline notes; missing definitions are indicated. Reference properties change the identifier. |
| inline.abbreviation | Abbreviation; acronym | mark.abbreviation (direct; abbreviations); syntax_inline.abbreviation (source; mmd_abbreviations) | implemented / P2 | Editable MMD abbreviation source and PHP abbreviation text/expansion. Double-click properties update the document's abbreviation definition. |
| inline.citation | Citation | citation (reference; notion_mentions); syntax_inline.citation (source; mmd_citations); syntax_inline.citation (source; citations) | implemented / P2 | Editable citation source, MMD bibliography lookup and Pandoc CSL citeproc preview with local bibliography/style files. CSL processing requires the installed Pandoc executable. |
| inline.deletion | Deletion; CriticMarkup deletion | mark.critic.deletion (direct; critic_markup) | implemented / P0 |  |
| inline.addition | Addition; CriticMarkup addition | mark.critic.addition (direct; critic_markup) | implemented / P0 |  |
| inline.substitution | Substitution; CriticMarkup substitution | mark.critic.substitution (direct; critic_markup) | implemented / P2 | Replacement text is edited inline; double-click revision properties edits the retained original text. Both values persist as CriticMarkup. |
| inline.glossary | Glossary | syntax_inline.glossary (source; glossary) | implemented / P2 | Inline glossary source and definitions are editable; references resolve against document definitions. |
| inline.metadata_variable | Metadata variable; variable | syntax_inline.variable (source; metadata_variables) | implemented / P2 | Editable variable name and live lookup in body metadata; it does not overwrite page YAML. |
| inline.underline | Underline | mark.underline (direct; notion_underline) | implemented / P0 |  |
| inline.small_caps | Small caps | mark.small_caps (direct; bracketed_spans); mark.small_caps (direct; native_spans); mark.small_caps (direct; attributes) | implemented / P3 | Native editable structure with source-preserving parsing and serialization. |
| inline.native_span | Native span | mark.native_span (direct; bracketed_spans); mark.native_span (direct; native_spans); mark.native_span (direct; attributes) | implemented / P3 | Native editable structure with source-preserving parsing and serialization. |
| inline.mention_person | Mention person; mention user | mention.user (reference; notion_mentions) | implemented / P4 | Editable person reference URL and display label. This local object does not authenticate a member or connect an external directory. |
| inline.mention_page_or_data_source | Mention data source; mention database | mention.database (reference; notion_mentions); mention.data-source (reference; notion_mentions) | implemented / P2 | Database/data-source references remain distinct; page mentions belong to inline.internal_link. The historical object ID is retained for catalog compatibility. |
| inline.date_or_reminder | Date or reminder; date mention | mention.date (reference; notion_mentions) | implemented / P4 | Editable date range and explicit reminder timestamp. Local reminders run while the app is open and catch up on reopening; desktop notifications require browser permission. |
| inline.text_color | Text color; color | mark.color (direct; notion_colors) | implemented / P0 |  |
| inline.background_color | Background color; background | mark.color.background (direct; notion_colors) | implemented / P0 |  |
| character.line_break | Line break; hard break; hard_break | hard_break (direct) | implemented / P0 |  |
| character.html_entity | HTML entity; entity | text (text) | implemented / P0 |  |
| character.backslash_escape | Backslash escape; escape | text (text) | implemented / P0 |  |
| character.smart_typography | Smart typography; smart punctuation | text (text; smart) | implemented / P2 | Dialect-controlled smart punctuation, legacy dash rules and ordinary text editing; a text-processing capability, not a separate node. |

## 验证与维护

注册表来源：src/document/content-objects.ts。测试覆盖对象数量与分类、上下文识别、真实示例、Callout 原编码和撤销、TOC 层级与导出、扩展开关、CRLF、未知内容及代码围栏边界。浏览器验证全表与别名、折叠持久化、正文输入收取、目录实时更新、统一菜单及临时知识库保存。完整验收运行 npm test、npm run build、npm run test:e2e。

更新注册表后运行 node --import tsx docs/fixtures/content-object-roadmap.ts 重新生成本文件。旧 BLOCK-MODEL-REVIEW / CONTENT-CAPABILITIES 保留为历史讨论与方言快照；对象边界以本清单为准。
