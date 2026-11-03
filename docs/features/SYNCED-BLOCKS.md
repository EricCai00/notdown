<a id="本地同步块"></a>

# Local synced blocks

**English** · [简体中文](SYNCED-BLOCKS.zh-CN.md)

2026-09-27. The synchronization block uses a single ProseMirror document. The ontology and reference snapshots are saved in Markdown and are not connected to the Notion cloud service.

<a id="操作"></a>

## Operations

- Use the insert menuSynced block，or blockhandle menuTurn into → Synced block。Continuous multiple selections can be included in a container together; existing synchronized blocks and their internal transformations are no longer nested.
- Hover or focus to display a light warm thin border and a floating toolbar on the upper right; the toolbar uses a light gray stroke and light shadow, the text follows the page font, and no additional toolbar space is reserved above the block.
- When the location or more menu is opened, the synchronized block of the current operation is marked with a light blue background. The location menu lists the usage locations according to the real page icon, name and parent page, marked Original and This page, and supports page jump; the path is not displayed when there is no parent page. Bottom Learn more about Synced blocks opens local operating instructions. The menu will adjust its position at the edge of the window and can also be operated with the arrow keys, Home / End and Escape.
- Copy synced block first collects and saves the current page input, and then copies and references Markdown. The unnamed ontology is stable UUID at this point; references still point to the original ontology and no reference chain is created. Reasons for copy failures or save conflicts are displayed.
- Paste the content into another Notdown page. New references enable automatic synchronization. Same-page linkage and editing are combined into one transaction; cross-pages are published about 900ms after editing stops, and clean copies are opened to check the source about every two seconds.
- More menus retain manual Refresh from source / Publish to source, the old read-only direction live refresh switch, and the new auto-sync switch. Manual refresh explicitly replaces the current snapshot with the source and can be undone; automatic refresh does not replace local edits.
- Unsync Unlocks the current copy container and retains its rich text body, reversible. Ontology refuses to unsynchronize when there are still copies, and you need to cancel the copy synchronization one by one to avoid silently generating invalid references; cross-page batch de-synchronization is not available at the moment.

<a id="存储与冲突"></a>

## Storage and conflicts

Reuse `<synced_block>` / `<synced_block_reference>` without introducing new text tags. References to URL are `#page/PAGE_ID#block=BLOCK_ID` .

Only `syntax.variant: notdown` gives `id` , `source-revision` , `snapshot-hash` , `auto-refresh` , `auto-sync` native behaviors. New copy references are written to `auto-sync="true"`; old files are not migrated, and old live refresh behavior is not automatically upgraded. The official `notion-markdown` will retain the content containing supplementary attributes as the original text, and will not be enabled out of bounds by explicit expansion switches.

Source code is written in the existing createVault page, API, and carries captured data. `baseRevision`Controversy does not force retesting, services retain source and submission content; editors suspend automatic syncing of the copy and retain local text. Asynchronous responses to document, target, edit status and view lifecycle checks, and no publication or replacement of text in the input law portfolio. Unknown properties and code fences are maintained by existing Markdown codec.

Unopened pages retain the last saved snapshot and read local sources after opening. Directly changing the ontology or reference in Source mode will save Markdown first; automatic synchronization only runs in the editable Page projection. External URL, unauthorized notice, and unlocatable sources retain snapshots and do not write to Notion. This feature is not cross-device transfer, collaboration, or universal file synchronization.
