import workbook from "../../docs/data/extension-workbook.json";
import { pandocSyntax, pandocSyntaxAnchors } from "./catalog-pandoc-syntax";
import {
  contentObjects,
  getContentCapabilities,
} from "../document/content-objects";
import {
  dialects,
  extensions,
  supportsOption,
  canonicalExtensionId,
  legacyLocalExtensionIds,
  type Dialect,
  type SyntaxConfig,
} from "../markdown-engine/config";

export const catalogObjects = contentObjects;
import { extensionCategory } from "./extension-categories";
import { notionFeatureOrigins, localEncodingNote, notionMcpSyntax, notionMcpSpecUrl } from "./extension-feature-origins";
export { extensionCategories, type ExtensionCategory } from "./extension-categories";
export interface Reference {
  label: string;
  url: string;
}
const pandoc = "https://pandoc.org/MANUAL.html";
const notion =
  "https://developers.notion.com/guides/data-apis/enhanced-markdown";
const typora = "https://support.typora.io/Markdown-Reference/";
const mmd = "https://fletcher.github.io/MultiMarkdown-6/syntax/";

/** Evidence for formats whose carrier names can be mistaken for product types. */
export const objectReferences: Record<string, Reference[]> = {
  ...Object.fromEntries(catalogObjects.map(object => [object.id,
    [...new Set(object.adapters.flatMap(adapter => adapter.extensions))]
      .flatMap(id => notionFeatureOrigins[id] ? [{ label: notionFeatureOrigins[id].label + " (feature reference; local encoding differs)", url: notionFeatureOrigins[id].url }] : []),
  ])),
  "metadata.yaml_front_matter": [
    { label: "MultiMarkdown metadata restrictions", url: mmd + "metadata.html" },
    { label: "Pandoc YAML metadata", url: pandoc + "#extension-yaml_metadata_block" },
  ],
  "block.file_transclusion": [{ label: "MultiMarkdown file transclusion", url: mmd + "transclusion.html" }, { label: "MultiMarkdown source: markers may occur within a paragraph", url: "https://github.com/fletcher/MultiMarkdown-6/blob/master/src/transclude.c#L122-L139" }],
  "inline.inline_html": [{ label: "Pandoc raw inline attributes", url: pandoc + "#extension-raw_attribute" }],
  "inline.image": [{ label: "Notion images are media blocks", url: notion + "#media-blocks" }],
  "inline.autolink": [{ label: "Notion documents explicit links", url: notion + "#rich-text-formatting" }],
  "inline.internal_link": [
    { label: "Notion links and page mentions", url: notion + "#rich-text-formatting" },
    { label: "Obsidian pages, headings and block IDs", url: "https://obsidian.md/help/links" },
    { label: "Typora file and anchor links", url: "https://support.typora.io/Links/" },
  ],
};
export function objectFeatureNotes(id: string): string[] {
  const object = catalogObjects.find(o => o.id === id);
  const origins = [...new Set(object?.adapters.flatMap(a => a.extensions) ?? [])]
    .flatMap(key => notionFeatureOrigins[key] ? [notionFeatureOrigins[key].note] : []);
  return origins.length ? [localEncodingNote, ...origins] : [];
}
const obsidian = "https://obsidian.md/help/syntax";
const pandocAnchors = pandocSyntaxAnchors;
const notionAnchors: Record<string, string> = {
  notion_columns: "columns",
  notion_callouts: "callout",
  notion_toggles: "toggle",
  notion_tables: "table",
  notion_pages: "page-and-database-references",
  notion_mentions: "mentions",
  notion_media: "media-blocks",
  notion_databases: "page-and-database-references",
  notion_synced: "synced-block",
  notion_toc: "table-of-contents",
  notion_nesting: "indentation",
  notion_colors: "rich-text-formatting",
  notion_underline: "rich-text-formatting",
};
const ref = (label: string, url: string): Reference => ({ label, url });
export const variantReferences: Record<Dialect, Reference[]> = {
  quarto: [ref("Quarto Markdown", "https://quarto.org/docs/authoring/markdown-basics.html"), ref("Quarto computations", "https://quarto.org/docs/computations/execution-options.html")],
  rmarkdown: [ref("R Markdown", "https://rmarkdown.rstudio.com/authoring_quick_tour.html"), ref("knitr chunk options", "https://yihui.org/knitr/options/")],
  typora: [ref("Typora Markdown reference", typora)],
  obsidian: [ref("Obsidian formatting syntax", obsidian)],
  "notion-markdown": [ref("Notion enhanced Markdown", notion)],
  notdown: [ref("Notion base syntax · Notdown adds its own block encodings", notion)],
  commonmark: [ref("CommonMark 0.31.2", "https://spec.commonmark.org/0.31.2/")],
  gfm: [
    ref(
      "GitHub Flavored Markdown specification",
      "https://github.github.com/gfm/",
    ),
  ],
  markdown: [ref("Pandoc Markdown", pandoc + "#pandocs-markdown")],
  commonmark_x: [
    ref("Pandoc CommonMark with extensions", pandoc + "#input-formats"),
  ],
  markdown_strict: [
    ref(
      "Original Markdown syntax",
      "https://daringfireball.net/projects/markdown/syntax",
    ),
  ],
  markdown_phpextra: [
    ref(
      "PHP Markdown Extra",
      "https://michelf.ca/projects/php-markdown/extra/",
    ),
  ],
  markdown_mmd: [ref("MultiMarkdown 6 syntax (reference version)", mmd)],
  markdown_github: [
    ref("Pandoc legacy GitHub Markdown", pandoc + "#input-formats"),
  ],
};

// Canonical notion_* keys retain the scopes of their legacy notdown_* aliases.
export const extensionNames: Record<string, { label: string; note: string }> = {
  notion_columns: {
    label: "Notion column tags",
    note: "Official columns tags support percentage ratio attributes and resizing. Legacy width-ratio fractions are read in Notdown; resizing writes ratio only. Retired :::columns directives are preserved as raw source.",
  },
  notion_callouts: {
    label: "Notion callout tags",
    note: "Controls <callout> encoding. The alerts switch controls > [!TYPE] encoding of the same object.",
  },
  notion_toggles: {
    label: "Notion toggle tags",
    note: "Official <details> / <summary> blocks. Persisted open state is Notdown-only; the official variant only folds the view.",
  },
  notion_tables: {
    label: "Notion table tags",
    note: "Official structured Notion tables. Spans and captions use Pandoc grid tables in Notdown, not additional NFM tags.",
  },
  notion_pages: {
    label: "Notion page references",
    note: "Official <page> is Child page and <mention-page> is inline. Only Notdown enables the supplemental <page-link> for Link to page, including links to direct children. Block type never derives from parent metadata; retired ::page directives remain raw source.",
  },
  notion_mentions: {
    label: "Notion mentions and citations",
    note: "Covers user, date, database and data-source mentions, and Notion citations. Page mentions use notion_pages. Date reminders and format properties are supplemental and Notdown-only. Official dates use start/end/startTime/timeZone.",
  },
  notion_media: {
    label: "Notion media and file tags",
    note: "Covers Notion audio, video, PDF and file block tags. Ordinary Markdown links remain links.",
  },
  notion_databases: {
    label: "Notion database source preservation",
    note: "Compatibility key only. Database objects are not implemented; existing tags use Unsupported raw-source recovery.",
  },
  notion_synced: {
    label: "Notion synced-block tags",
    note: "Official reference and snapshot tags. Local IDs, refresh, live refresh and CAS publishing are supplemental and Notdown-only. No cross-device synchronization.",
  },
  notion_toc: {
    label: "Notion table-of-contents tags",
    note: "Controls <table_of_contents/>. Markdown directives use toc_directives.",
  },
  notion_nesting: {
    label: "Block nesting (Notion / Notdown)",
    note: "Official tab-indented children in Notion and Notdown. Retired :::nest directives are preserved as raw source.",
  },
  notion_colors: {
    label: "Notion colors",
    note: "Controls block, text and background colors. Underline has its own notion_underline switch.",
  },
  notion_underline: { label: "Notion underline", note: "Controls <span underline=\"true\"> independently of notion_colors." },
};

const productReferences: Record<string, Reference[]> = {
  symbol_replacements: [ref("ProseMirror input rules (implementation mechanism)", "https://prosemirror.net/docs/ref/#inputrules")],
  highlight: [
    ref("Typora highlight syntax", typora),
    ref("Obsidian formatting", obsidian),
  ],
  comments: [ref("Obsidian comments", obsidian)],
  toc_directives: [
    ref("Typora table of contents", typora),
    ref("MultiMarkdown table of contents", mmd),
  ],
  diagrams: [ref("Typora diagrams", typora)],
  html_embed: [ref("Typora HTML support", typora)],
  typora_loose_lists: [ref("Typora lists", typora)],
  mmd_tables: [ref("MultiMarkdown tables", mmd + "#tables")],
  mmd_abbreviations: [
    ref("MultiMarkdown abbreviations", mmd + "#abbreviationsoracronyms"),
  ],
  mmd_citations: [ref("MultiMarkdown citations", mmd + "#citations")],
  critic_markup: [ref("CriticMarkup in MultiMarkdown", mmd + "#criticmarkup")],
  transclusion: [
    ref("MultiMarkdown file transclusion", mmd + "#filetransclusion"),
  ],
  glossary: [ref("MultiMarkdown glossaries", mmd + "#glossaries")],
  metadata_values: [ref("MultiMarkdown metadata", mmd + "#metadata")],
  metadata_variables: [
    ref("MultiMarkdown metadata variables", mmd + "#metadatavariables"),
  ],
};
const workbookVariants: Dialect[] = [
  "markdown",
  "markdown_strict",
  "markdown_phpextra",
  "markdown_mmd",
  "markdown_github",
  "gfm",
  "commonmark",
  "commonmark_x",
  "typora",
  "obsidian",
  "notion-markdown",
];
export const catalogExtensions = workbook.rows.map((row, index) => {
  const id = canonicalExtensionId(row[0]!);
  const registered = extensions.find((e) => e.id === id);
  const category = extensionCategory(id);
  const naming = extensionNames[id];
  return {
    id,
    legacyId: row[0] === id ? "" : row[0]!,
    label: naming?.label ?? registered?.label ?? id,
    oldLabel: registered?.label ?? id,
    description:
      registered?.description ??
      "Reference syntax; not implemented by the native editor.",
    category,
    sourceLabel: row[1]!,
    sourceRange: `A${index + 3}:N${index + 3}`,
    workbookStates: { ...Object.fromEntries(
      workbookVariants.map((v, i) => [v, row[i + 2]]),
    ), notdown: "—", rmarkdown: "—", quarto: "—" } as Record<Dialect, string>,
    workbookRegistration: row[13]!,
    status: registered
      ? "registered"
      : row[13] === "非 MD"
        ? "out-of-scope"
        : "pending",
    namingNote:
      naming?.note ??
      (category === "pandoc"
        ? "Keeps the Pandoc extension identifier for comparison with the manual."
        : "A Notdown switch for product syntax; the category identifies the registry source, not the inventor of the syntax."),
    references:
      category === "pandoc"
        ? [
            ref(
              "Pandoc: " + id,
              pandoc + "#" + (pandocAnchors[id] ?? "extension-" + id),
            ),
          ]
        : category === "notion"
          ? [ref("Notion enhanced Markdown", notion + "#" + notionAnchors[id])]
          : (productReferences[id] ?? [ref("MultiMarkdown 6 syntax", mmd)]),
  };
}).concat(extensions.filter(e => !workbook.rows.some(row => canonicalExtensionId(row[0]!) === e.id)).map(e => ({
  id: e.id, legacyId: Object.keys(legacyLocalExtensionIds).find(key => legacyLocalExtensionIds[key] === e.id) ?? "", label: e.label, oldLabel: e.label, description: e.description,
  category: extensionCategory(e.id), sourceLabel: notionMcpSyntax[e.id] ? "Notion MCP specification" : notionFeatureOrigins[e.id] ? "Notion feature / Notdown local encoding" : notionAnchors[e.id] ? "Notion enhanced Markdown" : "Notdown blocks and extensions", sourceRange: "",
  workbookStates: Object.fromEntries(dialects.map(v => [v.id, "—"])) as Record<Dialect, string>,
  workbookRegistration: "", status: "registered", namingNote: notionMcpSyntax[e.id] || (notionFeatureOrigins[e.id] ? localEncodingNote + " " + notionFeatureOrigins[e.id].note : extensionNames[e.id]?.note ?? "Local adapter; upstream dialect defaults are independent."),
  references: notionMcpSyntax[e.id] ? [ref("Notion MCP specification", notionMcpSpecUrl)] : notionFeatureOrigins[e.id] ? [ref(notionFeatureOrigins[e.id].label, notionFeatureOrigins[e.id].url)] : notionAnchors[e.id] ? [ref("Notion enhanced Markdown", notion + "#" + notionAnchors[e.id])] : e.id === "display_math" ? [ref("Typora math blocks", typora + "#math-blocks")] : productReferences[e.id] ?? [],
}))).sort((a, b) => Number(a.status === "out-of-scope") - Number(b.status === "out-of-scope"));
export type CatalogExtension = (typeof catalogExtensions)[number];
export const catalogExtension = (id: string) =>
  catalogExtensions.find((e) => e.id === canonicalExtensionId(id));

// Adapter requirements are one kind of relation. Modifiers and planned syntax
// must also be discoverable, without presenting them as working adapters.
const modifiers: Record<string, string[]> = {
  symbol_replacements: ["block.paragraph", "block.heading", "character.smart_typography"],
  blank_before_header: ["block.heading"],
  space_in_atx_header: ["block.heading"],
  header_attributes: ["block.heading"],
  auto_identifiers: ["block.heading", "inline.internal_link"],
  mmd_header_identifiers: ["block.heading", "inline.internal_link"],
  implicit_header_references: ["block.heading", "inline.internal_link"],
  blank_before_blockquote: ["block.quote"],
  lists_without_preceding_blankline: [
    "block.bullet_list_item",
    "block.numbered_list_item",
    "block.task_list_item",
  ],
  typora_loose_lists: [
    "block.bullet_list_item",
    "block.numbered_list_item",
    "block.task_list_item",
  ],
  startnum: ["block.numbered_list_item"],
  backtick_code_blocks: ["block.code_block"],
  fenced_code_blocks: ["block.code_block"],
  fenced_code_attributes: ["block.code_block"],
  escaped_line_breaks: ["character.line_break"],
  hard_line_breaks: ["character.line_break"],
  ignore_line_breaks: ["character.line_break", "block.paragraph"],
  all_symbols_escapable: ["character.backslash_escape"],
  intraword_underscores: ["inline.emphasis", "inline.strong_emphasis"],
  short_subsuperscripts: ["inline.subscript", "inline.superscript"],
  tex_math_double_backslash: ["inline.inline_math"],
  link_attributes: ["inline.link", "inline.image", "block.image_block"],
  mmd_link_attributes: ["inline.link", "inline.image", "block.image_block"],
  autolink_bare_uris: ["inline.autolink"],
  notion_nesting: [
    "block.paragraph",
    "block.quote",
    "block.bullet_list_item",
    "block.numbered_list_item",
    "block.task_list_item",
  ],
};
const planned: Record<string, string[]> = {
  gutenberg: ["inline.strong_emphasis", "inline.emphasis", "block.heading"],
  sourcepos: ["block.paragraph", "block.heading", "inline.native_span"],
  angle_brackets_escapable: ["character.backslash_escape"],
  ascii_identifiers: ["block.heading"],
  gfm_auto_identifiers: ["block.heading"],
  attributes: [
    "inline.link",
    "inline.image",
    "block.heading",
    "block.code_block",
  ],
  bracketed_spans: ["inline.native_span", "inline.small_caps"],
  native_spans: ["inline.native_span", "inline.small_caps"],
  citations: ["inline.citation"],
  east_asian_line_breaks: ["character.line_break"],
  example_lists: ["block.example_list_item"],
  fancy_lists: ["block.numbered_list_item"],
  four_space_rule: ["block.bullet_list_item", "block.numbered_list_item"],
  grid_tables: ["block.table"],
  multiline_tables: ["block.table"],
  simple_tables: ["block.table"],
  table_attributes: ["block.table"],
  table_captions: ["block.table"],
  inline_code_attributes: ["inline.code_span"],
  inline_notes: ["inline.footnote"],
  latex_macros: ["inline.inline_math", "block.math_block"],
  literate_haskell: ["block.code_block"],
  mark: ["inline.highlight"],
  markdown_in_html_blocks: ["block.html_block"],
  native_divs: ["block.native_div"],
  old_dashes: ["character.smart_typography"],
  raw_tex: ["block.unsupported"],
  rebase_relative_paths: ["inline.link", "inline.image", "block.image_block"],
  shortcut_reference_links: ["inline.link"],
  spaced_reference_links: ["inline.link"],
  tex_math_gfm: ["inline.inline_math", "block.math_block"],
  tex_math_single_backslash: ["inline.inline_math", "block.math_block"],
  wikilinks_title_before_pipe: ["inline.internal_link"],
};
export type ObjectExtensionRelation = {
  objectId: string;
  extensionId: string;
  role: "encoding" | "modifier" | "planned";
};
export const objectExtensionRelations: ObjectExtensionRelation[] =
  catalogObjects.flatMap((object) => {
    const required = new Set(object.adapters.flatMap((a) => a.extensions));
    return catalogExtensions.flatMap((e): ObjectExtensionRelation[] => {
      const role = required.has(e.id)
        ? "encoding"
        : modifiers[e.id]?.includes(object.id)
          ? "modifier"
          : planned[e.id]?.includes(object.id) || pandocSyntax.some(s => s.extensions.includes(e.id) && s.objects.includes(object.id))
            ? e.status === "registered" ? "modifier" : "planned"
            : undefined;
      return role ? [{ objectId: object.id, extensionId: e.id, role }] : [];
    });
  });
export const extensionsForObject = (id: string) =>
  objectExtensionRelations.filter((r) => r.objectId === id);
export const objectsForExtension = (id: string) =>
  objectExtensionRelations.filter((r) => r.extensionId === canonicalExtensionId(id));
export function objectVariantState(id: string, variant: Dialect) {
  const c: SyntaxConfig = { version: 1, variant, extensions: {} };
  const active = getContentCapabilities(id, c);
  if (active?.available)
    return { status: "default", editing: active.editing } as const;
  const optional = getContentCapabilities(id, {
    ...c,
    extensions: Object.fromEntries(
      extensions
        .filter((e) => supportsOption(c, e.id))
        .map((e) => [e.id, true]),
    ),
  });
  if (optional?.available)
    return { status: "optional", editing: optional.editing } as const;
  return { status: "unavailable", editing: [] } as const;
}
export const variantsForObject = (id: string) =>
  dialects.map((d) => ({ ...d, ...objectVariantState(id, d.id) }));
export const objectsForVariant = (variant: Dialect) =>
  catalogObjects.map((object) => ({
    object,
    ...objectVariantState(object.id, variant),
  }));

export function workbookStateLabel(value: string) {
  return (
    (
      {
        开: "On",
        可: "Optional",
        "—": "Not listed",
        "开/—": "On upstream / unavailable locally",
        "可/—": "Optional upstream / unavailable locally",
        "—/可": "Not listed upstream / optional locally",
        "—/开": "Not listed upstream / on locally",
      } as Record<string, string>
    )[value] ?? value
  );
}
