import { isListItem } from "./list-items";
import { tocIncludes } from "../blocks/content-toc";
import type { DOMOutputSpec, Node as PMNode } from "prosemirror-model";
import {
  htmlDocument as legacyHtml,
  type OutlineNode,
  type PageReference,
} from "./markdown.js";
import { parseNotionMarkdown } from "./notion-markdown.js";
import { parseNative } from "../markdown-engine/codec.js";
import { defaultSyntax, type SyntaxConfig } from "../markdown-engine/config.js";
import {
  escapeXml,
  localPageTarget,
  pageUrl,
  safeReference,
  type BodyFormat,
} from "./notion-syntax.js";
import katex from "katex";
import { tableCellStyle, tableCaptionId } from "../editor/editor-table.js";
import { codeCaption } from "./code-caption.js";
import { renderRawHtml } from "../markdown-engine/html.js";
import { syntaxHtml } from "../markdown-engine/product-render.js";
export type { OutlineNode, PageReference } from "./markdown.js";
export type { BodyFormat } from "./notion-syntax.js";

export function extractLinks(
  source: string,
  format: BodyFormat = "markdown",
  syntax?: SyntaxConfig,
): string[] {
  syntax ??= defaultSyntax(format);
  const targets = new Set<string>();
  (syntax
    ? parseNative(source, syntax)
    : parseNotionMarkdown(source)
  ).descendants((node) => {
    if (node.type.name === "page_link") {
      const target = localPageTarget(
        node.attrs.url || pageUrl(node.attrs.target),
      );
      if (target) targets.add(target);
    }
  });
  return [...targets];
}
function label(node: PMNode): string {
  if (node.isText) return node.text || "";
  if (node.isLeaf)
    return (
      node.attrs.label ||
      node.attrs.alt ||
      node.attrs.value ||
      (node.type.name === "hard_break" ? " " : "")
    );
  let result = "";
  node.forEach((child) => {
    result += label(child);
  });
  return result;
}
export function getOutline(
  source: string,
  format: BodyFormat = "markdown",
  syntax?: SyntaxConfig,
): OutlineNode[] {
  syntax ??= defaultSyntax(format);
  const doc = syntax
      ? parseNative(source, syntax)
      : parseNotionMarkdown(source),
    roots: OutlineNode[] = [],
    headings: OutlineNode[] = [];
  const walk = (node: PMNode, listParents: OutlineNode[] = []) => {
    const heading = node.type.name === "heading",
      list = isListItem(node);
    let parents = listParents;
    if (heading || list) {
      const line =
        node.attrs.sourceStart == null
          ? roots.length + 1
          : source.slice(0, node.attrs.sourceStart).split(/\r\n|\n|\r/).length;
      const level = heading
        ? node.attrs.level
        : (headings.at(-1)?.level || 0) + listParents.length + 1;
      const item: OutlineNode = {
        id: `${heading ? "heading" : "list"}-${line}`,
        text: label(list ? node.firstChild! : node),
        level,
        line,
        kind: heading ? "heading" : "list",
        children: [],
      };
      if (heading) {
        while (headings.length && headings.at(-1)!.level >= level)
          headings.pop();
        (headings.at(-1)?.children || roots).push(item);
        headings.push(item);
      } else {
        (
          listParents.at(-1)?.children ||
          headings.at(-1)?.children ||
          roots
        ).push(item);
        parents = [...listParents, item];
      }
    }
    node.forEach((child) => {
      if (!child.isInline) walk(child, parents);
    });
  };
  walk(doc);
  return roots;
}

/** Render only schema-owned DOM descriptions. User tags never become HTML. */
export function renderNotionMarkdown(
  source: string,
  pages: PageReference[] = [],
  options: {
    sourcePositions?: boolean;
    codeBlock?: (language: string, source: string) => string | undefined;
    document?: PMNode;
    syntaxBlock?: (node: PMNode) => string | undefined;
  } = {},
): string {
  const doc = options.document ?? parseNotionMarkdown(source);
  let headingIndex = 0;
  const renderSpec = (spec: DOMOutputSpec, content: string): string => {
    if (typeof spec === "string") return escapeXml(spec);
    if (!Array.isArray(spec)) return "";
    const [tag, ...parts] = spec;
    const first = parts[0];
    const attributes =
      first && typeof first === "object" && !Array.isArray(first)
        ? (parts.shift() as Record<string, unknown>)
        : {};
    if (
      tag === "a" &&
      typeof attributes.href === "string" &&
      attributes.href.startsWith("#")
    ) {
      const match = headings.find(
        (h) => "#" + h.id.replace(/^md-/, "") === attributes.href,
      );
      if (match) attributes.href = "#" + match.id;
    }
    const attrs = Object.entries(attributes)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => ` ${key}="${escapeXml(value)}"`)
      .join("");
    if (["hr", "br", "img", "input", "col"].includes(tag))
      return `<${tag}${attrs}>`;
    return `<${tag}${attrs}>${parts.map((part) => (part === 0 ? content : renderSpec(part as DOMOutputSpec, content))).join("")}</${tag}>`;
  };
  const headings: { title: string; level: number; id: string }[] = [];
  doc.descendants((node) => {
    if (node.type.name === "heading")
      headings.push({
        title: label(node),
        level: node.attrs.level,
        id: node.attrs.markdownAttrs?.id
          ? "md-" + node.attrs.markdownAttrs.id
          : "nfm-heading-" + headings.length,
      });
  });
  const render = (node: PMNode, cellStyle?: string): string => {
    const html = renderNode(node, cellStyle);
    if (
      !options.sourcePositions ||
      !node.isBlock ||
      node.attrs.sourceStart == null
    )
      return html;
    const line = source
      .slice(0, node.attrs.sourceStart)
      .split(/\r\n|\n|\r/).length;
    return html.replace(
      /^<([a-z][\w-]*)(?=[\s>])/i,
      `<$1 data-source-line="${line}"`,
    );
  };
  const renderNode = (node: PMNode, cellStyle?: string): string => {
    if (node.type.name === "syntax_block") {
      const custom = options.syntaxBlock?.(node);
      if (custom !== undefined) return codeCaption(node)
        ? `<figure class="pm-code-rendered">${custom}<figcaption>${escapeXml(codeCaption(node))}</figcaption></figure>`
        : custom;
      return syntaxHtml(node);
    }
    if (node.type.name === "syntax_inline") {
      const external = options.syntaxBlock?.(node);
      if (external !== undefined) return external;
      if (node.attrs.html) return renderRawHtml(node.attrs.html);
    }
    if (node.type.name === "html_block")
      return (
        '<div class="pm-html-block">' + renderRawHtml(node.attrs.raw) + "</div>"
      );
    if (node.type.name === "html_inline")
      return (
        '<span class="pm-html-inline">' +
        renderRawHtml(node.attrs.html) +
        "</span>"
      );
    if (node.type.name === "code_block") {
      const custom = options.codeBlock?.(
        String(node.attrs.params || ""),
        node.textContent,
      );
      if (custom !== undefined) return custom;
    }
    const childHtml: string[] = [];
    node.forEach((child, _, rowIndex) => {
      if (node.type.name === "table") {
        if (child.type.name === "table_caption") {
          const id = tableCaptionId(node);
          childHtml.push(render(child).replace("<caption>", id ? `<caption id="${escapeXml(id)}">` : "<caption>"));
          return;
        }
        const cells: string[] = [];
        child.forEach((cell, _, columnIndex) =>
          cells.push(render(cell, tableCellStyle(node, rowIndex, columnIndex))),
        );
        childHtml.push(`<tr>${cells.join("")}</tr>`);
      } else childHtml.push(render(child));
    });
    let content = childHtml.join("");
    if (node.isText) content = escapeXml(node.text);
    else if (node.type.name === "doc") return content;
    else if (node.type.name === "table_cell" && cellStyle !== undefined)
      return `<${node.attrs.header ? "th" : "td"}${node.attrs.colspan > 1 ? ` colspan="${Number(node.attrs.colspan)}"` : ""}${node.attrs.rowspan > 1 ? ` rowspan="${Number(node.attrs.rowspan)}"` : ""} style="${escapeXml(cellStyle)}">${content}</${node.attrs.header ? "th" : "td"}>`;
    else if (node.type.name === "table_of_contents")
      content = `<nav class="pm-toc">${headings.filter((h) => tocIncludes(node, h.level)).map((h) => `<a href="#${escapeXml(h.id)}" style="padding-left:${(h.level - 1) * 16}px">${escapeXml(h.title)}</a>`).join("")}</nav>`;
    else if (["child_page", "page_link"].includes(node.type.name)) {
      const target = node.attrs.target,
        page = pages.find(
          (item) => item.id === target || item.title === target,
        );
      const url = page
        ? `#page/${encodeURIComponent(page.id)}`
        : safeReference(node.attrs.url || pageUrl(target));
      content = `<a class="${node.type.name === "child_page" ? "child-page-node" : "page-mention"}" href="${escapeXml(url)}"><span aria-hidden="true">▤</span> ${escapeXml(page?.title || node.attrs.label || target)}</a>`;
    } else if (node.type.name === "toggle_block") {
      content = `<details open class="pm-toggle"><summary>${childHtml[0]}</summary>${childHtml.slice(1).join("")}</details>`;
    } else if (["inline_math", "equation"].includes(node.type.name)) {
      content = katex.renderToString(
        (node.attrs.latexPrefix || "") + (node.isInline ? node.attrs.value : node.textContent),
        {
          displayMode: !node.isInline,
          output: "mathml",
          throwOnError: false,
          trust: false,
        },
      );
    } else {
      const spec = node.type.spec.toDOM?.(node);
      content = spec ? renderSpec(spec, content) : content;
      if (node.type.name === "code_block" && codeCaption(node))
        content = `<figure class="pm-code-rendered">${content}<figcaption>${escapeXml(codeCaption(node))}</figcaption></figure>`;
      if (node.type.name === "heading") {
        if (!node.attrs.markdownAttrs?.id)
          content = content.replace(
            /^<h(\d)/,
            `<h$1 id="nfm-heading-${headingIndex}"`,
          );
        headingIndex++;
      }
      if (
        isListItem(node) &&
        typeof node.attrs.checked === "boolean"
      )
        content = content.replace(
          /(<li[^>]*>)/,
          `$1<input type="checkbox" disabled${node.attrs.checked ? " checked" : ""}>`,
        );
    }
    for (let index = node.marks.length - 1; index >= 0; index--) {
      const spec = node.marks[index].type.spec.toDOM?.(node.marks[index], true);
      if (spec) content = renderSpec(spec, content);
    }
    return content;
  };
  return render(doc);
}
export function htmlDocument(
  title: string,
  body: string,
  pages: PageReference[] = [],
  format: BodyFormat = "markdown",
  syntax?: SyntaxConfig,
): string {
  syntax ??= defaultSyntax(format);
  const shell = legacyHtml(title, "", pages);
  const styles = `.note-columns{grid-template-columns:var(--column-widths,repeat(var(--column-count,2),minmax(0,1fr)))}.pm-callout{padding:16px 20px;background:#f1f1ef;border-radius:4px}.pm-callout:before{content:attr(data-icon);float:left;margin-right:12px}.pm-toggle>summary>p{display:inline}.pm-toc a{display:block}.pm-mention{background:#f1f1ef;border-radius:3px;padding:1px 4px}.pm-database,.pm-unknown{display:block;padding:8px}.page-mention,.child-page-node{color:inherit;text-decoration:none}.child-page-node{display:block}.page-mention{border-bottom:1px solid #ddd}.pm-media-block{margin:12px 0}.pm-equation{font-family:serif;text-align:center;padding:16px}.pm-synced{border:1px solid #e6e5e3;padding:12px}@media(max-width:620px){.note-columns{grid-template-columns:1fr}}`;
  return shell
    .replace(
      "</style>",
      `${styles}.pm-line-block{white-space:pre-wrap;margin:1em 0}.pm-verse-line{min-height:1.5em}.pm-definition-list dt{font-weight:bold}.pm-definition-list dd{margin-left:2em}.pm-footnote{border-top:1px solid #ddd;padding:1em}.pm-footnote:before{content:'[' attr(data-footnote-label) ']';font-size:.8em}.pm-fenced-div{border:1px dashed #ddd;padding:1em;margin:1em 0}</style>`,
    )
    .replace(
      "<article></article>",
      `<article>${renderNotionMarkdown(body, pages, syntax ? { document: parseNative(body, syntax) } : {})}</article>`,
    );
}
