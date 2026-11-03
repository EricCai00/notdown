<a id="原生-markdown-编辑核心"></a>

# Native Markdown editing engine

**English** · [简体中文](MARKDOWN-ENGINE.zh-CN.md)

2026-09-15, the first stage has been connected to the main application.

<a id="选择原生实时编辑借鉴-pandoc-的分层"></a>

## Decision: native live editing informed by Pandoc's layers

Retain the source code editing capabilities of CodeMirror and the block interaction of existing ProseMirror, implement dialect/extended registry, unified document session, and codec that can retain the original text. Pandoc is retained as an independent compatibility control tool for Lab, and can be used for import, export, and difference testing in the future.

[Pandoc's reader → AST → writer ](https://pandoc.org/MANUAL.html#description) layering is worth adopting; its semantics AST itself does not bear the responsibility of cursor, input method, drag history or original text typesetting preservation. Here we use our own ProseMirror schema to represent editing documents and do not pass it off as Pandoc JSON AST. The file truth continues to be Markdown , AST is only in memory.

```text
Markdown 文件 + YAML syntax
          ↕ createVault / baseRevision / 冲突分支
DocumentSession：源码草稿 + 配置 + 语义文档 + 共同撤销
          ↙                               ↘
CodeMirror                             ProseMirror
源码 / 行号 / 通用高亮                 页面 / 块 / 拖动 / Slash
          ↘ 原生 reader         writer ↙
       保留 source slice、位置、指纹的文档节点
```

<a id="当前可用范围"></a>

## Currently available capabilities

| native default | Default capabilities | Boundaries |
| --- | --- | --- |
| `notion-markdown` | Existing Notion codec, tasks, strikethrough, formulas and Notdown block extensions | Notion has its own newline/tab rules; database and sync blocks only retain content and references |
| `commonmark` | markdown-it CommonMark basic rules, including cleaned HTML preview | Does not claim to pass complete CommonMark conformance suite; any HTML elements need to be edited in the source code |
| `gfm` | Basic rules plus tables, strikethroughs, tasks, naked links and footnotes | The core syntax implementation does not claim to be completely consistent with GitHub/Pandoc item by item; the default value of the footnote refers to Pandoc 3.11 |

`markdown`, `commonmark_x`, `markdown_strict`, `markdown_phpextra`, `markdown_mmd`, and `markdown_github` have also been connected to native reader/writer, and all selectors are available. Please see [ NATIVE-DIALECTS.md ](../reference/NATIVE-DIALECTS.md) for differences between each preset, new rules and some compatibility boundaries. Complete Pandoc reader and extensions can still be used in Lab; the Lab extension list cannot be regarded as a native editor implemented list.

Added Typora and Obsidian presets. For product presets and PHP/MMD’s new 27 switches and editing modes, see [ PRODUCT-SYNTAX.md ](../reference/PRODUCT-SYNTAX.md). The following is the original rule grouping.

The registry currently has **70 built-in extension**:

- Markdown rules: `raw_html`, `definition_lists`, `footnotes`, `line_blocks`, `fenced_divs`, `pipe_tables`, `strikeout`, `task_lists`, `autolink_bare_uris`, `hard_line_breaks`, `tex_math_dollars`, `wikilinks_title_after_pipe`.
- Block capabilities: `notdown_columns`, `notdown_callouts`, `notdown_toggles`, `notdown_tables`, `notdown_pages`, `notdown_mentions`, `notdown_media`, `notdown_databases`, `notdown_synced`, `notdown_toc`, `notdown_nesting`, `notdown_colors`.
- Dialect basic rules (new 19 items): `blank_before_header`, `blank_before_blockquote`, `space_in_atx_header`, `lists_without_preceding_blankline`, `startnum`, `backtick_code_blocks`, `fenced_code_blocks`, `escaped_line_breaks`, `all_symbols_escapable`, `intraword_underscores`, `ignore_line_breaks`, `smart`, `subscript`, `superscript`, `abbreviations`, `emoji`, `yaml_metadata_block`, `pandoc_title_block`, `mmd_title_block` .

The line wrapping rules of Notion are fixed, and the syntax switches of `hard_line_breaks`, naked link, pipeline table and wiki are not provided for the time being; the five items of HTML, definition list, footnote, line block and fenced Div and the new 19 item this time have not yet been adapted to Notion codec. The corresponding configuration values ​​are retained but not executed. The other ten presets provide switches by the reader capability matrix and can also enable Notdown tag containers. The syntax of Notion codec is used inside the tag container, and the selected Markdown reader is used for external paragraphs. `notdown_colors` is an old alias for `notion_colors`. Color is now managed by `notion_colors`, and underline uses `notion_underline` independently; turning off color no longer turns off underlining. The original text rollback of unknown blocks is a core reserved capability.

The switches in the registry have actual parser/writer support, but Pandoc is not fully replicated. MMD citations, attributes, automatic identification and product-specific blocks have been integrated, see [Product capability and 62 matrix](../reference/PRODUCT-SYNTAX.md); citeproc, grid tables and complete attribute combinations have not yet been implemented, and the panel lists these names and configuration status alone. Unknown and pending configurations are retained but not executed. For the syntax, Pandoc capability matrix and limitations of the new blocks, see [BLOCKS.md](../reference/BLOCKS.md);such as local `commonmark+line_blocks` available, but Pandoc of reader does not accept this switch. Adding extensions must also explicitly parse rules, disable behaviors, serialization, input commands, nested conflicts, and round-trip testing, not just add checkboxes. The installation and lifecycle interfaces for independent third-party packages have not yet been implemented.

<a id="文档会话与原文保留"></a>

## Document sessions and original-source preservation

- The three views only change the layout, retaining the editor instances on both sides. Both directions share the history of `DocumentSession`; source code and structured editing do not each have separate undo stacks.
- Source code input immediately updates the draft, 70 ms anti-shake update page. Temporarily prohibit page editing while waiting for projection to prevent the old tree from overwriting the new source code; project after the input combination is completed, and receive pending input before switching views/saving.
- Page input goes through the ProseMirror transaction; when writing back, the original text of the unmodified node is reused, and only the modified top-level block is rewritten. Immutable node fingerprints are cached with WeakMap. Minimal text differences update CodeMirror, document differences update ProseMirror.
- Ten Markdown presets retain original spacing, reference definitions, CRLF and unknown syntax. Modifications within a compound block may still normalize the entire compound block; full CST (syntax tree with each delimiter and whitespace) has not yet been implemented.
- Configuration changes retain the original bytes of the text and enter the common history; resetting the defaults only clears known switch overlays, and unknown fields are retained. After closing the extension, it will be reinterpreted according to the remaining syntax. Uninterpreted tag containers will be displayed as original text blocks; syntax such as definition lists may become ordinary paragraphs, but the configuration switch itself will not rewrite the source code.
- Synchronous scrolling interpolates the source code position of the top-level block piecewise with the page DOM height, and rebuilds the position table after editing, configuration, size and image loading changes; currently not an exact mapping of each nested sub-block.
- The Limits of History80 A snapshot and source codeUTF-16 The size limit of the estimates is8 MiB；AST、String sharing and browser memory expense are not included in this valuation. The image is retained through changes in the editor's mapping, and the history of the cross-view selection is not fully realized.

<a id="文件与代码"></a>

## Files and code

| Files | Responsibilities |
| --- | --- |
| `src/markdown-engine/config.ts` | Versioned presets, extended defaults, available commands |
| `src/markdown-engine/codec.ts` | Native reader/writer, reuse Notion codec, Markdown tokens and original text information |
| `src/markdown-engine/dialects.ts` | Differences in basic rules, inline plug-ins, metadata identification and code block writing between the two reader families |
| `src/markdown-engine/session.ts` | Co-drafts, configurations and undo history |
| `src/markdown-engine/workspace.ts` | CodeMirror/ProseMirror connection, three views, scrolling and input collection |
| `server/vault.ts` | Atomic version checking of configuration and body, conflict preservation |

Page YAML Contract See [FORMAT.md](../FORMAT.md). No `syntax` The old Markdown page deduces the compatibility switch; user files will not be migrated in batches. Still using existing `createVault`, the second block JSON storage is not added.

<a id="性能与下一阶段"></a>

## Performance and the next stage

The local Node preliminary measurement, 3 preheating, 12 sampling to take the median; the content repeatedly includes titles, paragraphs, links and lists. The parsing of 10 and 058 characters is about 11-13 ms, and the single-block modification and serialization is about 0.6-0.9 ms; the parsing of 120 and 038 characters is about 142-160 ms, and the modification and serialization is about 7-10 ms. Original record `.run/native-benchmark.json`. This is not a browser end-to-end input latency measurement and does not include layout, drawing, disk saving, and the full range of extensions combined.

The current source code parsing is still full parsing on the main thread; 70 ms anti-shake is not equal to incremental parsing. Next stage sequence:

1. Move source code parsing into Worker, use document versions to discard stale results, retain the ability to save drafts synchronously; measure real browser input to draw latency.
2. Added block-level syntax index with original text position and safe reparsing boundary. Reference definitions, footnotes, list indents and unclosed fences may affect distant content and cannot be simply cut by blank lines and then cached.
3. Use the actual output of Pandoc to construct a difference sample and implement reader/extension item by item; retain the default value matrix and capability matrix to clarify the difference between "default enabled" and "actual support".
4. Add the adaptation layer of semantic document ↔ Pandoc JSON. Standard paragraphs, lists, and tables can be mapped; Notion subpages, synchronized references, databases, and unknown blocks require extended representation with types, attributes, and original payloads. Content that cannot be losslessly mapped must be explicitly retained and cannot be silently discarded.
5. Completion of extended-aware source code highlighting, sub-block scrolling position, complete selection history and more detailed original text preservation of compound blocks.

Retaining the original editors on both sides reduces the risk of rewriting cursors, dragging, input methods, and CAS; dialect compatibility is an engineering work of continuous implementation and testing, and cannot be achieved simply by reusing the terminology of Pandoc.
