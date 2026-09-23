import type MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import type { Node as PMNode } from "prosemirror-model";
import { editorSchema as schema } from "../document/editor-schema";
import { parseInline } from "../document/editor-markdown";
import { enabled, type SyntaxConfig } from "./config";
import { readAttributes, slug } from "./attributes";
import { openingTag } from "../document/notion-syntax";

const inline = (md: MarkdownIt, raw: string, env: any) => parseInline(md.parseInline(raw, env)[0]?.children || []);
const source = (s: any, node: PMNode) => { const t = s.push("source_inline", "", 0); t.meta = { node }; };
const alternatives = { alt: ["paragraph", "reference", "blockquote", "list"] };
function texCommandLength(raw: string): number {
  const command = /^\\[A-Za-z]+\*?/.exec(raw); if (!command) return 0;
  let end = command[0].length;
  while (raw[end] === "{" || raw[end] === "[") {
    const open = raw[end], close = open === "{" ? "}" : "]"; let depth = 1, next = end + 1;
    for (; next < raw.length && depth; next++) {
      if (raw[next] === "\\") next++;
      else if (raw[next] === open) depth++;
      else if (raw[next] === close) depth--;
    }
    if (depth) return 0;
    end = next;
  }
  return end;
}
const roman = (value: string) => {
  const digits: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0, last = 0; for (const c of value.toUpperCase().split("").reverse()) { const n = digits[c] || 0; total += n < last ? -n : n; last = n; } return total;
};
export function listMarker(number: number, style = "decimal", delimiter = ".") {
  let label = String(number);
  if (style === "alpha") { label = ""; let n = number; do { n--; label = String.fromCharCode(97 + n % 26) + label; n = Math.floor(n / 26); } while (n > 0); }
  if (style === "roman" || style === "Roman") { let n = number; label = ""; for (const [v, c] of [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]] as const) while(n >= v) { label += c; n -= v; } if(style === "roman") label = label.toLowerCase(); }
  if (style === "Alpha") label = listMarker(number, "alpha", "").toUpperCase();
  return delimiter === "()" ? "(" + label + ")" : label + delimiter;
}
/** Additional Pandoc syntax rules run at parser boundaries, never in code text. */
export function installAdvancedRules(md: MarkdownIt, config: SyntaxConfig, parse: (raw: string, env: any) => PMNode) {
  const on = (name: string) => enabled(config, name);
  md.core.ruler.before("replacements", "legacy_dashes", s => {
    if (!on("smart") || !on("old_dashes")) return;
    for (const t of s.tokens) for (const child of t.children || [])
      if (child.type === "text") child.content = child.content.replace(/--/g, "—").replace(/-(?=\d)/g, "–");
  });
  md.core.ruler.before("native_line_breaks", "east_asian_breaks", s => {
    if (!on("east_asian_line_breaks")) return;
    for (const t of s.tokens) for (let i = 0; i < (t.children?.length || 0); i++) {
      const child = t.children![i];
      if (child.type === "softbreak" && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u.test(t.children![i - 1]?.content || "") && /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(t.children![i + 1]?.content || "")) { child.type = "text"; child.content = ""; }
    }
  });
  md.inline.ruler.before("escape", "advanced_inline", (s, silent) => {
    const rest = s.src.slice(s.pos); let length = 0, nodes: PMNode[] = [];
    if (on("angle_brackets_escapable") && /^\\[<>]/.test(rest)) { length = 2; nodes = [schema.text(rest[1])]; }
    if (!length && on("inline_notes") && rest.startsWith("^[")) {
      const end = md.helpers.parseLinkLabel(s, s.pos + 1, true);
      if (end >= 0) { length = end - s.pos + 1; nodes = [schema.nodes.inline_note.create(null, inline(md, s.src.slice(s.pos + 2, end), s.env))]; }
    }
    if (!length && on("wikilinks_title_before_pipe") && rest.startsWith("[[")) {
      const m = /^\[\[([^\]\n]+)\]\]/.exec(rest);
      if (m) { const [label, target = label] = m[1].split("|"); length = m[0].length; nodes = [schema.nodes.page_link.create({ target: target.trim(), label: label.trim() })]; }
    }
    if (!length && (on("bracketed_spans") || on("attributes")) && rest[0] === "[") {
      const end = md.helpers.parseLinkLabel(s, s.pos, true), attributes = end >= 0 ? /^\{([^{}]+)\}/.exec(s.src.slice(end + 1)) : null;
      if (attributes) {
        const a = readAttributes(attributes[0]), mark = /(?:^|\s)smallcaps(?:\s|$)/.test(a.class || "") ? schema.marks.small_caps.create({ attributes: a }) : schema.marks.native_span.create({ attributes: a });
        length = end + 1 + attributes[0].length - s.pos; nodes = inline(md, s.src.slice(s.pos + 1, end), s.env).map(n => n.mark(mark.addToSet(n.marks)));
      }
    }
    if (!length && on("native_spans") && rest.startsWith("<span")) {
      const tag = openingTag(rest), end = rest.indexOf("</span>");
      if (tag?.tag === "span" && end >= tag.length && !(config.variant === "notdown" && (tag.attrs.color || tag.attrs.underline))) {
        const mark = /(?:^|\s)smallcaps(?:\s|$)/.test(tag.attrs.class || "") ? schema.marks.small_caps.create({ attributes: tag.attrs, syntaxForm: "html" }) : schema.marks.native_span.create({ attributes: tag.attrs, syntaxForm: "html" });
        length = end + 7; nodes = inline(md, rest.slice(tag.length, end), s.env).map(n => n.mark(mark.addToSet(n.marks)));
      }
    }
    if (!length && on("mark") && rest.startsWith("==")) {
      const end = rest.indexOf("==", 2); if (end > 2) { length = end + 2; const mark = schema.marks.highlight.create(); nodes = inline(md, rest.slice(2, end), s.env).map(n => n.mark(mark.addToSet(n.marks))); }
    }
    if (!length && on("tex_math_single_backslash") && rest.startsWith("\\(")) {
      const end = rest.indexOf("\\)", 2); if (end > 2) { length = end + 2; nodes = [schema.nodes.inline_math.create({ value: rest.slice(2, end), delimiter: "single" })]; }
    }
    if (!length && on("tex_math_gfm") && rest.startsWith("$`")) {
      const end = rest.indexOf("`$", 2); if (end > 2) { length = end + 2; nodes = [schema.nodes.inline_math.create({ value: rest.slice(2, end), delimiter: "gfm" })]; }
    }
    if (!length && on("example_lists")) {
      const m = /^@([\w-]+)/.exec(rest), number = m && s.env.exampleLabels?.[m[1]];
      if (m && number !== undefined) { length = m[0].length; nodes = [schema.nodes.syntax_inline.create({ kind: "example-reference", raw: m[0], label: String(number), target: "md-example-" + m[1], config })]; }
    }
    if (!length && on("citations") && !/[\p{L}\p{N}_]/u.test(s.src[s.pos - 1] || "")) {
      const m = /^\[(?:[^\]\n]*?\s)?-?@[A-Za-z0-9_][^\]\n]*\]|^-?@[A-Za-z0-9_][\w:.#$%&+?<>~/-]*/.exec(rest);
      if (m) { const raw = m[0].startsWith("[") ? m[0] : m[0].replace(/[.,;:!?]+$/, ""); length = raw.length; nodes = [schema.nodes.syntax_inline.create({ kind: "citation", raw, label: raw, title: "Pandoc citation", config })]; }
    }
    if (!length && on("raw_tex")) {
      length = texCommandLength(rest);
      if (length) { const raw = rest.slice(0, length); nodes = [schema.nodes.syntax_inline.create({ kind: "raw", raw, label: raw, title: "tex", config })]; }
    }
    if (!length) return false;
    if (!silent) for (const n of nodes) source(s, n);
    s.pos += length; return true;
  });
  md.block.ruler.before("fence", "advanced_blocks", (s, start, end, silent) => {
    if (s.sCount[start] - s.blkIndent >= 4) return false;
    const line = (n: number) => s.src.slice(s.bMarks[n] + s.tShift[n], s.eMarks[n]);
    const first = line(start); let next = start + 1, node: PMNode | undefined;
    const environment = /^\\begin\{([A-Za-z*]+)\}/.exec(first);
    if (on("raw_tex") && environment) {
      const close = "\\end{" + environment[1] + "}";
      if (!first.includes(close)) { while (next < end && !line(next).includes(close)) next++; if (next === end) return false; next++; }
      const raw = s.getLines(start, next, s.blkIndent, false).replace(/\n$/, "");
      node = schema.nodes.syntax_block.create({ kind: "raw", raw, config, data: { format: "tex", code: raw, syntaxForm: "tex" } });
    }
    if (!node && on("tex_math_single_backslash") && first.startsWith("\\[")) {
      let value: string;
      if (first.endsWith("\\]")) value = first.slice(2, -2);
      else { while (next < end && line(next).trim() !== "\\]") next++; if (next === end) return false; value = s.getLines(start + 1, next++, s.blkIndent, false); }
      node = schema.nodes.equation.create({ markdownAttrs: { mathDelimiter: "single" } }, value.trim() ? schema.text(value.trim()) : undefined);
    }
    if (!node && on("literate_haskell") && /^> ?\S/.test(first)) {
      while (next < end && /^>/.test(line(next))) next++;
      const value = Array.from({ length: next - start }, (_, i) => line(start + i).replace(/^> ?/, "")).join("\n");
      node = schema.nodes.code_block.create({ params: "haskell", markdownAttrs: { literate: "bird" } }, schema.text(value));
    }
    if (!node && (on("native_divs") || on("markdown_in_html_blocks")) && /^<div(?:\s|>)/.test(first)) {
      const tag = openingTag(first); if (tag && !first.slice(tag.length).trim()) {
        let depth = 1, fence = ""; while (next < end) {
          const text = line(next), marker = /^\s*(`{3,}|~{3,})/.exec(text)?.[1];
          if (fence) { if (marker?.[0] === fence[0] && marker.length >= fence.length && text.trim() === marker) fence = ""; next++; continue; }
          if (marker) { fence = marker; next++; continue; }
          if (text.trim() === "</div>" && --depth === 0) break;
          if (/^<div(?:\s|>)/.test(text)) depth++;
          next++;
        }
        if (next < end) {
          const body = parse(s.getLines(start + 1, next, s.blkIndent, false), s.env).content;
          node = schema.nodes.fenced_div.create({ attributes: Object.entries(tag.attrs).map(([k,v]) => `${k}="${v}"`).join(" "), syntaxForm: "html" }, body); next++;
        }
      }
    }
    const marker = (text: string) => {
      const match = /^(\(@([\w-]*)\)|\(?([A-Za-z]+|#|\d+)([.)]))[ \t]+(.*)$/.exec(text);
      if (!match || match[2] !== undefined) return match;
      const label = match[3];
      if (text.startsWith("(") && match[4] !== ")") return null;
      // An arbitrary word followed by punctuation is prose, not an alphabetic
      // enumerator. Multi-letter labels must be valid, consistently cased Roman numerals.
      if (/^[A-Za-z]{2,}$/.test(label) &&
          (!/^(?:[ivxlcdm]+|[IVXLCDM]+)$/.test(label) ||
           !/^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/i.test(label))) return null;
      if (/^[A-Z]$/.test(label) && match[4] === "." &&
          !/^[A-Z]\.(?: {2,}|\t)/.test(text)) return null;
      return match;
    };
    const firstMarker = marker(first);
    if (!node && firstMarker && (firstMarker[2] !== undefined ? on("example_lists") : on("fancy_lists") && !/^\d+[.)]/.test(first))) {
      if (silent) return true;
      const example = firstMarker[2] !== undefined;
      const token = firstMarker[3] || "1";
      const style = token === "#" || /^\d+$/.test(token) ? "decimal" : /^[ivxlcdm]+$/i.test(token) ? (token === token.toUpperCase() ? "Roman" : "roman") : token === token.toUpperCase() ? "Alpha" : "alpha";
      const order = style === "decimal" ? Number(token) || 1 : /roman/i.test(style) ? roman(token) : token.toLowerCase().charCodeAt(0) - 96;
      const children: PMNode[] = []; next = start;
      while (next < end) {
        const m = marker(line(next)); if (!m || (m[2] !== undefined) !== example) break;
        const lines = [m[5]]; next++;
        while (next < end && (s.isEmpty(next) || s.sCount[next] > s.blkIndent)) {
          if (s.isEmpty(next) && next + 1 < end && s.sCount[next + 1] <= s.blkIndent && !marker(line(next + 1))) break;
          lines.push(s.isEmpty(next) ? "" : s.src.slice(s.bMarks[next] + Math.min(s.sCount[next], s.blkIndent + 4), s.eMarks[next])); next++;
        }
        let content = parse(lines.join("\n"), s.env).content;
        if (content.firstChild?.type.name !== "paragraph") content = content.addToStart(schema.nodes.paragraph.create());
        const number = example ? (s.env.exampleCounter = (s.env.exampleCounter || 0) + 1) : order + children.length;
        if (example && m[2]) (s.env.exampleLabels ||= {})[m[2]] = number;
        children.push(schema.nodes[example ? "example_list_item" : "numbered_list_item"].create(example ? { label: m[2], number } : null, content));
        while (next < end && s.isEmpty(next) && next + 1 < end && marker(line(next + 1))) next++;
      }
      node = schema.nodes[example ? "example_list" : "ordered_list"].create(example ? { start: children[0].attrs.number } : { order, markerStyle: style, markerDelimiter: first.startsWith("(") ? "()" : firstMarker[4] }, children);
    }
    if (!node) return false;
    if (silent) return true;
    const t = s.push("source_node", "", 0); t.block = true; t.map = [start, next]; t.meta = { node }; s.line = next; return true;
  }, alternatives);
  md.core.ruler.push("advanced_projection", s => {
    const ids = new Set<string>();
    for (let i = 0; i < s.tokens.length; i++) {
      const t = s.tokens[i];
      if (t.type === "heading_open" && (on("ascii_identifiers") || on("gfm_auto_identifiers"))) {
        const raw = s.tokens[i + 1]?.children?.map(c => c.content).join("") || "";
        let id = on("gfm_auto_identifiers") ? raw.toLowerCase().replace(/[^\p{L}\p{N}_\s-]/gu, "").replace(/\s/g, "-") : slug(raw.normalize("NFKD").replace(/[^\x00-\x7f]/g, ""));
        const base = id; let suffix = 1; while (ids.has(id)) id = base + "-" + suffix++; ids.add(id);
        if (!t.meta?.markdownAttrs?.id || t.meta.markdownAttrs.generated) t.meta = { ...t.meta, markdownAttrs: { ...t.meta?.markdownAttrs, id, generated: "true" } };
      }
      if (t.type === "fence" && on("tex_math_gfm") && t.info.trim() === "math") {
        t.type = "source_node"; t.meta = { node: schema.nodes.equation.create({ markdownAttrs: { mathDelimiter: "gfm" } }, t.content.trim() ? schema.text(t.content.trim()) : undefined) };
      }
      const children = t.children || [];
      for (let j = 0; j < children.length; j++) {
        const child = children[j], after = children[j + 1];
        if (child.type === "softbreak" && on("east_asian_line_breaks") && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u.test(children[j - 1]?.content || "") && /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(after?.content || "")) { child.type = "text"; child.content = ""; }
        if (child.type === "code_inline" && (on("inline_code_attributes") || on("attributes")) && after?.type === "text") {
          const m = /^\{([^{}]+)\}/.exec(after.content); if(m) { child.meta = { ...child.meta, markdownAttrs: readAttributes(m[0]) }; after.content = after.content.slice(m[0].length); }
        }
      }
    }
  });
}
