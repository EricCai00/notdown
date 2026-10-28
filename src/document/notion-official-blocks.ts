import type { Node as PMNode } from "prosemirror-model";
import { editorSchema as schema } from "./editor-schema";
import { createEditorNode, editorKind } from "./node-identity";
import { attributesXml, decodeXml, escapeXml, openingTag } from "./notion-syntax";

export function officialNotionObject(node: PMNode): boolean {
  if (["mail", "custom_block", "external_object_instance"].includes(editorKind(node)) || ["web_bookmark", "web_embed", "link_preview", "link_mention"].includes(editorKind(node)) && node.attrs.syntaxForm === "notion") return true;
  return ["notion_embed", "folder", "database", "meeting_section"].includes(editorKind(node)) ||
    ["tabs", "tab", "meeting_notes"].includes(editorKind(node)) && node.attrs.syntaxForm === "notion";
}

/** Parse only complete containers; never consume fenced examples or trailing text. */
export function readOfficialNotionBlock(lines: string[], start: number, end: number,
  parse: (source: string) => PMNode): { node: PMNode; next: number } | undefined {
  const first = lines[start].trimStart(), tag = openingTag(first);
  if (!tag || !["tabs", "meeting-notes", "embed", "folder", "database"].includes(tag.tag)) return;
  if (tag.tag === "embed" && Object.hasOwn(tag.attrs,"source") && !Object.hasOwn(tag.attrs,"src")) return;
  // Old local title/active encodings keep their Notdown-only reader.
  if (tag.tag === "tabs" && Object.hasOwn(tag.attrs, "active") ||
      tag.tag === "meeting-notes" && ["title", "audio", "language", "transcript"].some(key => Object.hasOwn(tag.attrs, key))) return;
  const indent = lines[start].length - first.length;
  const close = `</${tag.tag}>`;
  let next = start + 1, body = "";
  const opaque = () => ({ node: createEditorNode(schema, "opaque_block", { raw: lines.slice(start, next).join("\n") }), next });
  if (tag.selfClosing) {
    if (first.slice(tag.length).trim()) return opaque();
  } else if (first.endsWith(close)) body = first.slice(tag.length, -close.length);
  else {
    let fence = "", depth = 1;
    for (; next < end; next++) {
      const line = lines[next].trim();
      const marker = /^(`{3,}|~{3,})(.*)$/.exec(line);
      if (fence) { if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = ""; continue; }
      if (marker) { fence = marker[1]; continue; }
      const child = openingTag(line);
      if (child?.tag === tag.tag && !child.selfClosing && !line.endsWith(close)) depth++;
      if (line === close && --depth === 0) break;
    }
    if (next === end) return opaque();
    body = [first.slice(tag.length), ...lines.slice(start + 1, next)].filter((line, i) => i || line.trim()).join("\n");
    next++;
  }
  const attrs = { nfmAttrs: tag.attrs, color: tag.attrs.color || "" };
  if (["embed", "folder", "database"].includes(tag.tag)) {
    if (body.includes("\n")) return opaque();
    const kind = tag.tag === "embed" ? "notion_embed" : tag.tag;
    return { node: createEditorNode(schema, kind, { ...attrs,
      src: tag.attrs.src || "", url: tag.attrs.url || "", label: decodeXml(body), caption: decodeXml(body),
      dataSourceUrl: tag.attrs["data-source-url"] || "", inline: tag.attrs.inline === "true", wiki: tag.attrs.wiki === "true", icon: tag.attrs.icon || "",
    }), next };
  }
  const bodyLines = body.split("\n");
  const dedent = (items: string[]) => items.map(line => line.startsWith("\t".repeat(indent + 1)) ? line.slice(indent + 1) : line).join("\n");
  const empty = () => schema.nodes["block.paragraph"].create();
  if (tag.tag === "tabs") {
    const children: PMNode[] = [];
    let i = 0;
    while (i < bodyLines.length) {
      if (!bodyLines[i].trim()) { i++; continue; }
      const tab = openingTag(bodyLines[i].trim());
      if (tab?.tag !== "tab" || tab.selfClosing || bodyLines[i].trim() !== bodyLines[i].trim().slice(0, tab.length)) return opaque();
      if (Object.hasOwn(tab.attrs, "title")) return;
      const titleLine = bodyLines[++i];
      if (!titleLine?.startsWith("\t".repeat(indent + 2)) || !titleLine.trim()) return opaque();
      const title = titleLine.slice(indent + 2);
      const content: string[] = [];
      let nesting = 1, fence = "";
      while (++i < bodyLines.length) {
        const text = bodyLines[i].trim(), marker = /^(`{3,}|~{3,})(.*)$/.exec(text);
        if (fence) { if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = ""; }
        else if (marker) fence = marker[1];
        else {
          const inner = openingTag(text);
          if (inner?.tag === "tab" && !inner.selfClosing && !text.endsWith("</tab>")) nesting++;
          if (text === "</tab>" && --nesting === 0) break;
        }
        content.push(bodyLines[i]);
      }
      if (nesting) return opaque();
      const raw = content.map(line => line.startsWith("\t".repeat(indent + 2)) ? line.slice(indent + 2) : line).join("\n");
      const doc = parse(raw);
      children.push(schema.nodes["structure.tab"].create({ title, syntaxForm: "notion", nfmAttrs: tab.attrs }, doc.childCount ? doc.content : empty()));
      i++;
    }
    if (!children.length) return opaque();
    return { node: createEditorNode(schema, "tabs", { ...attrs, syntaxForm: "notion" }, children), next };
  }
  const normalized = dedent(bodyLines).split("\n");
  while (normalized.length && !normalized[0].trim()) normalized.shift();
  const title = normalized.shift() || "";
  if (!title || ["summary", "notes", "transcript"].includes(openingTag(title)?.tag || "")) return opaque();
  const sections: PMNode[] = [];
  for (let i = 0; i < normalized.length; i++) {
    if (!normalized[i].trim()) continue;
    const section = openingTag(normalized[i].trim());
    if (!section || normalized[i].trim().slice(section.length).trim() || !["summary", "notes", "transcript"].includes(section.tag) || sections.some(node => node.attrs.section === section.tag)) return opaque();
    const content: string[] = [], closing = `</${section.tag}>`;
    if (!section.selfClosing) {
      let fence = "";
      for (i++; i < normalized.length; i++) {
        const line = normalized[i], marker = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
        if (fence) { if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = ""; }
        else if (marker) fence = marker[1];
        else if (line.trim() === closing) break;
        content.push(line.startsWith("\t") ? line.slice(1) : line);
      }
      if (i === normalized.length) return opaque();
    }
    const doc = parse(content.join("\n"));
    sections.push(schema.nodes["structure.meeting_section"].create({ section: section.tag, nfmAttrs: section.attrs }, doc.childCount ? doc.content : empty()));
  }
  return { node: createEditorNode(schema, "meeting_notes", { ...attrs, title, syntaxForm: "notion" }, sections.length ? sections : [empty()]), next };
}

export function writeOfficialNotionBlock(node: PMNode, write: (node: PMNode) => string): string | undefined {
  if (!officialNotionObject(node)) return;
  const attrs = { ...node.attrs.nfmAttrs, ...(node.attrs.color ? { color: node.attrs.color } : {}) };
  const indent = (raw: string) => raw.split("\n").map(line => "\t" + line).join("\n");
  const content = () => { const blocks: string[] = []; node.forEach(child => blocks.push(write(child))); return blocks.join("\n\n"); };
  const kind = editorKind(node);
  if (["web_embed", "web_bookmark", "link_preview"].includes(kind)) {
    for (const key of kind === "web_embed" ? ["title", "width", "height", "align"] : kind === "link_preview" ? ["title", "description", "image", "caption"] : ["title", "description", "icon", "image"]) {
      if (node.attrs[key]) attrs[key] = String(node.attrs[key]); else delete attrs[key];
    }
    delete attrs.url;
    if (kind !== "link_preview") delete attrs.caption;
    if (kind === "link_preview") return `<link-preview${attributesXml({ ...attrs, url: node.attrs.url })} />`;
    return `<${kind === "web_embed" ? "embed" : "bookmark"}${attributesXml({ ...attrs, source: node.attrs.url })}>${escapeXml(node.attrs.caption || "").replace(/\r?\n/g,"<br>")}</${kind === "web_embed" ? "embed" : "bookmark"}>`;
  }
  if (kind === "notion_embed") return `<embed${attributesXml({ ...attrs, src: node.attrs.src })}>${escapeXml(node.attrs.caption)}</embed>`;
  if (kind === "folder" || kind === "database") {
    if (node.attrs.url) attrs.url = node.attrs.url; else delete attrs.url;
    if (kind === "database") {
      if (node.attrs.dataSourceUrl) attrs["data-source-url"] = node.attrs.dataSourceUrl; else delete attrs["data-source-url"];
      for (const key of ["inline", "wiki"]) {
        if (node.attrs[key] || attrs[key] === "true" || attrs[key] === "false") attrs[key] = String(node.attrs[key]);
        // An unknown future value is retained unless explicitly set to true.
      }
      if (node.attrs.icon) attrs.icon = node.attrs.icon;
    }
    return `<${kind}${attributesXml(attrs)}>${escapeXml(node.attrs.label)}</${kind}>`;
  }
  const tag = kind === "meeting_notes" ? "meeting-notes" : kind === "meeting_section" ? node.attrs.section : kind;
  const title = kind === "tab" || kind === "meeting_notes" ? String(node.attrs.title).replace(/[\r\n]+/g, "<br>") + "\n" : "";
  if (kind === "meeting_notes") {
    const sections: string[] = [], loose: string[] = [];
    let notesWritten = false;
    const flush = () => {
      if (loose.length) {
        if (notesWritten) throw new Error("Keep meeting notes inside one notes section before saving.");
        notesWritten = true;
        sections.push(`<notes>\n${indent(loose.join("\n\n"))}\n</notes>`);
      }
      loose.length = 0;
    };
    node.forEach(child => {
      if (editorKind(child) === "meeting_section") {
        flush();
        if (child.attrs.section === "notes") {
          if (notesWritten) throw new Error("Keep meeting notes inside one notes section before saving.");
          notesWritten = true;
        }
        sections.push(write(child));
      }
      else if (editorKind(child) !== "paragraph" || child.content.size) loose.push(write(child));
    });
    flush();
    return `<${tag}${attributesXml(attrs)}>\n${indent((title + sections.join("\n\n")).trimEnd())}\n</${tag}>`;
  }
  return `<${tag}${attributesXml(attrs)}>\n${indent(title + content())}\n</${tag}>`;
}
