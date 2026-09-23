/** Lab profiles are independent of vault BodyFormat until edit/save codecs exist. */
export const variants = [
  {
    id: "gfm",
    label: "GitHub Flavored Markdown",
    short: "GitHub Flavored Markdown",
    engine: "pandoc",
  },
  {
    id: "commonmark",
    label: "CommonMark",
    short: "CommonMark",
    engine: "pandoc",
  },
  {
    id: "commonmark_x",
    label: "CommonMark + extensions",
    short: "CommonMark X",
    engine: "pandoc",
  },
  {
    id: "markdown",
    label: "Pandoc Markdown",
    short: "Pandoc",
    engine: "pandoc",
  },
  {
    id: "markdown_mmd",
    label: "Pandoc · MultiMarkdown reader",
    short: "Pandoc MultiMarkdown",
    engine: "pandoc",
  },
  {
    id: "markdown_phpextra",
    label: "PHP Markdown Extra",
    short: "PHP Extra",
    engine: "pandoc",
  },
  {
    id: "markdown_strict",
    label: "Original Markdown",
    short: "Original Markdown",
    engine: "pandoc",
  },
  {
    id: "markdown_github",
    label: "Legacy GitHub Markdown",
    short: "Legacy GitHub",
    engine: "pandoc",
    deprecated: true,
  },
  {
    id: "pandoc-cli",
    label: "Pandoc CLI · direct HTML",
    short: "Pandoc CLI",
    engine: "pandoc-cli",
  },
  {
    id: "multimarkdown-cli",
    label: "libMultiMarkdown CLI · direct HTML",
    short: "libMultiMarkdown CLI",
    engine: "multimarkdown-cli",
  },
  {
    id: "markdown-pl",
    label: "Markdown.pl · direct HTML",
    short: "Markdown.pl",
    engine: "markdown-pl",
  },
  {
    id: "notdown",
    label: "Notdown",
    short: "Notdown",
    engine: "notdown",
  },
  {
    id: "notion-markdown",
    label: "Notion-flavored Markdown",
    short: "Notion",
    engine: "notdown",
  },
] as const;
export type Variant = (typeof variants)[number]["id"];
export interface LabProfile {
  variant: Variant;
  extensions: Record<string, boolean>;
  plugins: string[];
}
export interface Capabilities {
  available: boolean;
  version: string;
  error?: string;
  extensions: Partial<Record<Variant, Record<string, boolean>>>;
  sourcePositions: Partial<Record<Variant, boolean>>;
  renderers?: Partial<Record<"pandoc-cli" | "multimarkdown-cli" | "markdown-pl", {
    available: boolean;
    version: string;
    error?: string;
  }>>;
}
export interface RenderResult {
  html: string;
  engine: string;
  blocks: number;
  mapping: "source" | "approximate" | "proportional";
  warnings: string[];
}
export const blockPlugins: { id: string; label: string; fence: string; description: string }[] = [];
export const extensionLabels: Record<string, string> = {
  blank_before_header: "Require blank line before headings",
  blank_before_blockquote: "Require blank line before blockquotes",
  footnotes: "Footnotes",
  pipe_tables: "Pipe tables",
  task_lists: "Task lists",
  strikeout: "Strikethrough",
  tex_math_dollars: "Dollar-delimited math",
  tex_math_gfm: "GFM math",
  smart: "Smart punctuation",
  hard_line_breaks: "Treat single newlines as hard breaks",
  definition_lists: "Definition lists",
  fenced_divs: "Fenced containers",
  bracketed_spans: "Inline containers",
  attributes: "Attributes",
  raw_html: "Raw HTML",
  yaml_metadata_block: "YAML metadata",
  alerts: "Alerts",
  wikilinks_title_after_pipe: "Wiki links (target | title)",
  citations: "Citation syntax",
};
