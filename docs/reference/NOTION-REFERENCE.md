<a id="notion-交互参考"></a>

# Notion reference

**English** · [简体中文](NOTION-REFERENCE.zh-CN.md)

Recording date: 2026-09-12. The current editor is a single ProseMirror document, which has replaced the earlier block-by-block Vditor. The following distinguishes between reference, implementation and test scope.

<a id="依据"></a>

## Evidence

This round is read only through Computer Use to view the native Notion "Notion vs Markdown" page, verify the actual text, nested list, sidebar and left blank; no editing of the Notion page. [The Notion editing base](https://www.notion.com/help/writing-and-editing-basics) and [Keyboard operation](https://www.notion.com/help/keyboard-shortcuts)。

It adopts the interactive methods of input within the text, block menu, list item level, and page link node. According to the user's explicit request, the left side of the block only displays a six-point handle when hovering, without a plus sign; Ctrl+E is used for page/source code switching. All interactions have been implemented without replicating Notion brand assets or claiming a complete product.

<a id="本地-clone-的具体参考"></a>

## Specific references from local clones

The following paths are relative to `D:/Workspace/note-app` and the upstream directory has not been modified.

| Files | Read implementation | This project corresponds to |
| --- | --- | --- |
| `AFFiNE/blocksuite/affine/blocks/list/src/commands/indent-list.ts`、`dedent-list.ts` | Each list item is independent and holds children; indentation and promotion change the tree structure and restore the selection | `editor-blocks.ts`Move subtree using independent list_item , Tab/Shift+Tab |
| `AFFiNE/blocksuite/affine/blocks/note/src/commands/indent-block.ts` | Parent-child block operation is a document structure update | Dragging the parent item carries the subtree, and the subitems are positioned independently; moving into descendants is prohibited |
| `AFFiNE/blocksuite/affine/widgets/slash-menu/src/widget.ts`、`slash-menu-popover.ts` | Real selection, query filtering, IME protection, command text consumption, monitoring and cleaning | `editor-slash.ts`Read the query from PM transaction/selection; `main.ts` displays a menu that does not steal the focus |
| `AppFlowy/frontend/appflowy_flutter/lib/plugins/document/presentation/editor_plugins/mention/mention_page_block.dart` | Page mentions are nodes with pageId, displaying titles and icons | `editor-links.ts`Page atom NodeView , keep visual display, navigate by stable ID |
| `anytype-ts/src/ts/component/menu/block/add.tsx`、`context.tsx` | Query and keyboard activity items, process selections before operation | Local slash menu, six-dot convert/copy/delete menu |
| `anytype-ts/src/ts/component/menu/search/object.tsx` | Centralize search, activity results, close and unbind | `page-search.ts`Local match and `main.ts` search popup |

These are interaction and structural references that do not introduce the upstream CRDT/ object store and do not treat its database as a second authoritative source for Markdown.

<a id="当前实现"></a>

## Current implementation

- `prosemirror-editor.ts`: A continuous EditorView, history is shared by selection, text editing, and structure changes. The text does not have an edit box mounted block by block.
- `editor-schema.ts`/`editor-markdown.ts`: The file is parsed into a temporary edit tree, and each modification is serialized back to Markdown. The source slice is retained without changing the top-level content, and unknown syntax is safely retained.
- `editor-slash.ts`Separately: `/` The following is a list of the topics covered: `、`、Select, delete and combine input status.Vditor The whole thingpre The problem of block code in the editing area has been eliminated.
- `editor-links.ts`: The in-line page mention displays the icon and current page name; the link to the page displays the entire line entry. Markdown is not expanded when the cursor passes; ordinary external links are always text with mark. Ctrl+K Explicitly edits URL.
- `editor-blocks.ts`: Each todo/bullet is an independent list_item; the parent item is dragged as a whole, and the nested items are dragged independently; the formation of a parent-child loop is prohibited. Fixed the position of the handle after pressing it to prevent hover from preemptively switching rows when dragging quickly.
- `editor-convert.ts`/`editor-input-rules.ts`: Transform the current item without changing its siblings; Markdown input and menu transformations maintain the same nesting rules; code transformations preserve the readable content of page/attachment atomic nodes.
- `main.ts`: Ctrl+E captures input before switching source code; in-page slash menu, page entry and search. `/link` inserts page blocks, `/mention` inserts inline mentions.

<a id="实测与边界"></a>

## Testing and limitations

Independent Chrome E2E coverage: single `/` completion and focus, Markdown title and list input, Enter, Tab/Shift+Tab, item-by-item todo, fast parent drag and subtree/undo, independent child drag/save/refresh, links not expanded, nested item copy and delete, single item type conversion. Screenshots are in `test-results/slash-menu.png` and `test-results/page-links.png`, have been viewed. The test uses a temporary vault and does not connect to the user's browser.

Tables and unknown extensions are currently displayed safely and the source code is retained. Modification requires Ctrl+E. Tab supports list items and ordinary text parent-child blocks; universal indentation, multi-block selection, cross-page dragging, complete database blocks, system-level Chinese IME, touch and large document performance have not yet been fully accepted for all block types. No cloud sync or MyBase Query completed.
