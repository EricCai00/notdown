<a id="notdown-保留的自定义正文扩展"></a>

# Retained Notdown extensions and official alternatives

**English** · [简体中文](NOTDOWN-EXTENSIONS.zh-CN.md)

Notdown gives priority to the existing Markdown dialect and official Notion Markdown; only when the corresponding ability cannot be fully expressed, the following supplements will be retained. Based on: [ Notion v1 ](https://developers.notion.com/guides/data-apis/enhanced-markdown), [ Notion v2 ](https://developers.notion.com/guides/data-apis/notion-flavored-markdown), [ Verified MCP specification ](NOTION-MCP-SYNTAX.md). Local editable and reopenable does not equal Notion. The cloud will accept or retain supplementary fields.

<a id="已采用官方替代的写法"></a>

## Syntax replaced by official alternatives

| old local expression | Current writing and retention content |
| --- | --- |
| `span bg_color` | Nested `span color`, background name with `_bg`; retain two color channels. |
| `web-embed url/caption` | `<embed source="URL">题注</embed>`;Retain URL, caption and necessary layout fields. |
| `bookmark url/caption` | `<bookmark source="URL">题注</bookmark>`;Retain URL, caption and manual preview information. |
| `tabs active`、`tab title` | Official tabs/tab, the title is written as the text; the order and content are retained, and the selected tab belongs to the interface state. |
| `meeting-notes title/transcript` | The title text is the same as the official notes/transcript partition; the service settings are unified into the existing `meeting-config`. |
| `column width-ratio` | Official `ratio` percent; retains valid column widths and unknown properties. |
| The entire ISO date and time, old time distinguished name | Ability to accurately express time into official date, time, and time zone format without rounding or guessing. |
| folded/titled`open="true/false"` | The expanded state is no longer written in the text. Expanded and collapsed belong to the interface state. |

The Notdown collection can read these official carriers without cutting the entire page into v2. Strict `notion-markdown` is still processed as the selected version. `span underline="true"` is the official v1, and `u` is the official v2, neither of which is self-created by the project.

The old carrier is stopped as a new build, edit output; history and unknown origin can be restored. This time, it is only migrated with user permission.Default、Notion test The validation ofNotdown The code, the example in the unknown container, is not converted; the conflict properties and ineffective boundaries are not guessed.

<a id="保留的块和行内载体"></a>

## Retained block and inline representations

| Writing method | Content | Why the official grammar cannot be completely replaced |
| --- | --- | --- |
| `<page-link url="…">标题</page-link>` | Non-owning page blocks | Official page represents subpages; ordinary links can navigate, but cannot represent the same block type and ownership semantics. |
| `<breadcrumb path="…"/>` | Optional page ID path; empty value automatically takes the ancestor chain | Official Markdown does not have dynamic local level navigation; fixed links cannot be updated with levels. |
| `<button label="…" icon="…" variant="…" actions="JSON"/>` | Local action steps; old action/target can be restored | Official Markdown cannot carry action protocols such as local insert blocks and open targets. |
| `<ai-block prompt="…" model="…" generate="…" using="…" context="…" search="…">正文</ai-block>` | Service configuration and areas involved in generation | Official Markdown does not have local AI service and generation zone contracts. |
| `<mention-link url="…">标签</mention-link>` | Createable local inline preview objects, custom labels | Official v2 link-preview is a read-only markup that lacks local preview creation and labeling contracts; normal links are another inline object. |

URL, names, and actions are syntax data and do not automatically authorize external access or execution. Unknown actions/fields are not executed as arbitrary scripts.

<a id="官方标签上的必要补充"></a>

## Necessary additions to official tags

| Location | reserved fields | Official format gap |
| --- | --- | --- |
| bookmark | `title/description/icon/image` | Card preview information filled in manually, saved offline, or captured. Sources and captions have been officially coded. |
| link-preview | local card`title/description/image/caption` | Local display information; local creation behavior cannot be passed off as write capability of Notion read-only tags. |
| embed | `title/width/height/align` | Attachment name, preview size and alignment. |
| Date | `reminder/reminder-offset/date-format/time-format` | Reminders and local preferences.date oftime-zone、v1 timeZone It is the official field. |
| Date precision/time zone exceptions | old ISO `start/end`, old`time-zone` | Seconds/milliseconds, fixed offset or conflicting fields cannot always be converted to HH:mm + IANA time zone losslessly; the original value is retained without rounding when verification fails. |
| synced block/reference | `id/source-revision/snapshot-hash/auto-refresh/auto-sync` | Local block positioning, CAS version, snapshot and refresh strategy; official URL does not provide local synchronization protocol. |
| meeting-notes | `meeting-config` JSON | Local transcription/generation service, audio attachment, language, prompt word configuration; old audio/language merged into this configuration. |
| Code caption | fence's `caption` Attributes | Property delimitation reuses Pandoc; the native display semantics of caption are not official Notion code properties. |

Example: Official carriers only attribute missing information.

```md
<bookmark source="https://example.com" title="手工标题" description="离线说明">题注</bookmark>

<embed source="assets/example.html" width="80%" height="400" align="center">说明</embed>
```

Table span, caption, and alignment can be expressed in Pandoc/MultiMarkdown by reusing existing syntax without creating a new XML table protocol. Unknown extra fields are still retained and are not automatically executed by name.

<a id="地址版本与开关"></a>

## Addresses, versions and switches

`#page/<uuid>`, `person://<uuid>` is a local address convention, borrowed from a link/mention carrier, not a new Markdown delimited syntax, nor does it pretend to be a Notion page or user:// identity.

Custom behavior is limited to `syntax.variant: notdown` and must comply with relevant extension switches. Explicit true in other dialects cannot cross-border to enable local protocols; strict official mode does not give supplementary fields local semantics. Unknown source text, invalid boundaries, and conflicting fields can be restored to preservation.

Generation of the old `:::nest` , `:::columns` , `::page` , `html-embed` , standalone figure attribute vectors, and Lab bookmark fences has been discontinued. Fences, HTML, Pandoc attributes, CriticMarkup, Obsidian, Quarto, R Markdown and other existing syntaxes are not self-created by the project.

Implementation: [ vector normalization ](../../src/document/canonical-notion.ts), [ explicit conversion and consistency check ](../../src/document/canonical-source.ts), [ attribute boundary ](../../src/document/notdown-boundary.ts). For migration and historical conclusions, see [ 2026-10-27 audit ](../audits/CUSTOM-SYNTAX-AUDIT-2026-10-27.md).
