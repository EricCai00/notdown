import { contentCommand } from "../document/content-objects";
import { objectSamples } from "../document/object-model";
import type { SyntaxConfig } from "../markdown-engine/config";

export const insertGroups = ["Notion basic", "Databases", "Notion advanced", "Notion media", "Notion embeds", "Notion inline", "Notion style", "Markdown blocks", "Markdown inline"];
const objectIcons: Record<string, string> = {
  tabs: "panels-top-left", web_bookmark: "bookmark", link_preview: "panel-top", breadcrumb: "navigation",
  button: "mouse-pointer-2", meeting_notes: "mic", ai_block: "sparkles", image_block: "image",
};
function insertGroup(id: string): string {
  if (["database_full_page", "database_inline", "wiki"].includes(id)) return "Databases";
  if (id === "r_inline" || id === "executable_inline") return "Markdown inline";
  if (["text", "child", "task", "heading1", "heading2", "heading3", "heading4", "list", "number", "quote", "divider", "link", "callout", "toggle", "table"].includes(id)) return "Notion basic";
  if (["columns", "toc", "equation", "toggle_heading", "synced_block", "button", "breadcrumb", "meeting_notes", "ai_block", "tabs"].includes(id)) return "Notion advanced";
  if (["code", "image", "video", "audio", "pdf", "file", "attachments", "web_bookmark", "link_preview", "image_block"].includes(id)) return "Notion media";
  if (["embed", "html_embed"].includes(id)) return "Notion embeds";
  if (["inline", "page_link", "location_link", "mention", "mention_person", "date_or_reminder", "inline_equation", "emoji"].includes(id)) return "Notion inline";
  if (["bold", "italic", "underline", "strike", "color", "background"].includes(id)) return "Notion style";
  if (["citation", "abbreviation", "glossary", "metadata_variable", "addition", "deletion", "substitution", "footnote", "native_span", "small_caps", "inline_comment", "subscript", "superscript", "highlight"].includes(id)) return "Markdown inline";
  return "Markdown blocks";
}
// The footer offers portable Markdown blocks. Existing extension content is
// still preserved by the codec; product containers are not offered here.
const footnoteCommands = new Set("text task heading1 heading2 heading3 heading4 heading5 heading6 list number quote divider code inline table equation diagram html definitions lines div file image image_block inline_equation bold italic underline strike color background subscript superscript highlight emoji native_span small_caps".split(" "));
const typingAliases: Record<string, string> = {
  text: "plain", number: "num", heading1: "#", heading2: "##", heading3: "###",
  equation: "latex", web_bookmark: "book", date_or_reminder: "reminder", task: "to-do",
};
export function insertMenuItems(config?: SyntaxConfig, inFootnote = false) {
  return [
    ["database_full_page", "table-2", "Database - Full page", "Create a database as a child page.", "database full page collection 数据库 整页"],
    ["database_inline", "table-2", "Database - Inline", "Create an editable database inside this page.", "database inline collection 数据库 内嵌"],
    ["wiki", "book-open", "Wiki", "Create a wiki with a Home page and page views.", "wiki knowledge base 知识库 维基"],
    ["executable_chunk", "code", "Executable Chunk", "Choose a language for an executable code block.", "quarto r python julia ojs javascript knitr executable chunk 可执行代码块"],
    ["executable_inline", "code-xml", "Executable Expression", "Choose a language for an inline expression.", "quarto r python julia ojs javascript inline expression 行内表达式"],
    ["citation", "quote", "Citation", "Insert or reuse a source reference.", "citation 引文 文献"],
    ["abbreviation", "type", "Abbreviation", "Define or reuse an abbreviation.", "abbreviation acronym 缩写"],
    ["glossary", "book-open", "Glossary", "Define or reuse a glossary term.", "glossary 术语"],
    ["metadata_variable", "type", "Metadata variable", "Insert a reference to document metadata.", "metadata variable 变量"],
    ["addition", "plus", "Addition", "Propose added text with CriticMarkup.", "revision addition 修订 新增"],
    ["deletion", "minus", "Deletion", "Propose removed text with CriticMarkup.", "revision deletion 修订 删除"],
    ["substitution", "arrow-right", "Substitution", "Propose replacement text with CriticMarkup.", "revision substitution 修订 替换"],
    ["text", "pen-line", "Text", "Start writing plain text.", "paragraph text"],
    ["child", "file-plus-2", "Page", "Embed a child page here.", "page child"],
    [
      "task",
      "square-check",
      "To-do list",
      "Track tasks with a to-do list.",
      "todo checkbox task",
    ],
    ["heading1", "heading-1", "Heading 1", "Large heading.", "h1 heading"],
    ["heading2", "heading-2", "Heading 2", "Medium heading.", "h2 heading"],
    ["heading3", "heading-3", "Heading 3", "Small heading.", "h3 heading"],
    ["heading4", "heading-4", "Heading 4", "Fourth-level heading.", "h4 heading"],
    ["heading5", "heading-5", "Heading 5", "Fifth-level heading.", "h5 heading"],
    ["heading6", "heading-6", "Heading 6", "Sixth-level heading.", "h6 heading"],
    ["list", "list", "Bulleted list", "Create a simple bulleted list.", "bullet list"],
    ["number", "list-ordered", "Numbered list", "Create a numbered list.", "number ordered"],
    ["quote", "quote", "Quote", "Quote a passage.", "quote"],
    ["divider", "minus", "Divider", "Separate sections visually.", "divider hr"],
    ["code", "code", "Code", "Add a code block.", "code"],
    ["inline", "code-xml", "Inline code", "Insert code in your text.", "inline"],
    ["page_link", "link-2", "Page link", "Link to a page in your text.", "page link mention wiki 页面链接 页面提及"],
    ["location_link", "hash", "Location link", "Link to a heading, block or anchor in any page.", "location heading block anchor line 位置链接 标题 块 锚点 行"],
    ["columns", "columns-2", "Two columns", "Place content side by side.", "columns"],
    ["callout", "lightbulb", "Callout", "Highlight a note.", "callout"],
    ["alert", "circle-alert", "GitHub-style Alert", "A colored alert with an optional title and folding.", "github alert note tip important warning caution 提示 警告"],
    [
      "toggle",
      "chevron-right",
      "Toggle list",
      "Expand or collapse nested content.",
      "toggle details",
    ],
    ["table", "table-2", "Simple table", "Organize content in rows and columns.", "table"],
    ["toc", "list-tree", "Table of contents", "Jump to headings on the page.", "toc contents"],
    ["equation", "sigma", "Equation", "Insert a math equation.", "math equation"],
    [
      "diagram",
      "workflow",
      "Diagram",
      "Live Mermaid preview.",
      "mermaid diagram sequence flow",
    ],
    [
      "comment",
      "message-square",
      "Hidden comments",
      "Preserve in source; hide on the page.",
      "comment",
    ],
    ["inline_comment", "message-square", "Inline comment", "Write a hidden comment at the current text position.", "inline comment hidden 注释"],
    [
      "transclusion",
      "file-text",
      "File inclusion",
      "Include a file from the vault.",
      "transclusion",
    ],
    [
      "embed",
      "external-link",
        "Web embed",
        "Embed a webpage from its URL.",
        "iframe embed web url 网页 嵌入 网址",
    ],
    ["html_embed", "code-xml", "HTML embed", "Upload an HTML file as an interactive document.", "html embed upload file 嵌入 上传 文件"],
    [
      "html",
      "code-xml",
      "HTML block",
      "Display HTML with editable source.",
      "html raw",
    ],
    [
      "definitions",
      "book-open",
      "Definition lists",
      "Terms and definitions, including multiple paragraphs.",
      "definition list",
    ],
    [
      "footnote",
      "footnote",
      "Footnote",
      "Insert an inline reference with its definition at the end of the document.",
      "footnote reference 脚注",
    ],
    [
      "lines",
      "align-left",
      "Line blocks",
      "Preserve line breaks in poetry or addresses.",
      "line block verse",
    ],
    [
      "div",
      "square",
      "Div containers",
      "A Markdown container with attributes.",
      "fenced div container",
    ],
    ["image", "image", "Image", "Upload an image to display on the page.", "image picture photo 图片 图像"],
    ["video", "video", "Video", "Upload a video with playback controls.", "video movie 视频"],
    ["audio", "music", "Audio", "Upload audio with playback controls.", "audio music sound 音频 音乐"],
    ["pdf", "file-text", "PDF", "Upload a PDF to preview on the page.", "pdf document 文档"],
    ["file", "paperclip", "File", "Upload a file card with its name and size.", "file attachment download 文件 附件"],
    ["attachments", "files", "From attachments", "Reuse a file already in this vault.", "assets library existing media 附件库 资源"],
    ...Object.keys(objectSamples).filter(id => id !== "web_embed").map(id => [id, (objectIcons[id] || "square"), contentCommand(id).label || id, "Insert an editable " + (contentCommand(id).label || id) + ".", id.replace(/_/g, " ")]),
    ["toggle_heading", "chevron-right", "Toggle heading", "A heading with collapsible child blocks.", "collapsible heading"],
    ["example_list_item", "list-ordered", "Example list item", "A numbered example with a stable label.", "example list"],
    ["synced_block", "copy", "Synced block", "Reuse content across local pages. Copy, sync and unsync.", "synced source snapshot"],
    ["mention_person", "user", "Mention person", "An editable person reference and label.", "person user mention"],
    ["date_or_reminder", "calendar", "Date or reminder", "An editable date with an optional local reminder.", "date reminder"],
    ["native_span", "type", "Native span", "Inline text with editable attributes.", "span attributes"],
    ["small_caps", "type", "Small caps", "Text displayed in small capitals.", "small caps"],
    ["inline_equation", "sigma", "Inline equation", "Write a formula within text.", "inline math 公式"],
    ["bold", "bold", "Bold", "Insert bold text.", "strong 粗体"],
    ["italic", "italic", "Italic", "Insert italic text.", "emphasis 斜体"],
    ["underline", "underline", "Underline", "Insert underlined text.", "下划线"],
    ["strike", "strikethrough", "Strikethrough", "Insert struck-through text.", "删除线"],
    ["color", "palette", "Text color", "Insert colored text; adjust it in the selection menu.", "颜色 style"],
    ["background", "paint-bucket", "Background color", "Insert text with a background color.", "背景 style"],
    ["subscript", "subscript", "Subscript", "Insert subscript text.", "下标"],
    ["superscript", "superscript", "Superscript", "Insert superscript text.", "上标"],
    ["highlight", "highlighter", "Highlight", "Insert highlighted text.", "高亮"],
    ["emoji", "smile", "Emoji", "Insert an emoji character.", "表情"],
  ].filter(([id]) => contentCommand(id, config).enabled && (id !== "alert" || config?.variant === "notdown") && (!inFootnote || footnoteCommands.has(id)))
    .map(([id, icon, title, description, aliases]) => {
      const entry = contentCommand(id);
      return [id, icon, ["image", "footnote", "alert", "page_link", "location_link", "html_embed", "embed"].includes(id) ? title : entry.label || title, description, [aliases, typingAliases[id] || "", ...(["embed", "html_embed"].includes(id) ? [] : entry.aliases)].join(" "), insertGroup(id)];
    }).sort((a, b) => insertGroups.indexOf(a[5]) - insertGroups.indexOf(b[5]));
}
