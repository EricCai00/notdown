import snapshot from "../../docs/data/pandoc-3.11-extensions.json";
import { canonicalExtensionId, pandocDefaults, localObjectPlugins, type Dialect } from "../markdown-engine/config";
import { escape } from "../shared/types";
import { extensionCategories, extensionCategory } from "./extension-categories";
import { notionFeatureOrigins, localEncodingNote } from "./extension-feature-origins";

export type SyntaxAuthority = "spec" | "docs";
export interface SyntaxEvidence {
  authority: SyntaxAuthority;
  requirement: "required" | "optional";
  source: string;
  url: string;
  note?: string;
  setting?: string;
}
export const provenanceReviewed = "2026-09-22";
export const pandocDefaultVersion = snapshot.pandocVersion;
const cm = "https://spec.commonmark.org/0.31.2/";
const gfm = "https://github.github.com/gfm/";
const github = "https://docs.github.com/en/get-started/writing-on-github/";
const ghBasic = github + "getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax";
const typora = "https://support.typora.io/Markdown-Reference/";
const mmd = "https://fletcher.github.io/MultiMarkdown-6/syntax/";
const php = "https://michelf.ca/projects/php-markdown/extra/";
const original = "https://daringfireball.net/projects/markdown/syntax";
const pandoc = "https://pandoc.org/MANUAL.html";
const obsidian = "https://help.obsidian.md/";
const notion = "https://developers.notion.com/guides/data-apis/enhanced-markdown";
type Rules = Record<string, SyntaxEvidence>;
const rules: Record<Dialect, Rules> = {
  rmarkdown: {},
  commonmark: {}, gfm: {}, typora: {}, obsidian: {}, "notion-markdown": {}, notdown: {},
  markdown: {}, commonmark_x: {}, markdown_strict: {}, markdown_phpextra: {}, markdown_mmd: {}, markdown_github: {},
};
function add(variant: Dialect, ids: string, source: string, url: string, options: Partial<SyntaxEvidence> = {}) {
  for (const id of ids.split(" ").filter(Boolean)) rules[variant][id] = {
    authority: "docs", requirement: "required", source, url, ...options,
  };
}

// Extension identifiers are adapters to syntax rules, not upstream feature names.
// Evidence is deliberately independent of both Notdown and Pandoc defaults.
const commonRules: Record<string, string> = {
  raw_html: "html-blocks", backtick_code_blocks: "fenced-code-blocks", fenced_code_blocks: "fenced-code-blocks",
  all_symbols_escapable: "backslash-escapes", escaped_line_breaks: "hard-line-breaks",
  intraword_underscores: "emphasis-and-strong-emphasis", space_in_atx_header: "atx-headings",
  shortcut_reference_links: "links", startnum: "ordered-list-marker", lists_without_preceding_blankline: "list-items",
};
for (const variant of ["commonmark", "gfm", "commonmark_x"] as const) {
  for (const [id, anchor] of Object.entries(commonRules)) {
    add(variant, id, variant === "gfm" ? "GFM Spec" : "CommonMark Spec", (variant === "gfm" ? gfm : cm) + "#" + anchor, { authority: "spec" });
  }
}
for (const [id, anchor] of Object.entries({ pipe_tables: "tables-extension-", task_lists: "task-list-items-extension-", strikeout: "strikethrough-extension-", autolink_bare_uris: "autolinks-extension-" })) {
  add("gfm", id, "GFM Spec", gfm + "#" + anchor, { authority: "spec" });
}
for (const [id, anchor] of Object.entries({ alerts: "alerts", footnotes: "footnotes", emoji: "using-emojis", gfm_auto_identifiers: "section-links" })) {
  add("gfm", id, "GFM Docs", ghBasic + "#" + anchor, { requirement: "optional", note: "GitHub website extension, outside the GFM specification; opt in explicitly." });
}
add("gfm", "tex_math_dollars tex_math_gfm", "GFM Docs", github + "working-with-advanced-formatting/writing-mathematical-expressions", { requirement: "optional" });
add("gfm", "diagrams", "GFM Docs", github + "working-with-advanced-formatting/creating-diagrams", { requirement: "optional", note: "GitHub documents Mermaid fences; this does not standardize every diagram engine supported by Notdown." });

for (const variant of ["markdown_strict", "markdown_phpextra", "markdown_mmd", "markdown", "markdown_github"] as const) {
  add(variant, "raw_html", "Original Markdown", original + "#html");
  add(variant, "shortcut_reference_links spaced_reference_links", "Original Markdown", original + "#link");
}
// Pandoc defines its own variants and optional extensions. This is not evidence
// that another product's syntax includes every switch accepted by Pandoc.
for (const variant of ["markdown", "commonmark_x", "markdown_github"] as const) {
  for (const id of Object.keys(pandocDefaults[variant])) {
    if (rules[variant][id]) continue;
    const anchor = ["subscript", "superscript"].includes(id) ? "superscript-subscript" : id === "wikilinks_title_before_pipe" ? "wikilinks_title_after_pipe" : id;
    add(variant, id, variant === "markdown_github" ? "Pandoc legacy variant" : "Pandoc manual", pandoc + "#extension-" + anchor, {
      requirement: "optional",
      note: variant === "markdown_github" ? "Deprecated Pandoc reader; not a claim about the current GFM Spec or GitHub Docs." : "A documented Pandoc option; enabled-by-default is a separate property.",
    });
  }
}
Object.assign(rules.rmarkdown, rules.markdown);
add("markdown_phpextra", "abbreviations", "PHP Extra Docs", php + "#abbr");
add("markdown_phpextra", "definition_lists", "PHP Extra Docs", php + "#def-list");
add("markdown_phpextra", "footnotes", "PHP Extra Docs", php + "#footnotes");
add("markdown_phpextra", "pipe_tables", "PHP Extra Docs", php + "#table");
add("markdown_phpextra", "fenced_code_blocks backtick_code_blocks", "PHP Extra Docs", php + "#fenced-code-blocks");
add("markdown_phpextra", "header_attributes link_attributes fenced_code_attributes", "PHP Extra Docs", php + "#spe-attr");
add("markdown_phpextra", "markdown_attribute", "PHP Extra Docs", php + "#markdown-attr");
add("markdown_phpextra", "intraword_underscores startnum", "PHP Extra Docs", php);

const mmdSections: Record<string, string> = {
  pipe_tables: "tables", mmd_tables: "tables", table_captions: "tables", footnotes: "footnotes", definition_lists: "definitionlists",
  mmd_title_block: "metadata", metadata_values: "metadata", metadata_variables: "metadatavariables",
  mmd_abbreviations: "abbreviationsoracronyms", mmd_citations: "citations", glossary: "glossaries", transclusion: "filetransclusion",
  raw_attribute: "rawsource", critic_markup: "criticmarkup", mmd_link_attributes: "linkandimageattributes", implicit_figures: "images",
  auto_identifiers: "cross-references", mmd_header_identifiers: "cross-references", implicit_header_references: "cross-references",
  subscript: "superscriptsandsubscripts", superscript: "superscriptsandsubscripts", short_subsuperscripts: "superscriptsandsubscripts",
  tex_math_dollars: "math", tex_math_double_backslash: "math", backtick_code_blocks: "fencedcodeblocks",
  toc_directives: "tableofcontents", escaped_line_breaks: "escapednewlines",
};
for (const [id, anchor] of Object.entries(mmdSections)) add("markdown_mmd", id, "MultiMarkdown Docs", mmd + "#" + anchor);
add("markdown_mmd", "smart", "MultiMarkdown Docs", mmd + "#smarttypography", { requirement: "optional", setting: "--nosmart / compatibility mode", note: "Enabled in MultiMarkdown by default, but its CLI can disable it; this is independent of the Pandoc reader default." });

const typoraSections: Record<string, string> = {
  raw_html: "html", backtick_code_blocks: "fenced-code-blocks", fenced_code_blocks: "fenced-code-blocks",
  pipe_tables: "tables", task_lists: "task-list", strikeout: "strikethrough", footnotes: "footnotes",
  yaml_metadata_block: "yaml-front-matter", toc_directives: "table-of-contents-toc", emoji: "emoji-happy",
  autolink_bare_uris: "urls", auto_identifiers: "internal-links", intraword_underscores: "emphasis",
  shortcut_reference_links: "reference-links", html_embed: "embed-contents",
};
add("typora", "display_math", "Typora Docs", typora + "#math-blocks");
for (const [id, anchor] of Object.entries(typoraSections)) add("typora", id, "Typora Docs", typora + "#" + anchor);
for (const [id, setting] of Object.entries({ highlight: "Highlight", subscript: "Subscript", superscript: "Superscript", tex_math_dollars: "Inline Math", alerts: "Callouts / GitHub Style Alerts" })) {
  add("typora", id, "Typora Docs", typora + "#" + ({ tex_math_dollars: "inline-math", alerts: "callouts--github-style-alerts" }[id] || id), {
    requirement: "optional", setting: "Preferences → Markdown → " + setting,
    ...(id === "tex_math_dollars" ? { note: "The setting applies to inline math; display math is documented separately. This Notdown switch covers both." } : {}),
  });
}
add("typora", "diagrams", "Typora Docs", "https://support.typora.io/Draw-Diagrams-With-Markdown/#precondition", { requirement: "optional", setting: "Preferences → Markdown → Diagrams" });
add("typora", "smart", "Typora Docs", "https://support.typora.io/SmartyPants/", { requirement: "optional", setting: "Smart Quotes / Smart Dashes", note: "Notdown combines these text-processing options into one switch." });
add("typora", "hard_line_breaks", "Typora Docs", "https://support.typora.io/Line-Break/", { requirement: "optional", setting: "Preserve single line break", note: "Related rendering preference; not an exact one-to-one parser flag." });
add("typora", "space_in_atx_header", "Typora Docs", "https://support.typora.io/What%27s-New-1.5/#ui--ux", { requirement: "optional", setting: "Preferences → Markdown → Strict Mode", note: "Strict Mode determines whether a heading needs whitespace after #; this switch covers that rule only." });

add("obsidian", "raw_html", "Obsidian Docs", obsidian + "html");
add("obsidian", "backtick_code_blocks fenced_code_blocks strikeout highlight footnotes comments", "Obsidian Docs", obsidian + "syntax");
add("obsidian", "pipe_tables tex_math_dollars diagrams", "Obsidian Docs", obsidian + "advanced-syntax");
add("obsidian", "task_lists", "Obsidian Docs", obsidian + "syntax#Task+lists");
add("obsidian", "alerts", "Obsidian Docs", obsidian + "callouts");
add("obsidian", "wikilinks_title_after_pipe", "Obsidian Docs", obsidian + "links");
add("obsidian", "transclusion", "Obsidian Docs", obsidian + "embeds", { note: "Obsidian ![[…]] embedding; MultiMarkdown transclusion syntax is a separate encoding." });
add("obsidian", "yaml_metadata_block", "Obsidian Docs", obsidian + "properties");
add("obsidian", "hard_line_breaks", "Obsidian Docs", obsidian + "syntax#Line+breaks", { requirement: "optional", setting: "Editor → Strict line breaks (inverse)", note: "Hard breaks correspond to disabling strict line breaks in Reading view." });

const notionSections: Record<string, string> = {
  notion_columns: "columns", notion_callouts: "callout", notion_toggles: "toggle", notion_tables: "table",
  notion_pages: "page-and-database-references", notion_databases: "page-and-database-references", notion_mentions: "mentions",
  notion_media: "media-blocks", notion_synced: "synced-block", notion_toc: "table-of-contents", notion_nesting: "indentation",
  notion_colors: "rich-text-formatting", notion_underline: "rich-text-formatting", strikeout: "rich-text-formatting", task_lists: "lists", tex_math_dollars: "equation",
};
for (const [id, anchor] of Object.entries(notionSections)) add("notion-markdown", id, "Notion Docs", notion + "#" + anchor);
add("notion-markdown", "diagrams", "Notion Docs", notion + "#code", { note: "Notion documents Mermaid code fences; other diagram engines are outside this mapping." });
for (const [id, evidence] of Object.entries(rules["notion-markdown"])) rules.notdown[id] = { ...evidence, note: "Inherited from Notion-flavored Markdown. Notdown block extensions use separate encodings." };

export type PandocDefaultState = "on" | "off" | "not-listed" | "no-preset";
/** Confirmed CommonMark base rules, not a general inference from an absent flag.
 * https://pandoc.org/MANUAL.html#markdown-variants
 * Notdown's CommonMark-family parser uses these base rules without switches. */
export function isBuiltInSyntax(variant: Dialect, id: string) {
  id = canonicalExtensionId(id);
  return ["commonmark", "gfm", "commonmark_x"].includes(variant) &&
    Object.hasOwn(commonRules, id) && !Object.hasOwn(pandocDefaults[variant], id);
}
export function extensionProvenance(variant: Dialect, id: string) {
  id = canonicalExtensionId(id);
  const defaults = pandocDefaults[variant];
  const pandoc: PandocDefaultState = !defaults ? "no-preset" : !Object.hasOwn(defaults, id) ? "not-listed" : defaults[id] ? "on" : "off";
  return { syntax: rules[variant][id], pandoc, builtIn: isBuiltInSyntax(variant, id) };
}
export const extensionGroupLabels = {
  specified: "Specified syntax", builtin: "Built-in syntax", other: "Others", outside: "Outside Markdown scope",
};
export type ExtensionGroupId = keyof typeof extensionGroupLabels;
type Entry = { id: string; label: string; status?: string };
// Local presentation scope is independent of parser registration and upstream syntax.
export function isOutsideMarkdownScope(entry: Pick<Entry, "id" | "status">) {
  return entry.id === "raw_tex" || entry.status === "out-of-scope";
}
export function groupExtensions<T extends Entry>(entries: readonly T[], variant: Dialect) {
  const groups: { id: ExtensionGroupId; label: string; entries: T[] }[] = Object.entries(extensionGroupLabels).map(([id, label]) => ({ id: id as ExtensionGroupId, label, entries: [] }));
  for (const entry of entries) {
    const evidence = extensionProvenance(variant, entry.id);
    const id = isOutsideMarkdownScope(entry) ? "outside" : evidence.builtIn ? "builtin" : evidence.syntax ? "specified" : "other";
    groups.find(group => group.id === id)!.entries.push(entry);
  }
  for (const group of groups) group.entries.sort((a, b) => {
    const categories = Object.keys(extensionCategories);
    const categoryOrder = categories.indexOf(extensionCategory(a.id)) - categories.indexOf(extensionCategory(b.id));
    const ea = extensionProvenance(variant, a.id).syntax, eb = extensionProvenance(variant, b.id).syntax;
    return (group.id === "other" ? categoryOrder : 0) || Number(ea?.requirement === "optional") - Number(eb?.requirement === "optional") ||
      Number(ea?.authority === "docs") - Number(eb?.authority === "docs") || a.label.localeCompare(b.label, "en") || a.id.localeCompare(b.id, "en");
  });
  return groups.filter(group => group.entries.length);
}
/** Shared display for both editable settings and read-only catalog lists. */
export function extensionProvenanceHtml(variant: Dialect, id: string) {
  id = canonicalExtensionId(id);
  const category = extensionCategory(id);
  const categoryBadge = `<span class="extension-category" data-extension-category="${category}">${extensionCategories[category]}</span>`;
  if (Object.values(localObjectPlugins).includes(id)) {
    const origin = notionFeatureOrigins[id];
    const featureBadge = origin ? `<a class="extension-evidence" href="${escape(origin.url)}" target="_blank" rel="noopener noreferrer" title="${escape(localEncodingNote)}">${escape(origin.label)} · local encoding ↗</a>` : "";
    return `<span class="extension-provenance">${categoryBadge}${featureBadge}<span class="extension-evidence">Notdown block extension · ${variant === "notdown" ? "on by default" : "unavailable in this variant"}</span></span>`;
  }
  const { syntax, pandoc: state, builtIn } = extensionProvenance(variant, id);
  const syntaxLabel = syntax ? `${syntax.source} · ${syntax.requirement === "optional" ? syntax.setting ? "Optional setting" : "Optional" : "Required"}` : "No documented syntax mapping";
  const syntaxBadge = syntax
    ? `<a class="extension-evidence" href="${escape(syntax.url)}" target="_blank" rel="noopener noreferrer" title="${escape([syntax.setting, syntax.note].filter(Boolean).join(" · ") || "Syntax reference; not a conformance claim or an enabled-state indicator.")}">${escape(syntaxLabel)} ↗</a>`
    : `<span class="extension-evidence extension-evidence-muted">${syntaxLabel}</span>`;
  const defaultLabel = builtIn ? "Pandoc: built in · no switch" : state === "on" ? "Pandoc default: on" : state === "off" ? "Pandoc default: off" : state === "no-preset" ? "Pandoc: no preset" : "Pandoc: no extension flag";
  return `<span class="extension-provenance">${categoryBadge}${syntaxBadge}<span class="extension-pandoc" data-pandoc-default="${state}" title="${escape(pandocDefaultVersion)} · ${state === "not-listed" ? "An absent flag can be built-in syntax, or a feature outside this Pandoc reader." : state === "no-preset" ? "Pandoc has no reader for this product; Notdown defaults are separate." : "Versioned --list-extensions snapshot; independent of Notdown overrides."}">${defaultLabel}</span></span>${syntax?.note ? `<small class="extension-evidence-note">${escape(syntax.note)}</small>` : ""}`;
}
