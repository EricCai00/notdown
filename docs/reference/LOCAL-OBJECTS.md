<a id="本地对象与服务"></a>

# Supplementary local content objects

**English** · [简体中文](LOCAL-OBJECTS.zh-CN.md)

For the current writing rules, see [. The reserved custom extensions ](NOTDOWN-EXTENSIONS.md): Web embed, bookmarks, Tabs, conference titles and transcriptions are changed to official carriers; the old attribute forms below are only historical records. Service and layout gaps remain as supplementary fields listed in the documentation.

2026-09-27：MCP It is clear.Tabs、DistrictsMeeting notes、HTML Annex to thisembed、Folder/Database The reference is already inNotdown withNotion Markdown Common support, see[The rules of grammar](NOTION-MCP-SYNTAX.md)。The followingTabs oftitle/active Attributes, meeting notesaudio/language It's the old one.Notdown Add code, with read and edit compatibility only; newly insertedTabs、The meeting notes are used in official form.`<embed>` Share `block.web_embed`The code is not available to the public, and it retains its own code in the URL attachment. This revision is prioritized by the following historical reference.

2026-09-22 dialect boundary correction: each dialect's default value is independently defined according to the upstream specification, and only Pandoc's own default default follows the Pandoc 3.11 snapshot. Nine types of local objects have been changed to independent plug-ins that are turned off by default and turned on in the page syntax panel; old text will not be migrated or deleted. Default rule isolation, explicit enablement, and parsing/command/directory unified gating have been implemented; full upstream consistency or cross-end synchronization has not been claimed. For details, see [ Dialect Checking and Plug-in Description ](DIALECT-CONFORMANCE.md); if the historical description below conflicts with it, this revision shall prevail.

2026-09-22. See [ object Roadmap ](../architecture/CONTENT-OBJECT-ROADMAP.md) for itemized capabilities. implemented represents the local editing/save path with this line description, which does not mean that any dialect is fully compatible or that real external services have been called. Character classes continue to serve as a showcase for text processing capabilities.

<a id="编辑与编码"></a>

## Editing and encoding

The title, font, selections and sequence of the Tabs page can be edited and removed. Web bookmark's URL, the title, description and images are filled in by the user. Link preview supports real-time previews of GitHub repositories, PR/Issue, code and OneDrive / SharePoint files, while other websites retain static cards. Select common links, inline references or cards. [Link Preview](../features/LINK-PREVIEWS.md)Breadcrumb uses an inline page icon, name and slash separation with no outer frames, suspended and keyboard focus to display background; paths show the parent chain of the current page in free time, the orderly page path ID is still preferred, and the missing/recycled site page displays uncliced positions. Auto paths are not written in the original. The image's alternate text and footnotes are saved respectively. HTML embed is a separate iframe from HTML block that disables the script.

Local labels include `tabs/tab`、`bookmark`、`link-preview`、`breadcrumb`、`button`、`meeting-notes`、`ai-block`、`web-embed`、`figure`They are locally encoded objects.**Not all of them.Notion officialMarkdown Labels**。

`web-embed` The currentTypora iframe、officialNotion embed SharedPM `block.web_embed`。`editorRepresentation` Record their respective coding; do not write internal fields to Markdown.`html-embed` The tag and the independent HTML input have been removed.

The Web embed panel supports the HTTP (S) link, and uploads/drags of HTML files. HTML files are first saved as API in the vault. `assets/*.html`After confirmation, submit only the attachment URL to the document; unsubmit, fail to retest, external update or page switching, close old draft, delay upload results cannot cover new content. Independent attachments after upload will not be removed due to revocation. Resource response also mandates sandbox, allowing in-line style with data images. Remote web pages are still restricted to embedding at target sites. HTML does not automatically copy the relative resources. Old content uses explicit migration scripts extracted as attachments, and is preserved and preserved in the original text history according to CAS. The code fence example is not rewritten.

```markdown
<tabs active="0">
<tab title="First">
Editable content
</tab>
<tab title="Second">
More content
</tab>
</tabs>

<bookmark url="https://example.com" title="Example" description="Manual metadata"/>

<ai-block prompt="Summarize the following text" model="">
Text to summarize
</ai-block>

<meeting-notes title="Meeting" audio="assets/recording.wav" language="en">
Editable notes or transcript
</meeting-notes>
```

Unmodified blocks reuse the original text; edited objects retain unknown tag attributes. Invalid or unclosed containers retain the original text. Each table encoding shares a model, and the merge operation is only enabled when the current configuration can express the span. Raw source / Raw TeX retains the target format and can edit the source code, without assuming that the browser can render all formats.

Block properties and metadata fields from the drag-and-drop menu **Properties…** Open the pop-up window and no longer occupy the folding panel in the original text. Fields are preserved in the window draft, with Save as a revocable update submission; Cancel/Escape discards the draft, blocks are updated or removed and old values are prohibited from covering it. The activity labels of Tabs and the headings of each Tab are edited separately from the menu of the corresponding blocks. The image, the original format content, the reference, the quotation, the footnote references can still be edited by the attribute/source; the shortening and replacement of the tag retains the attribute panel. Pandoc example list is used `(@label)`References to use `@label`• Native div/span and Small caps and inline notes are analyzed by the extended switch. • Page cover is saved to `properties.cover`；Edit the official data field independently of the outer layer of the pageYAML，Unknown fields are reserved.MMD Limitations See[Principles of data](../architecture/METADATA-AND-COMPATIBILITY.md)。

<a id="openai-compatible-服务"></a>

## OpenAI-compatible services

Settings → OpenAI-compatible services configures API endpoint (e.g. `https://api.openai.com/v1` ), Text model , Transcription model and API key . Model ID is provided by the service provider; the application does not hardcode the model. The endpoint accepts HTTPS or native HTTP without credentials, query parameters, or fragment .

- Generate: POST `/chat/completions`, non-streaming, sends prompt, current block text and model. The result is an editable paragraph that can be undone.
- Transcribe: POST `/audio/transcriptions`, multipart files and models, optional language; the audio must be in this vault assets, the maximum is 25 MB (the application upload limit is 20 MB). The result is an editable paragraph.
- When the block has been edited during the request, the results are only displayed in the status area and are not replaced with new content. If failed, keep the original text. Maximum of two parallel requests, 120 second timeout.

The settings are saved to the current vault `.notdown/services.json` and API key are local clear text fields and do not enter page Markdown, browser persistent settings or GET settings responses. The empty password box retains the old key and is cleared only when Remove saved API key is checked. When backing up the vault, you need to handle the file according to your own key management method. Only send corresponding text or audio when the corresponding action is clicked.

Agreement basis: [ Chat Completions ](https://platform.openai.com/docs/api-reference/chat/create), [ Audio transcriptions ](https://platform.openai.com/docs/api-reference/audio/createTranscription). Compatible services may only support one of the interfaces; automated testing uses simulated services, and real accounts are configured by users in the application.

<a id="本地执行边界"></a>

## Local execution boundaries

### Button

Reference [Notion Buttons](https://www.notion.com/help/buttons) The click execution, turning configuration, multi-step movement with four insertion positions; external reference[Official configuration screenshot](https://www.notion.com/help/guides/automatically-generate-blocks-pages-with-buttons). Notdown's `<button>` Yes `notion_button` Plugin coding, not the official Notion Enhanced Markdown automation format.

The button body only displays the name and optional emoji , and no longer displays another Run button control. Hover/keyboard focus shows gear, Properties... also opens the same inline configuration. Real-time preview of name, icon and style; Done submission, Cancel/Escape undo configuration draft, external updates will not overwrite old values. Supports actions to add, delete, copy, move up and down, up to 50 steps.

`actions` For theXML The TranslationsJSON The number of`action/target` Compatibility with reading, existence `actions` Priority is given to illegal JSON that does not retreat from the old action. The original word-for-word not modified is retained, and the unknown tags and action fields are retained after modification.

```markdown
<button label="New task" icon="＋" variant="default" actions="[{&quot;type&quot;:&quot;insert-blocks&quot;,&quot;position&quot;:&quot;below&quot;,&quot;content&quot;:&quot;- [ ] New task&quot;}]"/>
```

- `insert-blocks`: `content` is Markdown interpreted according to the dialect of the current page, and the configuration interface provides source code input and preview; `position` is `above/below/start/end`. Multiple co-located steps maintain configuration order; check template boundaries after parsing, and do not allow unclosed code/containers to engulf adjacent content.
- `confirmation`: `message` is plain text. After all confirmations are passed, the text will be submitted uniformly. If any one is canceled, the whole group will not modify the text. If the page is modified while waiting, it will terminate. Click again to try again.
- `open-url`: `target` is `#page/<id>` or HTTP (S) URL, which can only be used as the last step; the local page uses the existing collection input and save navigation, and the external link opens a new tab and provides a link fallback when the browser intercepts it.
- The old `insert-text` maintains plain text semantics, and the old `toggle-tasks` maintains the to-do reversal behavior of the current page; both are only for compatibility with existing configurations and do not pretend to be Notion native actions.

One execution corresponds to an independent undo record, which is still saved by page `baseRevision`/CAS. Read-only previews cannot be executed or configured. Database additions, notifications, emails, Webhook, variable formulas, cloud linkage or native block template editors are not supported; the style currently provides default strokes, gray background and blue background.

<a id="日期提醒与同步块"></a>

### Date reminders and synced blocks

Date mentioned reminder is ISO datetime, for example `<mention-date start="2026-10-01" reminder="2026-10-01T09:00:00+08:00">Review</mention-date>` . Check when the app is opened, and reissue unconfirmed reminders when it is reopened; system notifications need to be authorized in Settings. It is not a background operating system task.

The source of Synced block uses `<synced_block id="shared">…</synced_block>` and the reference to URL is `#page/PAGE_ID#block=shared` . The upper right toolbar provides synchronization location, copy and cancel synchronization. The new replication reference uses only Notdown enabled `auto-sync="true"`, same-page transaction linkage, cross-page automatic CAS publishing and refresh when opening. Old snapshots remain Refresh from source/Publish to source in the menu; Toggle live refresh checks the source every two seconds and pauses replacement after local editing. Release uses captured revision, generates recoverable conflicts and pauses when the source changes, and does not force overwriting. Unopened pages retain the last snapshot; real-time collaboration and cross-device transfer are not implemented. See [ sync block description ](../features/SYNCED-BLOCKS.md).

Pandoc Read the information in this librarybibliography，Select local self-containedCSL，Use installedPandoc Sandboxciteproc。Do not execute arbitrarilyfilter，No downloadCSL；Failed to keep citations.HTML Exporting reserved citation marks without waiting for a discrepancyciteproc。

`sourcepos` Provide a block-level linear range;`rebase_relative_paths` The treatment hassourcePath ofMarkdown The following is a list of links to the website.`markdown_in_html_blocks` It supports Div containers.`gutenberg` The local execution paths are not the same as the local execution paths.Pandoc All of them.reader/writer The whole thing is.
