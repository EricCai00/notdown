import snapshot from "../../docs/data/pandoc-3.11-extensions.json";

// Audited against upstream specifications, not Pandoc's similarly named readers.
// Sources and intentional limitations: docs/reference/DIALECT-CONFORMANCE.md.
const flags = (names: string): Record<string, boolean> =>
  Object.fromEntries(names.split(/\s+/).filter(Boolean).map(name => [name, true]));
const common = flags("raw_html backtick_code_blocks fenced_code_blocks all_symbols_escapable escaped_line_breaks intraword_underscores space_in_atx_header shortcut_reference_links startnum lists_without_preceding_blankline");
const gfm = { ...common, ...flags("pipe_tables task_lists strikeout autolink_bare_uris") };
const original = flags("raw_html shortcut_reference_links spaced_reference_links");
export const dialectDefaults: Record<string, Record<string, boolean>> = {
  quarto: { ...snapshot.variants.markdown, yaml_metadata_block: true },
  rmarkdown: { ...snapshot.variants.markdown, yaml_metadata_block: true },
  "notion-markdown": flags("strikeout task_lists tex_math_dollars notion_columns notion_callouts notion_toggles notion_tables notion_pages notion_mentions notion_media notion_databases notion_synced notion_toc notion_nesting notion_colors notion_underline"),
  commonmark: common,
  gfm,
  markdown_strict: original,
  markdown_phpextra: { ...original, ...flags("abbreviations definition_lists fenced_code_blocks backtick_code_blocks fenced_code_attributes footnotes header_attributes intraword_underscores link_attributes markdown_attribute pipe_tables startnum") },
  markdown_mmd: { ...original, ...flags("all_symbols_escapable auto_identifiers backtick_code_blocks definition_lists footnotes implicit_figures implicit_header_references intraword_underscores mmd_header_identifiers mmd_link_attributes mmd_title_block pipe_tables short_subsuperscripts subscript superscript tex_math_dollars tex_math_double_backslash mmd_tables mmd_abbreviations mmd_citations transclusion glossary metadata_values metadata_variables toc_directives raw_attribute critic_markup smart escaped_line_breaks") },
  typora: { ...gfm, ...flags("auto_identifiers footnotes emoji yaml_metadata_block toc_directives html_embed hard_line_breaks typora_loose_lists display_math") , all_symbols_escapable: false, space_in_atx_header: false },
  obsidian: { ...gfm, ...flags("auto_identifiers footnotes yaml_metadata_block hard_line_breaks highlight comments alerts wikilinks_title_after_pipe transclusion tex_math_dollars diagrams") },
  // Only these presets describe Pandoc readers, with a versioned default contract.
  markdown: snapshot.variants.markdown,
  commonmark_x: { ...common, ...snapshot.variants.commonmark_x },
  markdown_github: snapshot.variants.markdown_github,
};

/** Supplemental Notion storage keys, available only in Notdown. */
export const localObjectPlugins: Record<string, string> = {
  tabs: "notion_tabs", tab: "notion_tabs", web_bookmark: "notion_bookmark",
  link_preview: "notion_link_preview", link_mention: "notion_link_preview", breadcrumb: "notion_breadcrumb", button: "notion_button",
  meeting_notes: "notion_meeting_notes", ai_block: "notion_ai_block",
  web_embed: "notion_web_embed",
};

// Notdown inherits the Notion codec's syntax and adds our block encodings.
// It does not change the upstream preset or imply support for Notion cloud APIs.
dialectDefaults["notion-markdown"] = flags("strikeout task_lists tex_math_dollars notion_columns notion_callouts notion_toggles notion_tables notion_pages notion_mentions notion_media notion_databases notion_synced notion_toc notion_nesting notion_colors notion_underline");
dialectDefaults["notion-markdown"].notion_tabs = true;
dialectDefaults["notion-markdown"].notion_meeting_notes = true;
// Mermaid fences are part of the official Enhanced Markdown code syntax.
dialectDefaults["notion-markdown"].diagrams = true;
// Content extensions form a superset; competing lexical conventions (smart
// punctuation, reversed wiki labels, backslash math, literate code, etc.) remain opt-in.
export const notdownMarkdownDefaults = flags(`
  raw_html pipe_tables definition_lists footnotes line_blocks fenced_divs
  subscript superscript highlight comments alerts toc_directives diagrams
  emoji autolink_bare_uris wikilinks_title_after_pipe transclusion
  header_attributes link_attributes fenced_code_attributes bracketed_spans
  inline_code_attributes inline_notes native_spans
  grid_tables simple_tables multiline_tables table_attributes table_captions mmd_tables
  abbreviations mmd_abbreviations mmd_citations citations critic_markup glossary
  raw_attribute raw_tex tex_math_gfm
  example_lists fancy_lists yaml_metadata_block pandoc_title_block
  metadata_values metadata_variables html_embed markdown_attribute
  mmd_link_attributes mmd_header_identifiers implicit_header_references auto_identifiers
  short_subsuperscripts mmd_title_block implicit_figures escaped_line_breaks typora_loose_lists
  backtick_code_blocks fenced_code_blocks shortcut_reference_links
`);
dialectDefaults.notdown = { ...dialectDefaults["notion-markdown"], ...notdownMarkdownDefaults, ...flags(Object.values(localObjectPlugins).join(" ")), symbol_replacements: true };
