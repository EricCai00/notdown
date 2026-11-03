<a id="notdown-自定义正文语法审计与整改"></a>

# Audit and remediation of Notdown custom body syntax

**English** · [简体中文](CUSTOM-SYNTAX-AUDIT-2026-09-23.zh-CN.md)

For the current status, see [ 2026-10-27 Audit ](CUSTOM-SYNTAX-AUDIT-2026-10-27.md): The following is a historical audit, and labels such as Tabs, Bookmark, and Link preview can no longer be recognized as self-created. `bg_color` has been decommissioned and the specified vault will be migrated per user authorization.

2026-09-27 revision:`html-embed` with `notion_html_document` The traditional code on HTML is `web-embed` The assets document reference, explicit migration, is taken from the original text. The relevant lines in the table below are for historical auditing only.

<a id="最新决定与已落实边界"></a>

## Latest decisions and implemented boundaries

2026-09-27 meeting card revision: reuse official title-first `<meeting-notes>` with partition structure, date and contact mention; only Notdown adds `meeting-config` block attributes, supplements language, audio, summary instructions and menu preferences. Unknown fields in the configuration are reserved, and this attribute is not enabled in the official dialect; the location link reuses the existing Obsidian block anchor point, and no new link protocol is added. See [ meeting notes ](../features/MEETING-NOTES.md) for details.

2026-09-27 synchronization block interactive revision: Added one that is only effective for Notdown `auto-sync`, reuse official synchronization blocks/reference tags to complement local automatic publishing, refreshing and copy replication behaviors; no new tags are added, and old snapshots are not migrated. Implementation moved to [synced-block-view.ts](../../src/blocks/synced-block-view.ts), the captured version of CAS is still used, the conflict is suspended and the content of both sides is preserved. The official variant retains the supplementary attributes as original and does not enable local synchronization. See details[Synchronized block description](../features/SYNCED-BLOCKS.md)。

Subsequent revisions of 2026-09-27: The official MCP Enhanced Markdown complete specification has been verified and its explicit syntax has been implemented; Tabs is no longer listed as private as a whole, and the complete partition structure of Meeting notes is also supported. Tables col width, date endTime, etc. also belong to official boundaries. Old local properties are still Notdown only, MCP support is not equal to REST write endpoint authentication. For details, see ['s updated syntax and boundaries ](../reference/NOTION-MCP-SYNTAX.md). The 2026-09-23 status below and the old verification numbers are retained as historical records and conflicting conclusions are covered by this revision.

2026-09-23，The user modified the original application that did not allow any customization of the application.Notdown The collection is already availableMarkdown Dialogues andNotion。Customized grammar for complementary official languages onlyEnhanced Markdown UnsupportedNotion block、Alreadyblock The properties ofinline andstyle，And it's only in`syntax.variant: notdown` enable;`notion-markdown` Only the syntax defined by the official documentation is enabled, explicit extension switches cannot cross this boundary. The dialect can be reused with content expressed in the existing dialect, but no duplicate protocols can be created. Old files and unknown fields must be retained recoverably and user content is not migrated in bulk.

| Action | Content |
| --- | --- |
| Retained, Notdown only | Tabs, Bookmark, Link preview (including inline), Breadcrumb, Button, Meeting notes supplementary attributes, AI block, HTML document, Web embed, a total of nine groups of switches. They cannot be enabled by other variant legacy configurations, aliases or explicit true. |
| Retained, Notdown only | column width-ratio（Compatible with old writing); datereminder/reminder-offset/date-format/time-format/time-zone withISO start/end；foldopen；synced of localid/revision/hash/auto-refresh。officialvariant Encountering these known supplementary properties preserves the entire block text and avoids enabling behavior. |
| 2026-09-27 page block correction | officialpage Tags dedicated toChild page；Add onlyNotdown enabledpage-link label complementLink to page。Both can point to the same subpage, but cannotparent Inferred type. oldrole Only unknown attributes are reserved and new entries are not written. officialunknown Available atNotdown Import based onBlock API True type recovery, original data archiving; official dialects retain placeholders. |
| Remove duplicate agreements | local_figure Exit the extension of registration and the insertion of entries;Image block Example usePandoc standalone pictures andlink_attributes ofalt。oldfigure The original is still available, independent imagesalt Don't judge me wrong in your free timeimplicit figure。 |
| Stop building and deactivate | :::nest/:::children/:::endnest, :::columns/:::column, ::page; new content uses official Tab nesting, columns, page/mention-page. The old parsing function can only be restored from the old source, and currently only the restoreable source code is displayed in variant. |
| Remove duplicate plugins | Lab notdown-bookmark; The old saved bookmark plug-in configuration has no behavior, the fence is displayed as ordinary code, and the example is changed to ordinary link. |
| Reuse existing formats | NFM The combined elements of the table are not new, aligned and not newXML The structure;Notdown Use after editingPandoc grid_tables，The format is disabled and the format is disabled.variant Not open merger/The original text of the commands is preserved in the old extension structure. |

Official dates can still be edited using start/end/startTime/timeZone fields by double-clicking; rich date panels and reminders are only available in Notdown. Official folding expand/collapse only changes the view; column width dragging and local synchronization operations do not appear in official variant. Unknown source code and unmodified files are not converted in batches, and user vault remains unchanged.

**Implementation boundaries**: The official Meeting notes tag has been listed, but the complete structure has not been verified, so the official variant is currently retained as the original text; the local transcription of Notdown still relies on the configuration service. The nine sets of supplementary codes are not an interoperable format of Notion Markdown API. All upstream conformance of the existing dialect codec is not claimed to be complete, and existing functional gaps are still seen in DIALECT-CONFORMANCE.md.

Verification: `npm test` has a total of 447 items, 446 passed, 1 items were skipped; `npm run build -- --outDir .run/dist-syntax-boundary` passed. Independent temporary vault, headless Chrome regression covers official/supplementary format isolation, old source code recovery, date/reminder, column width, bookmarks, buttons, Tabs, HTML/Web embed, synchronized CAS, tables, directories and Lab. The old variant/bodyFormat combination and outdated directory assertions in the extended regression have been corrected; all 29 items in the final supplementary test passed, and the remaining related use cases passed in the previous round. Test logs are in `.run/syntax-boundary-tests-final.log`, `.run/syntax-boundary-e2e-final.log`, `.run/syntax-boundary-followup.log`; this does not mean that the entire browser test directory was executed or that all upstream conformance tests were passed.

The following is the audit record before the revision decision, describing the status when the problem was discovered, and is subject to this section.

2026-09-23. The user target is a collection of existing Markdown dialects and official Notion Markdown, and does not design its own text grammar at the current stage. **The current implementation does not yet meet this goal.**Previous nine local_* ID changed to notion_* Just changing the configuration name does not solve the text encoding problem.

This round checks Presets, Parsing and Serialization, Insert Menu, Property Editor and Markdown Lab. Just because a property is not listed in the document does not imply that it cannot exist; however, contracts adopted by the project itself without specific upstream basis cannot be included in the collection as verified syntax. This round does not read or modify user vault, nor does it remove existing runtime capabilities.

<a id="自定义或尚无上游编码依据的九组载体"></a>

## Nine custom representations or representations without an established upstream encoding

Commonly achieved: [ object-model.ts ](../../src/document/object-model.ts), [ object-codec.ts ](../../src/document/object-codec.ts), [ presets.ts ](../../src/markdown-engine/presets.ts). All are enabled by default in Notdown. The following codes will be written after creating a new file. It cannot be said to be only compatible with old files.

| Expand | current carrier | Check results |
| --- | --- | --- |
| local_figure | `<figure src="…" alt="…" caption="…"/>` | Local format, not equal to standard HTML figure/img/figcaption; Pandoc pictures and link_attributes can be used. |
| notion_tabs | `<tabs active="…"><tab title="…" icon="…">…` | The existence of Notion Tab API cannot prove this set of labels and attributes; the Markdown document checked does not verify this contract. |
| notion_bookmark | `<bookmark url="…" title="…" description="…" icon="…" image="…" caption="…"/>` | The official Markdown support table lists Bookmark as unknown , local card tags are not that output. |
| notion_link_preview | `<link-preview …/>`、`<mention-link …>…</mention-link>` | Markdown is officially listed as Link preview for unknown; API mention.link_preview JSON is not the basis for these labels. The model also has a link-mention name and standards should not be inferred by name. |
| notion_breadcrumb | `<breadcrumb path="…"/>` | Officially Markdown's Breadcrumb is listed as unknown. |
| notion_button | `<button label="…" icon="…" variant="…" actions="JSON"/>`, old action/target | Native action protocol; neither the HTML button element nor the Notion product button document certifies these action fields and behaviors. |
| notion_ai_block | `<ai-block prompt="…" model="…">…</ai-block>` | Locally generated service and container contracts, not verified as official Markdown. |
| notion_html_document | `<html-embed>转义的 HTML 文档</html-embed>` | Local document container; Notion HTML Block API uses HTML to upload files associated with embed, and labels cannot be defined accordingly. |
| notion_web_embed | `<web-embed url="…" title="…"/>` | Local URL container; existing Typora/raw HTML iframe is another well-founded encoding. |

Direct basis: [ Working with markdown content's support table ](https://developers.notion.com/guides/data-apis/working-with-markdown-content#block-type-support) clearly lists Bookmark, Embed, Link preview, and Breadcrumb as `<unknown url="…" alt="…"/>`. It is not enough that [ Block API ](https://developers.notion.com/reference/block) has corresponding functions. unknown applies to imported content that has a real Notion block URL. It is not allowed to forge remote URL for local objects, nor to replace existing text with empty placeholders.

<a id="meeting-notes-是混合情况"></a>

## Meeting notes are a mixed case

The official [ support table ](https://developers.notion.com/guides/data-apis/working-with-markdown-content#supported-block-types) explicitly lists **`<meeting-notes>`**, and the tag name itself cannot be judged as custom. Previously, I only looked at the Enhanced Markdown format reference and missed this basis.

Current notion_meeting_notes additionally agrees on title/audio/language/transcript attributes, any block sub-content, and local transcription services; the complete fields and substructure have not yet been verified as official Markdown. Official samples or authorized API round-trip corpus are required for confirmation, and API JSON cannot be directly moved to XML attributes.

<a id="官方标签中附加的项目属性"></a>

## Project-specific attributes added to official tags

| Location | local extension | Active writer location |
| --- | --- | --- |
| column | width-ratio | [column-widths.ts ](../../src/blocks/column-widths.ts)'s columnWidthTransaction is dragged wide and then the text is written; API width_ratio does not prove that NFM uses width-ratio. |
| mention-date | reminder、reminder-offset、date-format、time-format、time-zone | [date-mention.ts](../../src/features/dates/date-mention.ts)、[date-view.ts](../../src/features/dates/date-view.ts)、[object-properties.ts](../../src/editor/object-properties.ts) The field will be generated; time enteredstart ofISO Date and time of officialstart/startTime/timeZone The agreement must also be verified. |
| synced_block / reference | id, auto-refresh, source-revision, snapshot-hash and local block location address | [object-views.ts ](../../src/editor/object-views.ts), [ synced-source.ts ](../../src/blocks/synced-source.ts) Write the local synchronization identity, CAS, and snapshot control information into the text; the official synced label does not prove the local protocol. |
| Toggle content / heading | open="true/false" | [notion-nodeviews.ts](../../src/editor/notion-nodeviews.ts) Click folding will write nfmAttrs and enter the original; HTML details's bulk open is not the same as the string protocol, the header end attribute. |

The above does not have independent local_* switches, so only checking the extended prefix will miss it. Official reference: [ Enhanced markdown format ](https://developers.notion.com/guides/data-apis/enhanced-markdown). Tables col width, align, etc. may be legal in other encodings, but the complete support for mapping to NFM needs to be verified. Legal HTML attributes are not directly regarded as official NFM attributes.

<a id="旧自定义指令仍有写入器"></a>

## Legacy custom directives still have writers

- `:::nest`/`:::children`/`:::endnest`: [ codec.ts ](../../src/markdown-engine/codec.ts) writeBlock and [ editor-markdown.ts ](../../src/document/editor-markdown.ts). Creating a new normal parent-child block, CommonMark + notion_nesting still generates these instructions; Notdown has generated official Tab indentation and cannot be confused.
- `:::columns` / `:::column` / `:::`: editor-markdown's columns branch and older analyzer. Similar to fenced Div does not represent upstream definitions of the syntax; modern paths use official columns labels, but historical writers still exist.
- `::page{id="…"}`：editor-markdown ofchild_page The branch.[markdown.ts](../../src/document/markdown.ts) old read rules. The existing page/mention-page or corresponding dialect link code should be changed.

The original text of old files, the literal text within the fence, and the recovery of unknown syntax should continue to be retained; not allowing new generation does not mean allowing deletion of the user's existing content.

<a id="markdown-lab-也有独立自定义插件"></a>

## Markdown Lab also has separate custom plugins

`notdown-bookmark`Inside the fence JSON is interpreted as a bookmark card, see [ model.ts ](../../src/markdown-lab/model.ts), [ plugins.ts ](../../src/markdown-lab/plugins.ts). [ main.ts ](../../src/markdown-lab/main.ts) Initial draft The default plugins is bookmark, and the example also has this fence. Code Fences themselves are standard syntax, but this specialized rendering protocol is defined by the project and is independent of the native editor's ten object switches.

<a id="不应误判的项目"></a>

## Items that must not be misclassified

- The official NFM's callout/details/columns/media/mentions/colors/underline, unknown, and well-founded Pandoc/MMD/Typora/Obsidian syntax should be retained. Implementation deviations and custom syntax are two types of problems.
- sourceFingerprint, syntaxForm, PM nodes, DOM data-*, CSS classes, drag and drop MIME and other internal structures that are not written into the text are not considered new Markdown syntax; the focus of the review is persistent output.
- There is a basis for the YAML syntax, and application fields such as page id/title and unknown user attributes are still retained according to existing constraints.
- `#page/<uuid>`It is a local address/identity protocol with `person://<uuid>`, not a new label delimitation syntax; it still needs to explain the boundaries that cannot be resolved across applications, and cannot pretend to be the Notion workspace identity.

<a id="验证与整改边界"></a>

## Validation and remediation scope

Temporary memory probe: After parsing ten object samples, clear the top-level original text reuse fields, and then construct a new document serialization. The results are saved in `test-results/custom-syntax-audit.json`, all ten items are enabled by default and the carrier can be regenerated; Meeting notes is distinguished by the above-mentioned official label/unverified contract. In addition, to reproduce the new parent-child block of CommonMark, write the nest instruction, and for Notdown, write the Tab indentation. No user files are operated.

The round of inspections and updates of regulations and restrictions has been completed.**The customized format modification is not yet complete when running**■ Rectification of the order: stop the creation of undocumented code by default and new paths; share existing writers for objects that can be expressed in standard grammar; mark the ability to fully express as a gap, not replenish the protocol; view status and local service status must not be continued to be mixed in the original language without justification; Old files retain recoverable content, migrate the integrity of the information to class-by-class verification, and avoid global replacement. Verification needs to cover new builds, edits, savings, restarts, disabling and code fences, and ordinary source code roundtrip cannot replace upstream compatibility verification.
