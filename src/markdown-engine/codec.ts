import { hasSupplementalAttributes, needsMarkdownTable, canConvertNotionTable } from "../document/notdown-boundary";
import { encodeCodeCaption } from "../document/code-caption";
import { objectTags } from "../document/object-model";
import { localObjectPlugins } from "./presets";
import { isListItem } from "../document/list-items";
import { readObjectBlock, writeObjectBlock } from "../document/object-codec";
import { installAdvancedRules, listMarker } from "./advanced";
import { installReferenceOptions } from "./reference-options";
import { installDocumentOptions } from "./document-options";
import { installLatexMacros } from "./latex-macros";
import { installPandocTables, writeGridTable, writeSimpleTable } from "./pandoc-tables";
import { multiMarkdownTable } from "../document/table-markdown";
import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import type { Node as PMNode } from "prosemirror-model";
import { editorSchema as schema } from "../document/editor-schema.js";
import {
  parseEditorMarkdown,
  parseInline,
  serializeEditorMarkdown,
  inlineMarkdown,
  blockMarkdown,
  editorFingerprint,
} from "../document/editor-markdown.js";
import {
  parseNotionMarkdown,
  serializeNotionMarkdown,
  notionBlockMarkdown,
} from "../document/notion-markdown.js";
import { inlineColors, openingTag } from "../document/notion-syntax.js";
import {
  enabled,
  nativeDialect,
  usesNotionSyntax,
  markdownFamily,
  type SyntaxConfig,
} from "./config.js";
import { installMarkdownBlocks } from "./blocks.js";
import { installProductRules } from "./products.js";
import { readAttributes, writeAttributes } from "./attributes.js";
import { renderRawHtml } from "./html.js";
import { installDialectRules, dialectCodeBlock } from "./dialects.js";
import { editableBlankParagraphs } from "./spacing.js";
import { installRMarkdown } from "./rmarkdown";
import { coreGfm, gfmHtmlRanges, installGfm } from "./gfm";

const children = (node: PMNode) => {
  const result: PMNode[] = [];
  node.forEach((n) => result.push(n));
  return result;
};
const features: Record<string, string> = {
  columns: "notion_columns",
  column: "notion_columns",
  callout: "notion_callouts",
  toggle_block: "notion_toggles",
  media_block: "notion_media",
  child_page: "notion_pages",
  mention: "notion_mentions",
  citation: "notion_mentions",
  synced_block: "notion_synced",
  table_of_contents: "notion_toc",
  nested_block: "notion_nesting",
  equation: "tex_math_dollars",
  inline_math: "tex_math_dollars",
  html_block: "raw_html",
  html_inline: "raw_html",
  definition_list: "definition_lists",
  footnote: "footnotes",
  footnote_reference: "footnotes",
  line_block: "line_blocks",
  fenced_div: "fenced_divs",
};
const tags = new Set([
  "columns",
  "column",
  "callout",
  "details",
  "table",
  "table_of_contents",
  "page",
  "database",
  "audio",
  "video",
  "file",
  "pdf",
  "synced_block",
  "synced_block_reference",
  "unknown",
]);

function unavailable(node: PMNode, config: SyntaxConfig): boolean {
  if (node.type.name === "image_block") return true;
  if (node.type.name === "code_block" &&
      (node.attrs.markdownAttrs?.caption !== undefined || node.attrs.nfmAttrs?.caption !== undefined) &&
      (config.variant === "notion-markdown" || config.variant === "notdown" && !enabled(config, "fenced_code_attributes"))) return true;
  if (config.variant !== "notdown" && hasSupplementalAttributes(node)) return true;
  if (config.variant === "notion-markdown" && needsMarkdownTable(node)) return true;
  if (config.variant === "notion-markdown" && node.marks.some(mark =>
    ["native_span", "small_caps"].includes(mark.type.name))) return true;
  if (node.type.name === "heading" && node.attrs.toggle && !enabled(config, "notion_nesting")) return true;
  if (node.attrs.metadataForm) {
    const flag = ({ mmd: "mmd_title_block", yaml: "yaml_metadata_block", pandoc: "pandoc_title_block" } as Record<string, string>)[node.attrs.metadataForm];
    if (flag && !enabled(config, flag)) return true;
  }
  const localPlugin = localObjectPlugins[node.type.name];
  if (localPlugin && !enabled(config, localPlugin)) return true;
  const feature = node.type.name === "callout" && node.attrs.syntaxForm === "alert"
    ? "alerts"
    : node.type.name === "table_of_contents" && node.attrs.syntaxForm !== "notion"
      ? "toc_directives" : features[node.type.name];
  if (feature && !enabled(config, feature) && !(node.type.name === "equation" && enabled(config, "display_math")))
    return true;
  if (
    node.type.name === "table" &&
    !enabled(config, ({ grid: "grid_tables", simple: "simple_tables", multiline: "multiline_tables", mmd: "mmd_tables", pipe: "pipe_tables" } as Record<string,string>)[node.attrs.syntaxForm] || "notion_tables")
  )
    return true;
  if (
    node.type.name === "page_link" &&
    !enabled(
      config,
      usesNotionSyntax(config)
        ? "notion_pages"
        : "wikilinks_title_after_pipe",
    ) &&
    !enabled(config, "notion_pages")
  )
    return true;
  if (
    isListItem(node) &&
    node.attrs.checked !== null &&
    !enabled(config, "task_lists")
  )
    return true;
  if (
    node.marks.some((m) => m.type.name === "strike") &&
    !enabled(config, "strikeout")
  )
    return true;
  if (
    (node.attrs.color ||
      node.marks.some((m) => m.type.name === "color")) &&
    !enabled(config, "notion_colors")
  )
    return true;
  if (node.marks.some(m => m.type.name === "underline") && !enabled(config, "notion_underline")) return true;
  return children(node).some((child) => unavailable(child, config));
}
function preserve(node: PMNode, raw: string): PMNode {
  return schema.nodes.opaque_block.create({
    ...node.attrs,
    raw,
    source: raw,
    sourceFingerprint: null,
  });
}
const parsers = new Map<string, MarkdownIt>();
function parser(config: SyntaxConfig): MarkdownIt {
  const key = JSON.stringify([config.variant, config.extensions, config.sourcePath]);
  const cached = parsers.get(key);
  if (cached) return cached;
  const md = new MarkdownIt("commonmark", {
    html: enabled(config, "raw_html"),
    breaks: enabled(config, "hard_line_breaks"),
    linkify: enabled(config, "autolink_bare_uris"),
    typographer: enabled(config, "smart"),
  });
  md.core.ruler.after("inline", "native_line_breaks", (state) => {
    for (const block of state.tokens)
      for (const token of block.children ?? []) {
        if (token.type !== "softbreak") continue;
        if (enabled(config, "hard_line_breaks")) token.type = "hardbreak";
        else {
          token.type = "text";
          token.content = enabled(config, "ignore_line_breaks") ? "" : config.variant === "gfm" ? "\n" : " ";
        }
      }
  });
  if (enabled(config, "pipe_tables")) md.enable("table");
  if (enabled(config, "strikeout")) md.enable("strikethrough");
  if (enabled(config, "autolink_bare_uris")) md.enable("linkify");
  installDialectRules(md, config);
  installMarkdownBlocks(md, config);
  md.renderer.rules.footnote_reference = (ts, i) =>
    "<sup>[" + md.utils.escapeHtml(ts[i].meta.label) + "]</sup>";
  md.renderer.rules.source_inline = (ts, i) =>
    md.utils.escapeHtml(
      ts[i].meta.node.textContent || ts[i].meta.node.attrs.label || "",
    );
  if (enabled(config, "task_lists"))
    md.core.ruler.after("inline", "native_tasks", (state) => {
      for (let i = 0; i < state.tokens.length; i++) {
        if (
          state.tokens[i].type !== "list_item_open" ||
          state.tokens[i + 1]?.type !== "paragraph_open"
        )
          continue;
        // Typora renders task markers in ordered items as literal text.
        // Use this item's marker, not an ancestor list: nested bullet tasks
        // inside ordered lists still support checkboxes.
        if (config.variant === "typora" && /^[.)]$/.test(state.tokens[i].markup))
          continue;
        const inline = state.tokens[i + 2],
          first = inline?.children?.[0];
        const marker = /^\[([ xX])\](?=[ \t\n]|$)/.exec(inline?.content ?? "");
        if (
          !marker ||
          first?.type !== "text" ||
          !first.content.startsWith(marker[0])
        )
          continue;
        first.content = first.content.slice(marker[0].length);
        for (const child of inline.children!) {
          if (child.type === "softbreak") { child.type = "text"; child.content = ""; continue; }
          if (child.type !== "text") break;
          child.content = child.content.replace(/^[ \t]+/, "");
          if (child.content) break;
        }
        const checkbox = new state.Token("task_checkbox", "input", 0);
        checkbox.meta = { checked: marker[1].toLowerCase() === "x" };
        inline.children!.unshift(checkbox);
      }
    });
  if (["obsidian", "notdown"].includes(config.variant))
    md.inline.ruler.before("escape", "obsidian_block_id", (state, silent) => {
      if (state.pos > 0 && !/\s/.test(state.src[state.pos - 1])) return false;
      const match = /^\^([A-Za-z0-9-]+)[ \t]*$/.exec(state.src.slice(state.pos));
      if (!match || "linkLevel" in state && Number(state.linkLevel) > 0) return false;
      if (!silent) {
        const token = state.push("source_inline", "", 0);
        token.meta = { node: schema.nodes.syntax_inline.create({ kind: "block-anchor", target: match[1], raw: match[0] }) };
      }
      state.pos += match[0].length;
      return true;
    });
  if (enabled(config, "wikilinks_title_after_pipe"))
    md.inline.ruler.before("link", "native_wiki", (state, silent) => {
      if (
        silent ||
        ("linkLevel" in state && Number(state.linkLevel) > 0) ||
        state.src.slice(state.pos, state.pos + 2) !== "[["
      )
        return false;
      const end = state.src.indexOf("]]", state.pos + 2);
      if (end < 0) return false;
      const text = state.src.slice(state.pos + 2, end);
      if (/[\r\n\[\]]/.test(text)) return false;
      const split = text.indexOf("|"),
        target = (split < 0 ? text : text.slice(0, split)).trim();
      if (!target) return false;
      const token = state.push("wiki_link", "", 0);
      token.meta = { target, explicitLabel: split >= 0 };
      token.content = split < 0 ? target : text.slice(split + 1).trim();
      state.pos = end + 2;
      return true;
    });
  if (enabled(config, "tex_math_dollars")) {
    md.inline.ruler.before("escape", "native_math", (state, silent) => {
      if (
        state.src[state.pos] !== "$" ||
        state.src[state.pos + 1] === "$" ||
        /\s/.test(state.src[state.pos + 1] ?? " ")
      )
        return false;
      let end = state.pos + 1;
      while (
        (end = state.src.indexOf("$", end)) >= 0 &&
        state.src[end - 1] === "\\"
      )
        end++;
      if (
        end < 0 ||
        /\s/.test(state.src[end - 1]) ||
        /\d/.test(state.src[end + 1] ?? "") ||
        state.src.slice(state.pos, end).includes("\n")
      )
        return false;
      if (!silent) {
        const token = state.push("nfm_math", "", 0);
        token.content = state.src.slice(state.pos + 1, end);
      }
      state.pos = end + 1;
      return true;
    });
  }
  if (enabled(config, "tex_math_dollars") || enabled(config, "display_math")) {
    md.block.ruler.before(
      "fence",
      "native_equation",
      (state, start, end, silent) => {
        const line = state.src.slice(
          state.bMarks[start] + state.tShift[start],
          state.eMarks[start],
        );
        if (
          state.sCount[start] - state.blkIndent >= 4 ||
          !line.startsWith("$$")
        )
          return false;
        let finish = start + 1,
          value = "";
        if (line.length > 4 && line.endsWith("$$")) value = line.slice(2, -2);
        else if (line.trim() === "$$") {
          while (
            finish < end &&
            state.src
              .slice(
                state.bMarks[finish] + state.tShift[finish],
                state.eMarks[finish],
              )
              .trim() !== "$$"
          )
            finish++;
          if (finish === end) return false;
          value = state.getLines(start + 1, finish, state.blkIndent, false);
          finish++;
        } else return false;
        if (silent) return true;
        const token = state.push("source_node", "", 0);
        token.map = [start, finish];
        token.block = true;
        token.meta = {
          node: schema.nodes.equation.create(
            null,
            value.trim() ? schema.text(value.trim()) : undefined,
          ),
        };
        state.line = finish;
        return true;
      },
      { alt: ["paragraph", "reference", "blockquote", "list"] },
    );
  }
  // A balanced, opt-in block carrier. A disabled extension stays recoverable as raw source.
  md.inline.ruler.before(
    "html_inline",
    "native_inline_tags",
    (state, silent) => {
      if (silent || state.src[state.pos] !== "<") return false;
      const rest = state.src.slice(state.pos),
        tag = openingTag(rest);
      if (!tag) return false;
      const requirement =
        tag.tag === "span" && (tag.attrs.color || Object.hasOwn(tag.attrs, "bg_color"))
          ? "notion_colors"
          : tag.tag === "span" && tag.attrs.underline
            ? "notion_underline"
          : tag.tag === "mention-link"
            ? "notion_link_preview"
          : tag.tag === "mention-page"
            ? "notion_pages"
            : tag.tag.startsWith("mention-")
              ? "notion_mentions"
              : null;
      if (!requirement || !enabled(config, requirement)) return false;
      if (tag.tag === "span" && Object.hasOwn(tag.attrs, "bg_color") && config.variant !== "notdown") return false;
      if (tag.tag === "span" && ((tag.attrs.color && !enabled(config, "notion_colors")) || (tag.attrs.underline && !enabled(config, "notion_underline")))) return false;
      let close = rest.indexOf("</" + tag.tag + ">", tag.length);
      if (config.variant === "notdown" && tag.tag === "span" && !tag.selfClosing) {
        const nested = /<\/?span\b(?:[^>"']|"[^"]*"|'[^']*')*>/g;
        nested.lastIndex = tag.length;
        let depth = 1, match: RegExpExecArray | null;
        close = -1;
        while ((match = nested.exec(rest))) {
          if (match[0].startsWith("</")) depth--;
          else if (!match[0].endsWith("/>")) depth++;
          if (!depth) { close = match.index; break; }
        }
      }
      if (!tag.selfClosing && close < 0) return false;
      const end = tag.selfClosing ? tag.length : close + tag.tag.length + 3;
      if (end < tag.length) return false;
      if (config.variant === "notdown" && tag.tag === "span" && !tag.selfClosing) {
        const styled = parseNotionMarkdown(rest.slice(0, tag.length) + "x</span>").firstChild?.firstChild;
        for (const child of parseInline(md.parseInline(rest.slice(tag.length, close), state.env)[0]?.children ?? [])) {
          const token = state.push("source_inline", "", 0);
          token.meta = { node: child.mark(child.marks.reduce((marks, mark) => {
            const outer = marks.find(m => m.type.name === "color");
            if (outer && mark.type.name === "color") {
              const parentColors = inlineColors(outer.attrs), innerColors = inlineColors(mark.attrs);
              mark = mark.type.create({
                color: innerColors.color || parentColors.color,
                bg_color: innerColors.bg_color || parentColors.bg_color,
                nfmAttrs: { ...outer.attrs.nfmAttrs, ...mark.attrs.nfmAttrs },
              });
            }
            return mark.addToSet(marks);
          }, styled?.marks ?? [])) };
        }
        state.pos += end;
        return true;
      }
      const doc = parseNotionMarkdown(rest.slice(0, end), name => enabled(config, localObjectPlugins[name]));
      if (doc.childCount !== 1 || doc.firstChild?.type.name !== "paragraph")
        return false;
      // Opting into a carrier must not opt into every feature of the Notion
      // inline parser (math, strike, mentions, or local link previews).
      if (unavailable(doc.firstChild, config)) return false;
      doc.firstChild.forEach((node) => {
        const token = state.push("source_inline", "", 0);
        token.meta = { node };
      });
      state.pos += end;
      return true;
    },
  );
  md.block.ruler.before(
    "fence",
    "native_nest",
    (state, start, end, silent) => {
      const line = state.src.slice(
        state.bMarks[start] + state.tShift[start],
        state.eMarks[start],
      );
      const legacyPage = /^::page\{id="([^"\s<>]+)"\}[ \t]*$/.test(line);
      if (
        state.sCount[start] - state.blkIndent >= 4 ||
        (!legacyPage && ![":::nest", ":::columns"].includes(line.trim()))
      )
        return false;
      const tail = state.getLines(start, end, state.blkIndent, false),
        node = parseEditorMarkdown(tail).firstChild!;
      const raw = String(node.attrs.source || line),
        finish = Math.min(end, start + raw.split(/\r\n|\n|\r/).length);
      if (silent) return true;
      const token = state.push("source_node", "", 0);
      token.map = [start, finish];
      token.block = true;
      token.meta = {
        node: preserve(node, raw),
      };
      state.line = finish;
      return true;
    },
    { alt: ["paragraph", "reference", "blockquote", "list"] },
  );
  md.block.ruler.before(
    "fence",
    "native_notion_blocks",
    (state, start, end, silent) => {
      if (state.sCount[start] - state.blkIndent >= 4) return false;
      const at = (line: number) =>
        state.src.slice(
          state.bMarks[line] + state.tShift[line],
          state.eMarks[line],
        );
      const first = at(start).trim(),
        tag = openingTag(first);
      if (!tag || !tags.has(tag.tag)) return false;
      const requirement = ({ columns: "notion_columns", column: "notion_columns", callout: "notion_callouts", details: "notion_toggles", table: "notion_tables", table_of_contents: "notion_toc", page: "notion_pages", database: "notion_databases", audio: "notion_media", video: "notion_media", file: "notion_media", pdf: "notion_media", synced_block: "notion_synced", synced_block_reference: "notion_synced" } as Record<string,string>)[tag.tag];
      if (!requirement || !enabled(config, requirement)) return false;
      if (
        enabled(config, "raw_html") &&
        ((tag.tag === "table" && !enabled(config, "notion_tables")) ||
          (tag.tag === "details" && !enabled(config, "notion_toggles")))
      )
        return false;
      let finish = start + 1;
      if (!tag.selfClosing && !first.endsWith("</" + tag.tag + ">")) {
        let depth = 1,
          fence = "";
        for (; finish < end; finish++) {
          const line = at(finish).trim(),
            marker = /^(`{3,}|~{3,})(.*)$/.exec(line);
          if (fence) {
            if (
              marker &&
              marker[1][0] === fence[0] &&
              marker[1].length >= fence.length &&
              !marker[2].trim()
            )
              fence = "";
            continue;
          }
          if (marker) {
            fence = marker[1];
            continue;
          }
          if (line === "</" + tag.tag + ">" && --depth === 0) {
            finish++;
            break;
          }
          const nested = openingTag(line);
          if (
            nested?.tag === tag.tag &&
            !nested.selfClosing &&
            !line.endsWith("</" + tag.tag + ">")
          )
            depth++;
        }
      }
      if (silent) return true;
      const raw = state
        .getLines(start, finish, state.blkIndent, false)
        .replace(/\n$/, "");
      let node = parseNotionMarkdown(raw, name => enabled(config, localObjectPlugins[name])).firstChild!;
      if (
        (tag.tag === "table" && !enabled(config, "notion_tables")) ||
        unavailable(node, config)
      )
        node = preserve(node, raw);
      const token = state.push("source_node", "", 0);
      token.map = [start, finish];
      token.block = true;
      token.meta = { node };
      state.line = finish;
      return true;
    },
    { alt: ["paragraph", "reference", "blockquote", "list"] },
  );
  installProductRules(md, config, (source, env) =>
    parseNative(source, config, (env.nativeDepth || 0) + 1, env),
  );
  md.block.ruler.before("html_block", "content_objects", (state, start, end, silent) => {
    if (state.sCount[start] - state.blkIndent >= 4) return false;
    const first = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]);
    if (!/^<(?:tabs|bookmark|link-preview|breadcrumb|button|meeting-notes|ai-block|html-embed|web-embed|figure)(?:\s|\/?>)/.test(first)) return false;
    const objectName = objectTags[openingTag(first)?.tag || ""];
    if (!objectName || !enabled(config, localObjectPlugins[objectName])) return false;
    const lines = Array.from({ length: end }, (_, line) => state.src.slice(state.bMarks[line] + Math.min(state.tShift[line], state.blkIndent), state.eMarks[line]));
    const object = readObjectBlock(lines, start, end, raw => parseNative(raw, config, (state.env.nativeDepth || 0) + 1));
    if (!object) return false;
    if (silent) return true;
    const token = state.push("source_node", "", 0);
    token.map = [start, object.next]; token.block = true; token.meta = { node: object.node };
    state.line = object.next;
    return true;
  }, { alt: ["paragraph", "reference", "blockquote", "list"] });
  installAdvancedRules(md, config, (raw, env) => parseNative(raw, config, (env.nativeDepth || 0) + 1, env));
  installReferenceOptions(md, config);
  installPandocTables(md, config, (raw, env) => parseNative(raw, config, (env.nativeDepth || 0) + 1, env));
  installDocumentOptions(md, config);
  installLatexMacros(md, config);
  if (config.variant === "rmarkdown" || config.variant === "notdown") installRMarkdown(md);
  installGfm(md, config);
  if (parsers.size >= 16) parsers.delete(parsers.keys().next().value!);
  parsers.set(key, md);
  return md;
}

/** GFM syntax HTML, before the application's HTML allowlist. Never mount directly. */
export function renderGfmSyntax(source: string, config: SyntaxConfig = { version: 1, variant: "gfm", extensions: {} }, sourcePositions = false): string {
  const md = parser(config), env = {}, tokens = md.parse(source, env);
  if (sourcePositions) for (const token of tokens)
    if (token.block && token.map && token.nesting !== -1) token.attrSet("data-source-line", String(token.map[0] + 1));
  return md.renderer.render(tokens, md.options, env);
}

function tableNodes(tokens: Token[], config: SyntaxConfig, source: string): Token[] {
  const result: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== "table_open") {
      result.push(token);
      continue;
    }
    const rows: PMNode[] = [];
    let caption: PMNode | undefined;
    let captionId = "";
    let captionSide = "top";
    let markdownAttrs: Record<string, string> = {};
    let section = 0;
    let cells: PMNode[] = [],
      header = false,
      j = i + 1;
    for (; j < tokens.length && tokens[j].type !== "table_close"; j++) {
      const t = tokens[j];
      if (t.type === "thead_open") header = true;
      if (t.type === "thead_close") header = false;
      if (t.type === "tbody_open") section++;
      if (t.type === "caption_open") {
        captionSide = t.attrGet("style")?.includes("bottom") ? "bottom" : "top";
        const captionLine = source.split(/\r\n|\n|\r/)[t.map?.[0] ?? -1] || "";
        captionId = /^\s*\[.*?\](?:\[([^\]]*)\])?\s*$/.exec(captionLine)?.[1] || "";
        const inline = tokens[j + 1];
        caption = schema.nodes.table_caption.create(null, inline?.type === "inline" ? parseInline(inline.children ?? []) : []);
      }
      if (t.type === "tr_open") cells = [];
      if (t.type === "td_open" || t.type === "th_open") {
        let end = j + 1, depth = 1;
        for (; end < tokens.length; end++) {
          depth += tokens[end].nesting;
          if (!depth) break;
        }
        const inline = tokens[j + 1],
          align = /text-align:(left|right|center)/.exec(
            t.attrGet("style") ?? "",
          )?.[1];
        cells.push(
          schema.nodes.table_cell.create(
            { nfmAttrs: align ? { align } : {}, colspan: Number(t.attrGet("colspan")) || 1, rowspan: Number(t.attrGet("rowspan")) || 1, header: (config.variant === "gfm" || enabled(config, "mmd_tables")) && t.type === "th_open" },
            inline?.type === "inline" ? schema.nodes.paragraph.create(
              null,
              inline?.type === "inline"
                ? parseInline(inline.children ?? [])
                : [],
            ) : parseEditorMarkdown(source, tableNodes(tokens.slice(j + 1, end), config, source)).content,
          ),
        );
        j = end;
      }
      if (t.type === "tr_close")
        rows.push(schema.nodes.table_row.create({ header, section }, cells));
    }
    const readCaption = (text: string) => {
      const match = /^(?:Table:|:)\s+(.+)$/.exec(text);
      if (!match || !enabled(config, "table_captions")) return false;
      let value = match[1];
      const attrs = /\s*\{([^{}]+)\}$/.exec(value);
      if (attrs && enabled(config, "table_attributes")) { markdownAttrs = readAttributes(attrs[0].trim()); value = value.slice(0, attrs.index); }
      caption = schema.nodes.table_caption.create(null, parseInline(parser(config).parseInline(value, {})[0]?.children || []));
      captionId = markdownAttrs.id || captionId;
      return true;
    };
    if (result.at(-3)?.type === "paragraph_open" && result.at(-2)?.type === "inline" && readCaption(result.at(-2)!.content)) {
      captionSide = "top";
      if (token.map && result.at(-3)!.map) token.map[0] = result.at(-3)!.map![0];
      result.splice(-3);
    }
    if (tokens[j + 1]?.type === "paragraph_open" && tokens[j + 2]?.type === "inline") {
      const text = tokens[j + 2].content;
      if (readCaption(text)) captionSide = "bottom";
      else if (enabled(config, "table_attributes") && /^\{[^{}]+\}$/.test(text)) markdownAttrs = readAttributes(text);
      else { /* A following paragraph remains independent content. */ }
      if (/^(?:Table:|:)\s+/.test(text) && captionSide === "bottom" || /^\{[^{}]+\}$/.test(text) && enabled(config, "table_attributes")) {
        if (token.map && tokens[j + 1].map) token.map[1] = tokens[j + 1].map![1];
        j += 3;
      }
    }
    token.type = "source_node";
    token.nesting = 0;
    token.meta = {
      node: schema.nodes.table.create(
        { nfmAttrs: { "header-row": String(rows[0]?.attrs.header || false) }, syntaxForm: enabled(config, "mmd_tables") ? "mmd" : "pipe", captionId, captionSide, markdownAttrs: { ...token.meta?.markdownAttrs, ...markdownAttrs } },
        caption ? [caption, ...rows] : rows,
      ),
    };
    result.push(token);
    i = j;
  }
  return result;
}
export function parseNative(
  source: string,
  config: SyntaxConfig,
  depth = 0,
  context: Record<string, unknown> = {},
): PMNode {
  if (depth > 40)
    return schema.nodes.doc.create(null, [
      schema.nodes.opaque_block.create({ raw: source }),
    ]);
  if (!nativeDialect(config))
    return schema.nodes.doc.create({ source, sourceFormat: "markdown" }, [
      schema.nodes.opaque_block.create({ raw: source }),
    ]);
  if (usesNotionSyntax(config)) {
    const doc = parseNotionMarkdown(source, name => enabled(config, localObjectPlugins[name]), config.variant === "notdown" ? notdownExtensions(source, config, depth, context) : undefined);
    const nodes = children(doc).map((node) =>
      unavailable(node, config)
        ? preserve(node, node.attrs.source ?? notionBlockMarkdown(node))
        : node,
    );
    const next = doc.type.create(doc.attrs, nodes);
    return next.type.create(
      { ...next.attrs, sourceFingerprint: editorFingerprint(next) },
      next.content,
    );
  }
  return parseMarkdownNative(source, config, depth, context);
}

function parseMarkdownNative(source: string, config: SyntaxConfig, depth: number, context: Record<string, unknown> = {}): PMNode {
  const md = parser(config),
    env = { ...context, nativeDepth: depth },
    tokens = md.parse(source, env),
    projected: Token[] = [];
  if (coreGfm(config)) {
    const ranges = gfmHtmlRanges(tokens, md, env);
    for (const [first, last] of [...ranges].sort((a, b) => b[0] - a[0])) {
      const token = tokens[first];
      token.map = [token.map![0], tokens[last].map![1]];
      const raw = source.split(/\r\n|\n|\r/).slice(...token.map).join(source.match(/\r\n|\n|\r/)?.[0] ?? "\n").replace(/[\r\n]+$/, "");
      token.type = "source_node";
      token.meta = { node: schema.nodes.html_block.create({ raw, tagfilter: true, gfmConfig: config }) };
      tokens.splice(first + 1, last - first);
    }
  }
  // The native codec must trust GFM token classification, including malformed
  // tags that the CommonMark grammar intentionally treats as paragraph text.
  if (config.variant === "gfm") for (const token of tokens) token.meta = { ...token.meta, gfm: true };
  for (const t of tokens) {
    // A simple HTML line break is editable inline structure, not an opaque
    // HTML preview containing all of the surrounding paragraph/cell text.
    if (t.type === "inline")
      for (const child of t.children || [])
        if (child.type === "html_inline" && /^<br\s*\/?\s*>$/i.test(child.content)) {
          child.type = "hardbreak";
          child.tag = "br";
          child.content = "";
        }
    if (
      t.type === "inline" &&
      t.children?.some((child) => child.type === "html_inline")
    ) {
      const html = renderRawHtml(
        md.renderer.renderInline(t.children, md.options, env),
      );
      const child = new (
        t.constructor as typeof import("markdown-it/lib/token.mjs").default
      )("source_inline", "", 0);
      child.meta = {
        node: schema.nodes.html_inline.create({ raw: t.content, html }),
      };
      t.children = [child];
    }
  }
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    let node: PMNode | undefined;
    if (t.type === "html_block")
      node = schema.nodes.html_block.create({
        raw: t.content.replace(/\n$/, ""),
        tagfilter: config.variant === "gfm",
      });
    if (t.type === "footnote_open" || t.type === "fenced_div_open") {
      const name = t.type === "footnote_open" ? "footnote" : "fenced_div";
      const content = children(parseNative(t.meta.body, config, depth + 1));
      node =
        t.meta.closed === false
          ? schema.nodes.opaque_block.create({
              raw: source
                .split(/\r\n|\r|\n/)
                .slice(t.map![0], t.map![1])
                .join("\n"),
            })
          : schema.nodes[name].create(
              name === "footnote"
                ? { label: t.meta.label }
                : { attributes: t.meta.attributes },
              content,
            );
      i++;
    }
    if (t.type === "line_block_open") {
      const lines: PMNode[] = [];
      while (++i < tokens.length && tokens[i].type !== "line_block_close")
        if (tokens[i].type === "inline")
          lines.push(
            schema.nodes.line.create(
              null,
              parseInline(tokens[i].children ?? []),
            ),
          );
      node = schema.nodes.line_block.create(null, lines);
    }
    if (node) {
      t.type = "source_node";
      t.nesting = 0;
      t.meta = { node };
    }
    projected.push(t);
  }
  let doc = parseEditorMarkdown(source, tableNodes(projected, config, source));
  if (config.variant === "gfm") doc = doc.type.create({ ...doc.attrs, sourceSyntax: config }, doc.content);
  return config.variant === "typora" && depth === 0 ? editableBlankParagraphs(doc) : doc;
}
function writeBlock(node: PMNode, config: SyntaxConfig): string {
  const attrs = { ...node.attrs.markdownAttrs };
  if (attrs.generated) {
    delete attrs.id;
    delete attrs.generated;
  }
  const written = writeBlockBody(node, config);
  if (
    node.type.name === "heading" &&
    attrs.id &&
    enabled(config, "mmd_header_identifiers") &&
    !enabled(config, "header_attributes")
  )
    return written + " [" + attrs.id + "]";
  if (node.type.name === "equation" && attrs.mathDelimiter === "double")
    return "\\\\[\n" + node.textContent + "\n\\\\]";
  if (node.type.name === "equation" && attrs.mathDelimiter === "single") return "\\[\n" + node.textContent + "\n\\]";
  if (node.type.name === "equation" && attrs.mathDelimiter === "gfm") return "```math\n" + node.textContent + "\n```";
  if (node.type.name === "code_block" && attrs.literate === "bird") return node.textContent.split("\n").map(line => "> " + line).join("\n");
  if (node.type.name === "code_block" && Object.keys(attrs).length) {
    const lines = written.split("\n");
    if (attrs.caption !== undefined) attrs.caption = encodeCodeCaption(String(attrs.caption));
    lines[0] += writeAttributes(attrs);
    return lines.join("\n");
  }
  return ["heading", "paragraph"].includes(node.type.name)
    ? written + writeAttributes(attrs)
    : written;
}
function writeBlockBody(node: PMNode, config: SyntaxConfig): string {
  const object = writeObjectBlock(node, child => writeBlock(child, config));
  if (object !== undefined) return object;
  const kids = children(node),
    blocks = (nodes: PMNode[]) =>
      nodes.map((n) => writeBlock(n, config)).join("\n\n"),
    inline = (n: PMNode) =>
      inlineMarkdown(
        n,
        false,
        enabled(config, "tex_math_dollars"),
        enabled(config, "notion_pages") &&
          !enabled(config, "wikilinks_title_after_pipe"),
        enabled(config, "superscript"),
        markdownFamily(config) && !enabled(config, "all_symbols_escapable"),
        {
          mmdAttributes: enabled(config, "mmd_link_attributes"),
          htmlMarksFirst: config.variant === "notdown",
          literalExtensions:
            enabled(config, "critic_markup") ||
            enabled(config, "highlight") ||
            enabled(config, "comments") ||
            enabled(config, "transclusion"),
        },
      ).replace(
        markdownFamily(config) && !enabled(config, "space_in_atx_header")
          ? /^(\s*)(#{1,6})(?!#)/
          // A disabled rule must not match even empty inline content (unlike /$^/).
          : /(?!)/,
        "$1\\$2",
      );
  switch (node.type.name) {
    case "syntax_block":
      return node.attrs.raw;
    case "table_of_contents":
      if (node.attrs.syntaxForm === "notion") return notionBlockMarkdown(node);
      return node.attrs.syntaxForm === "directive" && (config.variant === "typora" || node.attrs.minLevel === 1 && node.attrs.maxLevel === 6)
        ? "[toc]" : `{{TOC:${node.attrs.minLevel}-${node.attrs.maxLevel}}}`;
    case "callout":
      if (node.attrs.syntaxForm !== "alert") return notionBlockMarkdown(node);
      return (
        "> [!" +
        node.attrs.kind +
        "]" +
        node.attrs.fold +
        (node.attrs.title ? " " + node.attrs.title : "") +
        "\n" +
        blocks(kids)
          .split("\n")
          .map((line) => "> " + line)
          .join("\n")
      );
    case "html_block":
      return node.attrs.raw;
    case "definition_list":
      return kids.map((n, i) => (i ? n.type.name === "definition_term" && kids[i - 1].type.name === "definition_description" ? "\n\n" : "\n" : "") + writeBlock(n, config)).join("");
    case "definition_term":
    case "table_caption":
      return inline(node);
    case "definition_description":
      return blocks(kids)
        .split("\n")
        .map((line, i) => (i ? "    " : ":   ") + line)
        .join("\n");
    case "footnote":
      return blocks(kids)
        .split("\n")
        .map((line, i) => (i ? "    " : "[^" + node.attrs.label + "]: ") + line)
        .join("\n");
    case "line_block":
      return kids
        .map((n) => "| " + inline(n).replace(/  \n/g, "\n| "))
        .join("\n");
    case "fenced_div":
      if (node.attrs.syntaxForm === "html") return "<div " + node.attrs.attributes + ">\n" + blocks(kids) + "\n</div>";
      return "::: " + node.attrs.attributes + "\n" + blocks(kids) + "\n:::";
    case "example_list":
      return kids.map(item => "(@" + item.attrs.label + ") " + children(item).map(n => writeBlock(n, config)).join("\n\n").split("\n").join("\n    ")).join("\n");
    case "paragraph":
      if (!node.content.size) return "";
      return inline(node)
        .replace(
          enabled(config, "mmd_title_block") ? /^([A-Za-z0-9][A-Za-z0-9 _-]*):/ : /(?!)/,
          "$1&#58;",
        )
        .replace(
          enabled(config, "pandoc_title_block") ? /^%(?=\s|$)/ : /(?!)/,
          "&#37;",
        );
    case "heading":
      return "#".repeat(node.attrs.level) + " " + inline(node);
    case "bullet_list":
    case "ordered_list":
      return kids
        .map((item, index) => {
          const marker =
            node.type.name === "ordered_list"
              ? listMarker(Number(node.attrs.order) + index, node.attrs.markerStyle, node.attrs.markerDelimiter) +
                (["Alpha", "Roman"].includes(node.attrs.markerStyle) && node.attrs.markerDelimiter === "." ? "  " : " ")
              : "- ";
          const check =
            item.attrs.checked === null
              ? ""
              : item.attrs.checked
                ? "[x] "
                : "[ ] ";
          const parts = children(item);
          let text =
            parts[0].type.name === "paragraph"
              ? inline(parts[0])
              : writeBlock(parts[0], config);
          for (const child of parts.slice(1))
            text +=
              (["bullet_list", "ordered_list"].includes(child.type.name)
                ? "\n"
                : "\n\n") + writeBlock(child, config);
          return (check + text)
            .split("\n")
            .map((line, i) =>
              i ? " ".repeat(marker.length) + line : marker + line,
            )
            .join("\n");
        })
        .join(config.variant === "gfm" && node.attrs.tight === false ? "\n\n" : "\n");
    case "blockquote":
      return blocks(kids)
        .split("\n")
        .map((line) => (line ? "> " + line : ">"))
        .join("\n");
    case "table": {
      if (node.attrs.syntaxForm === "notion") return notionBlockMarkdown(node);
      if (node.attrs.syntaxForm === "grid") return writeGridTable(node, n => writeBlock(n, config));
      if (["simple", "multiline"].includes(node.attrs.syntaxForm)) return writeSimpleTable(node, n => writeBlock(n, config));
      if (node.attrs.syntaxForm === "mmd") return multiMarkdownTable(node, inline, n => writeBlock(n, config));
      if (!enabled(config, "pipe_tables")) return notionBlockMarkdown(node);
      const tableRows = kids.filter(n => n.type.name === "table_row"), caption = kids.find(n => n.type.name === "table_caption");
      const rows = tableRows.map(
        (row) =>
          "| " +
          children(row)
            .map((cell) =>
              children(cell)
                .map(inline)
                .join(" ")
                .replace(/\|/g, "\\|")
                .replace(config.variant === "gfm" ? / {2}\n/g : /(?!)/g, "<br>")
                .replace(/\n/g, " "),
            )
            .join(" | ") +
          " |",
      );
      rows.splice(
        1,
        0,
        "| " +
          children(tableRows[0])
            .map(
              (cell) =>
                ({ left: ":---", right: "---:", center: ":---:" })[
                  String(cell.attrs.nfmAttrs.align)
                ] ?? "---",
            )
            .join(" | ") +
          " |",
      );
      if (caption) {
        const line = "Table: " + inline(caption) + writeAttributes(node.attrs.markdownAttrs);
        if (node.attrs.captionSide === "top") rows.unshift(line, ""); else rows.push("", line);
      } else if (Object.keys(node.attrs.markdownAttrs || {}).length) rows.push(writeAttributes(node.attrs.markdownAttrs).trim());
      return rows.join("\n");
    }
    case "code_block":
      return dialectCodeBlock(node, config);
    case "horizontal_rule":
    case "opaque_block":
      return blockMarkdown(node);
    case "nested_block":
      return notionBlockMarkdown(node, child => writeBlock(child, config));
    default:
      return notionBlockMarkdown(node);
  }
}
export function serializeNative(doc: PMNode, config: SyntaxConfig): string {
  if (config.variant !== "notdown") doc.descendants(node => {
    if (localObjectPlugins[node.type.name] || hasSupplementalAttributes(node) || config.variant === "notion-markdown" &&
        (needsMarkdownTable(node) || node.type.name === "code_block" && node.attrs.markdownAttrs?.caption !== undefined))
      throw new Error("Supplemental Notion content can only be written in the Notdown variant. Preserve the original source or switch variants.");
  });
  if (config.variant === "notdown") return serializeEditorMarkdown(doc, node => writeNotdownBlock(node, config));
  return usesNotionSyntax(config)
    ? serializeNotionMarkdown(doc)
    : serializeEditorMarkdown(doc, (node) => writeBlock(node, config));
}

/** Notion owns its explicit carriers and tab nesting; registered Markdown
 * readers own additional content forms. The upstream Notion preset is untouched. */
function notdownExtensions(source: string, config: SyntaxConfig, depth: number, context: Record<string, unknown>) {
  const md = parser(config);
  const env = { ...context, nativeDepth: depth };
  // Definitions and metadata must be visible to every inline in this document.
  md.parse(source, env);
  return {
    headingLimit: 6,
    inline(text: string): PMNode[] {
      const tokens = md.parseInline(text, env)[0]?.children ?? [];
      for (const token of tokens) {
        if (token.type === "html_inline" && /^<br\s*\/?\s*>$/i.test(token.content)) token.type = "hardbreak";
      }
      // Match the Markdown engine's source-editable inline HTML adapter. Known
      // HTML can render safely; unknown/disabled Notion tags remain literal.
      if (tokens.some(token => token.type === "html_inline" && /^<\/?(?:b|i|u|s|strong|em|mark|sub|sup|kbd|abbr|a|img)\b/i.test(token.content))) {
        return [schema.nodes.html_inline.create({ raw: text, html: renderRawHtml(md.renderer.renderInline(tokens, md.options, env)) })];
      }
      return parseInline(tokens);
    },
    blocks(source: string, atDocumentStart: boolean): Map<number, { node: PMNode; lines: number }> {
      const result = new Map<number, { node: PMNode; lines: number }>();
      // Parse each sibling sequence once, never the entire remaining suffix
      // again for every block. This also bounds work in nested containers.
      const doc = parseMarkdownNative(source, config, atDocumentStart ? depth : depth + 1, env);
      const lines = source.split("\n"), offsets = new Map<number, number>();
      let offset = 0;
      lines.forEach((line, index) => { offsets.set(offset, index); offset += line.length + 1; });
      const covered = new Set<number>();
      doc.forEach(node => {
        if (node.attrs.sourceStart == null || !node.attrs.source) return;
        const start = offsets.get(node.attrs.sourceStart);
        if (start === undefined) return;
        const raw = String(node.attrs.source), count = raw.split(/\r\n|\n|\r/).length;
        for (let i = start; i < start + count; i++) covered.add(i);
        const first = lines[start];
        if (/^\s*<(?!div\b|iframe\b|section\b|article\b|p\b|h[1-6]\b|!--)/i.test(first)
          || /^:::(?:nest|columns)\s*$/.test(first)) return;
        const fence = /^ {0,3}(`{3,}|~{3,})/.exec(first);
        if (fence && !raw.split("\n").slice(1).some(line => new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}\\s*$`).test(line))) return;
        const basic = ["paragraph", "heading", "blockquote", "bullet_list", "ordered_list", "horizontal_rule", "code_block"];
        if (basic.includes(node.type.name)) {
          const fancy = node.type.name === "ordered_list" && (node.attrs.markerStyle !== "decimal" && node.attrs.markerStyle || /^\d+\) /.test(first) || node.attrs.markerDelimiter === ")");
          const attributedCode = node.type.name === "code_block" && (node.attrs.rChunk || Object.keys(node.attrs.markdownAttrs || {}).length);
          const attributedHeading = node.type.name === "heading" && /\{(?:[#.]|[^{}]*=[^"'])|\[[^\]]+\]/.test(first);
          const spacedList = ["ordered_list", "bullet_list"].includes(node.type.name) && /\n {2,}\S/.test(raw);
          if (!fancy && !attributedCode && !attributedHeading && !spacedList) {
            if (node.type.name === "paragraph" && enabled(config, "escaped_line_breaks")) {
              let cursor = start;
              while (cursor < start + count) {
                let finish = cursor + 1;
                while (finish < start + count && lines[finish]?.trim() && (lines[finish - 1].match(/\\+$/)?.[0].length ?? 0) % 2 === 1) finish++;
                if (finish > cursor + 1) {
                  const joined = parseMarkdownNative(lines.slice(cursor, finish).join("\n"), config, depth + 1, env).firstChild;
                  if (joined?.type.name === "paragraph") result.set(cursor, { node: joined, lines: finish - cursor });
                }
                cursor = finish;
              }
            }
            return;
          }
        }
        if (node.type.name === "opaque_block" && !first.startsWith(":::")) return;
        result.set(start, { node, lines: count });
      });
      // Hidden definitions in gaps remain source objects, never code contents.
      lines.forEach((line, index) => {
        if (!covered.has(index) && /^(?:\*\[[^\]]+\]|\[(?!\^)[^\]]+\]):\s*\S/.test(line))
          result.set(index, { node: schema.nodes.syntax_block.create({ kind: "definition", raw: line, config }), lines: 1 });
      });
      return result;
    },
  };
}

function writeNotdownBlock(node: PMNode, config: SyntaxConfig): string {
  if (needsMarkdownTable(node)) {
    if (!canConvertNotionTable(node)) throw new Error("This table has attributes that a Pandoc grid table cannot preserve. Keep the original source.");
    if (!enabled(config, "grid_tables")) throw new Error("Enable grid_tables to write table spans or captions using Pandoc syntax.");
    return writeBlock(node.type.create({ ...node.attrs, syntaxForm: "grid" }, node.content), config);
  }
  const write = (child: PMNode) => writeNotdownBlock(child, config);
  const inline = (child: PMNode) => inlineMarkdown(child, false, true, true, true, false, { literalExtensions: true, htmlMarksFirst: true, notionBreaks: true });
  const markdown = ["definition_list", "definition_term", "definition_description", "footnote", "line_block", "fenced_div", "example_list", "syntax_block", "html_block"];
  if (markdown.includes(node.type.name)
    || ["heading", "code_block"].includes(node.type.name) && Object.keys(node.attrs.markdownAttrs || {}).length > 0
    || node.type.name === "table" && node.attrs.syntaxForm !== "notion"
    || node.type.name === "callout" && node.attrs.syntaxForm === "alert"
    || node.type.name === "table_of_contents" && node.attrs.syntaxForm !== "notion"
    || node.type.name === "ordered_list" && (node.attrs.markerStyle && node.attrs.markerStyle !== "decimal" || node.attrs.markerDelimiter === ")")) return writeBlock(node, config);
  if (node.type.name === "heading" && node.attrs.level > 4) {
    return notionBlockMarkdown(node, write, inline).replace(/^#{4}/, "#".repeat(node.attrs.level));
  }
  return notionBlockMarkdown(node, write, inline);
}
export function nativeBlockSupported(node: PMNode, config: SyntaxConfig) {
  return !unavailable(node, config);
}
