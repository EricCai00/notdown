<a id="markdown-lab外部渲染器方言与-html-输出"></a>

# Markdown Lab: external renderers, dialects and HTML output

**English** · [简体中文](MARKDOWN-LAB.zh-CN.md)

Markdown Lab is an experimental tool, and the sidebar entrance is closed by default. Turn on **Workspace settings → Experimental features → Markdown Lab**; **Block Explorer** in the same group also needs to be turned on separately. The switch only controls the sidebar entrance, and the original page URL can still be accessed directly.

2026-09-15, independent page entrance `/markdown-lab.html`.

The main application is now connected to the independent [ native editing core ](../architecture/MARKDOWN-ENGINE.md): three views, two-way editing and vault saving do not go through the external program request link of this page. This article only describes Lab.

<a id="当前链路"></a>

## Current pipeline

```text
CodeMirror 源码 + 当前渲染器／方言配置
           ↓ 180ms 防抖
POST /api/markdown/preview
           ↓
libMultiMarkdown / Markdown.pl CLI → HTML 标准输出
或 Pandoc reader → Pandoc JSON AST → 引文处理（citeproc）→ Pandoc HTML writer
或 Notion codec → ProseMirror 文档 → 现有 HTML renderer
           ↓
原始 HTML 文本标签页；清理后页面标签页 + 本地公式渲染
           ↓
右侧只读输出
```

Pandoc AST and ProseMirror documents exist only in preview request memory; the direct renderer returns standard output as HTML. Lab does not call the creation, update or attachment interface of the vault, and does not change the `bodyFormat` of the current note; importing only reads the files selected by the user, and downloading only outputs the editor source code. The window draft uses `sessionStorage` and includes source code, file names, renderers/dialects, extended coverage of each dialect, and scroll switches. It cannot be considered a long-term backup after closing the window.

<a id="pandoc-引文预览"></a>

## Pandoc citation preview

enable `citations` The Pandoc reader will use the document YAML `references` Run citeproc to generate author year and reference lists. Supports parentheses, authorial style, author omission, prefixes/locators/suffixes, citations in footnotes, and `nocite`、`link-citations`、`link-bibliography`、`reference-section-title`、`suppress-bibliography`、`lang` and `notes-after-punctuation`. Top-level headers remain top-level to retain `.reset-citation-positions` Semantics; synchronous scrolling still has source code line numbers.

Currently using the default author year style of Pandoc; Lab does not load the external ones in YAML `bibliography`、`csl` or `citation-abbreviations` file and prompt this restriction in the preview area. Missing literature data and citeproc diagnoses are also displayed in the preview area. Complete YAML and text always remain in Source and download file, close `citations` Then the literal display is restored without rewriting the source file. This item only adjusts the Pandoc Lab preview and does not change the main editor or the official direct parser.

You can directly open the [ citation test document ](../fixtures/pandoc-citations.md) and select **Pandoc Markdown**. Automatic verification covers actual citeproc output, complex positioning, citations in footnotes, reference links, extension closure and source code retention.

<a id="外部程序直出-html"></a>

## Direct HTML output from external programs

2026-09-23 adds `commonmark-js`, `cmark-gfm`, and `php-markdown-extra`, together with the two existing ones below, a total of five official direct entrances. Run [ CommonMark.js ](https://github.com/commonmark/commonmark.js) and [ GitHub cmark-gfm C respectively to implement ](https://github.com/github/cmark-gfm) (bound by Python cmarkgfm) and [ Michelf PHP Markdown Extra ](https://github.com/michelf/php-markdown); the bridge script only sends and receives the original text/HTML and does not replace the parsing rules. CommonMark.js is installed with `npm ci` and 0.31.2 is fixed; PHP/Python and its library are provided by this machine. This machine is cmarkgfm 2025.10.22, PHP Markdown Extra 2.0.0.

The three new items also disable the Lab extension switch and use the native default rules. CommonMark.js preserves raw HTML; cmark-gfm uses the default GFM extensions and UNSAFE output options to preserve the original HTML, and the page preview is still sanitized. The source code is not automatically uploaded to GitHub, and the approximate implementation of Typora/Obsidian/Notion is not listed as official parser.

New tool configuration (need to restart the backend after changing):

| environment variables | Purpose |
| --- | --- |
| `MARKDOWN_PYTHON_PATH` | Python 3 executable file, check local configuration/PATH if not set |
| `CMARKGFM_PATH` | cmarkgfm package directory; available for selected Python `-m pip install --target <目录> cmarkgfm==2025.10.22` Installation |
| `PHP_PATH` | PHP executable file |
| `PHP_MARKDOWN_EXTRA_PATH` | Directory containing `MarkdownInterface.php`, `Markdown.php`, `MarkdownExtra.php`; Composer when installed`vendor/michelf/php-markdown/Michelf` |

You can also create an ignored file `.run/markdown-lab-tools.json`, the keys are `python`, `cmarkgfm`, `php`, `phpMarkdownExtra`, and the value is the trusted local absolute path. Environment variables take priority; this configuration has been written for the audit installation. `.run/gfm-renderer` and `.run/dialect-audit/tools` are reused when the library directory is not configured. These temporary installations will not be distributed with Git and will need to be installed when changing machines. The service will not automatically connect to the Internet to download tools; the browser request cannot specify the program path. If it is missing, the reason for unavailability will be displayed, and it will not fall back to Pandoc.

original `multimarkdown-cli`、`markdown-pl` Two direct entrances and exits, run libMultiMarkdown respectively `multimarkdown` and Gruber's `Markdown.pl`, reads source code from standard input and returns standard output. MultiMarkdown use `--snippet --notransclude --to=html`; Markdown.pl is run by Perl with no additional syntax options. They do not consume Lab's extension switches or block plugins, and the related settings buttons are disabled. Pandoc dialect reader also calls Pandoc CLI, but it passes through the AST link and supports the extended switch of reader, so it is no longer listed separately `pandoc-cli` Straight out of the entrance.`markdown_mmd` YesPandoc ofreader；IndependencelibMultiMarkdown CLI It is still available for output control.

Probes only use trusted installations in the server environment. `PANDOC_PATH`, `MULTIMARKDOWN_PATH`, `MARKDOWN_PL_PATH`, and `PERL_PATH` can specify absolute paths before starting; MultiMarkdown will also search from PATH and Windows `Program Files/libMultiMarkdown *`, and Perl will search from PATH, Git for Windows, and Strawberry Perl. The script of Markdown.pl requires the user to install and set the path. The machine currently finds Pandoc 3.11 , libMultiMarkdown 6.7.0 and Markdown.pl 1.0.1 ; the latter uses Git for Windows for Perl . The service must be restarted after changing the installation or path. The browser request only passes the fixed renderer ID and does not pass the program path or parameters.

The HTML tab displays the program results as plain text; the page tab is displayed after cleaning with DOMPurify, and in-page input is disabled. The direct renderer has no source code location, and bidirectional scrolling is estimated based on document progress. Original HTML, page previews and error reports will not be written back to Markdown or the vault.

<a id="方言和扩展"></a>

## Dialects and extensions

For a complete reference, see [ A complete comparison of Pandoc extensions and Markdown dialects ](../reference/PANDOC-EXTENSIONS.md), including the 89 extensions of the manual, switch matrices for eight dialects, default off and non-Markdown special items, and an explanation of the differences between available switches and the final preview effect.

`src/markdown-lab/model.ts` Register `gfm`、`commonmark`、`commonmark_x`、`markdown`、`markdown_mmd`、`markdown_phpextra`、`markdown_strict`、`markdown_github`，Cover the homePandoc 3.11 All eight of them.Markdown reader，and adapted separately`notion-markdown` and `notdown`; Plus five official direct entrances and exits. The dialect display name is taken directly from the main editor `variant` Registry, internal ID remains unchanged. Old version `markdown_github` The deprecation instructions remain in the extension panel. Backend reads first `--list-input-formats`, only queries the extensions actually installed with reader; the interface disables unavailable items, and the selected text is not automatically switched or rewritten. Old conversation if selected `pandoc-cli`, restore the source code and change the selection `markdown`. The request verification and interface share this registry. If Pandoc adds dialect ID in the future, the registry needs to be supplemented; the test will check for omissions against the complete Markdown reader list of this machine. Lab selection types are independent of the vault `BodyFormat`, to avoid expanding the disk format contract when no writes to codec are available yet.

Native `pandoc --list-extensions=<variant>` provides support items and default values. The interface allows positive and negative coverage; the backend only receives Boolean values ​​and constructs `variant+extension-extension` after verifying the actual supported items. `sourcepos` is used by sync systems and is not used as a user expansion switch. Notion is presented as a complete dialect, and the existing columns, prompts, Tab sub-blocks, etc. maintain the original semantics; it is not claimed that these syntaxes can be switched item by item.

Switching dialects means "previewing the same source code with another set of rules", not conversion. The editor content will be replaced only after loading the example and opening the file, and the replacement will enter the undo history. downloaded `.md` It does not automatically insert dictionary messages, nor does it commitCRLF、BOM The byte level is back and forth; the original entry isCodeMirror After useLF。

<a id="历史书签演示已停用"></a>

## Historical bookmark demo (disabled)

The old version of Lab provided a "bookmark card" demo; now Lab is used to compare renderer/dialects with HTML output, and the independent display plug-in has been disabled. The old plugin ID in an existing session configuration can be read but not executed. The following only records historical carriers, not current syntax examples:

````md
```notdown-bookmark
{
  "title": "Pandoc",
  "url": "https://pandoc.org",
  "description": "文档之间的桥梁"
}
```
````

In dialects that support code fencing, the above content is originally an ordinary code block, and `notdown-bookmark` is just the fencing information string; after deactivating the demonstration, JSON will no longer be interpreted as a card, and there is no need to convert it to Unsupported. Other dialects are parsed according to their own rules. There are currently no Lab block plugins, dynamic scripts, or Lua Filter management available to install or enable. Existing Notdown page bookmarks use their own text formatting and editing paths, and do not rely on this old demo.

<a id="实时更新和同步滚动"></a>

## Live updates and synchronized scrolling

- The old request is immediately invalidated when the input changes; a new request is executed after 180ms is stabilized. Submit the preview after the synthesis input is completed. The page also checks the request sequence number, and the old result will not be accepted even if the network layer fails to cancel.
- GFM / CommonMark / CommonMark X use Pandoc `sourcepos` native line number; Notion reuses node `sourceStart`. The position of the source code line in CodeMirror and the actual position of the rendering block form an anchor point. Linear interpolation between the two points supports two-way synchronization.
- The following is a list of the most commonly used methods of detecting reader `sourcepos`Add the parameter only when it is actually supported. `markdown`、`markdown_mmd`、`markdown_phpextra`、`markdown_strict`、`markdown_github` The interface clearly shows "block-by-block estimate synchronization" through block content and markdown-it top-level position estimation. It is only used for rolling positioning and does not participate in the Markdown semantics analysis.
- New geometric positions are read after image loading, layout changes, and window size changes; invisible, rearranged, and non-monotonic positions in folds and columns are not used as synchronization anchor points. The beginning and end of the document are guaranteed to be reachable, and complex rearrangement structures and long tables within blocks cannot be accurately mapped line by line.
- In case of an error, the last successful preview is retained and the unupdated status is displayed and the entry is retried; during this period, the position synchronization between the new source code and the old page is stopped.

<a id="与-notdown-编辑器融合的困难"></a>

## Difficulties integrating with the Notdown editor

| Location | current difference | Need to be completed before fusion |
| --- | --- | --- |
| Line breaks and block structures | Notion adjacent lines are blocks, Tab are sub-blocks; general Markdown usually treats adjacent lines as paragraph soft wraps | Page-level dialect configuration; prohibit guessing by content or automatically switching formats |
| Save behavior | Edit the existing ProseMirror and write it uniformly.`notion-markdown` | reader/writer is provided per editable dialect, which removes coercion; format conversion becomes an explicit operation |
| Document representation | Pandoc AST contains footnotes, definition lists, citations, etc.; existing PM schema does not cover all nodes | Add semantic nodes and editing interaction, or provide recoverable original text nodes; you cannot silently downgrade and lose content. |
| Source code retained | Pandoc AST prioritizes expression semantics and does not retain all fences, blanks, and reference definition forms; the native source code location is only available in some reader | Continuation of original text slicing, changed subtree recognition and unknown syntax fallback, the full text cannot be rewritten through Pandoc every time it is entered. |
| Plugin deactivation | Editor schema is usually fixed; deleting an existing node type may invalidate the document | Keep the common plug-in/original node, disable only changing the display and adding new entries |
| Revisions and consistency | Pandoc upgrade may change the default extension; multi-window may have different configurations | Persist effective configuration or configuration version; rendering, source code, outline, reference diagram and export use the same configuration |
| File submission | The lab does not have a vault revision; existing notes are saved via CAS | Connect to `createVault`, and submit the text and configuration together with `baseRevision`; keep duplicate copies of conflicts, and collect pending input before switching. |

Complete the source code and preview first, so that "dialects, extensions, and plug-ins" can be truly realized; then select the dialects that require structured editing and gradually expand PM schema and codec. Just because the preview can recognize a certain grammar does not mean that it can be safely edited on the right side and written back in the original dialect.

<a id="运行约束和实现位置"></a>

## Runtime constraints and implementation locations

Backend `server/pandoc.ts` uses child processes without shell, fixed parameters, 8 second timeout, 16 MB output cap, and concurrency cap of four processes; Pandoc reader/writer enables `--sandbox`. Does not accept browser-provided executable files, Lua reader/filter, templates, or arbitrary CLI parameters. Cancel in-flight processes when closing a request.

`server/app.ts` The preview endpoint in the shared existing nativeHost、Origin andJSON Request for Restrictions: Source restrictions are128,000 UTF-16 The code is right.HTML DoingDOMPurify Cleansing; the original of the common dialectHTML The style was also removed.Notion Just keep the existing onesschema renderer Limited-scale production. Mathematics is locally producedKaTeX After cleaning, render and closetrust。

Main modules: `src/markdown-lab/main.ts` (dual columns and request lifecycle), `scroll.ts` (position interpolation), `plugins.ts` (empty compatibility entry to deactivate old demos), `model.ts` (capability contract). `src/document/document-format.ts` provides optional source code location and code block display callbacks, and the default call maintains the original behavior.

Reference: [ Pandoc modular structure ](https://pandoc.org/MANUAL.html#description), [ dialect ](https://pandoc.org/MANUAL.html#markdown-variants), [ extension ](https://pandoc.org/MANUAL.html#extensions), [ CodeMirror ](https://codemirror.net/docs/ref/).

<a id="2026-09-23-官方解析器接入验证"></a>

## 2026-09-23 official parser integration validation

The three new entries are all actually called on this machine. Complete unit test 505 item, 504 passed, 1 skipped; build successful. Added checks to cover their own unique syntax, separation of raw HTML code and clean previews, cancellation of requests, disabling Lab extension coverage, and returning 503 without replacing the parser when the runtime is missing.

The audit comparison page also adds an isolated HTML rendering preview, merges the official Pandoc column, and hides missing output. Unit and standalone Chrome tests check column count, actual header rendering, code source text, script/external request isolation, and narrow screen layout. The Lab and 11 browser tests of the control page all passed under the independent build directory, independent output directory, and temporary vault; the first run of shared dist was interfered by other build rewrites, and the rerun after isolation passed. The log is at `.run/logs/markdown-lab-parsers-*.log`. This time there are no changes to the main editor parsing rules or user content.
