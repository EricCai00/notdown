<a id="当前自定义正文写法与背景色迁移"></a>

# Current custom syntax and background-color migration

**English** · [简体中文](CUSTOM-SYNTAX-AUDIT-2026-10-27.zh-CN.md)

<a id="后续官方载体统一"></a>

## Follow-up: unifying official representations

Users further requested the removal of item writing that could be fully expressed by the official grammar. For the current contract, see [ retained custom extensions and official replacement ](../reference/NOTDOWN-EXTENSIONS.md); the "Still Existing" table below is an audit snapshot before this round of modifications.

This round replaces Web embed, bookmark URL/ title, Tabs title/activity item, conference title/transcription, valid column width alias, verifiable ISO date and time, and stops writing the folded status to the text. Card caching, layout, local reminders, synchronization and service configuration are only retained if there is no official corresponding semantics. Unknown properties, codes, and unknown containers are protected by source boundaries; conflicting properties are not translated guesstimately.

Pre-check first and then back up.createVault/baseRevision Save and review:Default scan219 page, modify6 page,Notion test scan137 page, modify2 page; two-stage conversion/clean up17 blocks. Repeat preflight remaining convertible items are0，767 an existingNotion Import archive itemized hashes unchanged.

First stage full backup: `D:/ProgramData/Notdown/backups/canonical-syntax-20261027-231458/`; folded state stage full backup: `D:/ProgramData/Notdown/backups/canonical-view-state-20261027-231944/`. Native plan, page-by-page old/new hashing and revision, results in `.run/logs/canonical-vault-carriers.json`, `canonical-vault-migration.json`, `canonical-vault-verification.json` respectively. Old backups, history and imported archives are not format converted.

Verification: All unit test files are grouped and executed.1183 I'm going to go through this.5 The first is the jump.R notebook The document3 The project is to operate independently and withdraw after the completion of the affirmative action to avoid theWindows worker The remaining handles caused the hanging, the rest1180 Normal exit. Modified carrier/Literary headings/Date/Border specials29 The following are the results of the survey:Chrome Back to batch coverage46 The first is the "Blood" and the second is the "Blood".Tabs、The meeting, the width of the column, the official boundaries and thev2 Import. First round of old coding statements, updated old menu locations; onceECONNRESET The bookmark test is a separate and repeated test.20 After the completion of the test, the test service was suspended and the independent service was terminated manually; the final boundary2 The document is normally passed at another independent port. This record does not represent the entire port.E2E The directory is approved.

Final installation package: `.run/desktop-release/Notdown-Setup-0.1.5-canonical-syntax-x64.exe`, 205253210 bytes; installation is not overwritten after generation. The log is located at `.run/logs/canonical-syntax-*`. Escaped tags/formatting characters in titles are converted to maintain literal meaning and are neither misinterpreted as mentions nor re-escaped; unverifiable boundaries still refuse to be converted.

<a id="早先bg_color-退役与审计"></a>

## Earlier: retiring and auditing bg_color

2026-10-27. Check current parsers, writers, object instances, and property boundaries against [ Enhanced Markdown v1 official specification ](https://developers.notion.com/guides/data-apis/enhanced-markdown) and [ Notion-flavored Markdown v2 official specification ](https://developers.notion.com/guides/data-apis/notion-flavored-markdown) . This record overwrites obsolete classifications from older audits. The label is official, but it does not mean that the local attached attributes are also official; internal model fields, DOM data attributes and text encoding are checked separately.

<a id="bg_color-已退役"></a>

## bg_color has been retired

All Notdown color editing paths uniformly output existing `span color`，Including nov2 The markNotdown The page:

```md
<span color="red"><span color="yellow_bg">红字黄底</span></span>
```

The self-created text attribute `bg_color` no longer participates in color analysis; the literal source code is retained when encountering the entire span. The background channel in the internal model still exists for independent editing and rendering, but it is not written to Markdown as this attribute. The menu capabilities of Notion Markdown v1 maintain the original single color limit; the two channels of v2 can be set independently. The nested form has an official syntax basis, and local display and saving have been verified. It is not claimed that the Notion remote end can retain dual colors in the same row range back and forth.

The user explicitly authorizes the migration of **Default and Notion test**, overriding the default rule of this project that usually does not migrate user content in batches. Save and exit the desktop program first, and then back up the two complete vaults; it will not be automatically expanded to other libraries.

| Vault | Scan activity Markdown | Modify page | Convert span |
| --- | ---: | ---: | ---: |
| Default | 219 | 2（Subpage、Tests） | 5 |
| Notion test | 50 | 0 | 0 |

The complete backup directory is `D:/ProgramData/Notdown/backups/bg-color-retirement-20261027-011206/`, including `Default.zip` and `Notion-test.zip`. The archive is unpacked, read, and reconciled with all pages and metadata versus SHA-256 of the pre-migration content; the migration record is in native `.run/logs/bg-color-migration.json` .

The transformation only targets the pair span in the traversable source code, and does not replace globally: fence-jumping, inline code, unknown containers, and literal mentions. Unknown attributes and text are retained; the source code cache is removed from the parsing results before and after migration, and the colors are normalized and compared one by one. actual preservation history `createVault.update` When passing in the read `baseRevision`, try again without conflict. Existing imported archives, backups, and historical texts will not be converted; normal saves will still record new versions.

<a id="仍存在的自定义写法"></a>

## Remaining custom syntax

The following table lists local conventions and does not rule the entire official label of the same name as private. Only `bg_color` is removed in this round, and the remaining items are not modified.

| Category | Current project writing method | Assessment and existing alternatives |
| --- | --- | --- |
| Web page embed vector | `<web-embed url="…" title="…" caption="…" width="…" height="…" align="…"/>` | Project custom vector. Official v2 already has `<embed source="…">题注</embed>`; Typora/raw HTML also has iframe. Supplementary fields such as size, alignment, title, etc. need to be placed separately, and the entire block cannot be replaced without validation. |
| Card supplementary code | local `<bookmark url="…" title="…" description="…" icon="…" image="…" caption="…"/>`; with `title/description/image` of local `<link-preview>`、`<mention-link>` | Bookmark and link-preview themselves have official forms; the card metadata and locally createable behaviors described above are project extensions. Official v2 link-preview is a read-only mark and local cards cannot claim equivalence simply by changing their name. |
| Non-owning page blocks | `<page-link url="…">标题</page-link>` | Project vector for Link to page. Official `<page>` represents the subpage of the current page; changing it to page will confuse the ownership relationship. Normal Markdown links/mentions are navigable, but not of the same block type. |
| Breadcrumbs | `<breadcrumb path="…"/>` | Project vector and path fields. When the path is empty, the navigation is calculated based on the local page level. |
| action button | `<button label="…" icon="…" variant="…" actions="JSON"/>`, legacy `action/target` | The project action protocol is not a HTML button native behavior, nor is it an official Markdown button contract. |
| AI block | `<ai-block prompt="…" model="…" generate="…" using="…" context="…" search="…">…</ai-block>` | Project container and local service configuration. |
| Local properties for official blocks | embed's `title/width/height/align`;collapse/title `open`;Code caption;Column old `width-ratio`;Table extra properties | Attribute semantics are supplemented by items. The official column width already has `ratio`, and new ones will use it; files with only the old column width may still write the old alias when dragging. Code fence attributes, table spans/captions can reuse existing syntax such as Pandoc, but borrowing syntax does not mean that these attributes belong to the official Notion. |
| Date enhancements | `reminder/reminder-offset/date-format/time-format`, old mention-date's `time-zone` Agreement with ISO start/end | Alert and display formats are native extensions. **official v2 `<date time-zone="…">` itself is the official attribute** and cannot be deemed private as a whole because of the same name. |
| Local sync controls | synced block's`id/source-revision/snapshot-hash/auto-refresh/auto-sync` | Tags have an official basis and these localization, versioning and refresh controls are project extensions. |
| Meeting notes configuration | `meeting-config`, as well as the old `title/audio/language/transcript` attribute form | meeting-notes and partition labels are official; transliteration service configuration, local audio association, and legacy attribute-style titles are project additions. Create new notes with official title text and sections. |
| Old Tabs properties | `<tabs active="…"><tab title="…">…` | tabs/tab is the official label; `active` and attribute `title` are old local formats, and old content can still be read and edited. The new one uses the official title text. |

Other local addresses agreed `#page/<uuid>`、`person://<uuid>`，They refer to the local pages and contacts separately; they borrow from existing links/References to grammar, not newMarkdown Definition markers, but other applications do not have to be analyzed.Notion of`user://` I.D.

<a id="不属于当前自创语法的内容"></a>

## Content that is not currently custom syntax

- `<span underline="true">…</span>` It's official **v1** The document explicitly lists the underlined form, v2 is changed to `<u>…</u>`；It's not just the opposite.v2 I'm just going tov1 The written code is self-created. The official syntax of different versions should be distinguished by version.
- `<page>`, `<folder>`, `<database>`, `<tabs>/<tab>`, partition `<meeting-notes>`, `<mail>`, `<custom-block>`, `<external_object_instance>`, v2 bookmark/embed/link-preview: all have official basis, and the versions and additional attributes must be distinguished.
- Pandoc attributes/tables/citations, MultiMarkdown, CriticMarkup, Obsidian wiki and block references, Quarto/R Markdown, GFM, etc. already have syntax, and it does not become self-created just because it enters the Notdown collection.
- The actual Notion REST output is seen `<code>…</code>` It is an upstream observation format, not included in the documentation of the v2 that was examined. Notdown is read-only, strictly the official mode retains the literal source code; it is not a permanent protocol for the new design of the project.
- deactivated `:::nest`、`:::columns`、`::page`、`html-embed`、Independencefigure The characteristic carrier, andLab The Oldbookmark The fence should not be listed as a current newly constructed output. Unknown original restored preserved does not represent compatibility execution.

<a id="实现与验证"></a>

## Implementation and validation

Main basis: [ color writing ](../../src/document/editor-markdown.ts), [ general analysis ](../../src/markdown-engine/codec.ts), [ Notion analysis ](../../src/document/notion-markdown.ts), [ object encoding ](../../src/document/object-codec.ts), [ object field ](../../src/document/object-model.ts), [ attribute boundary ](../../src/document/notdown-boundary.ts), [ v2 encoding ](../../src/document/notion-v2.ts).

- Directional Color/Notion Unit Test: 53 passed.
- Full unit test: 1107 passed, 5 skipped, 0 failed.
- `npm run build` passed.
- Chrome return of the independent temporary vault: `selection-menu.spec.ts` and `notion-v2-import.spec.ts` share 19, covering the two-color menu, clear, undo, save, reopen and import complementary colors of the old version of Notdown/v2. This is not all browser use case acceptance.
- After migration, re-reading confirms that the old attributes of the two library activity bodies are 0; the two modified pages have the same hash as the migration record, and the item-by-item hashes of the imported archive files of Notion test and 289 remain unchanged.
- `npm run desktop:dist`Passed, the installation package is `.run/desktop-release/Notdown-Setup-0.1.3-standard-colors-x64.exe` (205187293 bytes). This round of generation of installation packages has not overwritten the installed programs; the old programs have been saved and exited.
