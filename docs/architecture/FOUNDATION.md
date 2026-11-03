<a id="当前基础prosemirror-连续文档--markdown-文件内核"></a>

# Current foundation: ProseMirror documents and Markdown file storage

**English** · [简体中文](FOUNDATION.zh-CN.md)

2026-09-12 updated. The earlier Vditor scheme has been replaced based on user feedback on the actual editing experience. Vditor, which is activated block by block, cannot meet the requirements of independent operation of each list item, nested subtree dragging, continuous selection/undo, and links that remain visible at all times. Continuing to tinker with the periphery creates two sets of constituencies and histories.

Currently used directlyProseMirror ofmodel/state/view/history/schema-list/inputrules；List level referenceAFFiNE，Page Mentions ReferenceAppFlowy。ownMarkdown codec Keep source slices and extensions,PM The tree only exists during editing, persistence is still onlyMarkdown withYAML。No transferYjs or other binary documentation as an authoritative source.Vditor Dependencies and old editor modules have been removed.

The format comparison for the original upstream clone still holds, so the initial investigation below remains historical; the actual dependencies and implemented boundaries for Vditor only describe the legacy version. Current modules, evidence and limitations are based on the [ cross-reference ](../reference/NOTION-REFERENCE.md) and [ README ](../../README.md).

---
<a id="初始选型记录历史vditorlute"></a>

# Initial selection record (historical): Vditor/Lute

This round of selecting thought sources as the main reference for the page, block and local core design, the actual editor re-using the sameB3log The ecologicalMIT ComponentsVditor 4.0.0（TheMarkdown The engine isLute），The independence of the`markdown-workbench` Implement Markdown vault in . This is not directly source fork or reuse its Protyle, synchronization kernel, database engine; the upstream clone in the current repository remains independent.

The most important constraint for users is "people andAI Can be read and written directlyMarkdown Source file". Therefore, the selection priority should be based on the real persistence format and cannot be based solely onNotion styleUI or can be exportedMarkdown Determine suitability.

<a id="本地-clone-对比"></a>

## Comparing local clones

| candidate | Can be used for reference/reuse | Distance from core requirements | Select |
| --- | --- | --- | --- |
| SiYuan | Parent-child pages, blocks, properties, kernel API/MCP, local file organization | `.sy`Is Lute AST JSON; not Markdown text. Complete application AGPLv3 | Main architectural reference; `.sy` kernel not migrated |
| AFFiNE / BlockSuite | Block dragging, slash commands, databases, whiteboards and extension converters; BlockSuite MIT | Persistence is Yjs binary update; Markdown is snapshot conversion; sidebar tree is organized into folders | Power block editing alternative; the library will not be consolidated in this round fork |
| AppFlowy | Flutter multi-port, true parent-child pages, block editing and database | Flutter + Rust + Collab/yrs + RocksDB; Markdown is import and export | Alternative to the native Flutter route, the current reconstruction cost is high |
| Anytype ts + heart | Objects, properties, relationships, collection views, decentralized design | Independent object/synchronization model; currently clone uses Any Source Available License | Learn from the attribute view, not as the basis of the code for the time being |
| AnyBlock | Public formats, conversion tools, readable exchange structures; MIT | Currently README defines it as a Anytype interchange format item, independent notes UI; v2 is a JSON interchange format | It can be used as a reference for subsequent import and export adaptation. |

<a id="可复查的本地证据"></a>

## Local evidence available for review

The following path is relative to the workspace `D:\Workspace\note-app`, and the line numbers are from this round of checking and do not represent future versions of the upstream.

- Siyuan `.sy` Definition:`siyuan/docs/SY-FORMAT.md:11` Make it clear that the text is Lute AST serialized JSON;`:27` Describe API/MCP/CLI and index maintenance.`siyuan/kernel/model/file.go:1303` Pass `Md2BlockDOM` Convert Markdown;`:1195` by `filesys.WriteTree` Write tree.`siyuan/LICENSE:1` is AGPLv3. Siyuan provides these models and API and cannot be inferred from them. `.sy` It's Markdown.
- The bottom layer of AFFiNE: `AFFiNE/blocksuite/framework/store/src/model/store/store.ts:191` Description store is based on Y.Doc; `.../store/crud.ts:75` creates Y.Map. The text payload of `AFFiNE/packages/common/nbstore/README.md:23` is `bin: Uint8Array`. `AFFiNE/blocksuite/affine/shared/src/adapters/markdown/markdown.ts:254` and `:325` are bidirectional conversions of snapshot and Markdown.
- AFFiNE level: `AFFiNE/packages/frontend/core/src/modules/organize/entities/folder-node.ts:27` only enumerates child nodes of folder; `:107` rejects non-folder parent nodes. This sidebar model still needs to be changed to a page parent-child tree.
- AFFiNE License:`AFFiNE/LICENSE:5` I willbackend withcommon/native pointing tobackend/server/LICENSE；It containsEE The provisions andCE ofMPL2 Part of the...`AFFiNE/blocksuite/framework/store/package.json:11`、`blocksuite/affine/shared/package.json:11` Declaring MIT, the entire server cannot be summarized as MIT. Check commit AFFiNE `b4331cbe1e`。
- AppFlowy persistence: `AppFlowy/frontend/rust-lib/collab-integrate/src/collab_builder.rs:288` installs RocksdbDiskPlugin, and `:389` writes `encoded_collab.doc_state`. `AppFlowy/frontend/appflowy_flutter/lib/shared/markdown_to_document.dart:13`/`:27` are Markdown import/export; `frontend/rust-lib/flowy-folder/src/manager_observer.rs:183`/`:185` read the parent view and its subviews. `AppFlowy/LICENSE:1` is AGPLv3. Check commit `5cf3a365d` .
- Anytype and AnyBlock: `anytype-heart/README.md:2` identifies heart as the middle layer, `anytype-heart/LICENSE.md:7` and `anytype-ts/LICENSE.md:7` list the scope of use; `any-block/README.md:3` defines the exchange items, `:5` / `:7` distinguish protobuf v1 and readable import and export / API v2, `any-block/LICENSE.md:1` is MIT.
- This project directly depends on: `markdown-workbench/node_modules/vditor/package.json`'s version is `4.0.0` and its license is MIT. The actual scope of use is the editor component, and text storage, extended rendering and synchronization conflict logic are new codes for this project.

<a id="为什么复用-vditor"></a>

## Why reuse Vditor

The public interface of Vditor uses Markdown as input/output, and has real-time rendering (similar to Typora), WYSIWYG and source code split-screen mode, which meets the starting point of "the source code can still be edited without opening the source code by default"; Lute is a structured Markdown engine in the same ecosystem. This is more straightforward than mirroring the exported CRDT JSON/ binary into `.md`. [ Vditor official warehouse ](https://github.com/Vanessa219/vditor), [ Lute official warehouse ](https://github.com/88250/lute).

The BlockSuite official documentation also confirms that store is natively built on Yjs, so the existence of Markdown adapter cannot eliminate the persistence model difference. [ BlockSuite store ](https://blocksuite.io/guide/store). The independent appflowy_editor license is also completely different from AppFlowy. It is currently a AGPLv3/MPL2 dual license; if it switches to Flutter in the future, it should be evaluated separately. [ appflowy_editor LICENSE ](https://github.com/AppFlowy-IO/appflowy-editor/blob/main/LICENSE).

<a id="实现边界与后续门槛"></a>

## Implementation boundaries and next-stage requirements

The first ones currently implemented are Markdown vault, parent page/property model, Notion style interface, source code/visual editing, source code retained block operations, double links/subpages/two columns, derived outlines and views, HTML export, and version conflict copies. Column splitting and double chaining are explained by parser rules of this project and cannot be claimed to be native capabilities of unmodified Vditor.

Full multi-device cloud sync still requires authentication, attachment transfer, offline queuing, delete/rename conflicts, and cross-device testing. Conflicting fork protects data but is not equivalent to completing Git or mature CRDT collaboration. The true protocol of MyBase has been confirmed and metadata export has been implemented; Query and two-way synchronization have not yet been integrated. The standalone standard stdio MCP has been tested with real clients for reading, writing and collisions. Protyle's fine-grained drag experience, complete database query, and mobile terminal packaging still need to be implemented one by one in the future, and cannot be regarded as completed just by referring to the product name.
