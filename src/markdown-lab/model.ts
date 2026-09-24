/** Lab profiles are independent of vault BodyFormat until edit/save codecs exist. */
import { dialects, type Dialect } from "../markdown-engine/config";

const dialectLabel = (id: Dialect) => dialects.find((dialect) => dialect.id === id)!.label;

export const variants = [
  {
    id: "gfm",
    label: dialectLabel("gfm"),
    engine: "pandoc",
  },
  {
    id: "commonmark",
    label: dialectLabel("commonmark"),
    engine: "pandoc",
  },
  {
    id: "commonmark_x",
    label: dialectLabel("commonmark_x"),
    engine: "pandoc",
  },
  {
    id: "markdown",
    label: dialectLabel("markdown"),
    engine: "pandoc",
  },
  {
    id: "markdown_mmd",
    label: dialectLabel("markdown_mmd"),
    engine: "pandoc",
  },
  {
    id: "markdown_phpextra",
    label: dialectLabel("markdown_phpextra"),
    engine: "pandoc",
  },
  {
    id: "markdown_strict",
    label: dialectLabel("markdown_strict"),
    engine: "pandoc",
  },
  {
    id: "markdown_github",
    label: dialectLabel("markdown_github"),
    engine: "pandoc",
    deprecated: true,
  },
  {
    id: "multimarkdown-cli",
    label: "libMultiMarkdown CLI · direct HTML",
    engine: "multimarkdown-cli",
  },
  { id: "commonmark-js", label: "CommonMark.js · official HTML", engine: "commonmark-js" },
  { id: "cmark-gfm", label: "cmark-gfm · official HTML", engine: "cmark-gfm" },
  { id: "php-markdown-extra", label: "PHP Markdown Extra · official HTML", engine: "php-markdown-extra" },
  {
    id: "markdown-pl",
    label: "Markdown.pl · direct HTML",
    engine: "markdown-pl",
  },
  {
    id: "notdown",
    label: dialectLabel("notdown"),
    engine: "notdown",
  },
  {
    id: "notion-markdown",
    label: dialectLabel("notion-markdown"),
    engine: "notdown",
  },
] as const;
export type Variant = (typeof variants)[number]["id"];
export type DirectRenderer = "multimarkdown-cli" | "markdown-pl" | "commonmark-js" | "cmark-gfm" | "php-markdown-extra";
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
  renderers?: Partial<Record<DirectRenderer, {
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
