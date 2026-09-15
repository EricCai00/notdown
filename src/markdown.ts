import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";

export interface PageReference {
  id: string;
  title: string;
}
export interface BlockRecord {
  id: number;
  type: string;
  source: string;
  start: number;
  end: number;
}
export interface OutlineNode {
  id: string;
  text: string;
  level: number;
  line: number;
  kind: "heading" | "list";
  children: OutlineNode[];
}

interface ColumnsMeta {
  left: Token[];
  right: Token[];
}
interface ParseEnvironment {
  lineOffset?: number;
}

function lineOffsets(source: string): number[] {
  const result = [0];
  for (let index = 0; index < source.length; index++)
    if (source[index] === "\n") result.push(index + 1);
  return result;
}

function plainText(tokens: Token[] = []): string {
  return tokens
    .map((token) => {
      if (token.type === "wiki_link") return token.content;
      if (token.type === "image") return token.content;
      if (token.type === "softbreak" || token.type === "hardbreak") return " ";
      if (token.children) return plainText(token.children);
      return token.nesting === 0 ? token.content : "";
    })
    .join("");
}

/** Extensions are parser rules, so fenced and inline code keep their literal meaning. */
function markdown(pages: PageReference[] = []): MarkdownIt {
  const md = new MarkdownIt({ html: false, linkify: false, breaks: false });
  const escape = md.utils.escapeHtml;
  const resolve = (target: string) =>
    pages.find((page) => page.id === target || page.title === target)?.id ??
    target;

  md.inline.ruler.before("link", "wiki_link", (state, silent) => {
    const start = state.pos;
    // Link-label lookahead must see balanced literal brackets; otherwise this rule
    // would invalidate an enclosing ordinary Markdown link before it is parsed.
    if (silent || ("linkLevel" in state && Number(state.linkLevel) > 0))
      return false;
    if (state.src.slice(start, start + 2) !== "[[") return false;
    const end = state.src.indexOf("]]", start + 2);
    if (end < 0) return false;
    const inside = state.src.slice(start + 2, end);
    if (/[\r\n\[\]]/.test(inside)) return false;
    const separator = inside.indexOf("|");
    const target = (separator < 0 ? inside : inside.slice(0, separator)).trim();
    if (!target || /[\u0000-\u001f\u007f]/.test(target)) return false;
    if (!silent) {
      const token = state.push("wiki_link", "", 0);
      token.content =
        separator < 0 ? target : inside.slice(separator + 1).trim();
      token.meta = { target };
      token.attrSet("href", `#page/${encodeURIComponent(resolve(target))}`);
    }
    state.pos = end + 2;
    return true;
  });
  md.renderer.rules.wiki_link = (tokens, index) => {
    const token = tokens[index];
    return `<a class="wiki-link" href="${escape(token.attrGet("href") ?? "")}">${escape(token.content)}</a>`;
  };

  md.block.ruler.before(
    "fence",
    "page_directive",
    (state, start, _end, silent) => {
      if (state.sCount[start] - state.blkIndent >= 4) return false;
      const line = state.src.slice(
        state.bMarks[start] + state.tShift[start],
        state.eMarks[start],
      );
      const match = /^::page\{id="([^"\s<>]+)"\}[ \t]*$/.exec(line);
      if (!match) return false;
      if (silent) return true;
      const token = state.push("child_page", "", 0);
      token.block = true;
      token.map = [start, start + 1];
      token.meta = { target: match[1] };
      token.content =
        pages.find((page) => page.id === match[1])?.title ?? match[1];
      state.line = start + 1;
      return true;
    },
    { alt: ["paragraph", "reference", "blockquote", "list"] },
  );
  md.renderer.rules.child_page = (tokens, index) => {
    const token = tokens[index];
    return `<a class="child-page" href="#page/${escape(encodeURIComponent(token.meta.target))}"><span aria-hidden="true">↳</span> ${escape(token.content)}</a>\n`;
  };

  md.block.ruler.before(
    "fence",
    "nested_block",
    (state, start, end, silent) => {
      if (state.sCount[start] - state.blkIndent >= 4) return false;
      const lineAt = (line: number) =>
        state.src.slice(
          state.bMarks[line] + state.tShift[line],
          state.eMarks[line],
        );
      if (!/^:::nest[ \t]*$/.test(lineAt(start))) return false;
      if (silent) return true;
      let depth = 1,
        close = -1,
        separator = -1,
        fence = "",
        fenceLength = 0;
      for (let line = start + 1; line < end; line++) {
        if (state.sCount[line] - state.blkIndent >= 4) continue;
        const text = lineAt(line);
        const marker = /^(`{3,}|~{3,})(.*)$/.exec(text);
        if (fence) {
          if (
            marker &&
            marker[1][0] === fence &&
            marker[1].length >= fenceLength &&
            !marker[2].trim()
          )
            fence = "";
          continue;
        }
        if (marker && (marker[1][0] !== "`" || !marker[2].includes("`"))) {
          fence = marker[1][0];
          fenceLength = marker[1].length;
          continue;
        }
        if (/^:::nest[ \t]*$/.test(text)) depth++;
        if (depth === 1 && /^:::children[ \t]*$/.test(text)) {
          if (separator >= 0) return false;
          separator = line;
        }
        if (/^:::endnest[ \t]*$/.test(text) && --depth === 0) {
          close = line;
          break;
        }
      }
      const finish = close < 0 ? end : close + 1;
      const token = state.push(
        close < 0 ? "extension_literal" : "nested_block",
        "",
        0,
      );
      token.block = true;
      token.map = [start, finish];
      token.content = state.getLines(start, finish, state.blkIndent, false);
      if (close >= 0) {
        const parsePart = (from: number, to: number) =>
          md.parse(state.getLines(from, to, state.blkIndent, false), {
            ...state.env,
            lineOffset:
              ((state.env as ParseEnvironment).lineOffset ?? 0) + from,
          });
        token.meta =
          separator < 0
            ? { blocks: parsePart(start + 1, close) }
            : {
                head: parsePart(start + 1, separator),
                blocks: parsePart(separator + 1, close),
                separatorLine:
                  ((state.env as ParseEnvironment).lineOffset ?? 0) + separator,
              };
      }
      state.line = finish;
      return true;
    },
    { alt: ["paragraph", "reference", "blockquote", "list"] },
  );
  md.renderer.rules.nested_block = (tokens, index, options, env, renderer) =>
    `<div class="pm-nested-block">${tokens[index].meta.head ? renderer.render(tokens[index].meta.head, options, env) || "<p></p>" : ""}${renderer.render(tokens[index].meta.blocks, options, env)}</div>\n`;

  md.block.ruler.before(
    "fence",
    "columns",
    (state, start, end, silent) => {
      if (state.sCount[start] - state.blkIndent >= 4) return false;
      const lineAt = (line: number) =>
        state.src.slice(state.bMarks[line], state.eMarks[line]);
      if (!/^ {0,3}:::columns[ \t]*$/.test(lineAt(start))) return false;
      if (silent) return true;
      let depth = 1;
      let close = -1;
      let separator = -1;
      let malformed = false;
      let fenceCharacter = "";
      let fenceLength = 0;
      for (let line = start + 1; line < end; line++) {
        const text = lineAt(line);
        if (fenceCharacter) {
          const fence = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(text);
          if (
            fence &&
            fence[1][0] === fenceCharacter &&
            fence[1].length >= fenceLength
          )
            fenceCharacter = "";
          continue;
        }
        const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
        if (fence && (fence[1][0] !== "`" || !fence[2].includes("`"))) {
          fenceCharacter = fence[1][0];
          fenceLength = fence[1].length;
          continue;
        }
        if (/^ {0,3}:::columns[ \t]*$/.test(text)) {
          depth++;
          malformed = true;
        }
        if (/^ {0,3}:::column[ \t]*$/.test(text) && depth === 1) {
          if (separator >= 0) malformed = true;
          separator = line;
        }
        if (/^ {0,3}:::[ \t]*$/.test(text)) {
          depth--;
          if (depth === 0) {
            close = line;
            break;
          }
        }
      }
      const finish = close < 0 ? end : close + 1;
      const token = state.push(
        malformed || separator < 0 || close < 0
          ? "extension_literal"
          : "columns",
        "",
        0,
      );
      token.block = true;
      token.map = [start, finish];
      token.content = state.src.slice(
        state.bMarks[start],
        finish < state.bMarks.length ? state.bMarks[finish] : state.src.length,
      );
      if (token.type === "columns") {
        const offset = (state.env as ParseEnvironment).lineOffset ?? 0;
        token.meta = {
          left: md.parse(
            state.src.slice(state.bMarks[start + 1], state.bMarks[separator]),
            { ...state.env, lineOffset: offset + start + 1 },
          ),
          right: md.parse(
            state.src.slice(state.bMarks[separator + 1], state.bMarks[close]),
            { ...state.env, lineOffset: offset + separator + 1 },
          ),
        } satisfies ColumnsMeta;
      }
      state.line = finish;
      return true;
    },
    { alt: ["paragraph", "reference", "blockquote", "list"] },
  );
  md.renderer.rules.extension_literal = (tokens, index) =>
    `<pre class="unknown-extension">${escape(tokens[index].content)}</pre>\n`;
  md.renderer.rules.columns = (tokens, index, options, env, renderer) => {
    const { left, right } = tokens[index].meta as ColumnsMeta;
    return `<div class="note-columns"><section>${renderer.render(left, options, env)}</section><section>${renderer.render(right, options, env)}</section></div>\n`;
  };

  md.core.ruler.after("inline", "document_metadata", (state) => {
    const offset = (state.env as ParseEnvironment).lineOffset ?? 0;
    for (const token of state.tokens) {
      if (token.map)
        token.meta = { ...token.meta, sourceLine: token.map[0] + offset + 1 };
      if (token.type === "heading_open")
        token.attrSet("id", `heading-${token.map![0] + offset + 1}`);
      if (
        token.type !== "inline" ||
        !token.children ||
        token.children.length !== 3
      )
        continue;
      const [open, label, close] = token.children;
      const href = open.attrGet("href") ?? "";
      if (
        open.type !== "link_open" ||
        close.type !== "link_close" ||
        label.type !== "text"
      )
        continue;
      if (
        !href ||
        /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href) ||
        !md.validateLink(href)
      )
        continue;
      const extension = /\.(mp3|m4a|ogg|wav|mp4|webm|mov)(?:[?#].*)?$/i
        .exec(href)?.[1]
        .toLowerCase();
      if (!extension) continue;
      const media = new state.Token("local_media", "", 0);
      media.content = label.content;
      media.meta = {
        href,
        type: ["mp4", "webm", "mov"].includes(extension) ? "video" : "audio",
      };
      token.children = [media];
    }
  });
  md.renderer.rules.local_media = (tokens, index) => {
    const token = tokens[index];
    const { href, type } = token.meta;
    return `<${type} controls preload="metadata" src="${escape(href)}" aria-label="${escape(token.content)}"></${type}><a class="media-download" href="${escape(href)}">${escape(token.content)}</a>`;
  };
  md.core.ruler.after("document_metadata", "task_lists", (state) => {
    for (let index = 0; index < state.tokens.length; index++) {
      const item = state.tokens[index];
      const paragraph = state.tokens[index + 1];
      const inline = state.tokens[index + 2];
      // Only a real list item's first paragraph can be a task. Inspect raw
      // source too so an escaped marker remains literal text.
      if (
        item.type !== "list_item_open" ||
        paragraph?.type !== "paragraph_open" ||
        inline?.type !== "inline"
      )
        continue;
      const marker = /^\[([ xX])\](?:[ \t\r\n]|$)/.exec(inline.content);
      const first = inline.children?.[0];
      if (
        !marker ||
        first?.type !== "text" ||
        !/^\[([ xX])\]/.test(first.content)
      )
        continue;
      first.content = first.content.replace(/^\[([ xX])\][ \t]*/, "");
      const checkbox = new state.Token("task_checkbox", "input", 0);
      checkbox.meta = { checked: marker[1].toLowerCase() === "x" };
      inline.children!.unshift(checkbox);
      item.attrJoin("class", "task-list-item");
    }
  });
  md.renderer.rules.task_checkbox = (tokens, index) => {
    const checked = tokens[index].meta.checked;
    return `<input class="task-checkbox" type="checkbox" disabled${checked ? " checked" : ""} aria-label="${checked ? "已完成" : "未完成"}"> `;
  };
  return md;
}

export function parseBlocks(source: string): BlockRecord[] {
  if (source.length === 0) return [];
  const offsets = lineOffsets(source);
  const tokens = markdown().parse(source, {});
  const roots = tokens.filter(
    (token) => token.level === 0 && token.map && token.nesting !== -1,
  );
  if (roots.length === 0)
    return [{ id: 0, type: "blank", source, start: 0, end: source.length }];
  return roots.map((token, index) => {
    const start = index === 0 ? 0 : offsets[token.map![0]];
    const end =
      index + 1 < roots.length
        ? offsets[roots[index + 1].map![0]]
        : source.length;
    return {
      id: index,
      type: token.type.replace(/_open$/, ""),
      source: source.slice(start, end),
      start,
      end,
    };
  });
}

/** toIndex is the desired index after moving. Blocks retain their contents; joins
 * gain only missing line breaks so an unterminated moved block cannot consume
 * the following block's Markdown syntax. */
export function moveBlock(
  source: string,
  fromIndex: number,
  toIndex: number,
): string {
  const blocks = parseBlocks(source);
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= blocks.length ||
    toIndex >= blocks.length
  )
    return source;
  if (fromIndex === toIndex) return source;
  const [moved] = blocks.splice(fromIndex, 1);
  blocks.splice(toIndex, 0, moved);
  const newline = source.match(/\r\n|\n|\r/)?.[0] ?? "\n";
  const countNewlines = (whitespace: string) =>
    (whitespace.match(/\r\n|\n|\r/g) ?? []).length;
  return blocks.reduce((result, block, index) => {
    if (index === 0) return block.source;
    // Original neighbours already had a valid parser boundary. Preserve it,
    // including intentional single-newline heading/paragraph transitions.
    if (blocks[index - 1].id + 1 === block.id) return result + block.source;
    const trailing = result.match(/[ \t\r\n]*$/)![0];
    const leading = block.source.match(/^[ \t\r\n]*/)![0];
    const missing = Math.max(
      0,
      2 - countNewlines(trailing) - countNewlines(leading),
    );
    return result + newline.repeat(missing) + block.source;
  }, "");
}

function walkTokens(tokens: Token[], visit: (token: Token) => void): void {
  for (const token of tokens) {
    visit(token);
    if (token.type === "nested_block") {
      walkTokens(token.meta.head ?? [], visit);
      walkTokens(token.meta.blocks, visit);
    }
    if (token.children && token.type !== "image")
      walkTokens(token.children, visit);
    if (token.type === "columns") {
      walkTokens(token.meta.left, visit);
      walkTokens(token.meta.right, visit);
    }
  }
}

export function extractLinks(source: string): string[] {
  const targets = new Set<string>();
  walkTokens(markdown().parse(source, {}), (token) => {
    if (token.type === "wiki_link") targets.add(token.meta.target);
  });
  return [...targets];
}

export function getOutline(source: string): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const headings: OutlineNode[] = [];
  const items: OutlineNode[] = [];
  let listDepth = 0;
  const collect = (tokens: Token[]) => {
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      if (token.type === "nested_block") {
        collect(token.meta.head ?? []);
        collect(token.meta.blocks);
        continue;
      }
      if (token.type === "columns") {
        collect(token.meta.left);
        collect(token.meta.right);
        continue;
      }
      if (
        token.type === "bullet_list_open" ||
        token.type === "ordered_list_open"
      ) {
        listDepth++;
        continue;
      }
      if (
        token.type === "bullet_list_close" ||
        token.type === "ordered_list_close"
      ) {
        listDepth--;
        continue;
      }
      if (token.type === "list_item_close") {
        items.pop();
        continue;
      }
      if (token.type !== "heading_open" && token.type !== "list_item_open")
        continue;
      const heading = token.type === "heading_open";
      const line = token.meta?.sourceLine ?? (token.map?.[0] ?? 0) + 1;
      let inline = tokens[index + 1];
      if (!heading) {
        inline = tokens[index + 2];
        if (inline?.type !== "inline") inline = tokens[index + 1];
      }
      const text =
        inline?.type === "inline" ? plainText(inline.children ?? []) : "";
      const level = heading
        ? Number(token.tag.slice(1))
        : (headings.at(-1)?.level ?? 0) + listDepth;
      const node: OutlineNode = {
        id: `${heading ? "heading" : "list"}-${line}`,
        text,
        level,
        line,
        kind: heading ? "heading" : "list",
        children: [],
      };
      if (heading) {
        while (headings.length && headings.at(-1)!.level >= level)
          headings.pop();
        (headings.at(-1)?.children ?? roots).push(node);
        headings.push(node);
      } else {
        (items.at(-1)?.children ?? headings.at(-1)?.children ?? roots).push(
          node,
        );
        items.push(node);
      }
    }
  };
  collect(markdown().parse(source, {}));
  return roots;
}

export function renderMarkdown(
  source: string,
  pages: PageReference[] = [],
): string {
  return markdown(pages).render(source, {});
}

export function parseMarkdownTokens(source: string): Token[] {
  return markdown().parse(source, {});
}

/** body is Markdown. Raw HTML is disabled, and custom renderers escape text and attributes. */
export function htmlDocument(
  title: string,
  body: string,
  pages: PageReference[] = [],
): string {
  const escape = MarkdownIt().utils.escapeHtml;
  return `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>.pm-nested-block>:not(:first-child){margin-left:26px}body{max-width:880px;margin:64px auto;padding:0 24px;color:#2d3432;font:17px/1.8 system-ui,sans-serif}h1,h2,h3{line-height:1.35}h1{font-size:2.2rem}h2{margin-top:2rem;color:#346258}h3{color:#56736a}a{color:#347b68}img,video{max-width:100%;border-radius:10px}audio{max-width:100%}pre{padding:20px;overflow:auto;background:#f3f5f3;border-radius:10px}code{font-family:monospace}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px 14px}blockquote{border-left:3px solid #7c9f8e;margin-left:0;padding-left:18px;color:#63746b}.task-list-item{list-style:none}.task-checkbox{margin-right:.4em;accent-color:#347b68}.note-columns{display:grid;grid-template-columns:1fr 1fr;gap:28px}.note-columns section{min-width:0}.child-page{display:block;padding:14px;border:1px solid #ddd;border-radius:8px;text-decoration:none}.media-download{display:block;font-size:.85em}@media(max-width:620px){.note-columns{grid-template-columns:1fr}body{margin:24px auto}}@media print{body{max-width:none;margin:0}}</style></head><body><article>${renderMarkdown(body, pages)}</article></body></html>`;
}
