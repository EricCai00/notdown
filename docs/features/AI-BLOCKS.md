<a id="ai-block-配置与生成"></a>

# AI block configuration and generation

**English** · [简体中文](AI-BLOCKS.zh-CN.md)

2026-09-27. Supported only when `syntax.variant: notdown` and `notion_ai_block` are enabled; official `notion-markdown` is not enabled, even if the extension switch is explicitly turned on.

Newly addedAI block Open the configuration panel, enter and select instant access to document transactions, switchPage / Source Or downloaded from the original saved link in front of the page.Done Upload configuration; upper right cornerSettings The icon is reopened;Generate The call is openSettings ConfiguredOpenAI-compatible Service. Lack of configuration, absence of references or failure of requests will display errors and retain original content.reader Resolved to be editableMarkdown，Support for withdrawal. Results are displayed in the status area when the current document changes during the generation period, and do not cover the changes; leaving the page or deleting the node invalidates the results to be processed.

Use the `<ai-block prompt="…" model="…">Markdown 正文</ai-block>` attribute carrier and add optional attributes:

The generated result state is presented according to the text card: Good response / Bad response, Settings, and blue Generate are in the upper right corner. The feedback buttons are mutually exclusive and can be canceled by clicking again. They are only saved in the session state of the current node view, do not send to the server, and do not write Markdown; they are cleared after the text changes or is reopened. The Generate and feedback buttons are disabled during generation, and existing results remain editable; no additional Done status line is displayed after success. Settings / Done switch only hides or displays the main text, without replacing the generated content. Summary and bullet point presets hide custom prompts, mentions, and contextual controls, display fixed-center descriptions, and read-only Current page only.

| Properties | Values and behavior |
| --- | --- |
| `generate` | `custom`/ `summary` / `key-points`; the latter two display fixed summary/key points and only use the current page; the saved custom prompt/context/search is retained and restored when switching back to custom, and does not participate in the default request |
| `using` | `current-page`/`specified`; the former uses the current text in the editor, excluding AI block output; the latter uses context |
| `context` | XML escapes existing `<mention-page>`, `<mention-user>`, and `<mention-date>` fragments; no new reference protocol is created |
| `search` | `selected`/ `vault`; when specifying the context, the former only takes explicit references, and the latter matches the local page title according to the prompt word terms, and can add up to 5 pages. |

The @ menu and context menu in the prompt word both provide local pages, contacts, Today / Tomorrow. The page is saved stably in `#page/ID`, the contact is reused in `person://ID`, and the date is saved in the local calendar date when selected; the interface is displayed as a label. Person context includes name, organization and remarks, and is not equal to Notion members. Unknown fragments are not deleted by removing the tag next to them. The new settings will not batch migrate old files; old blocks without generate / using settings continue to have the original block text as additional input, retaining the old workflow. model can still be set via block properties. Original text and unknown XML attributes follow the codec retention rules.

The current page context uses unsaved editor content; other pages are read from local API. The corresponding context is sent to the configured service when Generate is explicit. Cross-page reading is the current snapshot of each page, and cross-page transaction snapshots are not provided. There is no Notion search, account invitation, member permissions, reminder scheduling, network search, vector retrieval or automatic update; local CAS and conflicting copies do not equal cross-end synchronization.

Verify: `tests/unit/ai-context.test.ts`, `tests/e2e/ai-block.spec.ts` and existing `tests/e2e/object-services.spec.ts`; write the screenshot to `test-results/ai-*.png`.
