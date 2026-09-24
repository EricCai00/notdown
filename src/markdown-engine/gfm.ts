import type MarkdownIt from "markdown-it";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
import textRule from "markdown-it/lib/rules_inline/text.mjs";
import htmlInline from "markdown-it/lib/rules_inline/html_inline.mjs";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import { enabled, type SyntaxConfig } from "./config";
import type { Root, RootContent } from "mdast";
import type Token from "markdown-it/lib/token.mjs";
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { dialectDefaults } from "./presets";

export function coreGfm(config: SyntaxConfig): boolean {
  return config.variant === "gfm" && Object.keys(config.extensions).every(key => !enabled(config, key) || dialectDefaults.gfm[key]);
}

/** HTML containers can span Markdown blocks. Use HTML parser locations in the
 * rendered token stream so tag-shaped text in code/comments cannot close them. */
export function gfmHtmlRanges(tokens: Token[], md: MarkdownIt, env: object): Map<number, number> {
  const ranges = new Map<number, number>();
  if (!tokens.some(token => token.type === "html_block")) return ranges;
  let html = "";
  const offsets = tokens.map(token => {
    const start = html.length;
    html += md.renderer.render([token], md.options, env);
    return [start, html.length];
  });
  const visit = (node: DefaultTreeAdapterMap["childNode"]): void => {
    if (!("tagName" in node)) return;
    const location = node.sourceCodeLocation;
    if (location?.startTag && location.endTag) {
      const first = offsets.findIndex(([start, end]) => start <= location.startTag!.startOffset && end > location.startTag!.startOffset);
      const last = offsets.findIndex(([start, end]) => start < location.endTag!.endOffset && end >= location.endTag!.endOffset);
      if (first >= 0 && last > first && tokens[first].type === "html_block" && tokens[last].type === "html_block" &&
          tokens[first].level === 0 && tokens[last].level === 0 && tokens[first].map && tokens[last].map) {
        ranges.set(first, Math.max(last, ranges.get(first) ?? last));
        return;
      }
    }
    node.childNodes.forEach(visit);
  };
  parseFragment(html, { sourceCodeLocationInfo: true }).childNodes.forEach(visit);
  return ranges;
}

/** GFM §6.11: filter parsed HTML only, never Markdown/code source. */
export function gfmTagfilter(html: string): string {
  return html.replace(/<(\/?)(title|textarea|style|xmp|iframe|noembed|noframes|script|plaintext)(?=[\t\n\f\r />])/gi, "&lt;$1$2");
}

interface LiteralLink { start: number; end: number; url: string; text: string }
const literalCache = new Map<string, LiteralLink[]>();
function literalLinks(source: string): LiteralLink[] {
  const cached = literalCache.get(source);
  if (cached) return cached;
  const links: LiteralLink[] = [];
  if (/(?:https?:\/\/|www\.|@)/i.test(source)) {
    // The prefix keeps an inline fragment from becoming a heading/list. Use
    // tokenizer positions, not the optional fuzzy link post-transform, so
    // entities, escaped punctuation and code retain their lexical boundaries.
    const input = "x " + source;
    const tree = fromMarkdown(input, {
      extensions: [gfm()],
      mdastExtensions: gfmFromMarkdown().map(extension => ({ ...extension, transforms: [] })),
    });
    const visit = (node: Root | RootContent) => {
      if (node.type === "link") {
        const start = node.position?.start.offset, end = node.position?.end.offset;
        if (start !== undefined && end !== undefined && !/[<[]/.test(input[start])) {
          const prefix = node.url.startsWith("mailto:") && /(?:mailto:|xmpp:)$/.exec(input.slice(0, start));
          let first = start, last = end, url = node.url;
          if (prefix) {
            first -= prefix[0].length;
            if (prefix[0] === "xmpp:") {
              const resource = /^\/[a-zA-Z0-9@._-]+/.exec(input.slice(last));
              if (resource) last += resource[0].replace(/[._-]+$/, "").length;
            }
            url = input.slice(first, last);
          }
          links.push({ start: first - 2, end: last - 2, url, text: input.slice(first, last) });
        }
        return;
      }
      if ("children" in node) for (const child of node.children) visit(child);
    };
    visit(tree);
  }
  if (literalCache.size >= 128) literalCache.delete(literalCache.keys().next().value!);
  literalCache.set(source, links);
  return links;
}

/** Keep GFM's lexical rules separate from linkify-it/Pandoc conventions. */
export function installGfm(md: MarkdownIt, config: SyntaxConfig): void {
  if (config.variant !== "gfm") return;
  if (enabled(config, "strikeout")) {
    md.inline.ruler.at("strikethrough", (state, silent) => {
      if (silent || state.src[state.pos] !== "~") return false;
      const scanned = state.scanDelims(state.pos, true);
      const length = scanned.length;
      const token = state.push("text", "", 0);
      token.content = "~".repeat(length);
      if (length <= 2) state.delimiters.push({
        // Different marker ids prevent mismatched single/double pairs.
        marker: length === 1 ? 0x7e : 0x1007e,
        length: 0, token: state.tokens.length - 1, end: -1,
        open: scanned.can_open, close: scanned.can_close,
      });
      state.pos += length;
      return true;
    });
    md.inline.ruler2.at("strikethrough", state => {
      const process = (delimiters: StateInline["delimiters"]) => {
        for (const delimiter of delimiters) {
          if (![0x7e, 0x1007e].includes(delimiter.marker) || delimiter.end < 0) continue;
          const close = delimiters[delimiter.end];
          for (const [index, opening] of [[delimiter.token, true], [close.token, false]] as const) {
            const token = state.tokens[index];
            token.type = opening ? "s_open" : "s_close";
            token.tag = "del";
            token.nesting = opening ? 1 : -1;
            token.markup = delimiter.marker === 0x7e ? "~" : "~~";
            token.content = "";
          }
        }
      };
      process(state.delimiters);
      for (const meta of state.tokens_meta) if (meta?.delimiters) process(meta.delimiters);
      return true;
    });
  }
  if (enabled(config, "autolink_bare_uris")) {
    md.disable("linkify");
    md.inline.ruler.before("text", "gfm_literal_link", (state, silent) => {
      if ("linkLevel" in state && Number(state.linkLevel) > 0) return false;
      const link = literalLinks(state.src).find(item => item.start === state.pos && item.end <= state.posMax);
      if (!link) return false;
      if (!silent) {
        const open = state.push("link_open", "a", 1);
        open.attrSet("href", md.normalizeLink(link.url));
        open.markup = "autolink";
        state.push("text", "", 0).content = link.text;
        state.push("link_close", "a", -1).markup = "autolink";
      }
      state.pos = link.end;
      return true;
    });
    md.inline.ruler.at("text", (state, silent) => {
      const end = state.posMax;
      const next = !("linkLevel" in state && Number(state.linkLevel) > 0) && literalLinks(state.src).find(item => item.start > state.pos && item.start < end);
      if (next) state.posMax = next.start;
      try { return textRule(state, silent); }
      finally { state.posMax = end; }
    });
  }
  // GFM 0.29 predates CommonMark's relaxed inline HTML comment grammar.
  md.inline.ruler.at("html_inline", (state, silent) => {
    if (state.src.startsWith("<!--", state.pos) &&
        !/^<!--(?!>|->)(?:(?!--)[\s\S])*?(?<!-)-->/.test(state.src.slice(state.pos))) return false;
    return htmlInline(state, silent);
  });
  md.renderer.rules.html_inline = (tokens, index) => gfmTagfilter(tokens[index].content);
  md.renderer.rules.html_block = (tokens, index) => gfmTagfilter(tokens[index].content);
  md.renderer.rules.task_checkbox = (tokens, index) =>
    `<input${tokens[index].meta.checked ? ' checked=""' : ""} disabled="" type="checkbox"> `;
  for (const type of ["th_open", "td_open"]) md.renderer.rules[type] = (tokens, index, options, _env, renderer) =>
    renderer.renderToken(tokens, index, options).replace(/style="text-align:(left|right|center)"/, 'align="$1"');
}
