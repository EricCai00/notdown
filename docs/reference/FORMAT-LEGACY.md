<a id="旧-markdown-格式-v02仅用于兼容读取"></a>

# Legacy body format contract

**English** · [简体中文](FORMAT-LEGACY.zh-CN.md)

See [ FORMAT.md ](../FORMAT.md) for new text specifications. This article is the basis for parsing old files, and these private instructions are no longer generated.

Design principle: The text is directly stored as UTF-8 Markdown. Render, tree, outline, mind map, and block drag are views of the same text. There is no separate copy of the JSON text that must be kept synchronized for block editing. This article specifies the text layer; page ID, parent page and attributes are managed by vault's YAML front matter.

The page file is `vault/pages/<uuid>.md` and the format is as follows:

```md
---
id: 550e8400-e29b-41d4-a716-446655440000
title: 示例页面
parent: null
icon: 📄
properties:
  status: 草稿
updated: "2026-09-12T05:00:00.000Z"
---

# 正文

这里是普通 Markdown。
```

`parent`It is ID or `null` of the only parent page; moving the page only changes the attributes and does not rely on folder renaming. The backend retains unknown YAML fields/comments, and strictly retains the text when changing metadata. The REST of `revision` is the SHA-256 of the entire file, and the writer must provide the `baseRevision` to avoid overwriting updates from another editor or AI. The revision history is at `.history/<pageId>/<revision>.md` and the conflicting copy is at `.history/conflicts/`.

<a id="标准语法"></a>

## Standard syntax

The base uses CommonMark, including table and strikethrough support for markdown-it. Titles, lists, quotes, fence codes, images, and regular file links use the established syntax. Do not open the body of raw HTML; it will be displayed as text. Unknown extensions retain their source code and will not be automatically deleted.

Supports GFM style task lists: `- [ ] 未完成`, `- [x] 已完成` (uppercase `X` is also supported). Only the markup at the beginning of the first paragraph of the actual list item is rendered as a checkbox; normal paragraphs, escaped text, and `[ ]` / `[x]` in code remain unchanged. The check boxes for reading view and HTML export are not clickable, and the editing status should be modified in the editor; the outline title omits the task mark.

```md
# 页面标题

![示意图](assets/diagram.png)

[附件](assets/specification.pdf)

[录音](assets/recording.mp3)

[演示](assets/demo.mp4)
```

A single local audio and video link is displayed as a player and attachment link; supports mp3, m4a, ogg, wav, mp4, webm, mov. Remote audio and video links are still ordinary links, and pictures follow the Markdown picture syntax. The HTML export includes styles and text, and attachments remain relative references. Attachments are not yet packaged or the entire library is exported.

<a id="页面链接"></a>

## Page links

```md
相关内容见 [[页面ID]]、[[页面标题]] 或 [[页面ID|显示文字]]。
```

Give priority to using the stable page ID to avoid invalidation after renaming. The title link is parsed according to the provided page index; when the title has the same name, the first item in the index is taken and no automatic guessing is performed. Display text is plain text, always HTML escaped. The render target is `#page/<编码后的ID>` . Code blocks, inline code, and backslash-escaped `\[[文字]]` do not create links and do not enter the graph reference index.

<a id="子页面入口"></a>

## Child-page entries

```md
::page{id="550e8400-e29b-41d4-a716-446655440000"}
```

This directive must occupy a separate line and be rendered as an openable subpage card. It represents an entry in the body and does not implicitly migrate pages, create pages, or modify parent-child relationships; the true only parent-page relationship belongs to the page attribute. Deleting an entry will not delete the subpages. Card titles are read from the page index and ID is displayed when the page is not found.

<a id="两栏"></a>

## Two columns

```md
:::columns

### 左栏

左栏使用普通 Markdown。
:::column

### 右栏

- 右栏也可以放列表
- 或图片、代码等内容
  :::
```

Only two columns are supported and there must be exactly one `:::column` delimiter. Nested columns are not allowed. Opening, delimiting, and closing tags must each occupy one line; up to three leading spaces are allowed. Small screens automatically stack into one column.

The code inside the fence `:::column` or `:::` It's just code. When there's no separator/terminator, there's a threesome or nesting, and the entire extension is shown in translated text, without guessing the structure. Block drag will make the entire block look like a block.

<a id="块与源码保留"></a>

## Blocks and source preservation

<a id="普通文本的父子块"></a>

### Parent and child blocks in plain text

Normal text and headings can have subblocks. `Tab` puts the current block into the previous block, and `Shift+Tab` advances one level; dragging the parent block will carry the child block. List items follow standard Markdown indentation. Ordinary text levels are saved with limited expansion to avoid four spaces being interpreted as code:

```md
:::nest
父块正文
:::children
子块正文

另一个子块
:::endnest
```

The parent block is an ordinary text or title; the child area is an ordinary Markdown, which can also contain another complete `:::nest`. Explicit delimiters allow empty parent blocks and empty child blocks to remain. Tags within code fences do not participate in nested parsing; original text that lacks terminators is safely retained. Inline breaks use standard Markdown hard line breaks (line break after two spaces): `Shift+Enter` inserts a hard line break within a block, `Enter` creates a new block; normal line breaks are used within code blocks.

<a id="顶层源码切片"></a>

### Top-level source slices

`parseBlocks()`Use the line interval slicing with syntax token, and do not use blank lines to roughly split the blocks. Fence code, lists with blank lines, tables, quotes, and columns as complete top-level blocks. The first block contains the blank space at the beginning of the text, and the remaining blocks contain the blank space after itself; slice splicing strictly restores the input, including CRLF.

`moveBlock(source, fromIndex, toIndex)`The middle `toIndex` refers to the final position after movement. The function moves the entire slice without reordering the list items or formatting the block contents. For adjacent blocks that appear after rearrangement, when there is less than one blank line in the existing space, add minimal line breaks to establish a blank line boundary; use the original line wrapping style, and all original characters remain unchanged. The original adjacent blocks remain separated, and the operations whose positions have not changed directly return to the original text.

For example, the last paragraph of `# A\n\nparagraph` is moved to the beginning and becomes `paragraph\n\n# A\n\n`, and will not be spelled as `paragraph# A`. Source code slice splicing is still strictly byte-preserving, and the actual block rearrangement allows the necessary delimiting newlines to be added to protect Markdown meaning. Adjacent lists of the same type still follow CommonMark's list merging rules, without additional private tags to force them apart.

This byte preservation guarantee applies to source code slicing and chunk reordering. Vditor rich text editing may normalize ordinary Markdown expressions, and conversions between arbitrary modes of the editor cannot be claimed to be byte-level lossless. Custom extensions should always retain source code exports.

<a id="ai-与属性"></a>

## AI and properties

AI can read the text directly and write it using version checking via vault API. Double links and child page cards have different relationships: double links form a reference graph, and parent page attributes form a tree. Page title is not the primary key.

Local MyBase has been checked for true Notation and Query specifications, and the metadata export adapter has been implemented; see [ MyBase integration contract ](MYBASE.md) for details. There are currently no MyBase executors or query services embedded. The specific mapping of page attributes to MyBase is managed by a single adaptation layer; unknown attributes and unknown body syntax cannot be automatically discarded as cleanup objects. Database views should be derived from these properties to avoid duplicate storage of the body.

<a id="已验证的核心边界"></a>

## Verified core boundaries

Automatic testing covers source code slicing and rearrangement, CRLF, lists/fences/tables, pseudo double links in code, page instructions, legal columns, nested/three columns/unclosed columns, unknown extensions, title/list outline, media and HTML/ dangerous URL injection.
