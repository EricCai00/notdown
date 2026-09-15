import { type Mark, type Node as EditorNode } from "prosemirror-model";
import type Token from "markdown-it/lib/token.mjs";
import { parseMarkdownTokens } from "./markdown.js";
import { editorSchema as schema, localMediaSource } from "./editor-schema.js";
import { attributesXml, escapeXml, localPageTarget, pageUrl } from "./notion-syntax.js";

/** Formatting metadata must not make an otherwise unchanged node look edited. */
export function editorFingerprint(node: EditorNode): string {
  const visit = (current: EditorNode): unknown => ({
    type: current.type.name,
    attrs: Object.fromEntries(
      Object.entries(current.attrs).filter(
        ([key]) => !key.startsWith("source"),
      ),
    ),
    marks: current.marks.map((mark) => mark.toJSON()),
    ...(current.isText
      ? { text: current.text }
      : { content: children(current).map(visit) }),
  });
  return JSON.stringify(visit(node));
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
  const markNames: Record<string, string> = {
    em: "em",
    strong: "strong",
    s: "strike",
    link: "link",
  };
  for (const token of tokens) {
    const markName = markNames[token.type.replace(/_(open|close)$/, "")];
    if (markName && token.nesting === 1) {
      const attrs =
        markName === "link"
          ? { href: token.attrGet("href") ?? "", title: token.attrGet("title") }
          : undefined;
      marks = schema.marks[markName].create(attrs).addToSet(marks);
    } else if (markName && token.nesting === -1) {
      marks = schema.marks[markName].removeFromSet(marks);
    } else if (token.type === "nfm_span") {
      const attrs = token.meta;
      let extra = marks;
      if (attrs.underline === "true") extra = schema.marks.underline.create().addToSet(extra);
      if (attrs.color || Object.keys(attrs).some((key) => key !== "underline"))
        extra = schema.marks.color.create({ color: attrs.color || "", nfmAttrs: attrs }).addToSet(extra);
      for (const child of parseInline(token.children ?? [])) {
        let combined = child.marks;
        for (const mark of extra) combined = mark.addToSet(combined);
        result.push(child.mark(combined));
      }
    } else if (token.type === "nfm_mention") {
      result.push(token.meta.kind === "page"
        ? schema.nodes.page_link.create({ target: localPageTarget(token.meta.attrs.url || "") ?? token.meta.attrs.url ?? "", label: token.content, url: token.meta.attrs.url || "", nfmAttrs: token.meta.attrs }, null, marks)
        : schema.nodes.mention.create({ kind: token.meta.kind, label: token.content, nfmAttrs: token.meta.attrs }, null, marks));
    } else if (token.type === "nfm_math") {
      result.push(schema.nodes.inline_math.create({ value: token.content }, null, marks));
    } else if (token.type === "nfm_citation") {
      result.push(schema.nodes.citation.create({ url: token.content }, null, marks));
    } else if (token.type === "text" && token.content) {
      result.push(schema.text(token.content, marks));
    } else if (token.type === "code_inline") {
      if (token.content)
        result.push(
          schema.text(
            token.content,
            schema.marks.code.create().addToSet(marks),
          ),
        );
    } else if (token.type === "softbreak") {
      result.push(schema.text("\n", marks));
    } else if (token.type === "hardbreak") {
      result.push(schema.nodes.hard_break.create(null, null, marks));
    } else if (token.type === "wiki_link") {
      result.push(
        schema.nodes.page_link.create(
          { target: token.meta.target, label: token.content },
          null,
          marks,
        ),
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
        schema.nodes.image.create(
          {
            src: token.attrGet("src") ?? "",
            alt: token.children ? altText(token.children) : token.content,
            title: token.attrGet("title"),
          },
          null,
          marks,
        ),
      );
    } else if (token.type === "local_media") {
      result.push(
        localMediaSource(token.meta.href)
          ? schema.nodes.media.create(
              {
                type: token.meta.type,
                src: token.meta.href,
                label: token.content,
              },
              null,
              marks,
            )
          : schema.text(
              token.content || token.meta.href,
              schema.marks.link
                .create({ href: token.meta.href })
                .addToSet(marks),
            ),
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
  ): EditorNode[] => {
    const result: EditorNode[] = [];
    for (let index = start; index < end; index++) {
      const token = tokens[index];
      if (token.nesting === -1 || token.type === "inline") continue;
      const close =
        token.nesting === 1 ? matchingClose(tokens, index, end) : index;
      const raw = range(token).source;
      let node: EditorNode;
      if (token.type === "paragraph_open" || token.type === "heading_open") {
        if (
          token.type === "paragraph_open" &&
          /^ {0,3}(?:<\/?[a-zA-Z!]|<\?|:::)/.test(raw)
        ) {
          node = schema.nodes.opaque_block.create({ raw });
        } else {
          const inline = tokens
            .slice(index + 1, close)
            .flatMap((item) =>
              item.type === "inline" ? parseInline(item.children ?? []) : [],
            );
          node =
            token.type === "heading_open"
              ? schema.nodes.heading.create(
                  { level: Number(token.tag.slice(1)) },
                  inline,
                )
              : schema.nodes.paragraph.create(null, inline);
        }
      } else if (
        token.type === "bullet_list_open" ||
        token.type === "ordered_list_open"
      ) {
        node = schema.nodes[
          token.type === "bullet_list_open" ? "bullet_list" : "ordered_list"
        ].create(
          token.type === "ordered_list_open"
            ? { order: Number(token.attrGet("start")) || 1 }
            : null,
          parse(tokens, index + 1, close),
        );
      } else if (token.type === "list_item_open") {
        const checkbox = tokens[index + 2]?.children?.find(
          (item) => item.type === "task_checkbox",
        );
        const content = parse(tokens, index + 1, close);
        if (content[0]?.type !== schema.nodes.paragraph)
          content.unshift(schema.nodes.paragraph.create());
        node = schema.nodes.list_item.create(
          { checked: checkbox ? Boolean(checkbox.meta.checked) : null },
          content,
        );
      } else if (token.type === "blockquote_open") {
        node = schema.nodes.blockquote.create(
          null,
          parse(tokens, index + 1, close),
        );
      } else if (token.type === "fence" || token.type === "code_block") {
        const text = token.content.replace(/\n$/, "");
        node = schema.nodes.code_block.create(
          { params: token.info ?? "" },
          text ? schema.text(text) : undefined,
        );
      } else if (token.type === "hr") {
        node = schema.nodes.horizontal_rule.create();
      } else if (token.type === "child_page") {
        node = schema.nodes.child_page.create({ target: token.meta.target });
      } else if (token.type === "nested_block") {
        const nested = parse(token.meta.blocks);
        const head = token.meta.head ? parse(token.meta.head) : null;
        const content = head
          ? [
              ...(head.length ? head : [schema.nodes.paragraph.create()]),
              ...(nested.length ? nested : [schema.nodes.paragraph.create()]),
            ]
          : nested;
        node =
          content.length &&
          ["paragraph", "heading"].includes(content[0].type.name)
            ? schema.nodes.nested_block.create(null, content)
            : schema.nodes.opaque_block.create({ raw });
      } else if (token.type === "columns") {
        const column = (items: Token[]) => {
          const content = parse(items);
          return schema.nodes.column.create(
            null,
            content.length ? content : [schema.nodes.paragraph.create()],
          );
        };
        node = schema.nodes.columns.create(null, [
          column(token.meta.left),
          column(token.meta.right),
        ]);
      } else {
        node = schema.nodes.opaque_block.create({
          raw:
            token.type === "extension_literal"
              ? token.content.replace(/[\r\n]+$/, "")
              : raw,
        });
      }
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

export function parseEditorMarkdown(source: string): EditorNode {
  const parser = blockParser(source);
  const tokens = parseMarkdownTokens(source);
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
  if (!nodes.length) nodes.push(schema.nodes.paragraph.create());
  const doc = schema.nodes.doc.create(
    {
      source,
      sourceGaps: gaps,
      sourceHidden: hiddenDefinitions(source, tokens),
      sourceSuffix: source.slice(previousEnd),
      sourceNewline: source.match(/\r\n|\n|\r/)?.[0] ?? "\n",
    },
    nodes,
  );
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

function escapeText(value: string): string {
  return value
    .replace(/[\\`*_[\]<>~]/g, "\\$&")
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

export function inlineMarkdown(node: EditorNode, notion = false): string {
  let result = "";
  let active: Mark[] = [];
  const open = (mark: Mark) =>
    mark.type.name === "underline" ? '<span underline="true">' : mark.type.name === "color"
      ? `<span${attributesXml({ ...mark.attrs.nfmAttrs, ...(mark.attrs.color ? { color: mark.attrs.color } : {}) })}>`
      : ({ em: "*", strong: "**", strike: "~~", link: "[" })[mark.type.name] ?? "";
  const close = (mark: Mark) =>
    mark.type.name === "link"
      ? `](${destination(mark.attrs.href)}${mark.attrs.title ? ` "${String(mark.attrs.title).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : ""})`
      : ["underline", "color"].includes(mark.type.name) ? "</span>" : open(mark);
  for (const child of children(node)) {
    const code = child.marks.some((mark) => mark.type.name === "code");
    const marks = child.marks.filter((mark) => mark.type.name !== "code");
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
        ? codeSpan(child.text ?? "")
        : (notion ? escapeText(child.text ?? "").replace(/&/g, "&amp;").replace(/[$|{}^]/g, "\\$&").replace(/\r\n|\n|\r/g, "<br>") : escapeText(child.text ?? ""));
    else if (child.type.name === "hard_break") result += notion ? "<br>" : "  \n";
    else if (child.type.name === "page_link") {
      const target = String(child.attrs.target).replace(/[\[\]\r\n]/g, "");
      const label = String(child.attrs.label || target).replace(
        /[\[\]\r\n]/g,
        "",
      );
      result += notion ? `<mention-page${attributesXml({ ...child.attrs.nfmAttrs, url: child.attrs.url || pageUrl(String(child.attrs.target)) })}>${escapeXml(child.attrs.label || child.attrs.target)}</mention-page>` : label === target ? `[[${target}]]` : `[[${target}|${label}]]`;
    } else if (child.type.name === "image") {
      result += `![${escapeText(child.attrs.alt || "")}](${destination(child.attrs.src)}${child.attrs.title ? ` "${String(child.attrs.title).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : ""})`;
    } else if (child.type.name === "media") {
      result += notion ? `<${child.attrs.type} src="${escapeXml(child.attrs.src)}">${escapeXml(child.attrs.label)}</${child.attrs.type}>` : `[${escapeText(child.attrs.label || child.attrs.src)}](${destination(child.attrs.src)})`;
    } else if (child.type.name === "mention") {
      const tag = `mention-${child.attrs.kind}`;
      result += child.attrs.label ? `<${tag}${attributesXml(child.attrs.nfmAttrs)}>${escapeXml(child.attrs.label)}</${tag}>` : `<${tag}${attributesXml(child.attrs.nfmAttrs)}/>`;
    } else if (child.type.name === "inline_math") {
      result += `$${child.attrs.value}$`;
    } else if (child.type.name === "citation") {
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

function blockMarkdown(node: EditorNode): string {
  switch (node.type.name) {
    case "paragraph":
      return inlineMarkdown(node);
    case "nested_block":
      return `:::nest\n${blockMarkdown(node.firstChild!)}\n:::children\n${blocksMarkdown(children(node).slice(1))}\n:::endnest`;
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
            node.type.name === "ordered_list"
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
            content += `${child.type.name === "bullet_list" || child.type.name === "ordered_list" ? "\n" : "\n\n"}${blockMarkdown(child)}`;
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
      return `::page{id="${String(node.attrs.target).replace(/["\s<>]/g, "")}"}`;
    case "columns":
      return `:::columns\n${blocksMarkdown(children(node.child(0)))}\n:::column\n${blocksMarkdown(children(node.child(1)))}\n:::`;
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
export function serializeEditorMarkdown(doc: EditorNode): string {
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
      : blockMarkdown(node).replace(/\r\n|\n|\r/g, newline);
    let gap = key === null ? "" : (gaps[key] ?? "");
    if (key !== null) used.add(key);
    if (unchanged && typeof node.attrs.sourceKey === "number")
      preserved.add(node.attrs.sourceKey);
    if (
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
