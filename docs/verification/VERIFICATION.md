<a id="本轮验收方言误解析与输入规则"></a>

# Acceptance: dialect parsing errors and input rules

**English** · [简体中文](VERIFICATION.zh-CN.md)

2026-09-22。Coverage12 A default grammar with a disabled border.Notion / Notdown ofH5/H6 The official guidelines continue to beH4，Unification of typing and source code analysis; rest of the correction[Checking incorrect parses](../reference/DIALECT-CONFORMANCE.md#checking-incorrect-parses)。

- `npm test`: 410 entry, **pass, 409 pass, 1 entry Windows symbolic link permission condition skipped, 0 fail**. The new matrix covers titles, list tags, image reference switches, Notion tags and sub-grammars, code literals, CRLF original text and adjacent editing; input rules cover all 12 dialects.
- The TypeScript / Vite build passes; the final independent build uses `npm run build -- --outDir test-results/overparsing-recheck-dist`, retaining the existing large chunk prompt.
- The preset list boundaries of Pandoc are also compared with the actual output of the local Pandoc: the spacing rules after ordinary words, malformed brackets, invalid Roman numerals and capital letters are consistent.
- **Browser use cases for 130 are sorted by batch**8: All directly related use cases are approved; the complementary suite 122 is first re-tested by 119 and 3 separately. The plug-in use cases are converted to verify both the identity of the plug-in and full default enablement, to avoid the simultaneous addition of additional plug-ins that invalidate the fixed number of claims. Page history and sidebar conflicts suggest duplication in the latest build, new temporary vault. `dist` Other builds are covered and test processes are interrupted, with the subsequent use of independent ports, builds and result directories. The result is not a complete green run, nor does it represent all use cases of continuous new work areas.
- Browsers are using a stand-alone temporary vault with Chrome; there is no migration or writing of user `vault/`. Storage CAS, conflicting branches or cross-end synchronization capabilities have not been modified in this round.

<a id="此前验收上游方言默认值与可选块插件"></a>

# Previous Acceptance: Upstream Dialect Defaults vs. Optional Block Plugins

2026-09-22. Define the default syntax according to the official specifications of each product, and cancel the implicit injection of local objects and Pandoc extensions into all dialects. Nine types of project blocks of eleven upstream presets are turned off by default and are explicitly activated through page syntax settings; the project's own Notdown presets are independently configured. For sources, dialect-by-dialect differences, and compatibility boundaries, see the [ Dialect Verification Record ](../reference/DIALECT-CONFORMANCE.md).

- `npm test`: 380 entry, **pass, 379 pass, 1 entry Windows symbolic link permission condition skipped, 0 fail**. The new test covers the default shutdown, independent activation, switching and original text retention of eleven upstream dialects × nine types of objects, as well as the consistency of configuration reset, export and link index.
- `npm run build -- --outDir .run/dialect-final-dist`:TypeScript/Vite passed, retaining the existing chunk prompt. To avoid other tasks building overlay artifacts at the same time, browser validation uses a separate temporary copy of the build, a separate port, a temporary repository, and Chrome.
- The final implications **The 77 browser is back in batches**：77 In operation76 Passed; an old oneTypora Comprehensive use cases not explicitly enabledalerts／diagrams，After modifying the sample configuration, the single item is passed.Markdown workspace、Notion、The product grammar and associated buttonsTabs and side-bar interaction. The old default assumption that previously fully run exposed to interference with shared builds has been replicated in independently built related kits; the batch results will not be described as a fully run green.
- Checking and regression are limited to this default capability and expansion boundary, and do not mean that all upstream syntax consistency certifications have been completed. There is no migration or writing to the user vault.

<a id="上一轮块属性移入手柄菜单弹窗"></a>

# Previous round: Block properties moved into controller menu popup

2026-09-22. The property folding panel and text metadata fields of the original ContentObjectView can be opened from the six-dot handle menu Properties.... The pop-up window uses a field draft. Save is submitted once and can be revoked once. Cancel/Escape does not modify the text. Target block changes within the editor disable saving; old pop-ups are destroyed when the entire editor is replaced by an external refresh. The container border/button area is positioned to the container handle, and the inner paragraphs continue to operate independently.

- `npm test`:356 entry, **pass, 355 pass, 1 entry, Windows symbolic link permission condition skips**. Added unknown attributes, original text round-trip, revocation, expired target, tag index verification, synchronization source revision cleaning and YAML/MMD field semantic verification.
- `npm run build` with `npm run test:e2e` The TypeScript/Vite builds through the use of independent build directories, dynamic ports, temporary vault and Chrome by the browser.
- 134 browser use cases passed in batches: the complete run of 104 passed; the sample installer port mismatch caused 1 items to fail, 26 items not to run, there were also browser session/product writing failures for 2 items, and insufficient page switching wait for 1 items. After unifying the test process ports and adding the page switching wait, all the **and 30 items involved passed**.
- Attribute-related verification covers menu entry, cancel, focus, save, undo/redo, reopen, narrow screen, external refresh, synchronized block update, Meeting notes field and nested Tab rename; screenshot to check window layout. The actual operation buttons such as generation, transcription and synchronization are retained, and page-level attributes and text semantics Toggle are not affected.

<a id="上一轮内置语法独立列为第二组"></a>

# Previous round: Built-in grammar is listed independently as the second group

2026-09-22。Extensions、Block Explorer Expanded list and dialect details Added second groupBuilt-in syntax。CommonMark／GFM／CommonMark X The nine basic rules of the Code read only to show the link to the non-switched status of the specification;HTML The configurable switches are still retained.Pandoc flag Or the product doesn'tPandoc preset The first is that the system is not automatically presumed to be built-in.

- `npm test`:347 entry, **pass, 346 pass, 1 entry, Windows symbolic link permission condition skips**. New grouping and native parsing validation covers base fencing, backslash wrapping, escaping, title spacing, list numbering/breaks, in-word underlining and shortcut citations, and round-trips to the original text.
- `npm run test:e2e`The TypeScript/Vite build passed. Among the complete 117 items, 114 passed; one assertion in the new use case misused internal ID and has been changed to verify the name link. The other two failures occurred with shared build/test artifacts being overwritten by other runs; parallel Vite builds, missing trace files, and missing reload pages were observed.
- Use independent build copy, dynamic port, independent product directory, temporary vault and Chrome rerun: **5 items all pass**, including all 3 item extended display use cases and the above two product syntax use cases. Screenshot to check the second set of locations, read-only entries, source links, and directory status.
- Updated README and extension dependency descriptions; does not modify user text, default switches, or parsing behavior.

<a id="上一轮按方言区分扩展规范与-pandoc-默认值"></a>

# Previous Round: Differentiating Extended Specifications vs. Pandoc Defaults by Dialect

2026-09-22. Edit page extension settings, Block Explorer extension list and dialect association list share the same specification basis and grouping. Specification items are arranged by required/optional and GFM Spec/Docs, followed by Pandoc, other default enabled items and other extensions; non-Markdown items are kept last. Official basis of label link; Pandoc 3.11 snapshot status and current check are displayed separately. See [ for instructions on ](../reference/EXTENSION-PROVENANCE.md) .

- `npm test`：345 The neck,**344 is passed by the 1 symbol linking permission condition of Windows**The new test covers all 115 items in the 11 dialect, no leaks, specification sources, Typora options, Pandoc differences between flag and reader missing products. Finally, the Strict Mode labeling was added and the 4 items were approved again.
- TypeScript/Vite passed the build, and the final version passed again; the existing large chunk prompts were retained.
- Full of `npm run test:e2e` of116 In the following sections114 Adopted;2 Testing assumptions that are not suitable for new link-based and full text search simultaneouslyCriticMarkup，It was corrected.6 The following:Markdown workspace Returns are approved; final directory and extension settings**7 is all passed**Verify the switching dictionary, check the check box to cover the non-changing specification/default tag, filter and back-and-forth navigation. Fix the same time period for the selected items in the same directory.
- Independent Chrome/temporary vault, screenshot check setting tags and directory grouping. There are no modifications to the user workbook, vault text, dialect default switch, or codec.

<a id="上一轮callout-手柄与图标选择"></a>

# Previous Round: Callout Controller and Icon Selection

2026-09-22. The first paragraph of Callout positions the overall handle to the outside of the container, and subsequent paragraphs and nested list items maintain independent operations. Notion tag Callout adds icon selector (search, recently used, custom emoji/symbol, remove), retaining native Alert encoding and display. Explicitly empty icons no longer restore the default light bulb after saving.

- `npm test`:341 entry, **pass, 340 pass, 1 entry, Windows symbolic link permission condition skips**. Added container/sub-block movement and undo, CRLF restart after icon modification/removal, unknown attribute retention verification.
- `npm run test:e2e` In the InteriorTypeScript／Vite The building is approved;114 In a browser case113 It was passed.1 The old one.Slash The user case is interrupted by the drag option on the test page of the same name.Block types After the menu,Callout withNotion The format**The 6 is re-adopted**The product code has not been changed due to the failure of the test.
- Verify the overall/subparagraph dragging, handle position, selector search/cancel, icon undo/redo, save, reopen and remove in independent Chrome and temporary vault; take screenshots to confirm that the selector and outer handles are normal. The rest of the complete regression covers view switching, external refresh, window draft isolation, and CAS conflict recovery.
- README and FORMAT update the current boundaries. The icon is currently a plain text emoji/symbol, and no image upload is provided; the user vault content has not been changed.

<a id="上一轮方言与扩展测试子页面"></a>

# Previous Round: Dialects and Extensions Testing Subpage

2026-09-22: newly added reproducible 27 portions accept the original language, covering the 11 dialect, 103 extensions and 81 content objects; additional navigation and reference objectives, and a direct subpage of 29 and Tests. Structure and operation [Test page description](MANUAL-ACCEPTANCE-PAGES.md)。Applications requested by usersAPI Installed in a designated knowledge library, originally13 The pagerevision It's all the same.

- `npm test`: 339 entry, **pass, 338 pass, 1 entry Windows symbolic link permission condition skipped, 0 fail**. The first run of the existing REST test was randomly assigned to the fetch disabled port, and the entire set of reruns passed.
- `npm run build`: TypeScript and Vite are passed, and the existing large chunk prompt is retained.
- New browser sample check: **27 item passed**; after final adjustment of the default dialect sample, all 11 dialect pages passed again. Use independent Chrome and temporary vault to verify page-by-page opening, view switching, source code retention and browser exceptions; no content is sent to the real model.
- The sample manifest checks cover all extensions, objects and dialects, and verifies schema and unmodified source roundtrips. The page manual acceptance record is still Not run; smoke checking does not equal all editing operations or upstream syntax compatibility certification.

<a id="上一轮对象补齐扩展规范命名与兼容服务"></a>

# Previous round: Object completion, extended specification naming and compatibility services

2026-09-22. The registry is still 81 semantic objects; the workbook 103 and Markdown extensions all have local execution paths, and the 12 and Outside Markdown scope entries are ranked last and cannot be enabled. notdown_* configuration is compatible with reading, and the specification key notion_* takes priority and is used for subsequent configuration writeback; unknown keys are retained with the user's original text.

- `npm test`：**338 and 337 passed through the 1 and Windows symbol linking permission conditions, and 0 failed.**。
- `npm run build`: TypeScript and Vite are passed, and the construction prompt of chunk of the chart library is retained.
- `npm run test:e2e`: **85 items all pass**, independent Chrome, temporary vault. Finally, after only updating the directory scope description, another directory unit test 5 item is run and passed, and the directory browser use case is rebuilt and verified.
- Unit covers new object LF/CRLF original text reuse, unknown attributes, invalid/unclosed input, code fence, nested reference; three new table codes and reopening after editing, row and column span and column attribute alignment; Small caps attribute, nested Raw TeX, example number and reference update; LaTeX macro, Gutenberg, path and sourcepos; local Pandoc CSL citeproc.
- The browser covers object/dialect/extension bidirectional jumps and aliases, table editing, metadata field undoing, definition list sorting, abbreviation attribute modification/undoing/reopening, Tabs titles and sorting; compatible service settings, generation, transcription, save undoing and delayed result protection; local reminder confirmation conflicts with Synced block automatic refresh pause and CAS publishing.
- Regression covering pending input, view switching, dragging, external refresh, window draft isolation, and CAS recovery. Take a screenshot to check that the service object displays normally.
- Model serving tests use mock endpoints and test keys, with no notes or audio sent to the real model. Reminder is not a background system task, and Synced block is not cross-end synchronization; Raw TeX, raw source and some grammars are provided with source code editing capabilities. See [ Local Objects and Services ](../reference/LOCAL-OBJECTS.md) for specific restrictions.
- The user vault has not been migrated in batches, and the user workbook or MyBase main library has not been modified. The old review and competency matrix retention date snapshot is currently based on [ objects Roadmap ](../architecture/CONTENT-OBJECT-ROADMAP.md) and Block Explorer.

<a id="上一轮表外对象清理与目录归位"></a>

# Previous round: Cleaning up off-table objects and relocating directories

2026-09-22. Remove Mention agent's product registration and mention parsing, Inline media node and local link to player rules; Inline raw source is included in the official list, and File transclusion unifies block level and inline position. Removed the Existing content section and the misspelled alias date ot reminder, and there are a total of 81 items in the official object.

- `npm test`:298 entry, **pass, 297 pass, 1 entry, Windows symbolic link permission condition skips**. Added official raw inline examples and edit reopening, dual-position identities introduced by files, old Agent tags (unknown attributes, self-closing, unclosed), CRLF and adjacent edit restoration; local audio and video links remain normal links.
- `npm run test:e2e`The included TypeScript/Vite build passes. The entire browser test **75 items passed**, the only failure was that the new use case misused the `.syntax-inline` selector; after correcting to the actual `.pm-syntax-inline`, `npx playwright test tests/e2e/block-catalog.spec.ts -g 'cleaned objects'` **1 items passed**, without changing the product code or lowering the assertion.
- The browser uses standalone Chrome and a temporary vault. Verify the search results of cleaned entries, bidirectional jumps between official objects and extensions, old directory links back to official objects, reloading and official basis links; 75 item regression covers pending input, file introduction preview, external refresh, window draft isolation and CAS conflict recovery.
- The screenshot confirms that only Content objects, Child structures, Markdown variants, and Extensions are retained in the directory. README, FORMAT, object Roadmap are updated synchronously with the format basis; there is no batch rewriting of user files.

<a id="上一轮mmd-元数据归并数据库对象移除及表外格式依据"></a>

# Previous round: MMD metadata merging, database object removal and off-table formatting basis

2026-09-21. MMD metadata is subsumed under YAML front matter, leaving separate restricted plain text reader and encoding sources; full page YAML is not affected. Database reference registration items and dedicated nodes are removed, and the original text is returned to Unsupported. The remaining four clearly distinguish between official basis and local compatible behavior, see [ description ](../architecture/METADATA-AND-COMPATIBILITY.md).

- `npm test`:295 entry, **pass, 294 pass, 1 entry, Windows symbolic link permission condition skips**. Covers first line/blank line boundaries, ASCII/ numeric keys, case and space normalization, multi-line and colon indentation, optional delimiters, the difference between plain text values ​​and full YAML, CRLF, expansion switches, code fences and old database tag restoration.
- `npm run test:e2e`: **75 items all pass**, independent Chrome and temporary vault. Added variable refresh after metadata source code editing, pending input collection, save and reopen, and page title not being overwritten by text metadata; directory verification MMD alias merging, official basis link and database object return to Unsupported.
- TypeScript/Vite passed the construction, retaining the existing large chart resource chunk prompt. After the complete set of regressions, only the directory adapter ownership of Inline media has been corrected: it no longer incorrectly hangs on the Notion media switch; the object/extension relationship orientation test and construction passed again.
- The user workbook or vault has not been modified, and the page YAML has not been migrated in batches; no database, Agent execution or original format writer service has been added.

<a id="上一轮独立列表项统一表格与对象子结构"></a>

# Previous Round: Independent List Items, Unified Tables, and Object Substructures

2026-09-21: Three list items are independent of the base node; Heading continues to share structure; pipeline, Notion, MMD table is unified into structured nodes, removing the entire source code carrier of MMD and the Notion specially replicated NodeView table. Child structures and Existing content display separately. Implementation and boundaries [Object Roadmap](../architecture/CONTENT-OBJECT-ROADMAP.md)。

- `npm test`: 291 entry, **290 passed, 1 entry Windows symlink permission condition skipped**, no failures. Three new types of list identities, mixed nesting and conversion/undo; structural consistency of table editing and re-parsing, table header/partition, simultaneous cross-row and column, caption position and reference label, multi-line code/list cell, Tab and intra-code line breaks, CRLF adjacent editing, expansion switch off, and code fence/unclosed input retention.
- `npm run build`(Also executed by `npm run test:e2e`): TypeScript and Vite pass; there is still an existing large chart resource chunk prompt.
- In the end, all `npm run test:e2e`: **and 74 items passed**, independent of Chrome and the temporary vault. Verify list node type, mixed indent/line break, drag/convert/undo, save and reopen; MMD cell/caption direct editing, collection of input to be submitted, last cell Tab new line and reopen; object/dialect/expansion and substructure linking; existing external refresh, window draft isolation and CAS conflict recovery.
- The first round fixed the retention issues caused by duplicate table NodeView, cross-row and cross-column output, and normalization of caption labels. Subsequent runs of the entire set encountered a race condition in which the old footnote use case read boundingBox before the node was displayed. After adding the display wait, the entire set finally passed; the layout assertion requirements were not reduced.
- The operation interface for adding/splitting merged cells has not yet been implemented. There is no batch migration of user Markdown, access to user browsers, or writing to user vaults.

<a id="上一轮block-explorer-关系来源与命名"></a>

# Previous Round: Block Explorer Relationships, Origins and Naming

2026-09-21. For the scope, see [ directory classification and naming instructions ](../reference/CATALOG-RELATIONS.md). The user workbook is read-only and the `extensions!A2:N117` snapshot is retained; the original workbook or user vault is not modified.

- `npm test`: 282 entry, 281 passed, 1 entry Windows symbolic link permission condition skipped, no failures. Added number of sources, current registry overrides, encoding/modification/scheme relationships, object/dialect bidirectional consistency, and `notdown_*` naming boundary validation.
- `npm run test:e2e`Within `npm run build`:TypeScript and Vite, retain the existing chart resource chunk size hint.
- Complete Chrome E2E: **72 items all pass**, using a separate browser process and a temporary vault. Added six directions of object/dialect/extension jump, official link address, refresh and forward/backward, classification and search recovery, pending and non-Markdown status, supplementary object navigation.
- The first round of targeted use cases found that long extensions caused the 390px page to overflow horizontally; after adjusting card wrapping and narrow screen layout, the complete regression passed. Check out the final narrow screen detailed screenshots.
- Check primary official sources and verify chapter anchors for Pandoc 89 reference links. The upstream capabilities of web pages or workbooks are not treated as local implemented capabilities, and the dialect default values ​​and configuration keys are not changed.

<a id="上一轮内容对象统一-p0--p1"></a>

# Previous Round: Content Object Unification P0/P1

2026-09-21. See [ Object Roadmap ](../architecture/CONTENT-OBJECT-ROADMAP.md) for the first batch of object scopes and implementation boundaries. P2 – P4 are not yet shipped as features in this batch.

- `npm test`: 279 entry, 278 passed, 1 entry skipped because Windows does not allow creation of symbolic links; no failures. Added 80 object registration and context identification, real directory examples, Callout attributes and original encoding, TOC scope and HTML export, undo, extension switches and source code boundary verification.
- `npm run build`: TypeScript and Vite pass; there is still an existing large chart resource chunk prompt.
- `npm run test:e2e`: All complete 70 items passed, using independent Chrome and temporary vault. Added directory classification/alias, folding persistence, directory update, view switching input and unified Callout entry.
- Specially verify that DOM and revision after external refresh are replaced together; when the refresh request has not yet been returned, the input will retain the original revision, and subsequently generate 409 and retain the disk and local content; the two windows restore their respective Callout drafts, and the old save will not overwrite the content of the other window.
- Full regression only to supplement old name search aliases, and rebuild and direct validation directory interaction with merged objects. The test does not connect to the user's browser or write to the user's vault.

<a id="历史补充typoraobsidian-与-62-条产品语法实现"></a>

# Historical supplement: Typora/Obsidian and 62 product syntax implementation

2026-09-15. Two new presets and 27 rules were added in this round, for a total of 11 presets and 70 registered extensions. See [ PRODUCT-SYNTAX.md ](../reference/PRODUCT-SYNTAX.md) for itemized current support, default switches, and boundaries. Previous gap audits below are retained as historical records.

- `npm ci`Complete; dependency audit 0 known vulnerabilities. Mermaid is loaded locally on demand, and markdown-it-multimd-table is used for complex tables.
- Final `npm test`: 252 entry, 251 passed, 1 entry Windows symbolic link permission condition skipped, no failures. 62 original samples cover actual semantics, original text round-trip and adjacent block editing; supplementary attribute writeback, escaping, original format export fallback, BibTeX, temporary file dependency and out-of-bounds/loop protection.
- `npm run build`: TypeScript and Vite pass. There are chunk prompts for large dynamic resources (main chart resources), and the real-time performance of large documents has not been measured, so it cannot be claimed that all performance targets have been achieved.
- `npm run test:e2e`: All complete 46 items passed (independent Chrome, temporary vault). Covers original interactions, six Pandoc presets, charts for new product blocks, iframe, complex tables, metadata variables, real BibTeX, embedded files and inline embedded refresh, jump, Slash, dragging, expansion switches, three views, save reload and undo.
- Then the prompt for supplementary definition source code editing is refreshed and rebuilt; `npx playwright test tests/e2e/product-syntax.spec.ts` and finally all 6 items are passed. A full 46 run occurred before this minor fix, and the final set of test files totaled 47.
- The first round of regression found that directly modifying the title DOM during directory refresh would interfere with the editor state, and the modification path has been removed. The existing Notion column test reoccurred with the occasional problem that the input fell into the title after clicking on the blank area; instead, the entire set passed after clicking on the text position, and it did not claim to fix all the clicking behaviors in the Chrome blank area.
- Viewed the MMD page screenshot, checked the metadata preview/source code input, table of contents and text layout; complex table spans and captions, charts SVG and isolation iframe, and browser DOM assertions. Tests are not written to the user vault. Development services reverted to 4317/4318.

<a id="上一轮62-条用户语法核对与列表修复"></a>

# Previous round: 62 user syntax check and list repair

2026-09-15. Run the user's 62 syntax sample item by item, recording the round trip between the actual node and the unmodified source code; check the functional boundaries by combining the display and navigation code. See the [ verification report ](../audits/SYNTAX-AUDIT-2026-09-15.md) and its machine records for details. This does not mean that all 62 functions are supported or visual acceptance is completed.

- Fixed an issue where the `lists_without_preceding_blankline` limit was misapplied to sibling list boundaries; consecutively numbered items are no longer swallowed into the previous item. The new unit use cases cover six presets, continuous ordered/unordered lists, edit writeback and paragraph break restrictions; the six native dialect browser use cases add three numbered list checks.
- `npm test`: 185 item, 184 passed, 1 item Windows symbolic link permission skipped; TypeScript/Vite build passed.
- The full set of browser tests passed 40 and failed 1; the failure was caused by the existing Notion column input falling into the top title of the page, not a new dialect use case. Without modifying the product or test code, rerun the project alone to pass. It is recorded as an occasional input positioning failure, and the cause cannot be claimed to have been fixed simply by re-running it.
- Functions such as charts, attributes, citations, annotations, etc. that are missing in the report are not implemented this time. README clearly differentiates between default optional and full syntax compatibility; not written into the user vault.

<a id="前一次补充六个原生-markdown-方言"></a>

# Previous addition: six native Markdown dialects

2026-09-15。New growthPandoc Markdown、CommonMark X、Markdown Strict、PHP Markdown Extra、MultiMarkdown、oldGitHub Markdown The core ofreader/writer；Nine pre-set options are available, and the registry43 Item 6. Actual scope and incomplete items[NATIVE-DIALECTS.md](../reference/NATIVE-DIALECTS.md)。

- `npm ci` The following are the results of the survey:Emoji ofmarkdown-it Plugins, locking files sync.
- `npm test`: 184 entry, 183 passed, 0 failed, 1 entry Windows symbolic link permission skipped. Contains a block structure comparison of 60 groups against native Pandoc 3.11; this is not a full dialect conformance certification.
- `npm run build`: TypeScript/Vite passed; there are still shared package build prompts exceeding 500 KB.
- `npm run test:e2e`: The entire set of 41 items passed. Six new items are added to cover the actual rule switch, default reset, page editing, source code blank line, save and reload, switch dialects to retain source code, unknown switch retention, and intercept Pandoc API to verify that there is no call for daily editing.
- The existing HTML, definition list, footnote, line block, Div, Slash, dragging, Notion blank line retention, three views, common undo and synchronous scrolling tests continue to pass.
- End-fill completion of normal text writeback when "metadata is on but generalized escaping is off", and closure recognition when code fencing is disabled in Div. Then again passed the full 184 unit test (183 passed, 1 skipped), build and related 9 browser regressions.
- Tested using only temporary vault with standalone Chrome . The extensions to be implemented are listed separately in the panel, and their configuration is not performed; the metadata is only recognized and retained, and the page attributes are not written. No claims are made for full Pandoc syntax, Meta or AST bidirectional compatibility.

<a id="前一次补充notion-markdown-空行保留"></a>

# Previous addition: Notion Markdown blank lines are reserved

2026-09-15. Notion reader records the space before the top-level block and the space at the end of the file, and writer reuses the existing original text retention mechanism. Editors no longer need to re-assemble the entire article with a single line break; new/rewritten boundaries and sibling blocks within containers are separated by blank lines by default, and list items remain compact. Modifications within a compound block may normalize its spacing.

- `npm test`: 176 entries, 175 passes, 1 entries, Windows symbolic link permissions skipped. Newly added semantic round-trips covering consecutive blank lines, leading and trailing blanks, CRLF, original code/unknown blocks, insertion/movement, and editing within the container.
- `npm run test:e2e`Completed the build and 35 browser test cases, of which 34 passed; the only failure was that the old test still required no blank lines between paragraphs and lists. After changing the assertion to two newlines according to the new explicit output rules, the item passed independently by re-running it. The product code has not changed after this assertion adjustment.
- The new browser use case confirms that Notion page editing retains three consecutive line breaks, and that there are blank lines in the source code after creating a new paragraph in Enter. The saving and reopening are consistent, the formatting of blank lines does not generate additional nodes, and the internal blank lines of the code remain unchanged.
- The test uses a temporary vault and independent Chrome, and does not rewrite user texts in batches. README and FORMAT have updated writeback rules.

<a id="前一次补充html-与-markdown-复合块"></a>

# Previous addition: HTML and Markdown compound blocks

2026-09-15. Added `raw_html`, `definition_lists`, `footnotes`, `line_blocks`, `fenced_divs`, totaling 24 entries in the registry; see [ BLOCKS.md ](../reference/BLOCKS.md) for complete dialect ownership, block list and boundaries.

- `npm ci`Completed; add HTML5 parser `parse5` and definition list syntax plug-in `markdown-it-deflist`, lock file synchronization.
- `npm test`: 173 entry, 172 passed, 0 failed, 1 entry Windows symbolic link permission skipped. New test coverage parsing/editing/reopening, original text preservation, disabling extensions, code fences and indented code, nested Div, unclosed input, footnote tags and continuations, pipeline table priority, inline HTML, overall container movement and HTML cleanup/export.
- `npm run build`: TypeScript/Vite passed; the shared package still has build prompts exceeding 500 KB.
- `npm run test:e2e`：The Independent Temporary Knowledge Base andChrome The whole set.34 Adopted. Subsequently supplementedHTML The focus is on the re-use of the source box.GFM The default value is marked with a footnote, and the new blocks and three views are reconstructed and replicated.7 The browser usage example.
- The browser adds real Slash insertion covering five types of blocks, HTML whole block dragging, terminology/definition/footnote/poem line/Div editing, two-way source code update, save/reopen, text unchanged before and after the expansion switch, and HTML event/script/application operation attribute isolation.
- I've seen it. `test-results/markdown-blocks.png`Repair the HTML preview inheritance editor to retain the residual spacing caused by the blank style; the HTML source field uses shared history and remains open and focused after reworking.

The test did not change user vault; it did not access the full set of Pandoc AST conversions. There are still clear boundaries for HTML elements and styles, footnote layout, Div attribute execution, cross-container reference definitions, complex tables, and Notion codec's new extended adaptations. See the block documentation for details.

<a id="前一次补充原生-markdown-编辑核心"></a>

# Previous addition: Native Markdown editing core

2026-09-15. The main application has access to the unified source code draft, three views, 3 native presets and 19 built-in extensions; see [ architecture and actual boundaries of ](../architecture/MARKDOWN-ENGINE.md).

- `npm ci`Completed; add direct dependency of CodeMirror commands and lock file synchronization.
- `npm test`: 166 entry, 165 passed, 0 failed, 1 entry Windows symbolic link permission skipped. Native codec tests cover real switches, code fences, Notion containers, formulas, double chains, color and bold combinations, soft/hard line breaks, pipeline table alignment editing, source/reference definitions/CRLF, unknown configurations, and CAS conflict recovery and configuration removal.
- `npm run build`: TypeScript/Vite passed, but there is still a prompt that the size of the shared rendering package exceeds 500 KB.
- Standalone Temporary vault / Chrome Complete E2E: 31 items passed. Added source code → page and reverse input, three-view switching, common undo/redo, real expansion switch, configuration save/refresh, unknown switch retention, fast source code replacement, synthetic IME input, two-way scrolling and turning off synchronization; explicitly intercept Pandoc API and assert that the main editor did not request it.
- Existing Slash, single item/subtree drag, nested, directory, Notion tag, table and Lab tests continue to execute. The old page assertion has been changed to retain the original CommonMark source code and no longer requires automatic migration to Notion when switching views.
- Viewed `test-results/native-workspace.png`; double column width and viewport height are calculated based on the current window. The test always uses a temporary vault and does not add a test page in user vault.

Log: `.run/native-unit.log`, `.run/native-build.log`, `.run/native-e2e.log`; model performance example: `.run/native-benchmark.json`. Preliminary measurements do not include DOM/ rendering; real system IME, large document end-to-end latency, full Pandoc extension conformance, third-party extensions, and full Pandoc AST round-trips are not accepted.

<a id="前一次补充全部-pandoc-markdown-方言"></a>

# Previous addition: All Pandoc Markdown dialects

2026-09-15. Complete MultiMarkdown, PHP Markdown Extra, Markdown Strict and the old version of GitHub Markdown; together with the original four Pandoc dialects and Notion, there are nine languages ​​in total. Legacy GitHub dialect annotations are deprecated; bookmark cards are explicitly marked to show examples.

- `npm test`: 160 item, 159 passed through, 0 failed, 1 item, Windows symbol linking permissions were skipped. `--list-input-formats` Verify that Markdown reader is not omitted, each comparing the extension names and default values of eight languages.
- Added four new dialects to actually call Pandoc, verify paragraph and title differences when `blank_before_header` is turned on/off, and use block position estimation when native line numbers are missing.
- `npm run test:e2e`(Including TypeScript/Vite build): All 27 items passed. Added browser tests to select four dialects one by one, operate extension switches, verify rendering and source code unchanged, deprecation prompts and refresh recovery.
- Synchronous positioning is determined by reader capability detection to avoid passing unsupported reader into `+sourcepos`. The native runtime service has been updated, and the capabilities interface confirms that extensions are available for each of the eight Pandoc dialects.

<a id="前一次补充markdown-lab-双栏预览"></a>

# Previous supplement: Markdown Lab double column preview

2026-09-15, Windows/native Pandoc 3.11/standalone Chrome.

- `npm ci`Install dependencies; add CodeMirror and language highlighting dependencies, and update lockfile together.
- `npm test`: 158 item, 157 passed, 0 failed, 1 item ordinary file symbolic link skipped due to Windows permissions.
- `npm run build`: TypeScript and Vite multi-page build passes. Lab stands alone JS approximately 658 KB (gzip 229 KB), currently retaining build volume hints.
- `npm run test:e2e`: All 26 items passed, using the temporary vault and independent Chrome; after the final preview DOM anchor point isolation and illegal line number processing were modified, Lab was rebuilt and retested and all 6 items passed again.
- New model tests cover actual Pandoc extended reading, native line numbers, Notion column/unknown content, plug-in deactivation and invalid payloads, nested code fence protection, request parameter restrictions, request cancellation, YAML meta information boundaries and bidirectional position interpolation.
- Lab browser test covers real-time input/highlighting/formula, source code unchanged after expansion switch, refresh recovery, Notion dialect and bookmark plug-in, block position alignment and deactivation of two-way scrolling, delayed old response, synthetic input events, original HTML cleanup, application/document ID isolation, illegal line number, source code recovery after failure, UTF-8 file import download and vault unchanged, 600px narrow screen.
- The page screenshots have been manually checked: [ desktop ](../../test-results/markdown-lab-desktop.png), [ Notion ](../../test-results/markdown-lab-notion.png), [ narrow screen ](../../test-results/markdown-lab-narrow.png). Corrected the problem of line wrapping in the first paragraph of Notion to-do and re-screenshot after indenting common sub-blocks.
- The official local service entrance is `/markdown-lab.html` HTTP 200, and the capability interface returns `pandoc 3.11`. The test always uses the temporary vault; after starting the normal application, the Lab preview request does not call the vault read and write interface.

All combinations of the complete system Chinese IME, large document performance, and itemized Pandoc expansion have not yet been accepted. The source code location of Pandoc Markdown is an estimate; third-party plug-in installation, right-side editing, vault saving and complete multi-format export have not been implemented. See [ MARKDOWN-LAB.md ](../features/MARKDOWN-LAB.md) for detailed boundaries.

<a id="前一次补充notion-enhanced-markdown-正文格式"></a>

# Previous supplement: Notion Enhanced Markdown text format

2026-09-12。byNotion officialEnhanced Markdown withWorking with markdown content Two documents implementedFORMAT v0.3；Format settings, migration and functional boundaries[FORMAT.md](../FORMAT.md)。

- `npm test`: 152 item, 151 passed, 0 failed, 1 item Windows ordinary file symbolic link permission skipped; junction escape check passed.
- TypeScript checks pass with Vite production build. The current main entrance is about 517 KB after compression, and the construction retains the volume prompt; local KaTeX and fonts are packaged with the application.
- The Independent Temporary Knowledge Base andChrome of completeE2E：19 All items are accepted, including previous directories, backlinks, nestings, parent-dragging, page links andSlash Returns, as well as new official labels, tables, and old-form migration checks.
- New format model checks cover rereading after actual serialization: single newline blocks, Tab subtrees, `<br>`, empty blocks, multiple columns and nested columns, literal labels in code fences, prompts/collapses, tables, color precedence, formulas, mentions, Chinese page names, relative/external URL, unknown content, CRLF and HTML exports.
- Persistence checks cover writing the body with `bodyFormat`, retaining and merging old version conflicts, rejecting format modifications only without committing the full body, and formatting of new examples. The user vault has not been traversed or rewritten.

The browser actually edits the column content and presses Shift+Enter. After editing the table, add a new row from the last column Tab, save, switch the source code and refresh; the folded content can be expanded/collapsed, and the color priority is maintained after refreshing. Screenshot [ notion-format.png ](../../test-results/notion-format.png) has been actually viewed, showing columns, prompts, folds, colored tables, underlines, formulas and directories. Browser pageerror check passed.

This wheel repaired the folding button suspended to pull the handle shade, originalHome The following is a list of the most commonly used methods for the synchronization of the editor.HTML Exporting embeddedDOM The problem of the content slot not receiving the correct answer.7 A browser failure has been passed in this round of complete regression; the old test format claims to have beenv0.3 Updated

Log: `.run/notion-tests.log`, `.run/notion-browser.log`, `.run/notion-build.log`. Both the test and the browser use a temporary vault and do not write to the upstream clone or MyBase main library. Notion cloud API verification workspace import is not called; database execution, synchronization block cross-page linkage, custom emoji resources and meeting transcription are still processed according to the boundaries listed in the format document.

<a id="前一次补充目录点击定位"></a>

# Previous supplement: Directory click positioning

2026-09-12. Using a standalone temporary vault with Chrome, add a new test to enable normal scrolling animation. Two failures occurred before the repair: the title within the collapsed chapter was still hidden after being clicked; the last item was still highlighted after clicking on other titles at the end of the page. A baseline of rapid succession of clicks passes.

After the repair, the special **5 items in the table of contents passed**: level/reading following, long table of contents with 73 titles and keyboard operations, automatic expansion of multi-layer folds, keeping clicked items at the end of the page, and continuous smooth jumps after editing. Table of contents items are directly associated with the rendered title, and position following is restored when manually scrolling or editing. Chapter expansion does not modify the Markdown text or undo history; the test checked that the disk text before and after the click is consistent.

The first round of the project was built on the basis of the TypeScript and Vite protocols.`npm test` The execution is134 The neck133 I'm going to go through this.1 The following:Windows The symbol linking permission has been skipped.Chrome Return to the**9 passed, 7 failed**The default is for non-title-containing text/list uses: list regression, common text nesting, hard-to-order, sub-item/parent drag, copy and type conversion. `notion-markdown`The code is written in a Tab nested and edited form. `<br>`The old test still uses the input and partial output statements of normal Markdown, and there are also lists of DOM level statements that fail.

Log: `.run/toc-navigation-before.log` (recurrence), `.run/toc-navigation-after.log` (special project), `.run/toc-navigation-full.log` (complete regression), `.run/toc-navigation-unit.log` (unit test). The interface and editor modules returned by the local development service have been confirmed to contain fixes.

<a id="前一次补充退格普通文本嵌套与块内换行"></a>

# Previous addition: backspace, normal text nesting, and line breaks within blocks

2026-09-12. `npm test` has a total of 134 items, 133 passed, 1 items Windows symbolic link permission skipped, 0 failed. Chrome E2E has been expanded to 11 items, including parent-child dragging and refreshing of ordinary text, backspace at the end of the list, hard line wrapping of paragraph/to-do Shift+Enter, and source code round-trip. The logs are `.run/nesting-tests.log` and `.run/nesting-browser.log`.

New commands to test the empty nested lists are phased out, the normal text is upgraded and the next brother follows the sub-clause, the empty parent block/Sub-block, literally extended markup and original preservation. Common text-level useFORMAT v0.2 of`:::nest` / `:::children` / `:::endnest`The standard list is still shortened with Markdown.

<a id="前一轮验证记录连续块编辑器"></a>

# Previous round of verification records: Continuous block editor

2026-09-12，Windows / Node.js 24 / Chrome 153 / ProseMirror。

- `npm test`: 124 item, 123 passed, 0 failed, 1 skipped. The skipped items are that Windows does not allow the creation of ordinary file symbolic links; junction escape verification is passed.
- TypeScript check and Vite production build passed.
- Standalone Chrome E2E covers the 8 entries, see table below; the complete final batch log is in `.run/latest-browser-tests.log`.
- All tests use temporary vault and do not operate on the user vault, upstream clone or MyBase.

| Browser testing | Verify content |
| --- | --- |
| Slash autocomplete | Enter single/display menu immediately, keep text focus, continue typing h2 filter, Enter insert title |
| Markdown/nesting | The title is consistent with the list syntax, Enter independent item, Tab/Shift+Tab, Ctrl+E source code |
| Todos | First enter - and then [ ] to generate a to-do, item-by-item checkbox, Enter new item is unchecked, and the save is successful. |
| Child drag | Real mouse event drags children, retains grandchildren, saves and refreshes source code |
| Parent drag | Fast native dragTo moves parent and subtree as a whole, single-step undo |
| Page links | Inline mentions and page entries contain icons/names, and cursor movement does not expose Markdown |
| Nested menu | Nested items copied/deleted, other blocks unchanged |
| Single-item conversion | Convert the current item to a number, retaining the original types and sub-items of other siblings |

The screenshots `test-results/slash-menu.png` and `test-results/page-links.png` have been actually viewed; the test captures browser pageerror, all of which are empty. Computer Use Read-only view of the actual Notion window for interface reference.

Model testing additional coverage: reference definitions/unknown syntax/CRLF retention, more than 100 nested drag combinations, loop rejection, unified undo, inline marks/ page atomic retention, full link range, transcoding retaining attachments and page identifiers, local audio and video round-trips, input combination status. The system-level Chinese input method has not completed acceptance with real IME; the status/input rule test is not equivalent to real IME.

This round of real testing discovered and fixed: handle cancellation in mousedown prevents native dragging, hover removes the handle when dragging quickly, todo input reuses another transaction selection causing an exception, and Windows's temporary file occupation causes rename to fail. File replacement now has limited retries. Before retrying, confirm that the original file has not been modified externally; the original file is not deleted to bypass occupation, and revision conflicts are not forced to be retried.

All the following are old version history and do not represent the current editor.

---
<a id="旧版验证记录历史"></a>

# Old version verification record (history)

<a id="本轮阅读编辑与块整理合一"></a>

## This round: reading, editing and block sorting in one

Recording date: 2026-09-12. The following clearly distinguishes automatic inspection, code review and real UI acceptance; at the end of the article, the previous version of the record is retained as historical evidence.

- Final test batch: `npm test`, total 37 items, 36 passed, 0 failed, 1 skipped. The skipped item is still Windows. The current permissions do not allow the creation of ordinary file symbolic links; the directory junction escape test passes.
- `npm run typecheck`Passed.
- `npm run build`: This round of TypeScript inspection and Vite production build passed.
- The local preview portal, API, front-end module, CSS and Lute resources all return HTTP 200; the background service remains running after the build.
- The test is run in an independent temporary repository; no user `vault/`, upstream clone or MyBase main repositories were modified in this round.

New automatic overrides include: single block replacement/insertion/deletion/copy, safe merging of adjacent paragraphs, CRLF with no trailing line breaks, hidden reference definitions, code/table/list/two-column/unknown extension original text retention, to-do checkboxes positioned in true rendering order and modifying only single characters, and Chinese matching for searches, quoted phrases, title sorting, and recent visits. Existing storage, conflict, MCP and MyBase tests continue to run. Pure function testing cannot replace the cursor, drag and drop, and Chinese input method acceptance in the browser.

This round of code review checked: multiple input capture in active blocks, source code collection before switching views, ending active editing before menu/drag, insertion position preservation, slash query and selection invalidation, menu behavior and event cleanup during combined input. Unified view, left-hover six-dot handle, in-page slash menu, keyboard search and page menu have all been implemented; **these are implementation and code review records, not the browser actual test statement**.

<a id="浏览器控制受阻尚未完成本轮真实-ui-验收"></a>

### Browser control is blocked and the current round of real UI acceptance has not been completed.

This round attempted to use the browser control channel to validate the native page, but encountered the following tool-level failure:

- The built-in browser call times out after approximately 30 seconds.
- The Chrome control call returns `fetch failed` .
- Browser status reads `getState` and returns `fetch failed` .

Therefore, no actual UI screenshots after this round of modifications were obtained, and no manual browser acceptance of dragging, continuous editing, input method, or pixel layout was completed. Tool connection failure itself does not prove that the application page is normal or abnormal; even if the HTTP service is accessible, it cannot replace these interactive checks. The screenshot size, console status or successful operation of the previous version below may not be regarded as the result of this round.

After restoring browser control, first verify:

1. Continuously read and edit within the page, drag the six-point handle on the left to rearrange, copy, and delete blocks, and then use `Ctrl+E` to check the Markdown and disk results; confirm that there is no plus sign next to the block, and no additional handle is displayed when hovering the text.
2. `/`, `、` Open the menu in the text and continue to enter the query; English/Chinese IME, empty results, Escape, Enter, arrow keys, mouse clicks, invalid selections and switching pages will not correct the text or legacy event monitoring.
3. Keyboard search: recent visits, Chinese/quoted phrases, title priority, arrow key selection, focus recovery after Enter is opened, Escape is closed.
4. The page menu in the upper right corner switches page/outline/mind map/source code; attribute expansion, table of contents, title collapse, media and two columns; desktop and narrow screen layout.
5. Actual boundaries for active block text undo, block operation undo, cross-block selections, and keyboard navigation to avoid mistaking the current per-block edit model for the full Notion edit model.

<a id="前一版第一阶段验证记录历史"></a>

## Previous version: Phase 1 Verification Records (History)

The previous version of the record is retained below. Its "direct operation of real UI" and startup verification only correspond to the separate versions for editing, reading and sorting at that time. **does not mean that the unified editor of this round has accepted**.

Verification date: 2026-09-12. Environment: Windows, Node.js 24.19.0, Vditor 4.0.0, Vite 7.3.6. This document records actual measurement results and does not mark planned capabilities as completed.

<a id="自动检查前一版"></a>

### Automated checks (previous version)

- `npm run typecheck` passed.
- `npm test`: 25 test, 24 passed, 0 failed, 1 skipped. The skipped item is Windows. The current permissions do not allow the creation of ordinary file symbolic links; the directory junction escape test has passed.
- `npm run build`: TypeScript check passes with Vite production build.
- The test creates an independent temporary vault; the MCP test starts the real SDK client and stdio service process, and actually calls column page, page creation, page reading, successful update and stale revision update.
- MyBase ExportedMBN The current projectsparser withEntityJsonBuilder The project is not written in the knowledge library or register.

<a id="浏览器验收前一版"></a>

### Browser acceptance (previous version)

Access `http://127.0.0.1:4317` in the local browser and directly operate the real UI:

1. The newly created "My First Note" discs are compatible with UUID. `.md` The files.
2. The source code input title, to-do list, double columns, and page double links; the reading view displays the structure correctly, and the brain map is generated from the same text.
3. Immediately switch to the source code view after typing in the instant editor, and the text just entered will still exist. Discovered and fixed the data missing window between Vditor delayed callback and destruction, and increased instance isolation.
4. `/`Open the Insert menu to insert references and inline code; save the cursor range so that it can still be inserted at the specified position after the dialog box is closed.
5. The two browser windows modify the same page based on the same version; the first one is written successfully, and the second one displays the 409 conflict comparison; after explicit merging, the disk text contains the additions of both windows.
6. Check that `.history/conflicts/resolved/` retains merged proposal and the body is not silently overwritten by an older version.
7. Galleries, property lists and page diagrams can be toggled to show actual pages/properties/references.
8. Check the layout in 1280 × 720 and 390 × 844; narrow screen sidebar is collapsed, galleries are stacked, and abnormal banner height caused by caption font size has been corrected.
9. The browser does not log app console errors.

The sample page created by UI actual measurement is retained in the default vault created in this round for continued experience; the default vault is not included in source code management. The production build products and source files are retained, and the development service runs at the local address.

<a id="本地启动故障修复前一版"></a>

### Local startup failure fix (previous version)

On the same day, according to the browser `ERR_CONNECTION_REFUSED` investigation, the original development process log confirmed that the root cause was Vite's monitoring of `public/vendor/vditor` triggering Windows `EBUSY`, and then `concurrently -k` terminated the backend. Excluded listening for generated resource directories, and made resource preparation skip copying when the full cache is valid, and only update necessary files when they change.

Added `start.cmd` / `scripts/start.ps1` to start two independent hidden background processes with a fixed project working directory. Start the portal to check the vault identity, web page, API agent and Lute resources, and repeat the startup to reuse the existing service. It has been verified that the service continues to run after the startup script exits, the second startup is successful, and it can still be accessed after the production build is executed during service running; web pages, API, front-end portals and Lute resources all return HTTP 200, and the background error log is empty. This time the test was executed again and 24 passed, 1 system permissions were skipped, and the production build passed.

<a id="尚未完成的整体能力与验收"></a>

## Overall capability and acceptance yet to be completed

Cross-device network synchronization, power outage/disk full fault injection, system native Chinese IME combined input matrix, touch drag, super large library performance, complete screen reader process, audio and video cross-browser compatibility, HTML attachment packaging and complete MyBase Query have not yet undergone end-to-end acceptance. Application layer CAS cannot prevent arbitrary external processes from forcing writes between the last check and the atomic replacement; MCP/API writes are the currently controlled conflict protection entry.
