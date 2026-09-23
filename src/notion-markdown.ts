import MarkdownIt from "markdown-it";
import { readObjectBlock, writeObjectBlock } from "./object-codec";
import { multiMarkdownTable } from "./table-markdown";
import type Token from "markdown-it/lib/token.mjs";
import type { Node as PMNode } from "prosemirror-model";
import { editorSchema as schema } from "./editor-schema.js";
import {
  editorFingerprint,
  blockMarkdown,
  inlineMarkdown,
  parseEditorMarkdown,
  parseInline,
  serializeEditorMarkdown,
} from "./editor-markdown.js";
import {
  attributesXml,
  decodeXml,
  escapeXml,
  localPageTarget,
  openingTag,
  pageUrl,
  readAttributes,
  type TagAttributes,
} from "./notion-syntax.js";

const md = new MarkdownIt({ html: false, linkify: false });
md.inline.ruler.before("html_inline", "notion_inline", (state, silent) => {
  const rest = state.src.slice(state.pos);
  const br = /^<br\s*\/?\s*>/i.exec(rest);
  if (br) {
    if (!silent) state.push("hardbreak", "br", 0);
    state.pos += br[0].length;
    return true;
  }
  const tag = openingTag(rest);
  if (
    !tag ||
    (tag.tag !== "span" &&
      !/^mention-(?:page|user|database|data-source|date|link)$/.test(tag.tag))
  )
    return false;
  let finish = tag.length,
    content = "";
  if (!tag.selfClosing) {
    // Match nested spans, including differently styled inner spans.
    const names = /<\/?(?:span|mention-[\w-]+)\b(?:[^>"']|"[^"]*"|'[^']*')*>/g;
    names.lastIndex = tag.length;
    let depth = 1,
      match: RegExpExecArray | null;
    while ((match = names.exec(rest))) {
      if (match[0].startsWith(`</${tag.tag}>`)) depth--;
      else if (
        openingTag(match[0])?.tag === tag.tag &&
        !match[0].endsWith("/>")
      )
        depth++;
      if (depth === 0) {
        content = rest.slice(tag.length, match.index);
        finish = names.lastIndex;
        break;
      }
    }
    if (depth) return false;
  }
  if (!silent) {
    const token = state.push(
      tag.tag === "span" ? "nfm_span" : "nfm_mention",
      "",
      0,
    );
    token.content = decodeXml(content);
    if (tag.tag === "span") {
      token.meta = tag.attrs;
      token.children = md.parseInline(content, state.env)[0]?.children ?? [];
    } else token.meta = { kind: tag.tag.slice(8), attrs: tag.attrs };
  }
  state.pos += finish;
  return true;
});
md.inline.ruler.before("escape", "notion_math_citation", (state, silent) => {
  const rest = state.src.slice(state.pos);
  const citation = /^\[\^([^\]\r\n]+)\]/.exec(rest);
  const equation = /^\$([^$\r\n]+)\$/.exec(rest);
  const match = citation || equation;
  if (!match) return false;
  if (!silent) {
    const token = state.push(citation ? "nfm_citation" : "nfm_math", "", 0);
    token.content = match[1];
  }
  state.pos += match[0].length;
  return true;
});
// [[...]] remains an input convenience and a legacy reader, never new output.
md.inline.ruler.before("link", "legacy_page_mention", (state, silent) => {
  if (!state.env.legacyWiki) return false;
  const match = /^\[\[([^\]\r\n]+)\]\]/.exec(state.src.slice(state.pos));
  if (!match || silent) return false;
  const [target, ...label] = match[1].split("|");
  const token = state.push("wiki_link", "", 0);
  token.meta = { target: target.trim() };
  token.content = label.join("|") || target.trim();
  state.pos += match[0].length;
  return true;
});

export const notionInline = (source: string): PMNode[] =>
  parseInline(md.parseInline(source, {})[0]?.children ?? []);
const kids = (node: PMNode): PMNode[] => {
  const result: PMNode[] = [];
  node.forEach((child) => result.push(child));
  return result;
};
const paragraph = (text = "", attrs: Record<string, unknown> = {}) =>
  schema.nodes.paragraph.create(attrs, notionInline(text));
const nonempty = (nodes: PMNode[]) => (nodes.length ? nodes : [paragraph()]);
const indent = (source: string) =>
  source
    .split("\n")
    .map((line) => `\t${line}`)
    .join("\n");

function lineAttributes(source: string): {
  text: string;
  attrs: Record<string, unknown>;
} {
  const match = /(?<!\\)\s+\{([^{}]*)\}\s*$/.exec(source);
  const attrs = match ? readAttributes(match[1]) : null;
  if (!attrs) return { text: source, attrs: {} };
  return {
    text: source.slice(0, match!.index),
    attrs: {
      nfmAttrs: attrs,
      color: attrs.color || "",
      toggle: attrs.toggle === "true",
    },
  };
}

/** Parse structure before rich text. A tab belongs to the block tree; tabs and
 * tag-looking lines inside code fences are always literal code. */
export interface NotionExtensions {
  headingLimit?: number;
  inline: (source: string) => PMNode[];
  blocks: (source: string, atDocumentStart: boolean) => Map<number, { node: PMNode; lines: number }>;
}
export function parseNotionMarkdown(source: string, allowObject: (name: string) => boolean = () => false, extensions?: NotionExtensions): PMNode {
  const notionInline = extensions?.inline ?? ((text: string) => parseInline(md.parseInline(text, {})[0]?.children ?? []));
  const paragraph = (text = "", attrs: Record<string, unknown> = {}) => schema.nodes.paragraph.create(attrs, notionInline(text));
  const lines = source.split(/\r\n|\n|\r/);
  const offsets = [0];
  for (const match of source.matchAll(/\r\n|\n|\r/g))
    offsets.push(match.index! + match[0].length);
  const depthAt = (line: number) => lines[line]?.match(/^\t*/)?.[0].length ?? 0;
  const textAt = (line: number) => (lines[line] ?? "").slice(depthAt(line));
  const raw = (from: number, to: number) =>
    source
      .slice(offsets[from] ?? source.length, offsets[to] ?? source.length)
      .replace(/[\r\n]+$/, "");
  const withSource = (node: PMNode, from: number, to: number): PMNode =>
    node.type.create(
      {
        ...node.attrs,
        source: raw(from, to),
        sourceStart: offsets[from],
        sourceEnd: (offsets[from] ?? 0) + raw(from, to).length,
        sourceFingerprint: editorFingerprint(node),
      },
      node.content,
      node.marks,
    );
  const opaque = (from: number, to: number) =>
    schema.nodes.opaque_block.create({
      raw: raw(from, to)
        .split(/\r\n|\n|\r/)
        .map((line) =>
          line.slice(
            Math.min(depthAt(from), line.match(/^\t*/)?.[0].length ?? 0),
          ),
        )
        .join("\n"),
    });
  function closeTag(from: number, end: number, name: string): number {
    let depth = 1,
      fence = "",
      length = 0;
    for (let line = from + 1; line < end; line++) {
      const text = textAt(line).trim();
      const code = /^(`{3,}|~{3,})(.*)$/.exec(text);
      if (fence) {
        if (
          code &&
          code[1][0] === fence &&
          code[1].length >= length &&
          !code[2].trim()
        )
          fence = "";
        continue;
      }
      if (code) {
        fence = code[1][0];
        length = code[1].length;
        continue;
      }
      if (text === `</${name}>` && --depth === 0) return line;
      const open = openingTag(text);
      if (
        open?.tag === name &&
        !open.selfClosing &&
        !text.slice(open.length).includes(`</${name}>`)
      )
        depth++;
    }
    return -1;
  }
  function inside(from: number, to: number, fallback: number): PMNode[] {
    const levels = lines
      .slice(from, to)
      .flatMap((line, index) => (line.trim() ? [depthAt(from + index)] : []));
    return sequence(from, to, levels.length ? Math.min(...levels) : fallback);
  }
  function one(
    from: number,
    end: number,
    level: number,
    extra?: { node: PMNode; lines: number },
  ): {
    node: PMNode;
    next: number;
    list?: "bullet_list" | "ordered_list";
    order?: number;
  } {
    const text = textAt(from);
    if (extra) return { node: extra.node, next: from + extra.lines };
    const object = /^<(?:tabs|bookmark|link-preview|breadcrumb|button|meeting-notes|ai-block|html-embed|web-embed|figure)(?:\s|\/?>)/.test(text)
      ? readObjectBlock(lines.map(line => line.slice(level)), from, end, raw => parseNotionMarkdown(raw, allowObject, extensions)) : undefined;
    if (object) return (object.node.type.name === "opaque_block" || allowObject(object.node.type.name)) ? object : {
      node: schema.nodes.opaque_block.create({ raw: lines.slice(from, object.next).map(line => line.slice(level)).join("\n") }), next: object.next,
    };
    const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
    if (fence) {
      let close = from + 1;
      for (; close < end; close++) {
        const candidate = new RegExp(
          `^${fence[1][0]}{${fence[1].length},}[ \\t]*$`,
        );
        if (depthAt(close) === level && candidate.test(textAt(close))) break;
      }
      const value = lines
        .slice(from + 1, close)
        .map((line) =>
          line.startsWith("\t".repeat(level)) ? line.slice(level) : line,
        )
        .join("\n");
      if (close === end) return { node: opaque(from, end), next: end };
      const info = lineAttributes(fence[2].trim());
      return {
        node: schema.nodes.code_block.create(
          { ...info.attrs, params: info.text },
          value ? schema.text(value) : undefined,
        ),
        next: close + 1,
      };
    }
    if (text.startsWith("$$")) {
      if (text.length > 3 && text.endsWith("$$"))
        return {
          node: schema.nodes.equation.create(
            null,
            text.slice(2, -2).trim()
              ? schema.text(text.slice(2, -2).trim())
              : undefined,
          ),
          next: from + 1,
        };
      if (text.trim() === "$$") {
        let close = from + 1;
        while (
          close < end &&
          !(depthAt(close) === level && textAt(close).trim() === "$$")
        )
          close++;
        if (close === end) return { node: opaque(from, end), next: end };
        const value = lines
          .slice(from + 1, close)
          .map((line) => line.slice(level))
          .join("\n");
        return {
          node: schema.nodes.equation.create(
            null,
            value ? schema.text(value) : undefined,
          ),
          next: close + 1,
        };
      }
    }
    // Old directives are parsed with the old grammar, including its fenced-code rules.
    if (/^:::(?:nest|columns)\s*$/.test(text) || /^::page\{/.test(text)) {
      const tail = lines
        .slice(from, end)
        .map((line) =>
          line.slice(Math.min(level, line.match(/^\t*/)?.[0].length ?? 0)),
        )
        .join("\n");
      const legacy = parseEditorMarkdown(tail).firstChild!;
      const count = String(legacy.attrs.source || text).split(
        /\r\n|\n|\r/,
      ).length;
      return { node: schema.nodes.opaque_block.create({ raw: lines.slice(from, Math.min(end, from + count)).map(line => line.slice(level)).join("\n") }), next: Math.min(end, from + count) };
    }
    const tag = openingTag(text.trimStart());
    if (tag) {
      const trimmed = text.trimStart();
      // Block carriers must occupy the whole line. Never discard a suffix
      // merely because the line begins with a self-closing block tag.
      if (tag.selfClosing && trimmed.slice(tag.length).trim() &&
          !tag.tag.startsWith("mention-") && !["span", "br"].includes(tag.tag))
        return { node: paragraph(text), next: from + 1 };
      const attrs = { nfmAttrs: tag.attrs, color: tag.attrs.color || "" };
      const endTag = `</${tag.tag}>`;
      const single = !tag.selfClosing && trimmed.endsWith(endTag);
      const close =
        single || tag.selfClosing ? from : closeTag(from, end, tag.tag);
      const next = close < 0 ? end : close + 1;
      const body = single
        ? trimmed.slice(tag.length, -endTag.length)
        : close >= 0
          ? lines.slice(from + 1, close).join("\n")
          : "";
      if (tag.tag === "empty-block" && tag.selfClosing)
        return { node: paragraph("", attrs), next };
      if (
        [
          "page",
          "database",
          "audio",
          "video",
          "file",
          "pdf",
          "unknown",
          "table_of_contents",
        ].includes(tag.tag) &&
        (single || tag.selfClosing)
      ) {
        if (tag.tag === "page")
          return {
            node: schema.nodes.child_page.create({
              ...attrs,
              target:
                localPageTarget(tag.attrs.url || "") ?? tag.attrs.url ?? "",
              url: tag.attrs.url || "",
              label: decodeXml(body),
            }),
            next,
          };
        if (tag.tag === "database")
          return {
            node: opaque(from, next),
            next,
          };
        if (tag.tag === "table_of_contents")
          return { node: schema.nodes.table_of_contents.create(attrs), next };
        if (tag.tag === "unknown")
          return {
            node: schema.nodes.unknown_block.create({
              ...attrs,
              url: tag.attrs.url || "",
              alt: tag.attrs.alt || "",
            }),
            next,
          };
        return {
          node: schema.nodes.media_block.create({
            ...attrs,
            type: tag.tag,
            src: tag.attrs.src || "",
            caption: decodeXml(body),
          }),
          next,
        };
      }
      if (
        [
          "columns",
          "column",
          "callout",
          "details",
          "synced_block",
          "synced_block_reference",
          "table",
        ].includes(tag.tag)
      ) {
        if (close < 0) return { node: opaque(from, end), next: end };
        if (tag.tag === "table") {
          const table = parseTable(body, attrs, notionInline);
          return { node: table || opaque(from, next), next };
        }
        let content = single
          ? kids(parseNotionMarkdown(body, allowObject, extensions))
          : inside(from + 1, close, level + 1);
        if (tag.tag === "columns") {
          if (
            content.length < 2 ||
            content.some((child) => child.type !== schema.nodes.column)
          )
            return { node: opaque(from, next), next };
          return { node: schema.nodes.columns.create(attrs, content), next };
        }
        if (tag.tag === "column")
          return {
            node: schema.nodes.column.create(attrs, nonempty(content)),
            next,
          };
        if (tag.tag === "callout")
          return {
            node: schema.nodes.callout.create(
              { ...attrs, icon: tag.attrs.icon ?? "💡" },
              nonempty(content),
            ),
            next,
          };
        if (tag.tag.startsWith("synced_block"))
          return {
            node: schema.nodes.synced_block.create(
              {
                ...attrs,
                url: tag.attrs.url || "",
                reference: tag.tag.endsWith("reference"),
              },
              nonempty(content),
            ),
            next,
          };
        const summary = single
          ? /^\s*<summary>([\s\S]*?)<\/summary>/.exec(body)
          : /^\s*<summary>(.*?)<\/summary>\s*$/.exec(lines[from + 1] || "");
        if (!summary) return { node: opaque(from, next), next };
        content = single
          ? kids(parseNotionMarkdown(body.slice(summary[0].length), allowObject, extensions))
          : inside(from + 2, close, level + 1);
        return {
          node: schema.nodes.toggle_block.create(attrs, [
            paragraph(summary[1]),
            ...content,
          ]),
          next,
        };
      }
      // Inline tags such as mentions/spans are paragraphs, not raw HTML blocks.
      if (!tag.tag.startsWith("mention-") && !["span", "br"].includes(tag.tag))
        return { node: opaque(from, next), next };
    }
    if (/^\s*<\//.test(text))
      return { node: opaque(from, from + 1), next: from + 1 };
    // The official complete example also permits GFM pipe tables.
    if (text.includes("|") && /^\s*\|?\s*:?-{3,}/.test(textAt(from + 1))) {
      let finish = from + 2;
      while (
        finish < end &&
        depthAt(finish) === level &&
        textAt(finish).trim() &&
        textAt(finish).includes("|")
      )
        finish++;
      const tokens = md.parse(
        lines
          .slice(from, finish)
          .map((line) => line.slice(level))
          .join("\n"),
        {},
      );
      const rows: PMNode[] = [];
      let cells: PMNode[] = [];
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type === "tr_open") cells = [];
        if (["th_open", "td_open"].includes(tokens[i].type))
          cells.push(
            schema.nodes.table_cell.create(
              null,
              paragraph(tokens[i + 1]?.content || ""),
            ),
          );
        if (tokens[i].type === "tr_close" && cells.length)
          rows.push(schema.nodes.table_row.create(null, cells));
      }
      if (rows.length)
        return {
          node: schema.nodes.table.create(
            { nfmAttrs: { "header-row": "true" } },
            rows,
          ),
          next: finish,
        };
    }
    const parsed = lineAttributes(text);
    const line = parsed.text;
    const list = /^\s*(?:([-+*]) |(\d+)\. )(.*)$/.exec(line);
    if (list) {
      const checkbox = /^\[([ xX])\](?: |$)/.exec(list[3]);
      return {
        node: schema.nodes[checkbox ? "task_list_item" : list[2] ? "numbered_list_item" : "bullet_list_item"].create(
          {
            ...parsed.attrs,
            checked: checkbox ? checkbox[1].toLowerCase() === "x" : null,
          },
          paragraph(checkbox ? list[3].slice(checkbox[0].length) : list[3]),
        ),
        next: from + 1,
        list: list[2] ? "ordered_list" : "bullet_list",
        order: Number(list[2]) || 1,
      };
    }
    if (/^\s*---\s*$/.test(line))
      return {
        node: schema.nodes.horizontal_rule.create(parsed.attrs),
        next: from + 1,
      };
    const heading = /^(#{1,6})(?:[ \t]+|$)(.*)$/.exec(line);
    if (heading)
      return {
        node: schema.nodes.heading.create(
          { ...parsed.attrs, level: Math.min(extensions?.headingLimit ?? 4, heading[1].length) },
          notionInline(heading[2]),
        ),
        next: from + 1,
      };
    if (/^> ?/.test(line))
      return {
        node: schema.nodes.blockquote.create(
          parsed.attrs,
          paragraph(line.replace(/^> ?/, "")),
        ),
        next: from + 1,
      };
    return { node: paragraph(line, parsed.attrs), next: from + 1 };
  }
  function sequence(from: number, end: number, level: number): PMNode[] {
    const result: PMNode[] = [];
    const prepared = extensions?.blocks(lines.slice(from, end).map(line => line.startsWith("\t".repeat(level)) ? line.slice(level) : line).join("\n"), from === 0 && level === 0);
    for (let cursor = from; cursor < end;) {
      if (!lines[cursor].trim()) {
        cursor++;
        continue;
      }
      if (depthAt(cursor) < level) break;
      const start = cursor;
      if (depthAt(cursor) > level) {
        do cursor++;
        while (
          cursor < end &&
          (!lines[cursor].trim() || depthAt(cursor) > level)
        );
        result.push(withSource(opaque(start, cursor), start, cursor));
        continue;
      }
      const item = one(cursor, end, level, prepared?.get(cursor - from));
      let node = item.node;
      cursor = Math.max(cursor + 1, item.next);
      let nextContent = cursor;
      while (nextContent < end && !lines[nextContent].trim()) nextContent++;
      if (nextContent < end && depthAt(nextContent) > level) {
        let finish = nextContent + 1;
        while (
          finish < end &&
          (!lines[finish].trim() || depthAt(finish) > level)
        )
          finish++;
        const nested = sequence(nextContent, finish, level + 1);
        if (["paragraph", "heading"].includes(node.type.name)) {
          if (node.type === schema.nodes.heading)
            node = node.type.create(
              { ...node.attrs, toggle: true },
              node.content,
            );
          node = schema.nodes.nested_block.create(null, [
            withSource(node, start, item.next),
            ...nested,
          ]);
        } else if (
          ["bullet_list_item", "numbered_list_item", "task_list_item", "blockquote", "callout", "toggle_block"].includes(
            node.type.name,
          )
        )
          node = node.copy(
            node.content.append(
              schema.nodes.doc.create(null, nonempty(nested)).content,
            ),
          );
        else node = opaque(start, finish);
        cursor = finish;
      }
      node = withSource(node, start, cursor);
      if (item.list) {
        const previous = result.at(-1);
        const consecutive =
          previous?.type.name === item.list &&
          (item.list !== "ordered_list" ||
            Number(previous.attrs.order) + previous.childCount === item.order);
        if (consecutive) {
          const combined = previous!.copy(
            previous!.content.append(
              schema.nodes[item.list].create(null, node).content,
            ),
          );
          result[result.length - 1] = combined.type.create(
            {
              ...combined.attrs,
              source: source.slice(
                previous!.attrs.sourceStart,
                node.attrs.sourceEnd,
              ),
              sourceEnd: node.attrs.sourceEnd,
              sourceFingerprint: editorFingerprint(combined),
            },
            combined.content,
          );
        } else
          result.push(
            withSource(
              schema.nodes[item.list].create(
                item.list === "ordered_list" ? { order: item.order } : null,
                node,
              ),
              start,
              cursor,
            ),
          );
      } else result.push(node);
    }
    return result;
  }
  let nodes = sequence(0, lines.length, 0);
  // A stray column or any future structural element must remain recoverable.
  nodes = nodes.map((node) =>
    node.type.isInGroup("block")
      ? node
      : schema.nodes.opaque_block.create({ raw: node.attrs.source || source }),
  );
  const gaps: string[] = [];
  let previousEnd = 0;
  nodes = nodes.map((node, index) => {
    gaps.push(source.slice(previousEnd, node.attrs.sourceStart ?? previousEnd));
    previousEnd = node.attrs.sourceEnd ?? previousEnd;
    return node.type.create(
      { ...node.attrs, sourceKey: index },
      node.content,
      node.marks,
    );
  });
  const doc = schema.nodes.doc.create(
    {
      source,
      sourceGaps: gaps,
      sourceSuffix: source.slice(previousEnd),
      sourceFormat: "notion-markdown",
      sourceNewline: source.match(/\r\n|\n|\r/)?.[0] || "\n",
    },
    nonempty(nodes),
  );
  return doc.type.create(
    { ...doc.attrs, sourceFingerprint: editorFingerprint(doc) },
    doc.content,
  );
}

function parseTable(
  body: string,
  attrs: Record<string, unknown>,
  inline = notionInline,
): PMNode | null {
  const widths: string[] = [],
    columnAttrs: TagAttributes[] = [],
    rows: PMNode[] = [];
  let rest = body.trim();
  if (rest.startsWith("<colgroup>")) {
    const end = rest.indexOf("</colgroup>");
    if (end < 0) return null;
    let group = rest.slice(10, end).trim();
    while (group) {
      const col = openingTag(group);
      if (col?.tag !== "col") return null;
      widths.push(col.attrs.width || "");
      columnAttrs.push(col.attrs);
      group = group
        .slice(col.length)
        .replace(/^<\/col>/, "")
        .trim();
    }
    rest = rest.slice(end + 11).trim();
  }
  while (rest) {
    const row = openingTag(rest);
    if (row?.tag !== "tr") return null;
    const end = rest.indexOf("</tr>", row.length);
    if (end < 0) return null;
    let content = rest.slice(row.length, end).trim();
    const cells: PMNode[] = [];
    while (content) {
      const cell = openingTag(content);
      if (!cell || !["td", "th"].includes(cell.tag)) return null;
      const finish = content.indexOf(`</${cell.tag}>`, cell.length);
      if (finish < 0) return null;
      cells.push(
        schema.nodes.table_cell.create(
          { nfmAttrs: cell.attrs },
          schema.nodes.paragraph.create(null, inline(content.slice(cell.length, finish).trim())),
        ),
      );
      content = content.slice(finish + cell.tag.length + 3).trim();
    }
    if (!cells.length) return null;
    rows.push(schema.nodes.table_row.create({ nfmAttrs: row.attrs }, cells));
    rest = rest.slice(end + 5).trim();
  }
  return rows.length
    ? schema.nodes.table.create({ ...attrs, widths, columnAttrs }, rows)
    : null;
}

function attrsFor(node: PMNode): TagAttributes {
  return {
    ...node.attrs.nfmAttrs,
    ...(node.attrs.color ? { color: node.attrs.color } : {}),
  };
}
function suffix(node: PMNode): string {
  const attrs = attrsFor(node);
  if (node.type === schema.nodes.heading && node.attrs.toggle)
    attrs.toggle = "true";
  return Object.keys(attrs).length ? ` {${attributesXml(attrs).trim()}}` : "";
}
function blocks(nodes: PMNode[]): string {
  return nodes.map(node => notionBlockMarkdown(node)).join("\n\n");
}
export function notionBlockMarkdown(node: PMNode, write: (node: PMNode) => string = notionBlockMarkdown, inline: (node: PMNode) => string = node => inlineMarkdown(node, true)): string {
  const blocks = (nodes: PMNode[]) => nodes.map(node => write(node)).join("\n\n");
  const object = writeObjectBlock(node, child => write(child));
  if (object !== undefined) return object;
  const attrs = attrsFor(node);
  const container = (
    name: string,
    content: PMNode[],
    extra: TagAttributes = {},
  ) =>
    `<${name}${attributesXml({ ...attrs, ...extra })}>\n${indent(blocks(content))}\n</${name}>`;
  switch (node.type.name) {
    case "paragraph":
      return node.content.size
        ? inline(node) + suffix(node)
        : `<empty-block${attributesXml(attrs)}/>`;
    case "heading":
      return `${"#".repeat(Math.min(4, node.attrs.level))} ${inline(node)}${suffix(node)}`;
    case "nested_block": {
      let head = node.firstChild!;
      if (head.type === schema.nodes.heading)
        head = head.type.create({ ...head.attrs, toggle: true }, head.content);
      return `${write(head)}${node.childCount > 1 ? `\n${indent(blocks(kids(node).slice(1)))}` : ""}`;
    }
    case "bullet_list":
    case "ordered_list":
      return kids(node)
        .map((item, index) => {
          const marker =
            node.type.name === "ordered_list"
              ? `${Number(node.attrs.order) + index}. `
              : "- ";
          const check =
            item.attrs.checked === null
              ? ""
              : item.attrs.checked
                ? "[x] "
                : "[ ] ";
          return `${marker}${check}${inline(item.firstChild!)}${suffix(item)}${item.childCount > 1 ? `\n${indent(blocks(kids(item).slice(1)))}` : ""}`;
        })
        .join("\n");
    case "blockquote": {
      const head =
        node.firstChild?.type === schema.nodes.paragraph
          ? node.firstChild
          : null;
      const children = kids(node).slice(head ? 1 : 0);
      return `> ${head ? inline(head) : ""}${suffix(node)}${children.length ? `\n${indent(blocks(children))}` : ""}`;
    }
    case "code_block": {
      const params = String(node.attrs.params || "").replace(/[\r\n]/g, "");
      const character = params.includes("`") ? "~" : "`";
      const fence = character.repeat(
        Math.max(
          3,
          ...[
            ...node.textContent.matchAll(character === "`" ? /`+/g : /~+/g),
          ].map((match) => match[0].length + 1),
        ),
      );
      return `${fence}${params}${suffix(node)}\n${node.textContent}\n${fence}`;
    }
    case "horizontal_rule":
      return "---" + suffix(node);
    case "columns":
      return container("columns", kids(node));
    case "column":
      return container("column", kids(node));
    case "callout":
      // An absent icon uses the default; an explicit empty icon means removed.
      return node.attrs.icon === ""
        ? `<callout${attributesXml({ ...attrs, icon: "" })} icon="">\n${indent(blocks(kids(node)))}\n</callout>`
        : container("callout", kids(node), { icon: node.attrs.icon });
    case "toggle_block":
      return `<details${attributesXml(attrs)}>\n<summary>${inline(node.firstChild!)}</summary>${node.childCount > 1 ? `\n${indent(blocks(kids(node).slice(1)))}` : ""}\n</details>`;
    case "synced_block":
      return container(
        node.attrs.reference ? "synced_block_reference" : "synced_block",
        kids(node),
        { url: node.attrs.url },
      );
    case "child_page":
      return `<page${attributesXml({ ...attrs, url: node.attrs.url || pageUrl(node.attrs.target) })}>${escapeXml(node.attrs.label || node.attrs.target)}</page>`;
    case "table_of_contents":
      return `<table_of_contents${attributesXml(attrs)}/>`;
    case "unknown_block":
      return `<unknown${attributesXml({ ...attrs, url: node.attrs.url, alt: node.attrs.alt })}/>`;
    case "media_block":
      return `<${node.attrs.type}${attributesXml({ ...attrs, src: node.attrs.src })}>${escapeXml(node.attrs.caption)}</${node.attrs.type}>`;
    case "equation":
      return `$$\n${node.textContent}\n$$`;
    case "table": {
      if (node.attrs.syntaxForm === "mmd") return multiMarkdownTable(node, n => inlineMarkdown(n), n => blockMarkdown(n));
      const columns: TagAttributes[] = node.attrs.columnAttrs?.length
        ? node.attrs.columnAttrs
        : (node.attrs.widths || []).map((width: string) => ({ width }));
      return `<table${attributesXml(attrs)}>\n${columns.length ? `\t<colgroup>\n${columns.map((column) => `\t\t<col${attributesXml(column)}/>`).join("\n")}\n\t</colgroup>\n` : ""}${kids(
        node,
      )
        .map(
          (row) =>
            `\t<tr${attributesXml(row.attrs.nfmAttrs)}>\n${kids(row)
              .map(
                (cell) =>
                  `\t\t<td${attributesXml(cell.attrs.nfmAttrs)}>${kids(cell)
                    .map((p) => inline(p))
                    .join("<br>")}</td>`,
              )
              .join("\n")}\n\t</tr>`,
        )
        .join("\n")}\n</table>`;
    }
    case "opaque_block":
      return node.attrs.raw;
    default:
      return node.textContent;
  }
}

/** Original enhanced source is retained until its subtree changes. Legacy input
 * is converted as a whole once, so mixed newline semantics cannot enter a file. */
export function serializeNotionMarkdown(doc: PMNode): string {
  const enhanced = doc.attrs.sourceFormat === "notion-markdown";
  if (enhanced) return serializeEditorMarkdown(doc, notionBlockMarkdown);
  const newline = doc.attrs.sourceNewline || "\n";
  const output = kids(doc).map(node => notionBlockMarkdown(node));
  // Reference definitions and unrendered legacy metadata stay recoverable.
  for (const gap of doc.attrs.sourceGaps || [])
    if (gap.trim()) output.push(gap.trim());
  for (const hidden of doc.attrs.sourceHidden || []) output.push(hidden.source);
  if (doc.attrs.sourceSuffix?.trim())
    output.push(doc.attrs.sourceSuffix.trim());
  return output.join("\n\n").replace(/\r\n|\n|\r/g, newline);
}
