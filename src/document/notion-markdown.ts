import { createEditorNode, editorKind, isEditorKind } from "./node-identity";
import MarkdownIt from "markdown-it";
import { installNotionRichText } from "./notion-rich-text";
import { readOfficialNotionBlock, writeOfficialNotionBlock } from "./notion-official-blocks";
import { readNotionV2Block, notionSourceTags } from "./notion-v2";
import { rChunkMarkdown } from "../markdown-engine/rmarkdown";
import imageRule from "markdown-it/lib/rules_inline/image.mjs";
import linkRule from "markdown-it/lib/rules_inline/link.mjs";
import { readObjectBlock, writeObjectBlock } from "./object-codec";
import { multiMarkdownTable } from "./table-markdown";
import Token from "markdown-it/lib/token.mjs";
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
export interface NotionInlineLink { from: number; to: number; href: string }
// Collect source spans with the same inline grammar used by the editor. In
// particular, code, math, images and mention labels must not become links.
md.inline.ruler.at("link", (state, silent) => {
  const from = state.pos, tokenStart = state.tokens.length;
  if (!linkRule(state, silent)) return false;
  if (!silent && state.env.notionLinks) {
    const token = state.tokens.slice(tokenStart).find(token => token.type === "link_open");
    if (token) state.env.notionLinks.push({
      from: from + (state.env.notionOffset ?? 0),
      to: state.pos + (state.env.notionOffset ?? 0),
      href: token.attrGet("href") || "",
    });
  }
  return true;
});
export function notionInlineLinks(source: string): NotionInlineLink[] {
  const notionLinks: NotionInlineLink[] = [];
  md.parseInline(source, { notionLinks });
  return notionLinks;
}
export function notionInlineImages(source: string): NotionInlineLink[] {
  const notionImages: NotionInlineLink[] = [];
  md.parseInline(source, { notionImages, mediaImage: true });
  return notionImages;
}
// Enhanced Markdown documents links explicitly, and images as media blocks.
// Consume inline image syntax as a whole so it cannot fall through to a link.
md.disable("autolink");
md.inline.ruler.at("image", (state, silent) => {
  const start = state.pos;
  const links = state.env.notionLinks;
  let matched: boolean;
  try {
    state.env.notionLinks = undefined;
    matched = imageRule(state, silent);
  } finally { state.env.notionLinks = links; }
  if (!matched) return false;
  if (!silent && state.env.notionImages) state.env.notionImages.push({ from: start, to: state.pos, href: state.tokens.at(-1)?.attrGet("src") || "" });
  if (!silent && !state.env.mediaImage) {
    const token = state.tokens[state.tokens.length - 1];
    token.type = "text";
    token.content = state.src.slice(start, state.pos);
    token.children = null;
    token.attrs = null;
  }
  return true;
});
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
    (!["span", "b", "i", "s", "u", "mention", "date", "link-preview"].includes(tag.tag) &&
      !/^mention-(?:page|user|database|data-source|agent|date|link)$/.test(tag.tag))
  )
    return false;
  let finish = tag.length,
    content = "";
  if (!tag.selfClosing) {
    // Match nested spans, including differently styled inner spans.
    const names = /<\/?(?:span|b|i|s|u|mention|date|mention-[\w-]+)\b(?:[^>"']|"[^"]*"|'[^']*')*>/g;
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
      tag.tag === "span" ? "nfm_span" : ["b", "i", "s", "u"].includes(tag.tag) ? "nfm_format" : "nfm_mention",
      "",
      0,
    );
    token.content = decodeXml(content);
    if (tag.tag === "span" || ["b", "i", "s", "u"].includes(tag.tag)) {
      token.meta = tag.tag === "span" ? tag.attrs : { mark: ({ b: "strong", i: "em", s: "strike", u: "underline" } as Record<string,string>)[tag.tag] };
      token.children = md.parseInline(content, { ...state.env, mediaImage: false,
        notionOffset: (state.env.notionOffset ?? 0) + state.pos + tag.length,
      })[0]?.children ?? [];
    } else {
      const kind = tag.tag === "date" ? "date" : tag.tag === "link-preview" ? "link" : tag.tag === "mention" ? tag.attrs.type === "database" ? "database" : (tag.attrs.url || "").startsWith("user://") ? "user" : (tag.attrs.url || "").startsWith("agent://") ? "agent" : (tag.attrs.url || "").startsWith("collection://") ? "data-source" : "page" : tag.tag.slice(8);
      const attrs = { ...tag.attrs };
      if (tag.tag === "date") for (const [from,to] of [["start-time","startTime"],["end-time","endTime"],["time-zone","timeZone"]]) if (attrs[from] !== undefined) { attrs[to] = attrs[from]; delete attrs[from]; }
      token.meta = { kind, attrs, syntaxForm: ["mention", "date", "link-preview"].includes(tag.tag) ? "notion" : undefined };
    }
  }
  state.pos += finish;
  return true;
});
installNotionRichText(md);
md.block.ruler.before("html_block", "notion_v2_block", (state, start, end, silent) => {
  if (!state.env.notionV2) return false;
  const first = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]);
  if (!first.startsWith("<")) return false;
  const lines = state.getLines(start, end, state.blkIndent, false).split("\n");
  const parsed = readNotionV2Block(lines, 0, lines.length,
    source => parseNotionMarkdown(source, state.env.allowObject, state.env.extensions, "v2", (state.env.notionDepth || 0) + 1),
    source => parseInline(md.parseInline(source, { notionV2: true })[0]?.children ?? []),
    (body, attrs) => parseTable(body, attrs, source => parseInline(md.parseInline(source, { notionV2: true })[0]?.children ?? []), false), !!state.env.extensions);
  if (!parsed || !parsed.node.type.isInGroup("block")) return false;
  if (silent) return true;
  const token = state.push("source_node", "", 0); token.map = [start, start + parsed.next]; token.meta = { node: parsed.node, notionV2: true };
  state.line = start + parsed.next; return true;
}, { alt: ["paragraph", "reference", "blockquote", "list"] });
// [[...]] remains an input convenience and a legacy reader, never new output.
md.inline.ruler.before("link", "legacy_page_mention", (state, silent) => {
  if (!state.env.legacyWiki) return false;
  const match = /^\[\[([^\]\r\n]+)\]\]/.exec(state.src.slice(state.pos));
  if (!match || silent) return false;
  const [target, ...label] = match[1].split("|");
  const token = state.push("wiki_link", "", 0);
  token.meta = { target: target.trim(), explicitLabel: label.length > 0 };
  token.content = label.join("|") || target.trim();
  state.pos += match[0].length;
  return true;
});

export const notionInline = (source: string, version?: "v2"): PMNode[] =>
  parseInline(md.parseInline(source, { notionV2: version === "v2" })[0]?.children ?? []);
const kids = (node: PMNode): PMNode[] => {
  const result: PMNode[] = [];
  node.forEach((child) => result.push(child));
  return result;
};
const paragraph = (text = "", attrs: Record<string, unknown> = {}) =>
  schema.nodes["block.paragraph"].create(attrs, notionInline(text));
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

/** v2 ordinary prose follows CommonMark/GFM block boundaries. Official carriers
 * still go through their lossless readers; legacy v1 tab files remain readable. */
function v2MarkdownBlocks(source: string, extensions?: NotionExtensions, allowObject?: (name: string) => boolean, notionDepth = 0): Map<number, { node: PMNode; lines: number }> {
  const readInline = extensions?.inline;
  const tokens = md.parse(source, { mediaImage: true, notionV2: true, extensions, allowObject, notionDepth });
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]; token.meta = { ...token.meta, gfm: true };
    if (readInline && token.type === "inline" && !token.children?.some(child => child.type === "task_checkbox") && !/<(?:b|i|s|u|mention|date|link-preview)(?:\s|>)/.test(token.content)) token.children = readInline(token.content).map(node => { const t = new Token("source_inline", "", 0); t.meta = { node }; return t; });
    if (token.type === "list_item_open" && tokens[i + 2]?.type === "inline") {
      const inline = tokens[i + 2], first = inline.children?.[0];
      const checkbox = first?.type === "text" && /^\[([ xX])\](?: |$)/.exec(first.content);
      if (checkbox) { first!.content = first!.content.slice(checkbox[0].length); const check = new Token("task_checkbox", "", 0); check.meta = { checked: checkbox[1] !== " " }; inline.children!.unshift(check); }
    }
  }
  const doc = parseEditorMarkdown(source, tokens), result = new Map<number, { node: PMNode; lines: number }>();
  doc.forEach(node => {
    const raw = String(node.attrs.source || ""), first = raw.split("\n")[0];
    if (typeof node.attrs.sourceStart !== "number" || !raw || /^\t|\n\t/m.test(raw) || lineAttributes(first).attrs.nfmAttrs) return;
    const official = tokens.some(token => token.map && token.meta?.notionV2 && source.slice(0, node.attrs.sourceStart).split("\n").length - 1 === token.map[0]);
    if (!official && !['paragraph', 'heading', 'blockquote', 'bullet_list', 'ordered_list', 'horizontal_rule', 'code_block'].includes(editorKind(node))) return;
    if (!official && editorKind(node) === "paragraph" && notionSourceTags(raw).some(tag => !["span", "b", "i", "s", "u", "mention", "date", "link-preview", "br"].includes(tag.tag) && !tag.tag.startsWith("mention-"))) return;
    if (editorKind(node) === "paragraph" && /^\s*(?:!\[|\$\$)/.test(raw)) return;
    const start = source.slice(0, node.attrs.sourceStart).split("\n").length - 1;
    result.set(start, { node, lines: raw.split("\n").length });
  });
  return result;
}
export function parseNotionMarkdown(source: string, allowObject: (name: string) => boolean = () => false, extensions?: NotionExtensions, version: "v1" | "v2" = "v1", nesting = 0): PMNode {
  if (nesting > 40) return schema.nodes.doc.create({ source, sourceFormat: "notion-markdown" }, createEditorNode(schema, "opaque_block", { raw: source }));
  const notionInline = version === "v2" ? (text: string) => parseInline(md.parseInline(text, {})[0]?.children ?? []) : extensions?.inline ?? ((text: string) => parseInline(md.parseInline(text, {})[0]?.children ?? []));
  const paragraph = (text = "", attrs: Record<string, unknown> = {}) => schema.nodes["block.paragraph"].create(attrs, notionInline(text));
  const lines = source.split(/\r\n|\n|\r/);
  const offsets = [0];
  for (const match of source.matchAll(/\r\n|\n|\r/g))
    offsets.push(match.index! + match[0].length);
  const depthAt = (line: number) => lines[line]?.match(/^\t*/)?.[0].length ?? 0;
  const textAt = (line: number) => (lines[line] ?? "").slice(depthAt(line));
  const fenceAt = (line: number) => /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(textAt(line));
  const fenceEnds = new Map<number, number>();
  function fenceEnd(from: number, end: number): number {
    const fence = fenceAt(from);
    if (!fence) return end;
    if (!fenceEnds.has(from)) {
      const closing = new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}[ \\t]*$`);
      let close = from + 1;
      while (close < lines.length &&
        !(depthAt(close) === depthAt(from) && closing.test(textAt(close)))) close++;
      fenceEnds.set(from, close);
    }
    return Math.min(fenceEnds.get(from)!, end);
  }
  // The API can indent just the fences, leaving their literal body at column
  // zero. A code body must never terminate its parent's child range.
  function childrenEnd(from: number, end: number, parentLevel: number): number {
    let cursor = from;
    while (cursor < end && (!lines[cursor].trim() || depthAt(cursor) > parentLevel)) {
      const close = fenceAt(cursor) ? fenceEnd(cursor, end) : end;
      cursor = close < end ? close + 1 : cursor + 1;
    }
    return cursor;
  }
  const raw = (from: number, to: number) =>
    source
      .slice(offsets[from] ?? source.length, offsets[to] ?? source.length)
      .replace(/[\r\n]+$/, "");
  const withSource = (node: PMNode, from: number, to: number): PMNode =>
    node.type.create(
      {
        ...node.attrs,
        source: raw(from, to),
        // Keys belong only to this document's root blocks (assigned below).
        // A nested Markdown reader may have supplied keys from its own slice.
        sourceKey: null,
        sourceStart: offsets[from],
        sourceEnd: (offsets[from] ?? 0) + raw(from, to).length,
        sourceFingerprint: editorFingerprint(node),
      },
      node.content,
      node.marks,
    );
  const opaque = (from: number, to: number) =>
    createEditorNode(schema, "opaque_block", {
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
    let depth = 1;
    for (let line = from + 1; line < end; line++) {
      const text = textAt(line).trim();
      if (fenceAt(line)) {
        const close = fenceEnd(line, end);
        if (close === end) return -1;
        line = close;
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
    const levels: number[] = [];
    for (let cursor = from; cursor < to; cursor++) {
      if (lines[cursor].trim()) levels.push(depthAt(cursor));
      const close = fenceAt(cursor) ? fenceEnd(cursor, to) : to;
      if (close < to) cursor = close;
    }
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
    if (version === "v2" && text.trimStart().startsWith("![")) {
      const parsed = lineAttributes(text), tokens = md.parseInline(parsed.text.trim(), { mediaImage: true, notionV2: true })[0]?.children ?? [];
      if (tokens.length === 1 && tokens[0].type === "image") {
        const image = parseInline(tokens)[0];
        return { node: createEditorNode(schema, "image_block", { ...parsed.attrs, syntaxForm: "notion", src: image.attrs.src, caption: image.attrs.alt || "", title: image.attrs.title || "" }), next: from + 1 };
      }
    }
    if (version === "v2" && extra) return { node: extra.node, next: from + extra.lines };
    if (version === "v2") {
      const v2 = readNotionV2Block(lines.map(line => line.startsWith("\t".repeat(level)) ? line.slice(level) : line), from, end,
        raw => parseNotionMarkdown(raw, allowObject, extensions, version, nesting + 1), notionInline,
        (body, attrs) => parseTable(body, attrs, notionInline, false), !!extensions);
      if (v2) return v2;
    }
    if (extra) return { node: extra.node, next: from + extra.lines };
    const official = /^<(?:tabs|meeting-notes|embed|folder|database)(?:\s|\/?>)/.test(text)
      ? readOfficialNotionBlock(lines.map(line => line.slice(level)), from, end, raw => parseNotionMarkdown(raw, allowObject, extensions, version)) : undefined;
    if (official) return official;
    const object = /^<(?:tabs|bookmark|link-preview|breadcrumb|button|meeting-notes|ai-block|web-embed|figure)(?:\s|\/?>)/.test(text)
      ? readObjectBlock(lines.map(line => line.slice(level)), from, end, raw => parseNotionMarkdown(raw, allowObject, extensions, version)) : undefined;
    if (object) return (isEditorKind(object.node, "opaque_block") || allowObject(editorKind(object.node))) ? object : {
      node: createEditorNode(schema, "opaque_block", { raw: lines.slice(from, object.next).map(line => line.slice(level)).join("\n") }), next: object.next,
    };
    const fence = fenceAt(from);
    if (fence) {
      const close = fenceEnd(from, end);
      const body = lines.slice(from + 1, close);
      // Accept both the API's literal-body layout and our fully indented
      // serialization. Never strip real code tabs from a literal-body block.
      const indented = body.every(line => !line.trim() || line.startsWith("\t".repeat(level)));
      const value = body
        .map((line) =>
          indented && line.startsWith("\t".repeat(level)) ? line.slice(level) : line,
        )
        .join("\n");
      if (close === end) return { node: opaque(from, end), next: end };
      if (!extensions && fence[1][0] === "~")
        return { node: opaque(from, close + 1), next: close + 1 };
      const info = lineAttributes(fence[2].trim());
      return {
        node: schema.nodes["block.code_block"].create({ ...info.attrs, params: info.text }, value ? schema.text(value) : undefined),
        next: close + 1,
      };
    }
    if (text.startsWith("$$")) {
      if (text.length > 3 && text.endsWith("$$"))
        return {
          node: schema.nodes["block.math_block"].create(null, text.slice(2, -2).trim()
              ? schema.text(text.slice(2, -2).trim())
              : undefined),
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
          node: schema.nodes["block.math_block"].create(null, value ? schema.text(value) : undefined),
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
      return { node: createEditorNode(schema, "opaque_block", { raw: lines.slice(from, Math.min(end, from + count)).map(line => line.slice(level)).join("\n") }), next: Math.min(end, from + count) };
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
          "page-link",
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
        if (tag.tag === "page-link" && !allowObject("link_to_page"))
          return { node: opaque(from, next), next };
        if (tag.tag === "page" || tag.tag === "page-link")
          return {
            node: createEditorNode(schema, tag.tag === "page" ? "owned_page" : "child_page", {
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
          return { node: schema.nodes["block.table_of_contents"].create(attrs), next };
        if (tag.tag === "unknown")
          return {
            node: schema.nodes["block.unsupported"].create({
              ...attrs,
              url: tag.attrs.url || "",
              alt: tag.attrs.alt || "",
            }),
            next,
          };
        return {
          node: createEditorNode(schema, "media_block", {
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
          // A colgroup may start on the opening line. Retain it when an edit
          // invalidates the preserved source, including unknown column attrs.
          const tableBody = single ? body : trimmed.slice(tag.length) + "\n" + body;
          const table = parseTable(tableBody, attrs, notionInline, !extensions);
          return { node: table || opaque(from, next), next };
        }
        let content = single
          ? kids(parseNotionMarkdown(body, allowObject, extensions, version))
          : inside(from + 1, close, level + 1);
        if (tag.tag === "columns") {
          if (
            content.length < 2 ||
            content.some((child) => child.type !== schema.nodes["structure.column"])
          )
            return { node: opaque(from, next), next };
          return { node: schema.nodes["block.columns"].create(attrs, content), next };
        }
        if (tag.tag === "column")
          return {
            node: schema.nodes["structure.column"].create(attrs, nonempty(content)),
            next,
          };
        if (tag.tag === "callout")
          return {
            node: schema.nodes["block.callout"].create({ ...attrs, icon: tag.attrs.icon ?? "💡" }, nonempty(content)),
            next,
          };
        if (tag.tag.startsWith("synced_block"))
          return {
            node: schema.nodes["block.synced_block"].create({
                ...attrs,
                url: tag.attrs.url || "",
                reference: tag.tag.endsWith("reference"),
              }, nonempty(content)),
            next,
          };
        const summary = single
          ? /^\s*<summary>([\s\S]*?)<\/summary>/.exec(body)
          : /^\s*<summary>(.*?)<\/summary>\s*$/.exec(lines[from + 1] || "");
        if (!summary) return { node: opaque(from, next), next };
        content = single
          ? kids(parseNotionMarkdown(body.slice(summary[0].length), allowObject, extensions, version))
          : inside(from + 2, close, level + 1);
        return {
          node: schema.nodes["block.toggle"].create(attrs, [
            paragraph(summary[1]),
            ...content,
          ]),
          next,
        };
      }
      // Inline tags such as mentions/spans are paragraphs, not raw HTML blocks.
      if (!tag.tag.startsWith("mention-") && !["span", "br", ...(version === "v2" ? ["b", "i", "s", "u", "mention", "date", "link-preview"] : [])].includes(tag.tag))
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
            schema.nodes["structure.table_cell"].create(null, paragraph(tokens[i + 1]?.content || "")),
          );
        if (tokens[i].type === "tr_close" && cells.length)
          rows.push(schema.nodes["structure.table_row"].create(null, cells));
      }
      if (rows.length)
        return {
          node: schema.nodes["block.table"].create({ nfmAttrs: { "header-row": "true" } }, rows),
          next: finish,
        };
    }
    const parsed = lineAttributes(text);
    const line = parsed.text;
    if (!extensions && line.trimStart().startsWith("![")) {
      const tokens = md.parseInline(line.trim(), { mediaImage: true })[0]?.children ?? [];
      if (tokens.length === 1 && tokens[0].type === "image") {
        if (tokens[0].attrGet("title")) return { node: opaque(from, from + 1), next: from + 1 };
        const image = parseInline(tokens)[0];
        return { node: createEditorNode(schema, "image_block", {
          ...parsed.attrs, syntaxForm: "notion", src: image.attrs.src, caption: image.attrs.alt || "",
        }), next: from + 1 };
      }
    }
    const list = /^\s*(?:([-+*]) |(\d+)\. )(.*)$/.exec(line);
    if (list) {
      const checkbox = /^\[([ xX])\](?: |$)/.exec(list[3]);
      if (!extensions && checkbox && list[2])
        return { node: opaque(from, from + 1), next: from + 1 };
      return {
        node: createEditorNode(schema, checkbox ? "task_list_item" : list[2] ? "numbered_list_item" : "bullet_list_item", {
            ...parsed.attrs,
            checked: checkbox ? checkbox[1].toLowerCase() === "x" : null,
          }, paragraph(checkbox ? list[3].slice(checkbox[0].length) : list[3])),
        next: from + 1,
        list: list[2] ? "ordered_list" : "bullet_list",
        order: Number(list[2]) || 1,
      };
    }
    if (/^\s*---\s*$/.test(line))
      return {
        node: schema.nodes["block.divider"].create(parsed.attrs),
        next: from + 1,
      };
    const heading = /^(#{1,6})(?:[ \t]+|$)(.*)$/.exec(line);
    if (heading)
      return {
        node: createEditorNode(schema, "heading", { ...parsed.attrs, level: Math.min(extensions?.headingLimit ?? 4, heading[1].length) }, notionInline(heading[2])),
        next: from + 1,
      };
    if (/^> ?/.test(line))
      return {
        node: schema.nodes["block.quote"].create(parsed.attrs, paragraph(line.replace(/^> ?/, ""))),
        next: from + 1,
      };
    const node = paragraph(line, parsed.attrs);
    // Notdown also supports real inline images, but a standalone Markdown image
    // is a media block. Keep its source spelling; no import/vault rewrite needed.
    if (line.trimStart().startsWith("![") && node.childCount === 1 && isEditorKind(node.firstChild, "image") && !node.firstChild.marks.length) {
      const image = node.firstChild;
      return { node: createEditorNode(schema, "image_block", {
        ...parsed.attrs, syntaxForm: "notion", src: image.attrs.src, caption: image.attrs.alt || "",
        title: image.attrs.title || "", nfmAttrs: {}, markdownAttrs: { ...node.attrs.nfmAttrs, ...image.attrs.markdownAttrs },
      }), next: from + 1 };
    }
    return { node, next: from + 1 };
  }
  function sequence(from: number, end: number, level: number): PMNode[] {
    const result: PMNode[] = [];
    const siblingSource = lines.slice(from, end).map(line => line.startsWith("\t".repeat(level)) ? line.slice(level) : line).join("\n");
    const prepared = version === "v2" ? v2MarkdownBlocks(siblingSource, extensions, allowObject, nesting) : new Map<number, { node: PMNode; lines: number }>();
    for (const [at, value] of extensions?.blocks(siblingSource, from === 0 && level === 0) ?? []) if (!prepared.has(at)) prepared.set(at, value);
    for (let cursor = from; cursor < end;) {
      if (!lines[cursor].trim()) {
        cursor++;
        continue;
      }
      if (depthAt(cursor) < level) break;
      const start = cursor;
      if (depthAt(cursor) > level) {
        cursor = childrenEnd(cursor, end, level);
        result.push(withSource(opaque(start, cursor), start, cursor));
        continue;
      }
      const item = one(cursor, end, level, prepared?.get(cursor - from));
      let node = item.node;
      cursor = Math.max(cursor + 1, item.next);
      let nextContent = cursor;
      while (nextContent < end && !lines[nextContent].trim()) nextContent++;
      if (nextContent < end && depthAt(nextContent) > level) {
        const finish = childrenEnd(nextContent, end, level);
        // Ordinary headings cannot acquire children or silently become toggles.
        if (!extensions && isEditorKind(node, "heading") && !node.attrs.toggle) {
          result.push(withSource(opaque(start, finish), start, finish));
          cursor = finish;
          continue;
        }
        const nested = sequence(nextContent, finish, level + 1);
        if (["paragraph", "heading"].includes(editorKind(node))) {
          if (isEditorKind(node, "heading"))
            node = createEditorNode(schema, "heading",
              { ...node.attrs, toggle: true },
              node.content,
            );
          node = schema.nodes["structure.nested_block"].create(null, [
            withSource(node, start, item.next),
            ...nested,
          ]);
        } else if (
          ["bullet_list_item", "numbered_list_item", "task_list_item", "blockquote", "callout", "toggle_block"].includes(
            editorKind(node),
          )
        )
          node = node.copy(
            node.content.append(
              schema.nodes["doc"].create(null, nonempty(nested)).content,
            ),
          );
        else node = opaque(start, finish);
        cursor = finish;
      }
      // A toggle keeps its interactive container even before its first child is
      // added, including after saving and reopening a newly typed heading.
      if (isEditorKind(node, "heading") && node.attrs.toggle)
        node = schema.nodes["structure.nested_block"].create(null, node);
      node = withSource(node, start, cursor);
      if (item.list) {
        const previous = result.at(-1);
        const consecutive =
          isEditorKind(previous, item.list) &&
          (item.list !== "ordered_list" ||
            Number(previous.attrs.order) + previous.childCount === item.order);
        if (consecutive) {
          const combined = previous!.copy(
            previous!.content.append(
              createEditorNode(schema, item.list, null, node).content,
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
              createEditorNode(schema, item.list, item.list === "ordered_list" ? { order: item.order } : null, node),
              start,
              cursor,
            ),
          );
      } else result.push(node);
    }
    return result;
  }
  let nodes = sequence(0, lines.length, version === "v2" ? depthAt(Math.max(0, lines.findIndex(line => line.trim()))) : 0);
  // A stray column or any future structural element must remain recoverable.
  nodes = nodes.map((node) =>
    node.type.isInGroup("block")
      ? node
      : createEditorNode(schema, "opaque_block", { raw: node.attrs.source || source }),
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
  const doc = schema.nodes["doc"].create({
      source,
      sourceGaps: gaps,
      sourceSuffix: source.slice(previousEnd),
      sourceFormat: "notion-markdown",
      sourceSyntax: version === "v2" ? { notionVersion: "v2" } : null,
      sourceNewline: source.match(/\r\n|\n|\r/)?.[0] || "\n",
    }, nonempty(nodes));
  return doc.type.create(
    { ...doc.attrs, sourceFingerprint: editorFingerprint(doc) },
    doc.content,
  );
}

function parseTable(
  body: string,
  attrs: Record<string, unknown>,
  inline = notionInline,
  strict = true,
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
      if (strict && cell.tag !== "td") return null;
      const finish = content.indexOf(`</${cell.tag}>`, cell.length);
      if (finish < 0) return null;
      cells.push(
        schema.nodes["structure.table_cell"].create({ nfmAttrs: cell.attrs, header: cell.tag === "th" }, schema.nodes["block.paragraph"].create(null, inline(content.slice(cell.length, finish).trim()))),
      );
      content = content.slice(finish + cell.tag.length + 3).trim();
    }
    if (!cells.length) return null;
    rows.push(schema.nodes["structure.table_row"].create({ nfmAttrs: row.attrs }, cells));
    rest = rest.slice(end + 5).trim();
  }
  return rows.length
    ? schema.nodes["block.table"].create({ ...attrs, widths, columnAttrs }, rows)
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
  if (isEditorKind(node, "heading") && node.attrs.toggle)
    attrs.toggle = "true";
  return Object.keys(attrs).length ? ` {${attributesXml(attrs).trim()}}` : "";
}
function blocks(nodes: PMNode[]): string {
  return nodes.map(node => notionBlockMarkdown(node)).join("\n\n");
}
export function notionBlockMarkdown(node: PMNode, write: (node: PMNode) => string = notionBlockMarkdown, inline: (node: PMNode) => string = node => inlineMarkdown(node, true)): string {
  const official = writeOfficialNotionBlock(node, write);
  if (official !== undefined) return official;
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
  switch (editorKind(node)) {
    case "paragraph":
      return node.content.size
        ? inline(node) + suffix(node)
        : `<empty-block${attributesXml(attrs)}/>`;
    case "heading":
      return `${"#".repeat(Math.min(4, node.attrs.level))} ${inline(node)}${suffix(node)}`;
    case "nested_block": {
      let head = node.firstChild!;
      if (isEditorKind(head, "heading"))
        head = createEditorNode(schema, "heading", { ...head.attrs, toggle: true }, head.content);
      return `${write(head)}${node.childCount > 1 ? `\n${indent(blocks(kids(node).slice(1)))}` : ""}`;
    }
    case "bullet_list":
    case "ordered_list":
      return kids(node)
        .map((item, index) => {
          const marker =
            isEditorKind(node, "ordered_list")
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
        node.firstChild?.type === schema.nodes["block.paragraph"]
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
    case "executable_chunk":
      return rChunkMarkdown(node);
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
    case "child_page": {
      const tag = node.type.name === "block.link_to_page" ? "page-link" : "page";
      return `<${tag}${attributesXml({ ...attrs, url: node.attrs.url || pageUrl(node.attrs.target) })}>${escapeXml(node.attrs.label || node.attrs.target)}</${tag}>`;
    }
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
  assertOfficialNotionStructure(doc);
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

/** Pasted/programmatically created nodes must obey the same boundary as source.
 * Never flatten an unsupported inline into a different block or silently drop it. */
function assertOfficialNotionStructure(doc: PMNode): void {
  const marks = new Set(["em", "strong", "strike", "code", "link", "underline", "color"]);
  const visit = (node: PMNode, parent?: PMNode, grandparent?: PMNode, index = 0, parentIndex = 0) => {
    const image = isEditorKind(node, "image");
    const inlineImage = image && (!isEditorKind(parent, "paragraph") || parent.childCount !== 1 ||
      isEditorKind(grandparent, "table_cell") || parentIndex === 0 &&
      ["bullet_list_item", "numbered_list_item", "task_list_item", "blockquote", "toggle_block"].includes(editorKind(grandparent) || ""));
    const plainHeadingChildren = isEditorKind(node, "nested_block") &&
      isEditorKind(node.firstChild, "heading") && !node.firstChild.attrs.toggle;
    const orderedTask = isEditorKind(node, "ordered_list") && kids(node).some(child => child.attrs.checked !== null);
    if (inlineImage || (image || isEditorKind(node, "image_block")) && (node.marks.length || node.attrs.title || Object.keys(node.attrs.markdownAttrs || {}).length) ||
      plainHeadingChildren || orderedTask || node.marks.some(mark => !marks.has(editorKind(mark)) ||
        isEditorKind(mark, "color") && (mark.attrs.bg_color || Object.hasOwn(mark.attrs.nfmAttrs || {}, "bg_color"))))
      throw new Error("This structure is not documented in Notion-flavored Markdown. Preserve its source or use Notdown.");
    node.forEach((child, _offset, childIndex) => visit(child, node, parent, childIndex, index));
  };
  visit(doc);
}
