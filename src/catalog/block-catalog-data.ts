import { editorKind, isEditorKind } from "../document/node-identity";
import { localObjectPlugins } from "../markdown-engine/presets";
import { nodeName, editorNodeType } from "../document/node-identity";
import { contentObjects, implementationRoles, resolveContentObject, type ContentObjectDefinition } from "../document/content-objects";
import type { Node as PMNode } from "prosemirror-model";
import { objectSamples } from "../document/object-model";
import { isHtmlAsset } from "../document/embed-source";
import { editorSchema } from "../document/editor-schema";
import type { Dialect } from "../markdown-engine/config";

const labels: Record<string, string> = {
  paragraph: "Text",
  heading: "Heading",
  blockquote: "Quote",
  horizontal_rule: "Divider",
  code_block: "Code",
  executable_chunk: "Executable Chunk",
  executable_inline: "Executable Expression",
  bullet_list: "Bulleted list",
  ordered_list: "Numbered list",
  bullet_list_item: "Bullet list item",
  numbered_list_item: "Numbered list item",
  task_list_item: "Task list item",
  nested_block: "Nested blocks",
  columns: "Columns",
  column: "Column",
  child_page: "Child page",
  opaque_block: "Preserved source",
  html_block: "HTML block",
  html_inline: "Inline HTML",
  definition_list: "Definition list",
  definition_list_item: "Definition list item",
  definition_term: "Definition term",
  definition_description: "Definition description",
  footnote: "Footnote",
  footnote_reference: "Footnote reference",
  line_block: "Line block",
  line: "Line",
  fenced_div: "Div container",
  callout: "Callout",
  toggle_block: "Toggle",
  synced_block: "Synced block snapshot",
  table_of_contents: "Table of contents",
  unknown_block: "Unknown block",
  media_block: "Media",
  equation: "Equation",
  table: "Table",
  table_row: "Table row",
  table_cell: "Table cell",
  text: "Text node",
  image: "Image",
  hard_break: "Line break",
  mention: "Mention",
  inline_math: "Inline equation",
  citation: "Citation",
  page_link: "Page link",
  syntax_block: "Extension block",
  syntax_inline: "Inline extension",
  alert: "Alert",
};
export const syntaxKinds: Record<string, string> = {
  diagram: "Diagram",
  raw: "Raw format",
  embed: "Embedded page",
  "html-markdown": "Markdown in HTML",
  figure: "Figure and caption",
  comment: "Hidden comment",
  transclusion: "File transclusion",
  metadata: "Metadata",
  definition: "Reference definition",
};
export function blockTypeLabel(node: PMNode, list?: PMNode): string {
  if (node.type.name === "block.web_embed") return isEditorKind(node, "notion_embed") || isHtmlAsset(String(node.attrs.url || node.attrs.data?.src || "")) ? "HTML embed" : "Web embed";
  if (isEditorKind(node, "nested_block") && node.firstChild) return blockTypeLabel(node.firstChild, list);
  const object = resolveContentObject(node, { list });
  if (isEditorKind(node, "heading")) return (object?.name || "Heading") + " " + node.attrs.level;
  if (isEditorKind(node, "callout") && node.attrs.kind) return "Callout · " + node.attrs.kind;
  const role = isEditorKind(node, "syntax_block") ? implementationRoles[`syntax.${node.attrs.kind}`] : implementationRoles[editorKind(node)];
  return object?.name || role || labels[editorKind(node)] || editorKind(node);
}
export interface CatalogEntry {
  id: string;
  label: string;
  category: string;
  node: string;
  sample?: string;
  variant: Dialect;
  extensions?: string[];
  note?: string;
  object?: ContentObjectDefinition;
  aliases?: string[];
  parents?: string[];
}
const samples: Record<string, string> = {
  paragraph:
    "A paragraph with **bold**, *italic*, and a [link](https://example.com).",
  heading:
    "# Heading 1\n\n## Heading 2\n\n### Heading 3\n\n#### Heading 4\n\n##### Heading 5\n\n###### Heading 6",
  blockquote: "> A quoted paragraph.",
  horizontal_rule: "Before\n\n---\n\nAfter",
  code_block: "```javascript\nconst message = 'Hello Notdown';\n```",
  executable_chunk: "```{python}\n#| label: sample\n1 + 1\n```",
  executable_inline: "The result is `{python} 1 + 1`.",
  bullet_list: "- First\n- Second\n  - Child",
  ordered_list: "1. First\n2. Second",
  bullet_list_item: "- First\n- Second",
  numbered_list_item: "1. First\n2. Second",
  task_list_item: "- [ ] To do\n- [x] Done",
  nested_block: "Parent\n\tChild",
  columns:
    "<columns>\n<column>\nLeft column\n</column>\n<column>\nRight column\n</column>\n</columns>",
  child_page: '<page-link url="https://example.com/page">Example link</page-link>',
  // Deliberately unknown directive syntax, not a valid Pandoc Div opener.
  // A negative example must remain bounded when followed by other samples.
  opaque_block: ':::unknown {custom="keep"}\nPreserved content\n:::',
  html_block:
    "<div><h3>HTML block</h3><p>HTML preview with <strong>formatting</strong>.</p></div>",
  definition_list: "Markdown\n: A text format.\n\nBlock\n: A unit of content.",
  definition_list_item: "Markdown\n: A text format.\n: An editable document format.",
  footnote: "A note[^1].\n\n[^1]: Footnote text.",
  line_block: "| First line\n| Second line\n|   Indented line",
  fenced_div: "::: {.example}\nA container.\n:::",
  callout: '<callout icon="💡">\nA useful idea.\n</callout>',
  toggle_block:
    "<details>\n<summary>Open this toggle</summary>\nHidden content.\n</details>",
  synced_block: "<synced_block>\nSnapshot content.\n</synced_block>",
  table_of_contents:
    "<table_of_contents/>\n\n# First section\n\n## Second section",
  unknown_block:
    '<unknown url="https://example.com" alt="Preserved unknown block"/>',
  media_block: '<file src="https://example.com/sample.pdf">Sample PDF</file>',
  equation: "$$\nE = mc^2\n$$",
  table: "| Name | Value |\n| --- | --- |\n| Example | 42 |",
  alert: "> [!NOTE]\n> A note alert.",
  image: "![Example image](example.png)",
  hard_break: "First line  \nSecond line",
  inline_math: "Inline math: $x^2$",
  html_inline: "Text <kbd>Ctrl</kbd> + <kbd>K</kbd>.",
};
Object.assign(samples, objectSamples);
const required: Record<string, string[]> = {
  task_list_item: ["task_lists"],
  nested_block: ["notion_nesting"],
  columns: ["notion_columns"],
  child_page: ["notion_pages"],
  html_block: ["raw_html"],
  html_inline: ["raw_html"],
  definition_list: ["definition_lists"],
  definition_list_item: ["definition_lists"],
  footnote: ["footnotes"],
  line_block: ["line_blocks"],
  fenced_div: ["fenced_divs"],
  callout: ["notion_callouts"],
  toggle_block: ["notion_toggles"],
  synced_block: ["notion_synced"],
  table_of_contents: ["notion_toc"],
  media_block: ["notion_media"],
  equation: ["tex_math_dollars"],
  inline_math: ["tex_math_dollars"],
  table: ["pipe_tables"],
  alert: ["alerts"],
};
for (const [node, plugin] of Object.entries(localObjectPlugins)) required[node] = [plugin];
const internal = new Set([
  "column",
  "table_row",
  "table_cell",
  "definition_term",
  "definition_list",
  "definition_description",
  "line",
]);
const notion = new Set([
  "columns",
  "child_page",
  "callout",
  "toggle_block",
  "synced_block",
  "table_of_contents",
  "unknown_block",
  "media_block",
]);
export const implementationCatalog: CatalogEntry[] = Object.entries(editorSchema.nodes)
  .filter(([id]) => id !== "doc")
  .map(([canonicalId, node]) => { const id = node.spec.editorKind || canonicalId; return ({
    id: canonicalId,
    node: canonicalId,
    label: labels[id] || id,
    category: internal.has(id)
      ? "Internal nodes"
      : node.isInline
        ? "Inline content"
        : "Blocks",
    sample: canonicalId === nodeName(id) ? samples[id] : undefined,
    variant: canonicalId === "block.link_to_page" ? "notdown" : ["executable_chunk", "executable_inline"].includes(id) ? "quarto" : ["r_chunk", "r_inline"].includes(id) ? "rmarkdown" : localObjectPlugins[id] ? "notdown" : notion.has(id) || id === "nested_block" ? "notion-markdown" : "typora",
    extensions: required[id],
    note: internal.has(id)
      ? "Part of a composite block; not an independently insertable page block."
      : id === "synced_block"
        ? "Content snapshot only; no cross-page synchronization."
        : undefined,
  }); });
const extra: [string, string, string, Dialect, string[]][] = [
  [
    "raw",
    "HTML block",
    "```{=html}\n<div>*Literal HTML content*</div>\n```",
    "markdown",
    ["raw_attribute"],
  ],
  [
    "diagram",
    "Diagram",
    "```mermaid\ngraph LR\n  Write --> Organize\n```",
    "typora",
    ["diagrams"],
  ],
  [
    "table",
    "MultiMarkdown table",
    "| A | B |\n| --- | --- |\n| One | Two |",
    "markdown_mmd",
    ["mmd_tables"],
  ],
  [
    "embed",
    "Embedded page",
    '<iframe src="about:blank" title="Blank example"></iframe>',
    "typora",
    ["html_embed"],
  ],
  [
    "html-markdown",
    "Markdown in HTML",
    '<div markdown="1">\n**Markdown** inside HTML.\n</div>',
    "markdown_phpextra",
    ["markdown_attribute"],
  ],
  [
    "figure",
    "Figure and caption",
    "![Image caption](example.png)",
    "markdown",
    ["implicit_figures"],
  ],
  [
    "comment",
    "Hidden comment",
    "%%\nA hidden comment\n%%",
    "obsidian",
    ["comments"],
  ],
  [
    "toc",
    "Table of contents directive",
    "[toc]\n\n# First section\n\n## Second section",
    "typora",
    ["toc_directives"],
  ],
  [
    "transclusion",
    "File transclusion",
    "![[example.md]]",
    "obsidian",
    ["transclusion"],
  ],
  [
    "metadata",
    "Metadata",
    "---\ntitle: Sample\nauthor: Writer\n---",
    "markdown",
    ["yaml_metadata_block", "metadata_values"],
  ],
  [
    "definition",
    "Reference definition",
    "[>HTML]: Hypertext Markup Language",
    "markdown_mmd",
    ["mmd_abbreviations"],
  ],
];
for (const [kind, label, sample, variant, extensions] of extra)
  implementationCatalog.push({
    id: kind === "toc" ? "toc:directive" : kind === "table" ? "table:mmd" : `syntax:${kind}`,
    node: kind === "toc" ? "block.table_of_contents" : kind === "table" ? "block.table" : editorNodeType(editorSchema, "syntax_block", { kind, raw: sample, data: { format: kind === "raw" ? "html" : "" } }).name,
    category: "Extension blocks",
    label,
    sample,
    variant,
    extensions,
    note: "Uses the native renderer. Some extension blocks use a preview with source editing; referenced files need to exist in a vault.",
  });
for (let level = 1; level <= 6; level++)
  implementationCatalog.push({
    id: `heading:${level}`,
    node: "block.heading",
    label: `Heading ${level}`,
    category: "Block variants",
    sample: `${"#".repeat(level)} Heading ${level}`,
    variant: "typora",
  });
for (const kind of ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"])
  implementationCatalog.push({
    id: `alert:${kind}`,
    node: "block.callout",
    label: `Callout · ${kind}`,
    category: "Block variants",
    sample: `> [!${kind}]\n> ${kind.toLowerCase()} content.`,
    variant: "typora",
    extensions: ["alerts"],
  });
for (const [id, type] of Object.entries(editorSchema.marks))
  implementationCatalog.push({
    id: `mark:${id}`,
    node: id,
    label: id.replaceAll("_", " "),
    category: "Inline formatting",
    variant: "typora",
    note: `Inline formatting, not a separate block. ${Object.keys(type.spec.attrs || {}).join(", ")}`,
  });
for (const kind of ["audio", "video", "file", "pdf"])
  implementationCatalog.push({
    id: `media:${kind}`,
    node: `block.${kind}`,
    label: `Media · ${kind}`,
    category: "Block variants",
    variant: "notion-markdown",
    sample: `<${kind} src="sample.${kind === "audio" ? "mp3" : kind === "video" ? "mp4" : "pdf"}">Sample attachment</${kind}>`,
    extensions: ["notion_media"],
    note: "Replace the sample path with your uploaded attachment. Media availability depends on the file and browser.",
  });
for (const fold of ["+", "-"])
  implementationCatalog.push({
    id: `alert:fold:${fold}`,
    node: "block.callout",
    label: `Callout · ${fold === "+" ? "Expanded" : "Collapsed"}`,
    category: "Block variants",
    variant: "obsidian",
    sample: `> [!NOTE]${fold} Details\n> Foldable content.`,
    extensions: ["alerts"],
  });

const sampleAliases: Record<string, string> = {
  "block.bullet_list_item": "bullet_list", "block.numbered_list_item": "ordered_list",
  "block.task_list_item": "task_list_item", "block.image_block": "image_block",
  "block.link_to_page": "child_page",
  "block.audio": "media:audio", "block.video": "media:video",
  "block.pdf": "media:pdf", "block.file": "media:file",
};
const specificSamples: Record<string, Partial<CatalogEntry>> = {
  "block.folder": { sample: '<folder url="https://www.notion.so/example">Folder</folder>', variant: "notion-markdown" },
  "block.database": { sample: '<database data-source-url="collection://example" inline="true" wiki="false">Database</database>', variant: "notion-markdown" },
  "inline.mention_agent": { sample: '<mention-agent url="agent://example">Agent</mention-agent>', variant: "notion-markdown" },
  "block.tabs": { sample: '<tabs>\n\t<tab icon="📄">\n\t\tFirst\n\t\tFirst tab content\n\t</tab>\n\t<tab>\n\t\tSecond\n\t\tSecond tab content\n\t</tab>\n</tabs>', variant: "notion-markdown" },
  "block.meeting_notes": { sample: '<meeting-notes>\n\tMeeting\n\t<notes>\n\t\tUser notes\n\t</notes>\n</meeting-notes>', variant: "notion-markdown" },
  "block.unsupported": { sample: samples.opaque_block, variant: "typora" },
  "block.child_page": { sample: '<page url="#page/example">Example child</page>', variant: "notion-markdown" },
  "block.link_to_page": { sample: '<page-link url="#page/example">Example link</page-link>', variant: "notdown" },
  "inline.citation": { sample: "A source [p. 12][#paper].\n\n[#paper]: Jane Doe. *Example book*. 2026.", variant: "markdown_mmd" },
  "inline.abbreviation": { sample: "[>MMD]\n\n[>MMD]: MultiMarkdown", variant: "markdown_mmd" },
  "inline.glossary": { sample: "[?codec]\n\n[?codec]: A reader and writer for a document format.", variant: "markdown_mmd" },
  "inline.metadata_variable": { sample: "Title: Example\n\nThe title is [%title].", variant: "markdown_mmd" },
  "inline.addition": { sample: "An {++added++} word.", variant: "markdown_mmd" },
  "inline.deletion": { sample: "A {--removed--} word.", variant: "markdown_mmd" },
  "inline.substitution": { sample: "A {~~previous~>replacement~~} word.", variant: "markdown_mmd" },
  "inline.footnote": { sample: "A note [^example].\n\n[^example]: Editable footnote text.", variant: "markdown_mmd" },
  "inline.code_span": { sample: "An `inline code` example.", variant: "commonmark" },
  "inline.emphasis": { sample: "An *emphasized* word.", variant: "commonmark" },
  "inline.strong_emphasis": { sample: "A **strong** word.", variant: "commonmark" },
  "inline.strikethrough": { sample: "A ~~deleted~~ word.", variant: "gfm" },
  "inline.link": { sample: "[Example](https://example.com)", variant: "commonmark" },
  "inline.autolink": { sample: "<https://example.com>", variant: "commonmark" },
  "inline.internal_link": { sample: "[[Example]] · [[Example#Details|Details]] · [[#^example|Block]]\n\n<mention-page url=\"#page/example\">Example</mention-page> · [Details](Example.md#details)\n\n## Details\n\nA paragraph. ^example", variant: "notdown" },
  "inline.emoji": { sample: ":smile:", variant: "typora" },
  "inline.subscript": { sample: "H~2~O", variant: "markdown" },
  "inline.superscript": { sample: "x^2^", variant: "markdown" },
  "inline.highlight": { sample: "==Highlighted text==", variant: "obsidian" },
  "inline.inline_comment": { sample: "Text %%hidden comment%%.", variant: "obsidian" },
  "inline.underline": { sample: '<span underline="true">Underlined text</span>', variant: "notion-markdown" },
  "inline.small_caps": { sample: "[Small capitals]{.smallcaps}", variant: "notdown" },
  "inline.native_span": { sample: "[A span]{.example}", variant: "notdown" },
  "inline.mention_person": { sample: '<mention-user url="user://example">Example person</mention-user>', variant: "notion-markdown" },
  "inline.mention_page_or_data_source": { sample: '<mention-data-source url="https://example.com/data">Example data source</mention-data-source>', variant: "notion-markdown" },
  "inline.date_or_reminder": { sample: '<mention-date start="2026-09-24"/>', variant: "notion-markdown" },
  "inline.text_color": { sample: '<span color="blue">Blue text</span>', variant: "notion-markdown" },
  "inline.background_color": { sample: '<span color="yellow_bg">Background</span>', variant: "notion-markdown" },
  "block.example_list_item": { sample: "(@example) Numbered example", variant: "markdown" },
  "metadata.yaml_front_matter": { sample: "---\ntitle: Example\ncustom: preserved\n---\n\nBody", variant: "markdown" },
  "character.html_entity": { sample: "Copyright &copy;", variant: "commonmark" },
  "character.backslash_escape": { sample: "An escaped \\*asterisk\\*", variant: "commonmark" },
  "character.smart_typography": { sample: '"Quoted" -- text...', variant: "markdown" },
  "inline.inline_html": { sample: 'Before `<b>*literal*</b>`{=html} after.', variant: "markdown", extensions: ["raw_attribute"] },
  "block.image_block": { sample: '![Caption](example.png){alt="Alternative description"}', variant: "markdown", extensions: ["implicit_figures", "link_attributes"] },
  "block.toggle_heading": { sample: '## Toggle heading {toggle="true"}\n\tChild content', variant: "notion-markdown", extensions: ["notion_nesting"] },
  "metadata.pandoc_title_block": { sample: "% Sample title\n% Example author\n% 2026", variant: "markdown", extensions: ["pandoc_title_block", "metadata_values"] },
  "inline.image": { sample: "An inline ![image](example.png) in text.", variant: "typora" },
};
export const blockCatalog: CatalogEntry[] = contentObjects.map(object => {
  const carrier = object.adapters[0]?.representation || object.adapters[0]?.carrier || "";
  const node = carrier.split(".")[0];
  const sampleId = sampleAliases[object.id] || (node === "syntax" ? "syntax:" + carrier.split(".")[1] : node === "mark" ? "mark:" + carrier.split(".")[1] : node);
  const example = implementationCatalog.find(entry => entry.id === nodeName(sampleId));
  return {
    id: object.id, label: object.name, category: object.category,
    node: editorSchema.nodes[object.id] ? object.id : example?.node || nodeName(node), variant: example?.variant || "typora",
    sample: example?.sample, extensions: example?.extensions, ...specificSamples[object.id],
    note: object.note, aliases: object.aliases, object,
  };
});

/** Content-owned structures only. Engine mechanisms are not catalogue objects. */
export const childStructureCatalog: CatalogEntry[] = [
  ["bullet_list", "Bullet list group", ["block.bullet_list_item", "block.task_list_item"]],
  ["ordered_list", "Numbered list group", ["block.numbered_list_item", "block.task_list_item"]],
  ["table_row", "Table row", ["block.table"]],
  ["table_cell", "Table cell", ["block.table"]],
  ["table_caption", "Table caption", ["block.table"]],
  ["column", "Column", ["block.columns"]],
  ["tab", "Tab panel", ["block.tabs"]],
  ["example_list", "Example list group", ["block.example_list_item"]],
  ["definition_term", "Definition term", ["block.definition_list_item"]],
  ["definition_description", "Definition body", ["block.definition_list_item"]],
  ["line", "Line", ["block.line_block"]],
  ["footnote", "Footnote definition", ["inline.footnote"]],
  ["syntax:definition", "Reference definition", ["inline.link", "inline.abbreviation", "inline.citation", "inline.glossary"]],
].map(([id, label, parents]) => ({
  ...implementationCatalog.find(e => e.id === nodeName(id as string)), id: id as string, label: label as string,
  node: id === "syntax:definition" ? "structure.reference_definition" : nodeName(id as string),
  category: "Child structures", variant: implementationCatalog.find(e => e.id === nodeName(id as string))?.variant || "typora", parents: parents as string[],
  note: "Owned by a content object. Not an independently insertable page object.",
}));
