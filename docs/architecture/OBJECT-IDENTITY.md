<a id="内容对象与节点身份"></a>

# Content objects and node identity

**English** · [简体中文](OBJECT-IDENTITY.zh-CN.md)

Updated: 2026-09-24.

Content nodes directly use the full object ID of the content directory as the ProseMirror node name. `resolveContentObject(node)` directly queries `node.type.name` and no longer maintains another mapping table of "node name to content type". The node JSON is just an in-memory edit structure; the body still has the Markdown file as the truth.

| Content object/node name | Markdown code or meaning |
| --- | --- |
| `block.paragraph` | Paragraph |
| `block.quote` | Block quote |
| `block.definition_list_item` | A term and its entire definition; paragraphs, lists, and code within the definition retain their own block identity |
| `block.heading` / `block.toggle_heading` | Heading / toggle heading |
| `inline.internal_link` | Page mentions, Wiki citations, location citations |
| `inline.mention_person` | `<mention-user>` |
| `inline.date_or_reminder` | `<mention-date>` |
| `inline.mention_page_or_data_source` | Database/data source mentions |
| `inline.link` | Local inline link card `<mention-link>` |
| `block.audio` / `block.video` / `block.pdf` / `block.file` | Corresponding media block |
| `block.diagram` / `block.block_comment` / `block.file_transclusion` | Charts, block comments, file import |
| `metadata.yaml_front_matter` / `metadata.pandoc_title_block` | document property block |
| `block.unsupported` | Unsupported content and its recoverable original text |

<a id="结构节点与格式标记"></a>

## Structural nodes and formatting marks

Table rows, list groupings, column containers, etc. use `structure.*` names, such as `structure.table_row` and `structure.bullet_list`. The footnote text and reserved inline source code are also the structure that makes up the content object, and no additional product content type is added. `doc` and `text` retain the engine base name.

The definition list consists of `structure.definition_list` holding multiple `block.definition_list_item` ; each item contains one `structure.definition_term` and one or more `structure.definition_description` . Blocks within the definition body container operate independently, whereas handles on term lines operate on the entire item.

Boldface, links, etc. mark, as well as entity escaping, emoji and other text processing capabilities will not be changed to independent nodes for naming consistency. They continue to use rich text markup or text, and the content catalog recognizes its semantics through a markup parser.

Content identity is determined by the node type, not by the display context passed in by the caller. For example, `inline.image` is still the node when placed in an independent paragraph; explicit picture blocks use `block.image_block`. `block.child_page` corresponds to a clear sub-page role, and ordinary `<page>` references use `block.link_to_page`; the page ownership is still determined by the vault metadata.

<a id="编码与编辑实现"></a>

## Codec and editor implementation

`src/document/node-identity.ts` Connect the representation kind of codec to the canonical node name. Common editing code use `schema.nodes["block.paragraph"]` Such a complete ID; when parsing mention, media, and source code objects that depend on attributes, use `createEditorNode` Select the appropriate type. schema does not register `paragraph`、`mention`、`page_link` Wait for the old name alias.

The same object can have multiple source encodings. For example HTML block with `{=html}` Source code sharing `block.html_block`. If necessary, memory attributes `editorRepresentation` Distinguish between the editing view and the writeback path, and do not write user Markdown. Node views are re-created when representation types change to avoid inheriting incompatible editors.

ProseMirror content expressions cannot directly use dotted names. schema expresses the nested rule in inner group; the actual NodeType name and node in JSON `type` Still full object ID .

Renaming does not change the Markdown dialect boundary, does not migrate the vault files, and does not add a new text protocol. `<mention-agent>` continues to retain the original text and has not yet implemented the Agent object; `<mention-link>` is still a Notdown extension.

<a id="验证"></a>

## Validation

`tests/unit/node-identity.test.ts`Checks the actual NodeType name, old name unavailability, resolved identity of mention/media/source objects, CRLF and unknown attribute retention, editing and undoing, view representation switching, and structural legality. The remaining codec, editing commands and browser tests continue to cover the original interaction.
