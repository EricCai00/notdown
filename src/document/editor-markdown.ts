import { createEditorNode, editorKind, isEditorKind } from "./node-identity";
import { nodeReference, referenceHref } from "./internal-reference";
import { notionBlockMarkdown } from "./notion-markdown";
import { type Mark, type Node as EditorNode } from "prosemirror-model";
import type Token from "markdown-it/lib/token.mjs";
import { parseMarkdownTokens } from "./markdown.js";
import { editorSchema as schema } from "./editor-schema.js";
import {
  attributesXml,
  escapeXml,
  localPageTarget,
  pageUrl,
} from "./notion-syntax.js";
import { writeAttributes } from "../markdown-engine/attributes.js";
import { originalLink } from "../markdown-engine/document-options";
import { rChunkMarkdown } from "../markdown-engine/rmarkdown";
import { rExpressionSource } from "./r-expression";

/** Formatting metadata must not make an otherwise unchanged node look edited. */
const fingerprints = new WeakMap<EditorNode, string>();
export function editorFingerprint(node: EditorNode): string {
  const cached = fingerprints.get(node);
  if (cached !== undefined) return cached;
  const metadata = JSON.stringify({
    type: node.type.name,
    attrs: Object.fromEntries(
      Object.entries(node.attrs).filter(([key]) => !key.startsWith("source")
        && !(isEditorKind(node, "example_list_item") && ["number", "referenceId"].includes(key))
        && !(isEditorKind(node, "example_list") && key === "start")
        && !(node.attrs.kind === "example-reference" && key === "label")),
    ),
    marks: node.marks.map((mark) => mark.toJSON()),
    ...(node.isText ? { text: node.text } : {}),
  });
  // ProseMirror nodes are immutable: unchanged subtrees reuse their exact fingerprint.
  const value = node.isText
    ? metadata
    : metadata.slice(0, -1) +
      ',"content":[' +
      children(node).map(editorFingerprint).join(",") +
      "]}";
  fingerprints.set(node, value);
  return value;
}

function children(node: EditorNode): EditorNode[] {
  const result: EditorNode[] = [];
  node.forEach((child) => result.push(child));
  return result;
}

function offsetsFor(source: string): number[] {
  const result = [0];
  for (const match of source.matchAll(/\r\n|\n|\r/g))
    result.push(match.index! + match[0].length);
  return result;
}

export function parseInline(tokens: Token[]): EditorNode[] {
  const result: EditorNode[] = [];
  let marks: readonly Mark[] = [];
  const markStack: (readonly Mark[])[] = [];
  const markNames: Record<string, string> = {
    em: "em",
    strong: "strong",
    s: "strike",
    sub: "subscript",
    sup: "superscript",
    abbr: "abbreviation",
    link: "link",
    highlight: "highlight",
    critic: "critic",
  };
  for (const token of tokens) {
    if (token.type === "source_inline") {
      let combined = token.meta.node.marks;
      for (const mark of marks) combined = mark.addToSet(combined);
      result.push(token.meta.node.mark(combined));
      continue;
    }
    const markName = markNames[token.type.replace(/_(open|close)$/, "")];
    if (markName && token.nesting === 1) {
      markStack.push(marks);
      const attrs =
        markName === "link"
          ? {
              href: token.attrGet("href") ?? "",
              title: token.attrGet("title"),
              markdownAttrs: token.meta?.markdownAttrs || {},
            }
          : markName === "critic"
            ? token.meta
            : markName === "abbreviation"
              ? { title: token.attrGet("title") || "" }
              : undefined;
      marks = schema.marks[markName].create(attrs).addToSet(marks);
    } else if (markName && token.nesting === -1) {
      marks = markStack.pop() ?? schema.marks[markName].removeFromSet(marks);
    } else if (token.type === "footnote_reference") {
      result.push(
        schema.nodes["inline.footnote"].create({ label: token.meta.label }, null, marks),
      );
    } else if (token.type === "nfm_span") {
      const attrs = token.meta;
      let extra = marks;
      // Style channels live in their own marks. Duplicating them on a native
      // span would restore stale colors/underline after a menu edit or clear.
      const nativeAttrs = { ...attrs };
      delete nativeAttrs.color;
      delete nativeAttrs.bg_color;
      delete nativeAttrs.underline;
      if (/(?:^|\s)smallcaps(?:\s|$)/.test(attrs.class || "")) extra = schema.marks.small_caps.create({ attributes: nativeAttrs, syntaxForm: "html" }).addToSet(extra);
      else if (attrs.class || attrs.id || attrs.lang) extra = schema.marks.native_span.create({ attributes: nativeAttrs, syntaxForm: "html" }).addToSet(extra);
      if (attrs.underline === "true")
        extra = schema.marks.underline.create().addToSet(extra);
      if (attrs.color || attrs.bg_color || !extra.some(m => ["native_span", "small_caps"].includes(editorKind(m))) && Object.keys(attrs).some((key) => key !== "underline"))
        extra = schema.marks.color
          .create({ color: attrs.color || "", bg_color: attrs.bg_color || "", nfmAttrs: attrs })
          .addToSet(extra);
      for (const child of parseInline(token.children ?? [])) {
        let combined = child.marks;
        for (const mark of extra) combined = mark.addToSet(combined);
        result.push(child.mark(combined));
      }
    } else if (token.type === "nfm_mention") {
      result.push(
        token.meta.kind === "link"
          ? schema.nodes["inline.link"].create({ url: token.meta.attrs.url || "", label: token.content, nfmAttrs: token.meta.attrs }, null, marks)
          : token.meta.kind === "page"
          ? schema.nodes["inline.internal_link"].create({
                target:
                  localPageTarget(token.meta.attrs.url || "") ??
                  token.meta.attrs.url ??
                  "",
                syntaxForm: "mention",
                labelMode: "auto",
                label: token.content,
                url: token.meta.attrs.url || "",
                nfmAttrs: token.meta.attrs,
              }, null, marks)
          : createEditorNode(schema, "mention", {
                kind: token.meta.kind,
                label: token.content,
                nfmAttrs: token.meta.attrs,
              }, null, marks),
      );
    } else if (token.type === "nfm_math") {
      result.push(
        schema.nodes["inline.inline_math"].create({ value: token.content }, null, marks),
      );
    } else if (token.type === "nfm_citation") {
      result.push(
        schema.nodes["inline.citation"].create({ url: token.content }, null, marks),
      );
    } else if (
      (token.type === "text" || token.type === "emoji") &&
      token.content
    ) {
      result.push(schema.text(token.content, marks));
    } else if (token.type === "code_inline") {
      if (token.content)
        result.push(
          schema.text(
            token.content,
            schema.marks.code.create({ markdownAttrs: token.meta?.markdownAttrs || {} }).addToSet(marks),
          ),
        );
    } else if (token.type === "softbreak") {
      result.push(schema.text("\n", marks));
    } else if (token.type === "hardbreak") {
      result.push(schema.nodes["character.line_break"].create(null, null, marks));
    } else if (token.type === "wiki_link") {
      result.push(
        schema.nodes["inline.internal_link"].create({ target: token.meta.target, label: token.content, syntaxForm: token.meta.syntaxForm || "wiki", labelMode: token.meta.explicitLabel ? "custom" : "auto" }, null, marks),
      );
    } else if (token.type === "image") {
      const altText = (items: Token[]): string =>
        items
          .map((item) =>
            item.children
              ? altText(item.children)
              : item.type === "softbreak" || item.type === "hardbreak"
                ? " "
                : item.nesting === 0
                  ? item.content
                  : "",
          )
          .join("");
      result.push(
        schema.nodes["inline.image"].create({
            src: token.attrGet("src") ?? "",
            alt: token.children ? altText(token.children) : token.content,
            title: token.attrGet("title"),
            layoutEnabled: token.meta?.notdownImageLayout === true,
            markdownAttrs: token.meta?.markdownAttrs || {},
          }, null, marks),
      );
    } else if (
      token.type !== "task_checkbox" &&
      token.nesting === 0 &&
      token.content
    ) {
      // Unknown inline tokens remain text, never injected HTML.
      result.push(schema.text(token.content, marks));
    }
  }
  return result;
}

interface BlockParser {
  parse(tokens: Token[], start?: number, end?: number): EditorNode[];
  range(token: Token): { start: number; end: number; source: string };
}

function blockParser(source: string): BlockParser {
  const offsets = offsetsFor(source);
  const range = (token: Token) => {
    const firstLine = token.meta?.sourceLine
      ? token.meta.sourceLine - 1
      : (token.map?.[0] ?? 0);
    const lineCount = token.map ? token.map[1] - token.map[0] : 1;
    const start = offsets[firstLine] ?? 0;
    const mappedEnd = offsets[firstLine + lineCount] ?? source.length;
    const raw = source.slice(start, mappedEnd).replace(/[\r\n]+$/, "");
    return { start, end: start + raw.length, source: raw };
  };
  const matchingClose = (tokens: Token[], start: number, end: number) => {
    let depth = 1;
    for (let index = start + 1; index < end; index++) {
      depth += tokens[index].nesting;
      if (depth === 0) return index;
    }
    return end;
  };
  const parse = (
    tokens: Token[],
    start = 0,
    end = tokens.length,
    ordered = false,
  ): EditorNode[] => {
    const result: EditorNode[] = [];
    for (let index = start; index < end; index++) {
      const token = tokens[index];
      if (token.nesting === -1 || token.type === "inline") continue;
      const close =
        token.nesting === 1 ? matchingClose(tokens, index, end) : index;
      const raw = range(token).source;
      let node: EditorNode;
      if (token.type === "source_node") {
        node = token.meta.node;
      } else if (
        token.type === "paragraph_open" ||
        token.type === "heading_open"
      ) {
        if (
          token.type === "paragraph_open" &&
          !token.meta?.gfm &&
          !tokens
            .slice(index + 1, close)
            .some((t) =>
              t.children?.some((child) => child.type === "source_inline") ||
              (t.children?.[0]?.type === "link_open" &&
                t.children[0].markup === "autolink"),
            ) &&
          /^ {0,3}(?:<\/?[a-zA-Z!]|<\?|:::)/.test(raw)
        ) {
          node = createEditorNode(schema, "opaque_block", { raw });
        } else {
          const inline = tokens
            .slice(index + 1, close)
            .flatMap((item) =>
              item.type === "inline" ? parseInline(item.children ?? []) : [],
            );
          node =
            token.type === "heading_open"
              ? createEditorNode(schema, "heading", { level: Number(token.tag.slice(1)) }, inline)
              : schema.nodes["block.paragraph"].create(null, inline);
        }
      } else if (
        token.type === "bullet_list_open" ||
        token.type === "ordered_list_open"
      ) {
        const tight = !tokens.slice(index + 1, close).some(item =>
          item.type === "paragraph_open" && item.level === token.level + 2 && !item.hidden);
        node = createEditorNode(schema, token.type === "bullet_list_open" ? "bullet_list" : "ordered_list", token.type === "ordered_list_open"
            ? { order: Number(token.attrGet("start") ?? 1), ...(token.meta?.gfm ? { tight } : {}) }
            : token.meta?.gfm ? { tight } : null, parse(tokens, index + 1, close, token.type === "ordered_list_open"));
      } else if (token.type === "list_item_open") {
        const checkbox = tokens[index + 2]?.children?.find(
          (item) => item.type === "task_checkbox",
        );
        const content = parse(tokens, index + 1, close);
        if (content[0]?.type !== schema.nodes["block.paragraph"])
          content.unshift(schema.nodes["block.paragraph"].create());
        node = createEditorNode(schema, checkbox ? "task_list_item" : ordered ? "numbered_list_item" : "bullet_list_item", { checked: checkbox ? Boolean(checkbox.meta.checked) : null }, content);
      } else if (token.type === "blockquote_open") {
        const content = parse(tokens, index + 1, close);
        node = schema.nodes["block.quote"].create(null, content.length ? content : [schema.nodes["block.paragraph"].create()]);
      } else if (token.type === "fence" || token.type === "code_block") {
        const text = token.content.replace(/\n$/, "");
        node = schema.nodes["block.code_block"].create({ params: token.info ?? "" }, text ? schema.text(text) : undefined);
      } else if (token.type === "hr") {
        node = schema.nodes["block.divider"].create();
      } else if (token.type === "child_page") {
        node = createEditorNode(schema, "child_page", { target: token.meta.target });
      } else if (token.type === "nested_block") {
        const nested = parse(token.meta.blocks);
        const head = token.meta.head ? parse(token.meta.head) : null;
        const content = head
          ? [
              ...(head.length ? head : [schema.nodes["block.paragraph"].create()]),
              ...(nested.length ? nested : [schema.nodes["block.paragraph"].create()]),
            ]
          : nested;
        node =
          content.length &&
          ["paragraph", "heading"].includes(editorKind(content[0]))
            ? schema.nodes["structure.nested_block"].create(null, content)
            : createEditorNode(schema, "opaque_block", { raw });
      } else if (["dl_open", "dd_open", "dt_open"].includes(token.type)) {
        const type = {
          dl_open: "definition_list",
          dd_open: "definition_description",
          dt_open: "definition_term",
        }[token.type]!;
        let content =
          token.type === "dt_open"
            ? tokens
                .slice(index + 1, close)
                .flatMap((t) =>
                  t.type === "inline" ? parseInline(t.children ?? []) : [],
                )
            : parse(tokens, index + 1, close);
        if (token.type === "dl_open") {
          const groups: EditorNode[][] = [];
          for (const child of content) {
            if (isEditorKind(child, "definition_term")) groups.push([]);
            groups.at(-1)!.push(child);
          }
          content = groups.map(children => createEditorNode(schema, "definition_list_item", null, children));
        }
        const attrs = token.type === "dd_open" ? {
          tight: token.meta?.definitionTight ?? null,
          marker: token.meta?.definitionMarker ?? ":",
        } : null;
        node = createEditorNode(schema, type, attrs, content.length
            ? content
            : token.type === "dt_open"
              ? []
              : [schema.nodes["block.paragraph"].create()]);
      } else if (token.type === "columns") {
        const column = (items: Token[]) => {
          const content = parse(items);
          return schema.nodes["structure.column"].create(null, content.length ? content : [schema.nodes["block.paragraph"].create()]);
        };
        node = schema.nodes["block.columns"].create(null, [
          column(token.meta.left),
          column(token.meta.right),
        ]);
      } else {
        node = createEditorNode(schema, "opaque_block", {
          raw:
            token.type === "extension_literal"
              ? token.content.replace(/[\r\n]+$/, "")
              : raw,
        });
      }
      if (token.meta?.markdownAttrs)
        node = node.type.create(
          { ...node.attrs, markdownAttrs: token.meta.markdownAttrs },
          node.content,
          node.marks,
        );
      if (token.level === 0 && token.map) {
        const original = range(token);
        node = node.type.create(
          {
            ...node.attrs,
            source: original.source,
            sourceStart: original.start,
            sourceEnd: original.end,
            sourceFingerprint: editorFingerprint(node),
          },
          node.content,
          node.marks,
        );
      }
      result.push(node);
      index = close;
    }
    return result;
  };
  return { parse, range };
}

export function parseEditorMarkdown(
  source: string,
  suppliedTokens?: Token[],
): EditorNode {
  const parser = blockParser(source);
  const tokens = suppliedTokens ?? parseMarkdownTokens(source);
  let nodes = parser.parse(tokens);
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
  if (!nodes.length) nodes.push(schema.nodes["block.paragraph"].create());
  const doc = schema.nodes["doc"].create({
      source,
      sourceGaps: gaps,
      sourceHidden: hiddenDefinitions(source, tokens),
      sourceSuffix: source.slice(previousEnd),
      sourceNewline: source.match(/\r\n|\n|\r/)?.[0] ?? "\n",
    }, nodes);
  return doc.type.create(
    { ...doc.attrs, sourceFingerprint: editorFingerprint(doc) },
    doc.content,
  );
}

/** Reference definitions disappear from markdown-it's visible token tree. Find
 * them only in uncovered source lines; code, tables and unknown syntax are
 * covered first and are never searched or rewritten as reference definitions. */
function hiddenDefinitions(
  source: string,
  tokens: Token[],
): { ownerKey: number; source: string }[] {
  const offsets = offsetsFor(source);
  const lines = source.split(/\r\n|\n|\r/);
  const covered = new Set<number>();
  const leafTypes = new Set([
    "paragraph_open",
    "heading_open",
    "table_open",
    "fence",
    "code_block",
    "hr",
    "child_page",
    "extension_literal",
  ]);
  const walk = (items: Token[]): void => {
    for (const token of items) {
      const first = token.meta?.sourceLine
        ? token.meta.sourceLine - 1
        : token.map?.[0];
      if (first === undefined || !token.map) continue;
      if (leafTypes.has(token.type)) {
        for (
          let line = first;
          line < first + token.map[1] - token.map[0];
          line++
        )
          covered.add(line);
      } else if (token.type === "nested_block") {
        walk(token.meta.head ?? []);
        walk(token.meta.blocks);
        covered.add(first);
        if (token.meta.separatorLine !== undefined)
          covered.add(token.meta.separatorLine);
        covered.add(first + token.map[1] - token.map[0] - 1);
      } else if (token.type === "columns") {
        walk(token.meta.left);
        walk(token.meta.right);
        // The parser has validated these delimiters. Fenced content was already
        // marked as covered above, so literal directive-looking code is safe.
        for (
          let line = first;
          line < first + token.map[1] - token.map[0];
          line++
        ) {
          if (/^ {0,3}:::(?:columns|column)?[ \t]*$/.test(lines[line] ?? ""))
            covered.add(line);
        }
      }
    }
  };
  walk(tokens);
  const roots = tokens.filter(
    (token) => token.level === 0 && token.map && token.nesting !== -1,
  );
  const hidden: { ownerKey: number; source: string }[] = [];
  roots.forEach((root, ownerKey) => {
    let cursor = root.map![0];
    while (cursor < root.map![1]) {
      if (covered.has(cursor)) {
        cursor++;
        continue;
      }
      const start = cursor;
      while (cursor < root.map![1] && !covered.has(cursor)) cursor++;
      const raw = source.slice(
        offsets[start],
        offsets[cursor] ?? source.length,
      );
      const unquoted = raw.replace(/^[ \t]*(?:>[ \t]?)+/gm, "");
      const nonempty = unquoted
        .split(/\r\n|\n|\r/)
        .filter((line) => line.trim());
      if (!nonempty.length) continue;
      const indentation = Math.min(
        ...nonempty.map((line) => line.match(/^[ \t]*/)?.[0].length ?? 0),
      );
      const candidate = unquoted
        .replace(new RegExp(`^[ \\t]{0,${indentation}}`, "gm"), "")
        .replace(/^[\r\n]+|[\r\n]+$/g, "");
      if (candidate.trim() && parseMarkdownTokens(candidate).length === 0)
        hidden.push({ ownerKey, source: candidate });
    }
  });
  return hidden;
}

function escapeText(value: string, legacyEscapes = false): string {
  return value
    .replace(/[\\`*_[\]<>~]/g, (char) =>
      legacyEscapes && "<>~".includes(char)
        ? `&#${char.charCodeAt(0)};`
        : "\\" + char,
    )
    .replace(/^(\s*)(#{1,6})(?=\s|$)/gm, "$1\\$2")
    .replace(/^(\s*)([-+])(?=\s)/gm, "$1\\$2")
    .replace(/^(\s*\d+)([.)])(?=\s)/gm, "$1\\$2")
    .replace(/^(\s*)([-=])(?=[-=\s]*$)/gm, "$1\\$2")
    .replace(/!\[/g, "\\![")
    .replace(/^(\s*):::(nest|children|endnest)(?=[ \t]*$)/gm, "$1\\:::$2");
}

function destination(value: string): string {
  return /[\s()<>]/.test(value)
    ? `<${value
        .replace(/</g, "%3C")
        .replace(/>/g, "%3E")
        .replace(/[\r\n]/g, "")}>`
    : value;
}

function codeSpan(value: string): string {
  const longest = Math.max(
    0,
    ...[...value.matchAll(/`+/g)].map((match) => match[0].length),
  );
  const delimiter = "`".repeat(longest + 1);
  const pad =
    /^`|`$/.test(value) || (/^ .* $/.test(value) && /\S/.test(value))
      ? " "
      : "";
  return `${delimiter}${pad}${value}${pad}${delimiter}`;
}

export function inlineMarkdown(
  node: EditorNode,
  notion = false,
  escapeMath = false,
  pageMentions = false,
  escapeSuperscript = false,
  legacyEscapes = false,
  options: { mmdAttributes?: boolean; literalExtensions?: boolean; htmlMarksFirst?: boolean; notionBreaks?: boolean } = {},
): string {
  let result = "";
  let active: Mark[] = [];
  const mmdAttrs = (attrs: Record<string, string>) =>
    Object.entries(attrs || {})
      .filter(([key]) => !key.startsWith("_"))
      .map(([key, value]) => ` ${key}="${value.replace(/"/g, "&quot;")}"`)
      .join("");
  const open = (mark: Mark) =>
    isEditorKind(mark, "native_span") || isEditorKind(mark, "small_caps")
      ? (notion || mark.attrs.syntaxForm === "html" ? `<span${attributesXml(mark.attrs.attributes)}>` : "[")
      : isEditorKind(mark, "critic")
      ? {
          addition: "{++",
          deletion: "{--",
          highlight: "{==",
          comment: "{>>",
          substitution: "{~~" + mark.attrs.old + "~>",
        }[mark.attrs.kind as string] || ""
      : isEditorKind(mark, "highlight")
        ? "=="
        : isEditorKind(mark, "underline")
          ? '<span underline="true">'
          : isEditorKind(mark, "color")
            ? `<span${attributesXml({ ...mark.attrs.nfmAttrs, color: mark.attrs.color, bg_color: mark.attrs.bg_color })}>`
            : ({
                em: "*",
                strong: "**",
                strike: "~~",
                subscript: "~",
                superscript: "^",
                link: "[",
              }[editorKind(mark)] ?? "");
  const close = (mark: Mark) =>
    isEditorKind(mark, "native_span") || isEditorKind(mark, "small_caps")
      ? (notion || mark.attrs.syntaxForm === "html" ? "</span>" : "]" + writeAttributes(mark.attrs.attributes).trimStart())
      : isEditorKind(mark, "critic")
      ? {
          addition: "++}",
          deletion: "--}",
          highlight: "==}",
          comment: "<<}",
          substitution: "~~}",
        }[mark.attrs.kind as string] || ""
      : isEditorKind(mark, "link")
        ? `](${destination(originalLink(mark.attrs.href, mark.attrs.markdownAttrs))}${
            mark.attrs.title ||
            (options.mmdAttributes &&
              Object.keys(mark.attrs.markdownAttrs || {}).length)
              ? ` "${String(mark.attrs.title || "")
                  .replace(/\\/g, "\\\\")
                  .replace(/"/g, '\\"')}"`
              : ""
          }${options.mmdAttributes ? mmdAttrs(mark.attrs.markdownAttrs) : ""})${options.mmdAttributes ? "" : writeAttributes(mark.attrs.markdownAttrs)}`
        : ["underline", "color"].includes(editorKind(mark))
          ? "</span>"
          : open(mark);
  for (const child of children(node)) {
    const code = child.marks.some((mark) => isEditorKind(mark, "code"));
    const marks = child.marks.filter((mark) => !isEditorKind(mark, "code"));
    // Keep XML wrappers outside delimiters; spaces inside tags invalidate ~sub~.
    if (options.htmlMarksFirst) {
      const wrapper = (mark: Mark) => ["color", "underline", "native_span", "small_caps"].includes(editorKind(mark)) ? 0 : 1;
      marks.sort((a, b) => wrapper(a) - wrapper(b));
    }
    let common = 0;
    while (
      common < active.length &&
      common < marks.length &&
      active[common].eq(marks[common])
    )
      common++;
    for (let index = active.length - 1; index >= common; index--)
      result += close(active[index]);
    for (let index = common; index < marks.length; index++)
      result += open(marks[index]);
    active = [...marks];
    if (child.isText)
      result += code
        ? codeSpan(child.text ?? "") + writeAttributes(child.marks.find(m => isEditorKind(m, "code"))?.attrs.markdownAttrs).trimStart()
        : notion
          ? escapeText(child.text ?? "")
              .replace(/&/g, "&amp;")
              .replace(/[$|{}^]/g, "\\$&")
              .replace(/\r\n|\n|\r/g, "<br>")
          : escapeText(child.text ?? "", legacyEscapes)
              .replace(
                options.literalExtensions ? /[{}=%]/g : /(?!)/g,
                (char) => "&#" + char.charCodeAt(0) + ";",
              )
              .replace(
                escapeMath ? /\$/g : /(?!)/g,
                legacyEscapes ? "&#36;" : "\\$&",
              )
              .replace(
                escapeSuperscript ? /\^/g : /(?!)/g,
                legacyEscapes ? "&#94;" : "\\$&",
              )
              .replace(
                marks.some((mark) =>
                  ["subscript", "superscript"].includes(editorKind(mark)),
                )
                  ? / /g
                  : /(?!)/g,
                "\\ ",
              );
    else if ((isEditorKind(child, "executable_inline"))) result += rExpressionSource(child);
    else if (["html_inline", "syntax_inline"].includes(editorKind(child))) {
      // A paragraph-leading reference must not reopen as an example definition.
      if (child.attrs.kind === "example-reference") result = result.replace(/(^|\n)( {0,3})\($/, "$1$2\\(");
      result += child.attrs.raw;
    }
    else if (isEditorKind(child, "footnote_reference"))
      result += "[^" + child.attrs.label + "]";
    else if (isEditorKind(child, "hard_break"))
      result += notion || options.notionBreaks ? "<br>" : "  \n";
    else if (isEditorKind(child, "page_link")) {
      const target = String(child.attrs.target).replace(/[\[\]\r\n]/g, "");
      const label = String(child.attrs.label || target).replace(
        /[\[\]\r\n]/g,
        "",
      );
      const reference = nodeReference(child);
      const mention = notion || child.attrs.syntaxForm === "mention" || pageMentions && child.attrs.syntaxForm !== "wiki" && child.attrs.syntaxForm !== "wiki-title-first";
      if (reference?.kind === "location" && (notion && child.attrs.syntaxForm !== "mention" || pageMentions && !child.attrs.syntaxForm)) {
        result += `[${label.replace(/([\\\[\]])/g, "\\$1")}](${referenceHref(reference).replace(/ /g, "%20")})`;
        continue;
      }
      result +=
        mention
          ? `<mention-page${attributesXml({ ...child.attrs.nfmAttrs, url: child.attrs.url || pageUrl(String(child.attrs.target)) })}>${escapeXml(child.attrs.label || child.attrs.target)}</mention-page>`
          : child.attrs.labelMode !== "custom" && label === target
            ? `[[${target}]]`
            : child.attrs.syntaxForm === "wiki-title-first" ? `[[${label}|${target}]]` : `[[${target}|${label}]]`;
    } else if (isEditorKind(child, "image")) {
      const attrs = child.attrs.markdownAttrs || {};
      const title =
        child.attrs.title ||
        (options.mmdAttributes && Object.keys(attrs).length)
          ? ` "${String(child.attrs.title || "")
              .replace(/\\/g, "\\\\")
              .replace(/"/g, '\\"')}"`
          : "";
      result += `![${escapeText(child.attrs.alt || "")}](${destination(originalLink(child.attrs.src, attrs))}${title}${options.mmdAttributes ? mmdAttrs(attrs) : ""})${options.mmdAttributes ? "" : writeAttributes(attrs)}`;
    } else if (isEditorKind(child, "inline_note")) {
      result += "^[" + inlineMarkdown(child, notion, escapeMath, pageMentions, escapeSuperscript, legacyEscapes, options) + "]";
    } else if (isEditorKind(child, "link_mention")) {
      result += `<mention-link${attributesXml({ ...child.attrs.nfmAttrs, url: child.attrs.url })}>${escapeXml(child.attrs.label)}</mention-link>`;
    } else if (isEditorKind(child, "mention")) {
      const tag = `mention-${child.attrs.kind}`;
      result += child.attrs.label
        ? `<${tag}${attributesXml(child.attrs.nfmAttrs)}>${escapeXml(child.attrs.label)}</${tag}>`
        : `<${tag}${attributesXml(child.attrs.nfmAttrs)}/>`;
    } else if (isEditorKind(child, "inline_math")) {
      result += child.attrs.delimiter === "single" ? `\\(${child.attrs.value}\\)` : child.attrs.delimiter === "gfm" ? "$`" + child.attrs.value + "`$" : `$${child.attrs.value}$`;
    } else if (isEditorKind(child, "citation")) {
      result += `[^${child.attrs.url}]`;
    }
  }
  for (let index = active.length - 1; index >= 0; index--)
    result += close(active[index]);
  return result;
}

function blocksMarkdown(nodes: EditorNode[]): string {
  return nodes.map((node) => blockMarkdown(node)).join("\n\n");
}

export function blockMarkdown(node: EditorNode): string {
  switch (editorKind(node)) {
    case "paragraph":
      return inlineMarkdown(node);
    case "nested_block":
      return notionBlockMarkdown(node);
    case "heading":
      return `${"#".repeat(node.attrs.level)} ${inlineMarkdown(node)}`;
    case "horizontal_rule":
      return "---";
    case "code_block": {
      const text = node.textContent;
      const params = String(node.attrs.params ?? "").replace(/[\r\n]/g, "");
      const character = params.includes("`") ? "~" : "`";
      const runs = [...text.matchAll(character === "`" ? /`+/g : /~+/g)];
      const fence = character.repeat(
        Math.max(3, ...runs.map((match) => match[0].length + 1)),
      );
      return `${fence}${params}\n${text}\n${fence}`;
    }
    case "executable_chunk":
      return rChunkMarkdown(node);
    case "blockquote":
      return blocksMarkdown(children(node))
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
    case "bullet_list":
    case "ordered_list":
      return children(node)
        .map((item, index) => {
          const marker =
            isEditorKind(node, "ordered_list")
              ? `${Number(node.attrs.order) + index}. `
              : "- ";
          const checkbox =
            item.attrs.checked === null
              ? ""
              : item.attrs.checked
                ? "[x] "
                : "[ ] ";
          const itemChildren = children(item);
          let content = inlineMarkdown(itemChildren[0]);
          for (const child of itemChildren.slice(1)) {
            content += `${isEditorKind(child, "bullet_list") || isEditorKind(child, "ordered_list") ? "\n" : "\n\n"}${blockMarkdown(child)}`;
          }
          return (checkbox + content)
            .split("\n")
            .map((line, lineIndex) =>
              lineIndex === 0
                ? marker + line
                : " ".repeat(marker.length) + line,
            )
            .join("\n");
        })
        .join("\n");
    case "child_page":
      return notionBlockMarkdown(node);
    case "columns":
      return notionBlockMarkdown(node);
    case "column":
      return blocksMarkdown(children(node));
    case "opaque_block":
      return node.attrs.raw;
    default:
      return node.textContent;
  }
}

function newlineCount(value: string): number {
  return (value.match(/\r\n|\n|\r/g) ?? []).length;
}

/** Serialize only edited top-level subtrees; untouched text and definitions survive. */
export function serializeEditorMarkdown(
  doc: EditorNode,
  writeBlock = blockMarkdown,
): string {
  if (
    doc.attrs.source !== null &&
    doc.attrs.sourceFingerprint === editorFingerprint(doc)
  )
    return doc.attrs.source;
  const newline = doc.attrs.sourceNewline || "\n";
  const gaps: string[] = doc.attrs.sourceGaps || [];
  const used = new Set<number>();
  const preserved = new Set<number>();
  let result = "";
  let previousKey: number | null = null;
  let previousUnchanged = true;
  let previousContent = "";
  let previousSourceEnd: number | null = null;
  doc.forEach((node, _offset, index) => {
    const key =
      typeof node.attrs.sourceKey === "number" &&
      !used.has(node.attrs.sourceKey)
        ? (node.attrs.sourceKey as number)
        : null;
    const unchanged =
      node.attrs.source !== null &&
      node.attrs.sourceFingerprint === editorFingerprint(node);
    const content = unchanged
      ? node.attrs.source
      : writeBlock(node).replace(/\r\n|\n|\r/g, newline);
    let gap = key === null ? "" : (gaps[key] ?? "");
    // The first surviving block no longer needs the separator owned by a
    // deleted leading empty paragraph. Keep an unmatched source newline.
    if (doc.attrs.sourceEditableBlanks && index === 0 && /^[ \t\r\n]*$/.test(gap) && newlineCount(gap) >= 2)
      gap = gap.replace(/\r\n|\r|\n/, "").replace(/\r\n|\r|\n/, "");
    if (key !== null) used.add(key);
    if (unchanged && typeof node.attrs.sourceKey === "number")
      preserved.add(node.attrs.sourceKey);
    if (doc.attrs.sourceEditableBlanks && index > 0) {
      const required = 2;
      const trailing = previousContent.match(/[ \t\r\n]*$/)?.[0] ?? "";
      const leading = (gap + content).match(/^[ \t\r\n]*/)?.[0] ?? "";
      // Preserve untouched adjacent syntax (e.g. heading immediately after prose).
      // A removed blank paragraph changes the source slice, so it cannot use this shortcut.
      const adjacent = key !== null && previousKey !== null && unchanged && previousUnchanged && previousSourceEnd !== null &&
        typeof node.attrs.sourceStart === "number" &&
        doc.attrs.source.slice(previousSourceEnd, node.attrs.sourceStart) === gap;
      if (!adjacent)
        gap = newline.repeat(Math.max(0, required - newlineCount(trailing) - newlineCount(leading))) + gap;
    } else if (
      index > 0 &&
      !(
        previousKey !== null &&
        key === previousKey + 1 &&
        previousUnchanged &&
        unchanged
      )
    ) {
      const trailing = result.match(/[ \t\r\n]*$/)?.[0] ?? "";
      const leading = (gap + content).match(/^[ \t\r\n]*/)?.[0] ?? "";
      gap =
        newline.repeat(
          Math.max(0, 2 - newlineCount(trailing) - newlineCount(leading)),
        ) + gap;
    }
    result += gap + content;
    previousKey = key;
    previousUnchanged = unchanged;
    previousContent = content;
    previousSourceEnd = typeof node.attrs.sourceEnd === "number" ? node.attrs.sourceEnd : null;
  });
  // Definitions have no visible node. Deleting a nearby paragraph must not delete them.
  gaps.forEach((gap, key) => {
    if (!used.has(key) && gap.trim()) {
      const needed = Math.max(
        0,
        2 -
          newlineCount(result.match(/[ \t\r\n]*$/)?.[0] ?? "") -
          newlineCount(gap.match(/^[ \t\r\n]*/)?.[0] ?? ""),
      );
      result += newline.repeat(needed) + gap;
    }
  });
  for (const hidden of doc.attrs.sourceHidden ?? []) {
    if (preserved.has(hidden.ownerKey)) continue;
    const trailing = result.match(/[ \t\r\n]*$/)?.[0] ?? "";
    result +=
      newline.repeat(Math.max(0, 2 - newlineCount(trailing))) + hidden.source;
  }
  return result + (doc.attrs.sourceSuffix ?? "");
}
