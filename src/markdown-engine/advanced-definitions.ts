/** Extensions with executable native parser paths (not mere catalog entries). */
export const nativeAdvancedExtensions = [
  "latex_macros", "gutenberg",
  "four_space_rule", "shortcut_reference_links", "spaced_reference_links", "sourcepos", "rebase_relative_paths",
  "grid_tables", "simple_tables", "multiline_tables", "table_attributes", "table_captions",
  "angle_brackets_escapable", "ascii_identifiers", "attributes", "bracketed_spans", "citations", "east_asian_line_breaks",
  "example_lists", "fancy_lists", "gfm_auto_identifiers", "inline_code_attributes", "inline_notes", "literate_haskell", "mark",
  "markdown_in_html_blocks", "native_divs", "native_spans", "old_dashes", "raw_tex", "tex_math_gfm", "tex_math_single_backslash", "wikilinks_title_before_pipe",
];

export const advancedDescriptions: Record<string, string> = {
  gutenberg: "Plain-text export with heading spacing, uppercase strong text and underscored emphasis; does not rewrite Markdown.",
  sourcepos: "Expose parsed block line ranges as data-pos in the document DOM; no inline character-position map.",
  rebase_relative_paths: "Resolve Markdown link/image URLs against sourcePath when provided, retaining their original spelling for saving.",
  citations: "Edit Pandoc citation syntax and preview CSL citations using local bibliography/style files and installed Pandoc.",
  latex_macros: "Apply document macro definitions to subsequent KaTeX math previews, preserving definitions and formula source.",
  raw_tex: "TeX target-format source, grouped under Outside Markdown scope in Notdown. Preserves commands and environments without executing TeX in the browser.",
  markdown_in_html_blocks: "Parse Markdown children in block Div containers while retaining HTML attributes and encoding.",
  grid_tables: "Parse and edit grid tables using the shared table model, including cell spans.",
  simple_tables: "Parse fixed-width simple tables using the shared editable table model.",
  multiline_tables: "Parse multiline fixed-width table cells using the shared editable table model.",
};
