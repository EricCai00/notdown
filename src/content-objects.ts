import { localObjectPlugins } from "./markdown-engine/presets";
import { isListItem } from "./list-items";
import { objectId, objectSamples } from "./object-model";
import type { Mark, Node as PMNode } from "prosemirror-model";
import {
  commandEnabled,
  enabled,
  type SyntaxConfig,
} from "./markdown-engine/config";

export type ContentCategory = "block" | "metadata" | "inline" | "character";
export type EditingMode =
  "direct" | "source" | "reference" | "text" | "preserved";
export interface ContentAdapter {
  carrier: string;
  /** All listed switches are required. Alternatives use separate adapters. */
  extensions: string[];
  editing: EditingMode;
}
export interface ContentObjectDefinition {
  id: string;
  category: ContentCategory;
  name: string;
  aliases: string[];
  structure:
    "inline" | "children" | "structured" | "leaf" | "metadata" | "text";
  status: "implemented" | "partial" | "planned";
  stage: "P0" | "P1" | "P2" | "P3" | "P4";
  adapters: ContentAdapter[];
  note: string;
}
type Row = [
  string,
  string,
  string,
  ContentObjectDefinition["structure"],
  ContentObjectDefinition["status"],
  ContentObjectDefinition["stage"],
  string,
  string?,
];
// carrier@switch+switch:editing; alternatives are separated by semicolons.
const rows: Record<ContentCategory, Row[]> = {
  block: [
    [
      "paragraph",
      "Paragraph",
      "text;empty block",
      "children",
      "implemented",
      "P0",
      "paragraph:direct",
      "Empty paragraphs are content; spacing is not. Children use the nesting adapter.",
    ],
    [
      "heading",
      "Heading",
      "header;heading 1;heading 2;heading 3;heading 4;heading 5;heading 6",
      "inline",
      "implemented",
      "P0",
      "heading:direct",
    ],
    [
      "toggle_heading",
      "Toggle heading",
      "collapsible heading",
      "children",
      "partial",
      "P2",
      "heading.toggle@notion_nesting:direct",
      "Heading and child wrapper share the existing editor representation; dedicated creation and editing need completion.",
    ],
    [
      "divider",
      "Divider",
      "thematic break;horizontal_rule",
      "leaf",
      "implemented",
      "P0",
      "horizontal_rule:direct",
    ],
    [
      "quote",
      "Quote",
      "block quote;blockquote",
      "children",
      "implemented",
      "P0",
      "blockquote:direct",
    ],
    [
      "callout",
      "Callout",
      "alert;alerts;alerts and callouts;admonition;note;warning",
      "children",
      "implemented",
      "P1",
      "callout.alert@alerts:direct;callout.notion@notion_callouts:direct",
      "One node; kind, title, icon, color, folding and source encoding are retained.",
    ],
    [
      "line_block",
      "Line block",
      "line group;line blocks",
      "structured",
      "implemented",
      "P0",
      "line_block@line_blocks:direct",
    ],
    [
      "table",
      "Table",
      "simple table;MultiMarkdown table",
      "structured",
      "partial",
      "P2",
      "table.pipe@pipe_tables:direct;table.notion@notion_tables:direct;table.mmd@mmd_tables:direct;table.grid@grid_tables:direct;table.simple@simple_tables:direct;table.multiline@multiline_tables:direct",
      "One table model for pipe, Notion and MultiMarkdown encodings. Cells and captions are editable; span creation controls remain pending.",
    ],
    [
      "code_block",
      "Code block",
      "code;verbatim block",
      "leaf",
      "implemented",
      "P0",
      "code_block:direct",
    ],
    [
      "diagram",
      "Diagram",
      "Mermaid;sequence;flowchart",
      "leaf",
      "partial",
      "P2",
      "syntax.diagram@diagrams:source",
      "Local preview and source editing; supported diagram languages only.",
    ],
    [
      "math_block",
      "Math block",
      "block equation;equation",
      "leaf",
      "implemented",
      "P0",
      "equation@display_math:direct;equation@tex_math_dollars:direct;equation@tex_math_double_backslash:direct",
    ],
    [
      "html_block",
      "HTML block",
      "raw HTML",
      "leaf",
      "partial",
      "P2",
      "html_block@raw_html:source;syntax.raw.html@raw_attribute:source;syntax.html-markdown@markdown_attribute:source",
      "Sanitized preview and source editing, not an independent embedded document.",
    ],
    [
      "raw_source",
      "Raw source",
      "raw format",
      "leaf",
      "partial",
      "P2",
      "syntax.raw@raw_attribute:source",
      "Format-tagged raw content for the corresponding renderer/exporter; not code or unknown content.",
    ],
    [
      "raw_tex",
      "Raw TeX",
      "raw latex",
      "leaf",
      "partial",
      "P3",
      "syntax.raw.tex@raw_attribute:source;syntax.raw.tex@raw_tex:source",
      "Raw TeX environments and inline commands retain their source; editable source is exported as TeX, not executed as document code.",
    ],
    [
      "native_div",
      "Native div",
      "Div container;Div containers;fenced div;fenced_div",
      "children",
      "partial",
      "P3",
      "fenced_div@fenced_divs:direct;fenced_div@native_divs:direct",
      "Fenced and native HTML Div share editable child blocks and retain attributes and their original encoding.",
    ],
    [
      "image_block",
      "Image block",
      "image;figure;image and caption",
      "leaf",
      "partial",
      "P2",
      "paragraph.image:direct;syntax.figure@implicit_figures:source",
      "Standalone image paragraphs and figure previews; dedicated caption editing remains pending.",
    ],
    [
      "video",
      "Video",
      "media video",
      "leaf",
      "partial",
      "P2",
      "media_block.video@notion_media:reference",
      "Local attachment playback; source-based property editing.",
    ],
    [
      "audio",
      "Audio",
      "media audio",
      "leaf",
      "partial",
      "P2",
      "media_block.audio@notion_media:reference",
      "Local attachment playback; source-based property editing.",
    ],
    [
      "pdf",
      "PDF",
      "PDF file",
      "leaf",
      "partial",
      "P2",
      "media_block.pdf@notion_media:reference",
      "File link, not a full PDF reader.",
    ],
    [
      "file",
      "File",
      "attachment",
      "leaf",
      "partial",
      "P2",
      "media_block.file@notion_media:reference",
    ],
    [
      "file_transclusion",
      "File transclusion",
      "file inclusion;embedded file;inline file transclusion",
      "leaf",
      "partial",
      "P2",
      "syntax.transclusion@transclusion:source;syntax_inline.transclusion@transclusion:source",
      "File inclusion supports block and inline placement, e.g. Before {{fragment.txt}} after. Upstream MultiMarkdown expands markers before parsing, without a line-boundary restriction. Notdown provides sandboxed read-only local text previews; no synchronized editing or unrestricted preprocessing.",
    ],
    [
      "embed_web_contents",
      "Embed web contents",
      "embed;web embed;embedded page;iframe;网页嵌入",
      "leaf",
      "partial",
      "P2",
      "syntax.embed@html_embed:source",
      "Isolated URL iframe; the remote site may refuse embedding.",
    ],
    [
      "html_embed",
      "HTML embed",
      "HTML document embed",
      "leaf",
      "planned",
      "P3",
      "",
      "HTML document import and isolated preview are not implemented.",
    ],
    ["link_preview", "Link preview", "github;onedrive", "leaf", "planned", "P3", ""],
    [
      "web_bookmark",
      "Web bookmark",
      "bookmark",
      "leaf",
      "planned",
      "P3",
      "",
      "The separate Markdown Lab card demo is not a main-editor bookmark object.",
    ],
    [
      "bullet_list_item",
      "Bullet list item",
      "unordered list item;bulleted list",
      "children",
      "implemented",
      "P0",
      "bullet_list_item:direct",
    ],
    [
      "numbered_list_item",
      "Numbered list item",
      "ordered list item;numbered list",
      "children",
      "implemented",
      "P0",
      "numbered_list_item:direct",
    ],
    [
      "task_list_item",
      "Task list item",
      "to-do list item;to-do list;todo;checkbox",
      "children",
      "implemented",
      "P0",
      "task_list_item@task_lists:direct",
      "Task state and ordered/bullet markers are independent; dialect restrictions still apply.",
    ],
    [
      "toggle",
      "Toggle",
      "collapsed section;toggle list item;toggle list",
      "children",
      "implemented",
      "P0",
      "toggle_block@notion_toggles:direct",
    ],
    [
      "definition_list_item",
      "Definition list item",
      "definition list;definition lists",
      "structured",
      "partial",
      "P2",
      "definition_list@definition_lists:direct",
      "Terms and definitions are editable; moving one definition item independently is pending.",
    ],
    [
      "example_list_item",
      "Example list item",
      "example list",
      "children",
      "planned",
      "P3",
      "",
    ],
    [
      "table_of_contents",
      "Table of contents",
      "TOC;table of contents directive",
      "leaf",
      "implemented",
      "P1",
      "table_of_contents.notion@notion_toc:direct;table_of_contents.directive@toc_directives:direct",
      "One generated directory with source-specific encoding and heading ranges.",
    ],
    [
      "block_comment",
      "Block comment",
      "hidden comment;hidden comments",
      "leaf",
      "partial",
      "P2",
      "syntax.comment@comments:source",
      "Source comment, not a collaboration thread.",
    ],
    [
      "link_to_page",
      "Link to page",
      "page reference",
      "leaf",
      "partial",
      "P2",
      "child_page@notion_pages:reference",
      "Block page reference; existing payloads do not encode ownership separately.",
    ],
    [
      "child_page",
      "Child page",
      "page",
      "leaf",
      "partial",
      "P2",
      "child_page@notion_pages:reference",
      "Creation also creates a page resource; the body reference alone does not establish or change its parent.",
    ],
    [
      "breadcrumb",
      "Breadcrumb",
      "",
      "leaf",
      "planned",
      "P3",
      "",
      "Application navigation is not an insertable breadcrumb block.",
    ],
    [
      "columns",
      "Columns",
      "column list;two columns",
      "structured",
      "implemented",
      "P0",
      "columns@notion_columns:direct",
    ],
    ["tabs", "Tabs", "tab group", "structured", "planned", "P3", ""],
    [
      "synced_block",
      "Synced block",
      "synced block snapshot",
      "children",
      "partial",
      "P4",
      "synced_block@notion_synced:direct",
      "Local content snapshot and source reference only; no live synchronization.",
    ],
    ["button", "Button", "", "leaf", "planned", "P4", ""],
    [
      "meeting_notes",
      "Meeting notes",
      "transcription",
      "children",
      "planned",
      "P4",
      "",
    ],
    ["ai_block", "AI block", "", "leaf", "planned", "P4", ""],
    [
      "unsupported",
      "Unsupported",
      "unknown;unknown block;preserved source;opaque block",
      "leaf",
      "partial",
      "P0",
      "opaque_block:preserved;opaque_block.database@notion_databases:preserved;unknown_block:reference",
      "Distinguish recoverable raw content from a reference-only placeholder.",
    ],
  ],
  metadata: [
    [
      "yaml_front_matter",
      "YAML front matter",
      "icon;cover;page property;page properties;MultiMarkdown title block;MMD metadata",
      "metadata",
      "partial",
      "P2",
      "page.yaml:direct;syntax.metadata.yaml@yaml_metadata_block+metadata_values:source;opaque_block.metadata.yaml@yaml_metadata_block:preserved;syntax.metadata.mmd@mmd_title_block+metadata_values:source;opaque_block.metadata.mmd@mmd_title_block:preserved",
      "One metadata object with YAML and restricted MultiMarkdown encodings. MMD starts at the document beginning, uses ASCII letter/digit keys, ignores key case/spaces and keeps values as plain text; it is not full YAML. Body metadata never overwrites page YAML. Cover UI remains pending.",
    ],
    [
      "pandoc_title_block",
      "Pandoc title block",
      "",
      "metadata",
      "partial",
      "P2",
      "syntax.metadata.pandoc@pandoc_title_block+metadata_values:source;opaque_block.metadata.pandoc@pandoc_title_block:preserved",
      "Body metadata is retained; full field semantics and structured editing remain pending.",
    ],
  ],
  inline: [
    [
      "raw_source",
      "Inline raw source",
      "raw inline",
      "inline",
      "partial",
      "P2",
      "syntax_inline.raw@raw_attribute:source",
      "Pandoc raw_attribute syntax: a code span followed by {=format} is raw target-format content, not ordinary code. Notdown preserves it; HTML uses the sanitized inline HTML route, while other formats are not executed or exported by an external writer.",
    ],
    [
      "code_span",
      "Code span",
      "verbatim;inline code",
      "inline",
      "implemented",
      "P0",
      "mark.code:direct",
    ],
    [
      "emphasis",
      "Emphasis",
      "italic;em",
      "inline",
      "implemented",
      "P0",
      "mark.em:direct",
    ],
    [
      "strong_emphasis",
      "Strong emphasis",
      "bold;strong",
      "inline",
      "implemented",
      "P0",
      "mark.strong:direct",
    ],
    [
      "strikethrough",
      "Strikethrough",
      "strikeout;strike",
      "inline",
      "implemented",
      "P0",
      "mark.strike@strikeout:direct",
    ],
    ["link", "Link", "link mention", "inline", "implemented", "P0", "mark.link:direct;link_mention@notion_link_preview:reference"],
    [
      "image",
      "Image",
      "inline image",
      "inline",
      "partial",
      "P2",
      "image:direct",
    ],
    [
      "autolink",
      "Autolink",
      "automatic link",
      "inline",
      "implemented",
      "P0",
      "mark.link:text",
      "Shares the link mark; the original spelling is source provenance, not a separate node.",
    ],
    [
      "inline_html",
      "Inline HTML",
      "html_inline",
      "inline",
      "partial",
      "P2",
      "html_inline@raw_html:source",
      "A sanitized fragment, edited as source.",
    ],
    [
      "internal_link",
      "Internal link",
      "cross-reference;wikilink;page link",
      "inline",
      "partial",
      "P2",
      "page_link@wikilinks_title_after_pipe:reference;mark.link:direct",
      "Local page and heading links; not every cross-reference syntax is implemented.",
    ],
    [
      "emoji",
      "Emoji",
      "",
      "text",
      "partial",
      "P2",
      "text:text;text@emoji:text",
      "Unicode and supported shortcode expansion; no custom emoji resource directory.",
    ],
    [
      "inline_math",
      "Inline math",
      "inline equation",
      "inline",
      "implemented",
      "P0",
      "inline_math@tex_math_dollars:direct",
    ],
    [
      "subscript",
      "Subscript",
      "",
      "inline",
      "implemented",
      "P0",
      "mark.subscript@subscript:direct",
    ],
    [
      "superscript",
      "Superscript",
      "",
      "inline",
      "implemented",
      "P0",
      "mark.superscript@superscript:direct",
    ],
    [
      "highlight",
      "Highlight",
      "",
      "inline",
      "implemented",
      "P0",
      "mark.highlight@highlight:direct;mark.critic.highlight@critic_markup:direct",
    ],
    [
      "inline_comment",
      "Inline comment",
      "CriticMarkup comment",
      "inline",
      "partial",
      "P2",
      "syntax_inline.comment@comments:source;mark.critic.comment@critic_markup:direct",
    ],
    [
      "footnote",
      "Footnote",
      "footnotes;footnote reference",
      "inline",
      "partial",
      "P2",
      "footnote_reference@footnotes:reference",
      "The editable footnote body is a supporting internal block; reference diagnostics remain pending.",
    ],
    [
      "abbreviation",
      "Abbreviation",
      "acronym",
      "inline",
      "partial",
      "P2",
      "mark.abbreviation@abbreviations:direct;syntax_inline.abbreviation@mmd_abbreviations:source",
    ],
    [
      "citation",
      "Citation",
      "",
      "inline",
      "partial",
      "P2",
      "citation@notion_mentions:reference;syntax_inline.citation@mmd_citations:source",
      "Fixed-format bibliography support; no complete citeproc/CSL engine.",
    ],
    [
      "deletion",
      "Deletion",
      "CriticMarkup deletion",
      "inline",
      "implemented",
      "P0",
      "mark.critic.deletion@critic_markup:direct",
    ],
    [
      "addition",
      "Addition",
      "CriticMarkup addition",
      "inline",
      "implemented",
      "P0",
      "mark.critic.addition@critic_markup:direct",
    ],
    [
      "substitution",
      "Substitution",
      "CriticMarkup substitution",
      "inline",
      "partial",
      "P2",
      "mark.critic.substitution@critic_markup:direct",
      "New text is editable; old text is retained in the mark.",
    ],
    [
      "glossary",
      "Glossary",
      "",
      "inline",
      "partial",
      "P2",
      "syntax_inline.glossary@glossary:source",
    ],
    [
      "metadata_variable",
      "Metadata variable",
      "variable",
      "inline",
      "partial",
      "P2",
      "syntax_inline.variable@metadata_variables:source",
      "Reads body metadata, not page YAML.",
    ],
    [
      "underline",
      "Underline",
      "",
      "inline",
      "implemented",
      "P0",
      "mark.underline@notion_underline:direct",
    ],
    ["small_caps", "Small caps", "", "inline", "planned", "P3", ""],
    ["native_span", "Native span", "", "inline", "planned", "P3", ""],
    [
      "mention_person",
      "Mention person",
      "mention user",
      "inline",
      "partial",
      "P4",
      "mention.user@notion_mentions:reference",
      "Local People address book with CRUD, stable person IDs and @ completion; not workspace accounts or collaboration members.",
    ],
    [
      "mention_page_or_data_source",
      "Mention page or data source",
      "mention page;mention database",
      "inline",
      "partial",
      "P2",
      "page_link@notion_pages:reference;mention.database@notion_mentions:reference;mention.data-source@notion_mentions:reference",
    ],
    [
      "date_or_reminder",
      "Date or reminder",
      "date mention",
      "inline",
      "partial",
      "P4",
      "mention.date@notion_mentions:reference",
      "Inline date picker, date ranges, time, formats and local reminders while the app is open.",
    ],
    [
      "text_color",
      "Text color",
      "color",
      "inline",
      "implemented",
      "P0",
      "mark.color@notion_colors:direct",
    ],
    [
      "background_color",
      "Background color",
      "background",
      "inline",
      "implemented",
      "P0",
      "mark.color.background@notion_colors:direct",
    ],
  ],
  character: [
    [
      "line_break",
      "Line break",
      "hard break;hard_break",
      "text",
      "implemented",
      "P0",
      "hard_break:direct",
    ],
    [
      "html_entity",
      "HTML entity",
      "entity",
      "text",
      "implemented",
      "P0",
      "text:text",
    ],
    [
      "backslash_escape",
      "Backslash escape",
      "escape",
      "text",
      "implemented",
      "P0",
      "text:text",
    ],
    [
      "smart_typography",
      "Smart typography",
      "smart punctuation",
      "text",
      "partial",
      "P2",
      "text@smart:text",
      "Dialect text transformation; no independent node or complete typography engine.",
    ],
  ],
};

function definition(
  category: ContentCategory,
  row: Row,
): ContentObjectDefinition {
  const [key, name, aliases, structure, status, stage, encoded, note = ""] =
    row;
  return {
    id: `${category}.${key}`,
    category,
    name,
    aliases: aliases.split(";").filter(Boolean),
    structure,
    status,
    stage,
    note,
    adapters: encoded
      ? encoded.split(";").map((route) => {
          const [source, editing] = route.split(":");
          const [carrier, switches] = source.split("@");
          return {
            carrier,
            extensions: switches?.split("+") || [],
            editing: editing as EditingMode,
          };
        })
      : [],
  };
}
export const contentObjects: ContentObjectDefinition[] = Object.entries(
  rows,
).flatMap(([category, entries]) =>
  entries.map((row) => definition(category as ContentCategory, row)),
);
const byId = new Map(
  contentObjects.map((entry) => [entry.id, entry]),
);
export const contentObject = (id: string) => byId.get(id);
for (const name of Object.keys(objectSamples)) {
  if (!localObjectPlugins[name]) continue;
  const object = byId.get("block." + name)!;
  object.adapters = [{ carrier: name, extensions: [localObjectPlugins[name]], editing: "direct" }, ...object.adapters];
  object.status = "implemented";
  object.note = ({
    web_bookmark: "Empty bookmark and URL popover; paste as Bookmark. Fetches public webpage title, description, icon and cover on creation or manual refresh; metadata is saved in Markdown. Failed requests retain the link. Edit properties, caption and link; undo and redo. Login-only or script-rendered pages may need manual details.",
    link_preview: "GitHub repository, issue, PR and code previews; OneDrive / SharePoint file thumbnails and metadata. Paste as link, inline mention or preview. Remote refresh never changes Markdown. Private content requires a local token; OAuth sign-in and automatic token renewal are not implemented.",
    ai_block: "Editable prompt and result; Generate calls the configured OpenAI-compatible service. Delayed results never replace concurrent edits.",
    meeting_notes: "Editable meeting notes and audio path; Transcribe uses the configured OpenAI-compatible service and stores the editable transcript.",
    button: "Click to run; hover to configure name, icon, style and ordered actions. Insert Markdown blocks in four positions, confirm, or open a page/URL. One undo per run; legacy actions preserved. Database/cloud actions are not supported.",
    tabs: "Editable tab titles and bodies, active tab selection, adding, removing and reordering tabs; all changes are undoable.",
    html_embed: "Upload or drop an HTML file, or enter HTML code directly. Editable sandboxed preview saved with the page; scripts are disabled.",
    embed_web_contents: "Insert an empty web embed and enter an HTTP(S) URL. Editable isolated preview; remote sites may refuse embedding.",
    image_block: "Editable image URL, alternative text, title and separate caption.",
    breadcrumb: "Clickable page icons and titles from the vault's root page to the current page, following its parent hierarchy.",
  } as Record<string, string>)[name] || "Editable URL, title, description and image metadata. Local card content is preserved with the page.";
}
// Completion describes the local object contract, independently of a dialect's
// full upstream language or an external service account being configured.
for (const [id, note] of Object.entries({
  "block.toggle_heading": "Official toggle heading with editable heading and children, subtree movement and undo. Persisted folding is supplemental and Notdown-only.",
  "block.table": "One model for pipe, Notion, MMD, grid, simple and multiline tables. Edit cells/captions, add/delete rows/columns, merge/split cells. Span commands require an enabled encoding that can retain geometry.",
  "block.native_div": "Fenced and native HTML Div share editable children and a properties form; original encoding and unknown attributes are retained.",
  "block.raw_tex": "Bare TeX environments and commands, explicit raw TeX fences, source editing and Markdown round trips. TeX is not executed by the browser.",
  "block.video": "Local playback and editable attachment URL/caption; undo and Markdown persistence.",
  "block.audio": "Local playback and editable attachment URL/caption; undo and Markdown persistence.",
  "block.file": "Editable attachment URL and caption with a download link; binary contents stay in the attachment.",
  "block.definition_list_item": "Edit terms and bodies; add, remove and move term/definition groups independently with undo.",
  "inline.image": "Inline images have editable URL, alternative text and title through double-click properties.",
  "inline.inline_html": "Double-click to edit one HTML fragment as source; preview stays sanitized.",
  "inline.inline_comment": "Comments remain distinct from visible text; inline source can be edited through properties and CriticMarkup text stays editable.",
  "inline.glossary": "Inline glossary source and definitions are editable; references resolve against document definitions.",
  "inline.metadata_variable": "Editable variable name and live lookup in body metadata; it does not overwrite page YAML.",
  "block.unsupported": "Unknown source can be edited through properties; reference-only placeholders have separate URL/description fields. Unchanged raw content is retained.",
  "block.diagram": "Mermaid, sequence and flow diagrams have local previews and a source editor. Rendering errors leave editable source intact.",
  "block.html_block": "Sanitized HTML preview and a source editor; HTML embed remains a separate document object.",
  "block.raw_source": "Format-tagged content has a source editor and preserves the declared format. Browser rendering is available for HTML; other target formats remain raw for their writers.",
  "block.pdf": "Editable PDF attachment URL/caption, an embedded browser PDF viewer for local files and an Open PDF fallback link.",
  "block.file_transclusion": "Editable block/inline inclusion references and recursive local previews, with file-change refresh and cycle/path/size checks. Included source remains a separate file.",
  "block.embed_web_contents": "Editable URL iframe in an isolated preview. Availability depends on the remote site's embedding policy.",
  "block.block_comment": "Editable Markdown source comments, retained on disk and omitted from rendered output.",
  "block.link_to_page": "Explicit block reference to an existing page; insertion and navigation do not change the target's parent.",
  "block.child_page": "Creating a child creates a page resource with its parent. Page metadata controls ownership; the supplemental role=child marker is only written in Notdown.",
  "block.synced_block": "Official tags preserve references and snapshots. In Notdown only: local source IDs, refresh/publish and optional live refresh that pauses on local edits. Publishing uses the captured source revision and preserves CAS conflicts. No cross-device sync.",
  "metadata.yaml_front_matter": "Page properties include a cover field. Body YAML/MMD have field and source editors and never overwrite page YAML. MMD remains restricted plain-text metadata, not full YAML.",
  "metadata.pandoc_title_block": "Title, author and date fields, continuation lines and source editing retain the Pandoc title-block encoding separately from page YAML.",
  "inline.raw_source": "Double-click to edit target-format raw source; format tags persist. HTML preview is sanitized and other formats are retained for their writers.",
  "inline.internal_link": "Editable local page/heading links, both wiki-link title orders and labelled example references; targets remain distinct from child-page ownership.",
  "inline.emoji": "Unicode text and enabled shortcode expansion; follows normal text insertion, selection, movement and undo.",
  "inline.footnote": "Editable references, definition bodies and inline notes; missing definitions are indicated. Reference properties change the identifier.",
  "inline.abbreviation": "Editable MMD abbreviation source and PHP abbreviation text/expansion. Double-click properties update the document's abbreviation definition.",
  "inline.citation": "Editable citation source, MMD bibliography lookup and Pandoc CSL citeproc preview with local bibliography/style files. CSL processing requires the installed Pandoc executable.",
  "inline.substitution": "Replacement text is edited inline; double-click revision properties edits the retained original text. Both values persist as CriticMarkup.",
  "inline.mention_person": "Editable person reference URL and display label. This local object does not authenticate a member or connect an external directory.",
  "inline.mention_page_or_data_source": "Editable page/data-source references and labels; local pages resolve to their current titles. A reference does not create a database.",
  "inline.date_or_reminder": "Official date fields are editable through properties. Notdown additionally supports the date picker, formatting and local reminders while the app is open; desktop notifications require browser permission.",
  "character.smart_typography": "Dialect-controlled smart punctuation, legacy dash rules and ordinary text editing; a text-processing capability, not a separate node.",
})) { const object = byId.get(id)!; object.status = "implemented"; object.note = note; }
byId.get("inline.footnote")!.adapters.push({ carrier: "inline_note", extensions: ["inline_notes"], editing: "direct" });
byId.get("inline.citation")!.adapters.push({ carrier: "syntax_inline.citation", extensions: ["citations"], editing: "source" });

export function getContentCapabilities(id: string, config: SyntaxConfig) {
  const object = byId.get(id);
  const adapters =
    object?.adapters.filter(
      (adapter) =>
        adapter.extensions.every((flag) => enabled(config, flag)),
    ) || [];
  return {
    object,
    adapters,
    available: adapters.length > 0,
    editing: [...new Set(adapters.map((a) => a.editing))],
  };
}

/** Supporting nodes are deliberately not additional product block types. */
export const implementationRoles: Record<string, string> = {
  doc: "Document root",
  text: "Text storage",
  nested_block: "Parent/children wrapper",
  bullet_list: "Bullet list grouping",
  ordered_list: "Numbered list grouping",
  column: "Column structure",
  tab: "Tab panel",
  example_list: "Example list group",
  table_row: "Table row",
  table_cell: "Table cell",
  table_caption: "Table caption",
  definition_term: "Definition term",
  definition_description: "Definition body",
  line: "Line structure",
  footnote: "Footnote body",
  footnote_section: "Footnotes presentation",
  footnote_anchor: "Footnote source position",
  "syntax.definition": "Reference definition",
};
for (const [id, carrier, flag] of [
  ["inline.native_span", "mark.native_span", "bracketed_spans"],
  ["inline.small_caps", "mark.small_caps", "bracketed_spans"],
  ["block.example_list_item", "example_list_item", "example_lists"],
] as const) {
  const object = byId.get(id)!;
  object.status = "implemented"; object.adapters = [{ carrier, extensions: [flag], editing: "direct" }];
  object.note = "Native editable structure with source-preserving parsing and serialization.";
}
for (const id of ["inline.native_span", "inline.small_caps"]) {
  const object = byId.get(id)!;
  for (const flag of ["native_spans", "attributes"])
    object.adapters.push({ carrier: object.adapters[0].carrier, extensions: [flag], editing: "direct" });
}
const nodeObjects: Record<string, string> = {
  link_mention: "inline.link",
  paragraph: "block.paragraph",
  heading: "block.heading",
  blockquote: "block.quote",
  horizontal_rule: "block.divider",
  code_block: "block.code_block",
  line_block: "block.line_block",
  table: "block.table",
  columns: "block.columns",
  callout: "block.callout",
  toggle_block: "block.toggle",
  fenced_div: "block.native_div",
  equation: "block.math_block",
  html_block: "block.html_block",
  html_inline: "inline.inline_html",
  synced_block: "block.synced_block",
  table_of_contents: "block.table_of_contents",
  opaque_block: "block.unsupported",
  unknown_block: "block.unsupported",
  definition_list: "block.definition_list_item",
  image: "inline.image",
  hard_break: "character.line_break",
  footnote_reference: "inline.footnote",
  inline_math: "inline.inline_math",
  citation: "inline.citation",
};
export interface ObjectContext {
  parent?: PMNode;
  list?: PMNode;
  pageRole?: "child" | "reference";
}
export function resolveContentObject(
  node: PMNode,
  context: ObjectContext = {},
): ContentObjectDefinition | undefined {
  let id = nodeObjects[node.type.name];
  const a = node.attrs;
  if (node.type.name === "opaque_block" && a.metadataForm)
    id = a.metadataForm === "pandoc" ? "metadata.pandoc_title_block" : "metadata.yaml_front_matter";
  if (node.type.name === "nested_block")
    return node.firstChild
      ? resolveContentObject(node.firstChild, context)
      : undefined;
  if (node.type.name === "heading" && a.toggle) id = "block.toggle_heading";
  if (isListItem(node))
    id =
      "block." +
      (node.type.name === "task_list_item"
        ? "task_list_item"
        : node.type.name === "numbered_list_item"
          ? "numbered_list_item"
          : "bullet_list_item");
  if (
    node.type.name === "paragraph" &&
    node.childCount === 1 &&
    node.firstChild?.type.name === "image" &&
    (!context.parent || (context.parent.isBlock && !context.parent.isTextblock))
  )
    id = "block.image_block";
  if (
    node.type.name === "image" &&
    context.parent?.type.name === "paragraph" &&
    context.parent.childCount === 1
  )
    id = "block.image_block";
  if (node.type.name === "child_page")
    id =
      (context.pageRole ? context.pageRole === "child" : a.nfmAttrs?.role === "child") ? "block.child_page" : "block.link_to_page";
  if (node.type.name === "page_link")
    id =
      Object.keys(a.nfmAttrs || {}).length || a.url
        ? "inline.mention_page_or_data_source"
        : "inline.internal_link";
  if (node.type.name === "media_block") id = `block.${a.type}`;
  if (node.type.name === "mention")
    id =
      "inline." +
      ({
        user: "mention_person",
        date: "date_or_reminder",
      }[String(a.kind)] || "mention_page_or_data_source");
  if (node.type.name === "syntax_block") {
    id = (
      {
        diagram: "block.diagram",
        embed: "block.embed_web_contents",
        figure: "block.image_block",
        comment: "block.block_comment",
        transclusion: "block.file_transclusion",
        "html-markdown": "block.html_block",
      } as Record<string, string>
    )[a.kind];
    if (a.kind === "raw")
      id = /^(tex|latex)$/.test(a.data?.format)
        ? "block.raw_tex"
        : a.data?.format === "html"
          ? "block.html_block"
          : "block.raw_source";
    if (a.kind === "metadata")
      id =
        "metadata." +
        (a.metadataForm === "pandoc" || String(a.raw).startsWith("%")
            ? "pandoc_title_block"
            : "yaml_front_matter");
    if (a.kind !== "definition" && !id) id = "block.unsupported";
  }
  if (node.type.name === "syntax_inline")
    if (a.kind === "example-reference") return byId.get("inline.internal_link");
  if (node.type.name === "syntax_inline")
    id =
      "inline." +
      ((
        {
          comment: "inline_comment",
          variable: "metadata_variable",
          unresolved_reference: "link",
        } as Record<string, string>
      )[a.kind] || a.kind);
  if (node.type.name === "syntax_inline" && a.kind === "transclusion")
    id = "block.file_transclusion";
  if (node.type.name === "syntax_inline" && a.kind === "raw")
    id = a.title === "html" ? "inline.inline_html" : "inline.raw_source";
  return byId.get(objectId(node) || id);
}
export function resolveMarkObject(
  mark: Mark,
): ContentObjectDefinition | undefined {
  const name = mark.type.name;
  const key =
    name === "critic"
      ? mark.attrs.kind === "comment"
        ? "inline_comment"
        : mark.attrs.kind
      : name === "color"
        ? String(mark.attrs.color).endsWith("_bg")
          ? "background_color"
          : "text_color"
        : (
            {
              code: "code_span",
              em: "emphasis",
              strong: "strong_emphasis",
              strike: "strikethrough",
            } as Record<string, string>
          )[name] || name;
  return byId.get(`inline.${key}`);
}
const commandObjects: Record<string, string> = {
  mention_person: "inline.mention_person", date_or_reminder: "inline.date_or_reminder",
  native_span: "inline.native_span", small_caps: "inline.small_caps", raw_inline: "inline.raw_source", inline_note: "inline.footnote",
  text: "block.paragraph",
  heading1: "block.heading",
  heading2: "block.heading",
  heading3: "block.heading",
  list: "block.bullet_list_item",
  number: "block.numbered_list_item",
  task: "block.task_list_item",
  quote: "block.quote",
  divider: "block.divider",
  code: "block.code_block",
  inline: "inline.code_span",
  child: "block.child_page",
  link: "block.link_to_page",
  mention: "inline.mention_page_or_data_source",
  columns: "block.columns",
  callout: "block.callout",
  alert: "block.callout",
  toggle: "block.toggle",
  table: "block.table",
  toc: "block.table_of_contents",
  equation: "block.math_block",
  diagram: "block.diagram",
  comment: "block.block_comment",
  transclusion: "block.file_transclusion",
  embed: "block.embed_web_contents",
  html: "block.html_block",
  definitions: "block.definition_list_item",
  footnote: "inline.footnote",
  lines: "block.line_block",
  div: "block.native_div",
};
export function contentCommand(command: string, config?: SyntaxConfig) {
  const object = byId.get(commandObjects[command] || "block." + command);
  const level = /^heading([1-6])$/.exec(command)?.[1];
  return {
    object,
    label: object ? object.name + (level ? ` ${level}` : "") : undefined,
    aliases: object?.aliases || [],
    enabled: !config || commandEnabled(config, command),
  };
}
