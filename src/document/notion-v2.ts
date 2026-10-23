import type { Node as PMNode } from "prosemirror-model";
import { editorSchema as schema } from "./editor-schema";
import { createEditorNode, editorKind } from "./node-identity";
import { inlineMarkdown } from "./editor-markdown";
import { attributesXml, decodeXml, escapeXml, openingTag, readAttributes, type TagAttributes } from "./notion-syntax";
import { needsMarkdownTable } from "./notdown-boundary";

export type NotionElement = { tag: string; attrs: TagAttributes; from: number; openEnd: number; bodyEnd: number; to: number; selfClosing: boolean };

/** Scan literal source, skipping fenced/inline code and escaped tags. Offsets
 * always address the original text, including CRLF and indentation. */
export function notionTagTokens(source: string): { from: number; to: number; tag: string; closing: boolean; selfClosing: boolean; attrs: TagAttributes }[] {
  const result: ReturnType<typeof notionTagTokens> = [];
  let fence = "", inline = "", lineStart = true;
  for (let i = 0; i < source.length;) {
    if (lineStart) {
      const lineEnd = source.indexOf("\n", i), line = source.slice(i, lineEnd < 0 ? source.length : lineEnd).replace(/\r$/, "");
      const match = /^[ \t]*(`{3,}|~{3,})(.*)$/.exec(line);
      if (match && (!fence || match[1][0] === fence[0] && match[1].length >= fence.length && !match[2].trim())) {
        fence = fence ? "" : match[1]; i = lineEnd < 0 ? source.length : lineEnd + 1; continue;
      }
      if (fence) { i = lineEnd < 0 ? source.length : lineEnd + 1; continue; }
      lineStart = false;
    }
    if (source[i] === "\n") { lineStart = true; i++; continue; }
    if (source[i] === "\\") { i += 2; continue; }
    if (source[i] === "`") {
      const run = /^`+/.exec(source.slice(i))![0];
      if (!inline) inline = run; else if (inline === run) inline = "";
      i += run.length; continue;
    }
    if (inline || source[i] !== "<") { i++; continue; }
    if (source.startsWith("<!--", i)) { const end = source.indexOf("-->", i + 4); i = end < 0 ? source.length : end + 3; continue; }
    const close = /^<\/([\w-]+)\s*>/.exec(source.slice(i));
    const open = close ? null : openingTag(source.slice(i));
    if (close) { result.push({ from: i, to: i + close[0].length, tag: close[1], closing: true, selfClosing: false, attrs: {} }); i += close[0].length; }
    else if (open) { result.push({ from: i, to: i + open.length, tag: open.tag, closing: false, selfClosing: open.selfClosing, attrs: open.attrs }); i += open.length; }
    else i++;
  }
  return result;
}

export function notionElement(source: string, from = 0): NotionElement | undefined {
  const tokens = notionTagTokens(source.slice(from)), first = tokens[0];
  if (!first || first.from !== 0 || first.closing) return;
  if (first.selfClosing) return { tag: first.tag, attrs: first.attrs, from, openEnd: from + first.to, bodyEnd: from + first.to, to: from + first.to, selfClosing: true };
  let depth = 0;
  for (const token of tokens) {
    if (token.tag !== first.tag || token.selfClosing) continue;
    depth += token.closing ? -1 : 1;
    if (!depth) return { tag: first.tag, attrs: first.attrs, from, openEnd: from + first.to, bodyEnd: from + token.from, to: from + token.to, selfClosing: false };
  }
}

const traversable = new Set(["p", "h1", "h2", "h3", "h4", "quote", "toggle", "li", "ul", "ol", "todo", "columns", "column", "tabs", "tab", "callout", "mail", "meeting-notes", "meeting-notes-section-notes", "meeting-notes-section-summary", "meeting-notes-section-transcript", "synced-block", "synced-block-reference", "table", "tr", "td", "th", "colgroup", "span", "b", "i", "s", "u", "details", "summary", "notes", "transcript", "synced_block", "synced_block_reference"]);
/** Unknown containers and literal mention labels cannot authorize extra reads. */
export function notionSourceTags(source: string): ReturnType<typeof notionTagTokens> {
  const tokens = notionTagTokens(source), result: typeof tokens = [];
  const blocked: string[] = [];
  for (const token of tokens) {
    if (blocked.length) {
      if (!token.closing && !token.selfClosing) blocked.push(token.tag);
      else if (token.closing && token.tag === blocked.at(-1)) blocked.pop();
      continue;
    }
    if (token.closing) continue;
    result.push(token);
    if (!token.selfClosing && !traversable.has(token.tag)) blocked.push(token.tag);
  }
  return result;
}

/** Offset-preserving prose mask for import destination edits. Unknown objects,
 * tag attributes, literal labels, comments and fenced code are never rewritten. */
export function notionProseSource(source: string): string {
  const chars = source.split("");
  const mask = (from: number, to: number) => { for (let i = from; i < to; i++) if (!/[\r\n]/.test(chars[i])) chars[i] = " "; };
  let fence = "", fenceStart = 0;
  for (const line of source.matchAll(/[^\n]*(?:\n|$)/g)) {
    const match = /^[ \t]*(`{3,}|~{3,}|\$\$)(.*?)[\r\n]*$/.exec(line[0]);
    if (match && (!fence || match[1][0] === fence[0] && match[1].length >= fence.length && !match[2].trim())) {
      if (fence) { mask(fenceStart, line.index! + line[0].length); fence = ""; }
      else { fence = match[1]; fenceStart = line.index!; }
    }
  }
  if (fence) mask(fenceStart, source.length);
  let blockedUntil = 0;
  for (const token of notionTagTokens(source)) {
    if (token.from < blockedUntil) continue;
    if (!token.closing && !token.selfClosing && !traversable.has(token.tag)) {
      const element = notionElement(source, token.from);
      blockedUntil = element?.to ?? source.length; mask(token.from, blockedUntil);
    } else mask(token.from, token.to);
  }
  for (const comment of source.matchAll(/<!--[\s\S]*?(?:-->|$)/g)) mask(comment.index!, comment.index! + comment[0].length);
  for (const line of chars.join("").matchAll(/[^\r\n]+/g)) {
    const attributes = /(?<!\\)\s+\{([^{}]*)\}\s*$/.exec(line[0]);
    if (attributes && readAttributes(attributes[1])) mask(line.index! + attributes.index, line.index! + line[0].length);
  }
  return chars.join("");
}

const childNodes = (node: PMNode) => [...node.content.content];
const supported = new Set([...traversable, "image", "file", "audio", "video", "pdf", "bookmark", "embed", "link-preview", "page", "folder", "database", "table-of-contents", "equation", "custom-block", "external_object_instance", "unknown"]);
const localMediaFields: Record<string, readonly string[]> = {
  web_bookmark: ["title", "description", "image", "icon"],
  link_preview: ["title", "description", "image", "caption"],
  web_embed: ["title", "width", "height", "align"],
};

export function readNotionV2Block(lines: string[], start: number, end: number,
  parse: (source: string) => PMNode, inline: (source: string) => PMNode[], parseTable: (body: string, attrs: Record<string, unknown>) => PMNode | null, localProperties = false): { node: PMNode; next: number } | undefined {
  const first = lines[start].trimStart(), tag = openingTag(first);
  if (!tag || !supported.has(tag.tag) || ["span", "b", "i", "s", "u"].includes(tag.tag)) return;
  // Existing Notdown/MCP encodings remain distinct from the v2 carriers.
  if (tag.tag === "bookmark" && !tag.attrs.source || tag.tag === "embed" && tag.attrs.src ||
      tag.tag === "tabs" && Object.hasOwn(tag.attrs, "active") ||
      tag.tag === "meeting-notes" && ["title", "audio", "language", "transcript"].some(key => Object.hasOwn(tag.attrs, key))) return;
  const source = [first, ...lines.slice(start + 1, end)].join("\n");
  const element = notionElement(source);
  const preserve = (next: number) => ({ node: createEditorNode(schema, "opaque_block", { raw: lines.slice(start, next).join("\n") }), next });
  if (!element) return preserve(end);
  const next = start + source.slice(0, element.to).split("\n").length;
  if (source.slice(element.to).split("\n")[0].trim()) return preserve(next);
  if (["custom-block", "unknown", "table-of-contents"].includes(tag.tag) && !element.selfClosing && source.slice(element.openEnd, element.bodyEnd).trim()) return preserve(next);
  const body = element.selfClosing ? "" : source.slice(element.openEnd, element.bodyEnd).replace(/^\r?\n/, "").replace(/\r?\n[ \t]*$/, "");
  const attrs = { nfmAttrs: tag.attrs, color: tag.attrs.color || "" };
  const paragraph = (text = "", extra = {}) => schema.nodes["block.paragraph"].create(extra, inline(text));
  const content = (text = body) => childNodes(parse(text));
  const header = () => {
    const split = /\r?\n[ \t]*\r?\n/.exec(body);
    return { title: split ? body.slice(0, split.index) : body, children: split ? content(body.slice(split.index + split[0].length)) : [] };
  };
  const elements = (text: string): NotionElement[] | undefined => {
    const result: NotionElement[] = []; let at = 0;
    while (at < text.length) {
      const white = /^\s*/.exec(text.slice(at))![0].length; at += white;
      if (at === text.length) break;
      const child = notionElement(text, at); if (!child) return;
      result.push(child); at = child.to;
    }
    return result;
  };
  let node: PMNode | undefined;
  if (tag.tag === "p" || /^h[1-4]$/.test(tag.tag)) {
    const h = header(), head = tag.tag === "p" ? paragraph(h.title, attrs) : createEditorNode(schema, "heading", { ...attrs, level: Number(tag.tag[1]) }, inline(h.title));
    node = h.children.length ? schema.nodes["structure.nested_block"].create(attrs, [head, ...h.children]) : head;
  } else if (["quote", "toggle", "li", "todo"].includes(tag.tag)) {
    const h = header(), head = paragraph(h.title === "<p />" || h.title === "<p/>" ? "" : h.title);
    if (tag.tag === "toggle" && /^h[1-4]$/.test(tag.attrs.heading || "")) node = schema.nodes["structure.nested_block"].create(attrs, [createEditorNode(schema, "heading", { ...attrs, toggle: true, level: Number(tag.attrs.heading[1]) }, head.content), ...h.children]);
    else if (tag.tag === "todo") node = schema.nodes["structure.bullet_list"].create(null, schema.nodes["block.task_list_item"].create({ ...attrs, checked: tag.attrs.checked === "true" }, [head, ...h.children]));
    else node = createEditorNode(schema, ({ quote: "blockquote", toggle: "toggle_block", li: "bullet_list_item" } as Record<string,string>)[tag.tag], attrs, [head, ...h.children]);
  } else if (["ul", "ol", "columns", "tabs"].includes(tag.tag)) {
    const parts = elements(body); if (!parts?.length) return preserve(next);
    const expected = ({ ul: "li", ol: "li", columns: "column", tabs: "tab" } as Record<string,string>)[tag.tag];
    if (parts.some(part => part.tag !== expected)) return preserve(next);
    const nodes: PMNode[] = [];
    for (const part of parts) {
      const result = readNotionV2Block(body.slice(part.from, part.to).split("\n"), 0, body.slice(part.from, part.to).split("\n").length, parse, inline, parseTable, localProperties);
      if (!result || result.node.type.name === "block.unsupported") return preserve(next);
      let child = result.node;
      if (tag.tag === "ol") child = schema.nodes["block.numbered_list_item"].create(child.attrs, child.content);
      nodes.push(child);
    }
    node = createEditorNode(schema, ({ ul: "bullet_list", ol: "ordered_list", columns: "columns", tabs: "tabs" } as Record<string,string>)[tag.tag], { ...attrs, syntaxForm: "notion", ...(tag.tag === "ol" ? { markerStyle: tag.attrs.type === "a" ? "alpha" : tag.attrs.type === "i" ? "roman" : "decimal" } : {}) }, nodes);
  } else if (tag.tag === "column") node = schema.nodes["structure.column"].create(attrs, content());
  else if (tag.tag === "tab") { const h = header(); node = schema.nodes["structure.tab"].create({ ...attrs, syntaxForm: "notion", title: decodeXml(h.title) }, h.children.length ? h.children : paragraph()); }
  else if (tag.tag === "callout") node = schema.nodes["block.callout"].create({ ...attrs, icon: tag.attrs.icon ?? "💡" }, content());
  else if (tag.tag === "synced-block" || tag.tag === "synced-block-reference") node = schema.nodes["block.synced_block"].create({ ...attrs, reference: tag.tag.endsWith("reference"), url: tag.attrs.url || "" }, content());
  else if (tag.tag === "table") node = parseTable(body, attrs) ?? undefined;
  else if (tag.tag === "table-of-contents") node = schema.nodes["block.table_of_contents"].create(attrs);
  else if (tag.tag === "equation") node = schema.nodes["block.math_block"].create(attrs, body ? schema.text(decodeXml(body)) : undefined);
  else if (tag.tag === "meeting-notes") {
    const tokens = notionTagTokens(body), sectionStart = tokens.find(token => !token.closing && token.tag.startsWith("meeting-notes-section-"))?.from;
    const title = (sectionStart === undefined ? body : body.slice(0, sectionStart)).trimEnd();
    const sections = sectionStart === undefined ? [] : elements(body.slice(sectionStart));
    if (!sections || sections.some(part => !["meeting-notes-section-notes", "meeting-notes-section-summary", "meeting-notes-section-transcript"].includes(part.tag))) return preserve(next);
    const sectionSource = sectionStart === undefined ? "" : body.slice(sectionStart);
    node = createEditorNode(schema, "meeting_notes", { ...attrs, syntaxForm: "notion", title: decodeXml(title) }, sections.length ? sections.map(part => schema.nodes["structure.meeting_section"].create({ section: part.tag.slice(22), nfmAttrs: part.attrs }, content(sectionSource.slice(part.openEnd, part.bodyEnd).replace(/^\n|\n$/g, "")))) : [paragraph()]);
  } else if (tag.tag === "mail") node = schema.nodes["block.mail"].create(attrs, content());
  else if (tag.tag === "custom-block") node = schema.nodes["block.custom_block"].create({ ...attrs, definitionId: tag.attrs["definition-id"] || "", url: tag.attrs.url || "" });
  else if (tag.tag === "external_object_instance") node = schema.nodes["block.external_object_instance"].create({ ...attrs, integration: tag.attrs.integration || "", label: decodeXml(body), url: tag.attrs.url || "" });
  else if (["image", "file", "audio", "video", "pdf", "bookmark", "embed", "link-preview"].includes(tag.tag)) {
    const captionDoc = paragraph(body), caption = captionDoc.textBetween(0, captionDoc.content.size, "\n", "\n");
    const properties = { ...attrs, src: tag.attrs.source || tag.attrs.src || "", url: tag.attrs.source || tag.attrs.url || "", caption, sourceCaption: body, sourceCaptionText: caption, syntaxForm: "notion" };
    const kind = ({ image: "image_block", file: "media_block", audio: "media_block", video: "media_block", pdf: "media_block", bookmark: "web_bookmark", embed: "web_embed", "link-preview": "link_preview" } as Record<string,string>)[tag.tag];
    const extra = localProperties ? Object.fromEntries((localMediaFields[kind] || []).filter(key => Object.hasOwn(tag.attrs, key)).map(key => [key, tag.attrs[key]])) : {};
    node = createEditorNode(schema, kind, { ...properties, ...extra, type: tag.tag });
  } else if (tag.tag === "unknown") node = schema.nodes["block.unsupported"].create({ ...attrs, url: tag.attrs.url || "", alt: tag.attrs.alt || "" });
  // Page/database/folder already have source-preserving official readers.
  else return;
  return node ? { node, next } : preserve(next);
}

export function notionV2BlockMarkdown(node: PMNode, fallback: (node: PMNode) => string, localProperties = false): string {
  const write = (child: PMNode): string => notionV2BlockMarkdown(child, fallback, localProperties);
  const kind = editorKind(node);
  if (Object.keys(node.attrs.markdownAttrs || {}).length ||
      kind === "heading" && node.attrs.level > 4 ||
      kind === "callout" && node.attrs.syntaxForm === "alert" ||
      kind === "table_of_contents" && node.attrs.syntaxForm !== "notion" ||
      kind === "table" && (node.attrs.syntaxForm !== "notion" || needsMarkdownTable(node)) ||
      kind === "ordered_list" && node.attrs.markerDelimiter === ")" ||
      kind === "image_block" && node.attrs.title) return fallback(node);
  const inline = (child: PMNode) => inlineMarkdown(child, true, false, true, false, false, { notionV2: true });
  const kids = childNodes(node), body = () => kids.map(write).join("\n\n");
  const attrs = { ...node.attrs.nfmAttrs, ...(node.attrs.color ? { color: node.attrs.color } : {}) };
  if (localProperties && node.attrs.syntaxForm === "notion") for (const field of localMediaFields[kind] || []) {
    if (node.attrs[field]) attrs[field] = node.attrs[field]; else delete attrs[field];
  }
  const tag = (name: string, text: string, extra: TagAttributes = {}) => `<${name}${attributesXml({ ...attrs, ...extra })}>${text}</${name}>`;
  const titleBody = () => (node.firstChild ? inline(node.firstChild) : "") + (kids.length > 1 ? "\n\n" + kids.slice(1).map(write).join("\n\n") : "");
  const caption = () => node.attrs.caption === node.attrs.sourceCaptionText ? node.attrs.sourceCaption : escapeXml(node.attrs.caption || "");
  switch (editorKind(node)) {
    case "paragraph": return node.content.size ? Object.keys(attrs).length || /^\s|\s$|^</.test(inline(node)) ? tag("p", inline(node)) : inline(node) : `<p${attributesXml(attrs)} />`;
    case "heading": return tag(node.attrs.toggle ? "toggle" : `h${Math.min(4,node.attrs.level)}`, inline(node), node.attrs.toggle ? { heading: `h${Math.min(4,node.attrs.level)}` } : {});
    case "nested_block": {
      const head = node.firstChild!, kind = editorKind(head), name = kind === "heading" ? head.attrs.toggle ? "toggle" : `h${Math.min(4,head.attrs.level)}` : "p";
      return `<${name}${attributesXml({ ...head.attrs.nfmAttrs, ...(head.attrs.color ? { color: head.attrs.color } : {}), ...(head.attrs.toggle ? { heading: `h${Math.min(4,head.attrs.level)}` } : {}) })}>${titleBody()}</${name}>`;
    }
    case "blockquote": return tag("quote", titleBody());
    case "toggle_block": return tag("toggle", titleBody());
    case "bullet_list":
    case "ordered_list": {
      if (kids.every(child => child.attrs.checked !== null)) return kids.map(write).join("\n\n");
      if (editorKind(node) === "ordered_list" && node.attrs.order > 1) return kids.map((child, index) => `${node.attrs.order + index}. ${childNodes(child).map((part, n) => n ? write(part) : inline(part)).join("\n\n").replace(/\n/g, "\n    ")}`).join("\n");
      return tag(editorKind(node) === "ordered_list" ? "ol" : "ul", "\n" + body() + "\n", editorKind(node) === "ordered_list" ? { type: node.attrs.markerStyle === "alpha" ? "a" : node.attrs.markerStyle === "roman" ? "i" : "1" } : {});
    }
    case "bullet_list_item": case "numbered_list_item": return tag("li", titleBody());
    case "task_list_item": return tag("todo", titleBody(), { checked: String(node.attrs.checked) });
    case "columns": case "column": return tag(editorKind(node), "\n" + body() + "\n");
    case "callout": return tag("callout", body(), { icon: node.attrs.icon });
    case "synced_block": return tag(node.attrs.reference ? "synced-block-reference" : "synced-block", body(), { ...(node.attrs.url ? { url: node.attrs.url } : {}) });
    case "tabs": return node.attrs.syntaxForm === "notion" ? tag("tabs", "\n" + body() + "\n") : fallback(node);
    case "tab": return node.attrs.syntaxForm === "notion" ? tag("tab", escapeXml(node.attrs.title) + "\n\n" + body()) : fallback(node);
    case "meeting_notes": {
      if (node.attrs.syntaxForm !== "notion") return fallback(node);
      const content = kids.some(child => editorKind(child) === "meeting_section") ? body() : `<meeting-notes-section-notes>${body()}</meeting-notes-section-notes>`;
      return tag("meeting-notes", escapeXml(node.attrs.title) + "\n" + content);
    }
    case "meeting_section": return tag(`meeting-notes-section-${node.attrs.section}`, body());
    case "mail": return tag("mail", body());
    case "custom_block": return `<custom-block${attributesXml({ ...attrs, "definition-id": node.attrs.definitionId, ...(node.attrs.url ? { url: node.attrs.url } : {}) })} />`;
    case "external_object_instance": return tag("external_object_instance", escapeXml(node.attrs.label), { integration: node.attrs.integration, ...(node.attrs.url ? { url: node.attrs.url } : {}) });
    case "web_bookmark": return node.attrs.syntaxForm === "notion" ? tag("bookmark", caption(), { source: node.attrs.url }) : fallback(node);
    case "link_preview": return node.attrs.syntaxForm === "notion" ? `<link-preview${attributesXml({ ...attrs, url: node.attrs.url })} />` : fallback(node);
    case "image_block": if (Object.keys(node.attrs.markdownAttrs || {}).length) return fallback(node); return tag("image", caption(), { source: node.attrs.src });
    case "media_block": return tag(node.attrs.type, caption(), { source: node.attrs.src });
    case "web_embed": return node.attrs.syntaxForm === "notion" ? tag("embed", caption(), { source: node.attrs.url }) : fallback(node);
    case "notion_embed": return tag("embed", caption(), { source: node.attrs.src });
    case "table_of_contents": return `<table-of-contents${attributesXml(attrs)} />`;
    case "equation": return tag("equation", escapeXml(node.textContent));
    case "table": { const cols = node.attrs.columnAttrs?.length ? node.attrs.columnAttrs : (node.attrs.widths || []).map((width: string) => ({ width })); return tag("table", (cols.length ? `<colgroup>${cols.map((col: TagAttributes) => `<col${attributesXml(col)} />`).join("")}</colgroup>\n` : "") + kids.map(row => `<tr${attributesXml(row.attrs.nfmAttrs)}>${childNodes(row).map(cell => `<${cell.attrs.header ? "th" : "td"}${attributesXml(cell.attrs.nfmAttrs)}>${childNodes(cell).map(inline).join("<br />")}</${cell.attrs.header ? "th" : "td"}>`).join("")}</tr>`).join("\n")); }
    default: return fallback(node);
  }
}
