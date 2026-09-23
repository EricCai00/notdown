import { dialectDefaults, localObjectPlugins } from "./presets";
export { dialectDefaults, localObjectPlugins } from "./presets";
import type { BodyFormat } from "../notion-syntax.js";
import { nativeAdvancedExtensions, advancedDescriptions } from "./advanced-definitions";
import pandocSnapshot from "../../docs/data/pandoc-3.11-extensions.json";

export const pandocDefaults = pandocSnapshot.variants as Record<
  string,
  Record<string, boolean>
>;
export const markdownFamily = (config: SyntaxConfig) =>
  config.variant.startsWith("markdown") || config.variant === "typora";

const productExtensions = new Set([
  "highlight",
  "comments",
  "toc_directives",
  "diagrams",
  "html_embed",
  "mmd_tables",
  "mmd_abbreviations",
  "mmd_citations",
  "critic_markup",
  "transclusion",
  "glossary",
  "metadata_values",
  "metadata_variables",
  "typora_loose_lists",
]);
export const productDefaults = dialectDefaults;

export const dialects = [
  { id: "typora", label: "Typora", native: true },
  { id: "obsidian", label: "Obsidian", native: true },
  { id: "notion-markdown", label: "Notion-flavored Markdown", native: true },
  { id: "notdown", label: "Notdown", native: true },
  { id: "commonmark", label: "CommonMark", native: true },
  { id: "gfm", label: "GitHub Flavored Markdown", native: true },
  { id: "markdown", label: "Pandoc Markdown", native: true },
  { id: "commonmark_x", label: "CommonMark X", native: true },
  { id: "markdown_strict", label: "Original Markdown", native: true },
  {
    id: "markdown_phpextra",
    label: "PHP Markdown Extra",
    native: true,
  },
  { id: "markdown_mmd", label: "MultiMarkdown", native: true },
  {
    id: "markdown_github",
    label: "Legacy GitHub Markdown",
    native: true,
  },
] as const;
export type Dialect = (typeof dialects)[number]["id"];
export interface SyntaxConfig {
  version: 1;
  variant: Dialect;
  extensions: Record<string, boolean>;
  [key: string]: unknown;
}
/** Both presets share the same source grammar and serializer. */
export const usesNotionSyntax = (config: Pick<SyntaxConfig, "variant">) =>
  config.variant === "notion-markdown" || config.variant === "notdown";
const blockLabels: Record<string, string> = {
  embed_web_contents: "Web embed",
  tabs: "Tabs", web_bookmark: "Bookmark", link_preview: "Link preview", breadcrumb: "Breadcrumb",
  button: "Button", meeting_notes: "Meeting notes", ai_block: "AI block", html_embed: "HTML document", image_block: "Image with caption",
};
type Extension = {
  id: string;
  label: string;
  description: string;
  kind: "syntax" | "block";
};
export const extensions: Extension[] = [
  ...Object.entries(localObjectPlugins).filter(([name]) => name !== "tab" && name !== "link_mention").map(([name, id]) => ({
    id, label: blockLabels[name],
    description: "Supplemental Notion encoding, available only in the Notdown variant. Not part of official enhanced Markdown.",
    defaults: ["notdown"], kind: "block" as const,
  })),
  { id: "display_math", label: "Display math", description: "Double-dollar block equations, independently of optional inline math.", kind: "syntax" },
  ...nativeAdvancedExtensions.map(id => ({ id, label: id.replace(/_/g, " ").replace(/^./, c => c.toUpperCase()), description: advancedDescriptions[id] || `Parse and edit ${id.replace(/_/g, " ")} with the local Markdown codec.`, kind: "syntax" as const })),
  ...(
    [
      ["alerts", "Alerts and callouts", "Collapsible GitHub / Obsidian > [!NOTE] alerts."],
      ["highlight", "Highlight", "==text==."],
      ["comments", "Hidden comments", "%%inline or multiline comments%%."],
      ["toc_directives", "Table of contents directives", "[toc], {{TOC}}, and heading level ranges."],
      ["diagrams", "Diagram", "Render mermaid, sequence, and flow code fences as diagrams."],
      ["html_embed", "Embedded page", "Display HTML iframes in isolated frames."],
      ["header_attributes", "Heading attributes", "Heading IDs, classes, and language attributes."],
      ["link_attributes", "Link and image attributes", "Attributes for links, images, and reference definitions."],
      ["fenced_code_attributes", "Code attributes", "Code fence languages, IDs, and classes."],
      ["mmd_link_attributes", "MMD link attributes", "Key-value attributes for inline and reference links."],
      [
        "markdown_attribute",
        "Markdown inside HTML",
        "Parse Markdown inside containers with markdown=1.",
      ],
      ["auto_identifiers", "Automatic heading anchors", "Generate unique anchors from heading text."],
      ["mmd_header_identifiers", "MMD heading identifiers", "An [identifier] after a heading."],
      [
        "implicit_header_references",
        "Heading cross-references",
        "Reference headings by title or identifier.",
      ],
      ["short_subsuperscripts", "Short subscript and superscript", "x~z and 100m^2, without closing delimiters."],
      [
        "tex_math_double_backslash",
        "Double-backslash math",
        "Math delimited by parentheses or brackets with double backslashes.",
      ],
      ["raw_attribute", "Raw output formats", "Output formats such as {=html} or {=latex} after code."],
      ["implicit_figures", "Standalone images and captions", "Display standalone images as figures with captions."],
      ["mmd_tables", "MultiMarkdown tables", "Column spans, grouped headers, sections, and captions."],
      ["mmd_abbreviations", "MMD abbreviations", "[>abbreviation] and inline definitions."],
      ["mmd_citations", "MMD citations", "Citation keys, inline bibliography entries, and reference lists."],
      ["critic_markup", "CriticMarkup revisions", "Additions, deletions, substitutions, highlights, and comments."],
      ["transclusion", "File inclusion", "{{file}}, with extension wildcards and nested dependencies."],
      ["glossary", "Glossary", "[?term] references and inline definitions."],
      [
        "metadata_values",
        "Document metadata",
        "Display structured document metadata without overwriting vault page properties.",
      ],
      ["metadata_variables", "Metadata variables", "[%name] references metadata at the start of the document."],
      ["typora_loose_lists", "Loose lists", "Typora nested lists with two-space indentation."],
    ] as const
  ).map(([id, label, description]) => ({
    id,
    label,
    description,
    kind: "syntax" as const,
  })),
  ...(
    [
      ["blank_before_header", "Blank line before headings", "Require a blank line before ATX headings."],
      ["blank_before_blockquote", "Blank line before blockquotes", "Require a blank line before blockquotes."],
      [
        "space_in_atx_header",
        "Space after heading hash",
        "Require a space between the hash and heading text.",
      ],
      [
        "lists_without_preceding_blankline",
        "Lists without preceding blank lines",
        "Allow lists directly after paragraphs.",
      ],
      ["startnum", "Preserve list start number", "Start ordered lists at the number in the source."],
      ["backtick_code_blocks", "Backtick code fences", "Wrap code in backticks."],
      ["fenced_code_blocks", "Tilde code fences", "Wrap code in ~~~ fences."],
      ["escaped_line_breaks", "Backslash line breaks", "A trailing backslash inserts a hard line break."],
      ["all_symbols_escapable", "Extended punctuation escapes", "Backslashes can escape all punctuation."],
      [
        "intraword_underscores",
        "Underscores within words",
        "Treat underscores within words literally instead of as emphasis.",
      ],
      ["ignore_line_breaks", "Ignore source line breaks", "Join wrapped paragraph lines without adding spaces."],
      ["smart", "Smart punctuation", "Convert quotes, dashes, and ellipses to typographic punctuation."],
      ["subscript", "Subscript", "Use ~subscript~."],
      ["superscript", "Superscript", "Use ^superscript^."],
      ["abbreviations", "Abbreviation definitions", "*[abbreviation]: definition adds a tooltip to an abbreviation."],
      ["emoji", "Emoji names", "Render names such as :smile: as emoji."],
      [
        "yaml_metadata_block",
        "YAML metadata blocks",
        "Recognize and preserve YAML metadata in the body without overwriting page properties.",
      ],
      [
        "pandoc_title_block",
        "Pandoc title blocks",
        "Recognize and preserve leading % title, author, and date lines.",
      ],
      [
        "mmd_title_block",
        "MultiMarkdown title blocks",
        "Recognize and preserve leading Key: Value metadata.",
      ],
    ] as const
  ).map(([id, label, description]): Extension => ({
    id,
    label,
    description,
    kind: "syntax",
  })),
  {
    id: "raw_html",
    label: "HTML",
    description: "Display HTML blocks and inline HTML fragments while preserving the source.",
    kind: "syntax",
  },
  {
    id: "definition_lists",
    label: "Definition lists",
    description: "Define terms with : or ~, including multiple paragraphs.",
    kind: "syntax",
  },
  {
    id: "footnotes",
    label: "Footnotes",
    description: "[^label] references and [^label]: definitions with multiple paragraphs.",
    kind: "syntax",
  },
  {
    id: "line_blocks",
    label: "Line blocks",
    description: "Start lines with | to preserve line breaks and indentation in poetry or addresses.",
    kind: "syntax",
  },
  {
    id: "fenced_divs",
    label: "Div containers",
    description: "Wrap Markdown blocks in ::: {.class}; nesting and original attributes are preserved.",
    kind: "syntax",
  },
  {
    id: "pipe_tables",
    label: "Pipe tables",
    description: "Tables separated by vertical bars, with editable cells.",
    kind: "syntax",
  },
  {
    id: "strikeout",
    label: "Strikethrough",
    description: "Use ~~text~~ for strikethrough.",
    kind: "syntax",
  },
  {
    id: "task_lists",
    label: "Task lists",
    description: "Recognize and edit - [ ] and - [x].",
    kind: "syntax",
  },
  {
    id: "autolink_bare_uris",
    label: "Automatic URL links",
    description: "Recognize URLs in the document as links.",
    kind: "syntax",
  },
  {
    id: "hard_line_breaks",
    label: "Newlines as hard breaks",
    description: "Display source newlines as line breaks in CommonMark / GFM paragraphs.",
    kind: "syntax",
  },
  {
    id: "tex_math_dollars",
    label: "Dollar-delimited math",
    description: "Use $…$ and $$…$$ with local math rendering.",
    kind: "syntax",
  },
  {
    id: "wikilinks_title_after_pipe",
    label: "Page wiki links",
    description: "[[target|title]]; the title follows the vertical bar.",
    kind: "syntax",
  },
  {
    id: "notion_columns",
    label: "Columns",
    description: "Use <columns> / <column> containers.",
    kind: "block",
  },
  {
    id: "notion_callouts",
    label: "Callout",
    description: "Use <callout> containers.",
    kind: "block",
  },
  {
    id: "notion_toggles",
    label: "Toggle blocks",
    description: "Use <details> / <summary>.",
    kind: "block",
  },
  {
    id: "notion_tables",
    label: "Notion tables",
    description: "Use <table> / <tr> / <td>, managed separately from pipe tables.",
    kind: "block",
  },
  {
    id: "notion_pages",
    label: "Page references",
    description: "Child pages and <mention-page>.",
    kind: "block",
  },
  {
    id: "notion_mentions",
    label: "Person and date mentions",
    description: "Preserve Notion mention tags.",
    kind: "block",
  },
  {
    id: "notion_media",
    label: "Media and file blocks",
    description: "Use audio, video, file, and pdf tags.",
    kind: "block",
  },
  {
    id: "notion_databases",
    label: "Database source preservation",
    description: "Compatibility setting: database tags are Unsupported raw source. Database objects are not implemented.",
    kind: "block",
  },
  {
    id: "notion_synced",
    label: "Synced block tags",
    description: "Preserve synced block content and references. Cross-device sync is not implemented.",
    kind: "block",
  },
  {
    id: "notion_toc",
    label: "Table of contents blocks",
    description: "Use <table_of_contents/>.",
    kind: "block",
  },
  {
    id: "notion_nesting",
    label: "Nested blocks",
    description: "Official Notion tab-indented child blocks, supported in Notion and Notdown.",
    kind: "block",
  },
  {
    id: "notion_colors",
    label: "Notion colors",
    description: "Block, text and background colors; preserve source when disabled.",
    kind: "block",
  },
  { id: "notion_underline", label: "Notion underline", description: "Underline spans, independently of text and background colors.", kind: "syntax" },
];

export function defaultSyntax(
  format: BodyFormat = "notion-markdown",
): SyntaxConfig {
  return {
    version: 1,
    variant: format === "notion-markdown" ? "notion-markdown" : "commonmark",
    extensions: {},
  };
}
const notionKeys = new Set(["columns", "callouts", "toggles", "tables", "pages", "mentions", "media", "databases", "synced", "toc", "nesting", "colors"]);
export const legacyLocalExtensionIds: Record<string, string> = Object.fromEntries(
  ["tabs", "bookmark", "link_preview", "breadcrumb", "button", "meeting_notes", "ai_block", "html_document", "web_embed"].map(name => ["local_" + name, "notion_" + name]),
);
const localAliases = Object.fromEntries(Object.entries(legacyLocalExtensionIds).map(([old, current]) => [current, old]));
export function canonicalExtensionId(name: string): string {
  return Object.hasOwn(legacyLocalExtensionIds, name) ? legacyLocalExtensionIds[name] : name.startsWith("notdown_") && notionKeys.has(name.slice(8)) ? "notion_" + name.slice(8) : name;
}
export function normalizeSyntax(config: SyntaxConfig): SyntaxConfig {
  const next: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(config.extensions)) {
    const canonical = canonicalExtensionId(key);
    next[canonical] = config.extensions[canonical] ?? value;
  }
  return { ...config, extensions: next };
}
export function enabled(config: SyntaxConfig, name: string): boolean {
  if (!name) return false;
  name = canonicalExtensionId(name);
  if (!supportsOption(config, name)) return false;
  return (
    config.extensions[name] ??
    (Object.hasOwn(localAliases, name) ? config.extensions[localAliases[name]] : undefined) ??
    (name.startsWith("notion_") ? config.extensions["notdown_" + name.slice(7)] : undefined) ??
    dialectDefaults[config.variant]?.[name] ??
    false
  );
}
export function nativeDialect(config: SyntaxConfig) {
  return dialects.find((v) => v.id === config.variant)?.native === true;
}
export function syntaxFormat(config: SyntaxConfig): BodyFormat {
  return usesNotionSyntax(config) ? "notion-markdown" : "markdown";
}
export function validSyntax(value: unknown): value is SyntaxConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const c = value as SyntaxConfig;
  return (
    c.version === 1 &&
    dialects.some((v) => v.id === c.variant) &&
    !!c.extensions &&
    typeof c.extensions === "object" &&
    !Array.isArray(c.extensions) &&
    Object.entries(c.extensions).length <= 256 &&
    Object.entries(c.extensions).every(
      ([key, v]) =>
        /^[a-z][a-z_0-9]{0,100}$/.test(key) && typeof v === "boolean",
    )
  );
}
export function supportsOption(config: SyntaxConfig, name: string) {
  name = canonicalExtensionId(name);
  const registered = extensions.some((e) => e.id === name);
  if (!registered) return false;
  if (config.variant === "notdown") return true;
  if (Object.values(localObjectPlugins).includes(name)) return false;
  if (name === "notion_nesting" && !usesNotionSyntax(config)) return false;
  if (name === "gutenberg") return true;
  if (name === "display_math") return !usesNotionSyntax(config);
  if (config.variant === "typora") return true;
  if (config.variant === "obsidian")
    return ![
      "blank_before_header",
      "blank_before_blockquote",
      "space_in_atx_header",
      "lists_without_preceding_blankline",
      "startnum",
      "backtick_code_blocks",
      "fenced_code_blocks",
      "escaped_line_breaks",
      "all_symbols_escapable",
      "intraword_underscores",
    ].includes(name);
  if (!usesNotionSyntax(config))
    return (
      name.startsWith("notion_") ||
      (["markdown_phpextra", "markdown_mmd", "markdown_strict"].includes(config.variant) && Object.hasOwn(dialectDefaults[config.variant] ?? {}, name)) ||
      name === "line_blocks" ||
      productExtensions.has(name) ||
      Object.hasOwn(pandocDefaults[config.variant] ?? {}, name)
    );
  // Only switches implemented by the independent Notion codec are offered.
  return (
    name.startsWith("notion_") ||
    ["strikeout", "task_lists", "tex_math_dollars"].includes(name)
  );
}
export function pendingExtensions(config: SyntaxConfig) {
  return Object.keys(pandocDefaults[config.variant] ?? {}).filter(
    (name) => !extensions.some((e) => e.id === name),
  );
}
export function resetExtensions(config: SyntaxConfig): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(config.extensions).filter(
      ([name]) => !extensions.some((e) => e.id === canonicalExtensionId(name)),
    ),
  );
}
export function commandEnabled(config: SyntaxConfig, command: string) {
  if (command === "notion_custom") return config.variant === "notdown";
  if (command === "image_block") return false;
  if (command === "embed") return enabled(config, "notion_web_embed") || (!usesNotionSyntax(config) && enabled(config, "html_embed"));
  if (/^heading[1-6]$/.test(command)) return config.variant !== "notion-markdown" || Number(command.slice(-1)) <= 4;
  if (command === "backtick_code") return !markdownFamily(config) || enabled(config, "backtick_code_blocks");
  if (localObjectPlugins[command]) return enabled(config, localObjectPlugins[command]);
  if (command === "equation") return enabled(config, "tex_math_dollars") || enabled(config, "display_math");
  if (command === "toggle_heading") return usesNotionSyntax(config) && enabled(config, "notion_nesting");
  if (command === "table_caption") return enabled(config, "table_captions") || enabled(config, "mmd_tables");
  if (command === "callout")
    return enabled(config, "alerts") || enabled(config, "notion_callouts");
  if (command === "ordered_task") return config.variant !== "typora";
  if (command === "ordered_parenthesis") return config.variant !== "notion-markdown" &&
    (!markdownFamily(config) || enabled(config, "fancy_lists"));
  if (command === "toc")
    return enabled(config, "notion_toc") || enabled(config, "toc_directives");
  const requirement: Record<string, string> = {
    inline_equation: "tex_math_dollars", background: "notion_colors",
    subscript: "subscript", superscript: "superscript", highlight: "highlight",
    synced_block: "notion_synced", mention_person: "notion_mentions", date_or_reminder: "notion_mentions",
    native_span: "bracketed_spans", small_caps: "bracketed_spans", raw_inline: "raw_attribute", raw_tex: "raw_tex", inline_note: "inline_notes",
    table_grid: "grid_tables", table_notion: "notion_tables", table_mmd: "mmd_tables",
    example_list_item: "example_lists",
    diagram: "diagrams",
    alert: "alerts",
    comment: "comments",
    transclusion: "transclusion",
    embed: "html_embed",
    html: "raw_html",
    definitions: "definition_lists",
    footnote: "footnotes",
    lines: "line_blocks",
    div: "fenced_divs",
    task: "task_lists",
    columns: "notion_columns",
    callout: "notion_callouts",
    toggle: "notion_toggles",
    toc: "notion_toc",
    equation: "tex_math_dollars",
    child: "notion_pages",
    mention: "notion_pages",
    link:
      usesNotionSyntax(config)
        ? "notion_pages"
        : "wikilinks_title_after_pipe",
    nesting: "notion_nesting",
    underline: "notion_underline",
    color: "notion_colors",
    strike: "strikeout",
  };
  if (command === "table")
    return enabled(config, "pipe_tables") || enabled(config, "mmd_tables") || enabled(config, "notion_tables");
  return !requirement[command] || enabled(config, requirement[command]);
}
