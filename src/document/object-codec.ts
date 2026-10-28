import { createEditorNode, editorKind, editorNodeType, isEditorKind } from "./node-identity";
import { inlineMarkdown } from "./editor-markdown";
import type { Node as PMNode } from "prosemirror-model";
import { editorSchema as schema } from "./editor-schema";
import { objectTags, objectNodeSpecs } from "./object-model";
import { openingTag, attributesXml } from "./notion-syntax";
import { canonicalNotionBlock } from "./canonical-notion";
import { writeOfficialNotionBlock } from "./notion-official-blocks";

// A shared PM type includes attributes from all of its source encodings.
// Read/write only this encoding's fields; leave unknown XML attributes intact.
const objectSpecs = objectNodeSpecs(spec => spec);

/** XML attributes carry properties; block bodies remain editable Markdown. */
export function readObjectBlock(lines: string[], start: number, end: number, parse: (raw: string) => PMNode): { node: PMNode; next: number } | undefined {
  const first = lines[start].trimStart();
  const tag = openingTag(first);
  const name = tag && objectTags[tag.tag];
  if (!tag || !name || name === "tab") return;
  if (tag.selfClosing && first.slice(tag.length).trim())
    return { node: createEditorNode(schema, "opaque_block", { raw: lines[start] }), next: start + 1 };
  const close = `</${tag.tag}>`;
  let next = start + 1, body = "";
  if (!tag.selfClosing) {
    const after = first.slice(tag.length);
    if (after.endsWith(close)) body = after.slice(0, -close.length);
    else {
      let nesting = 1, fence = "";
      while (next < end) {
        const line = lines[next].trim();
        const f = /^(`{3,}|~{3,})/.exec(line);
        if (f) { if (!fence) fence = f[1]; else if (f[1][0] === fence[0] && f[1].length >= fence.length && line === f[1]) fence = ""; }
        if (!fence) {
          if (line === close && --nesting === 0) break;
          const opening = openingTag(line);
          if (opening?.tag === tag.tag && !opening.selfClosing && !line.endsWith(close)) nesting++;
        }
        next++;
      }
      if (next === end) return { node: createEditorNode(schema, "opaque_block", { raw: lines.slice(start, end).join("\n") }), next: end };
      body = [after, ...lines.slice(start + 1, next)].filter((v, i) => i || v).join("\n");
      next++;
    }
  }
  const type = editorNodeType(schema, name);
  const parseChildren = (source: string) => {
    const lines = source.split("\n");
    // Accept one structural indentation level, without changing relative code indentation.
    return parse(lines.some(line => line.trim()) && lines.every(line => !line.trim() || line.startsWith("\t"))
      ? lines.map(line => line.startsWith("\t") ? line.slice(1) : line).join("\n") : source);
  };
  const properties: Record<string, unknown> = { nfmAttrs: tag.attrs };
  for (const key of ["color", ...Object.keys(objectSpecs[name]?.attrs || {})]) if (key in tag.attrs) properties[key] = tag.attrs[key];
  if (name === "tabs") {
    const children: PMNode[] = [];
    const tabLines = body.split("\n");
    for (let i = 0; i < tabLines.length; i++) {
      const t = openingTag(tabLines[i].trim());
      if (t?.tag !== "tab") {
        if (tabLines[i].trim()) return { node: createEditorNode(schema, "opaque_block", { raw: lines.slice(start, next).join("\n") }), next };
        continue;
      }
      const content: string[] = [];
      const rest = tabLines[i].trim().slice(t.length);
      if (rest.endsWith("</tab>")) content.push(rest.slice(0, -6));
      else {
        if (rest) content.push(rest);
        let depth = 1, fence = "";
        while (++i < tabLines.length) {
          const line = tabLines[i].trim();
          const marker = /^(`{3,}|~{3,})(.*)$/.exec(line);
          if (fence) {
            if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = "";
            content.push(tabLines[i]); continue;
          }
          if (marker) { fence = marker[1]; content.push(tabLines[i]); continue; }
          const nested = openingTag(line);
          if (nested?.tag === "tab" && !nested.selfClosing && !line.endsWith("</tab>")) depth++;
          if (line === "</tab>" && --depth === 0) break;
          content.push(tabLines[i]);
        }
        if (depth) return { node: createEditorNode(schema, "opaque_block", { raw: lines.slice(start, next).join("\n") }), next };
      }
      children.push(schema.nodes["structure.tab"].create({ title: t.attrs.title || "Tab", nfmAttrs: t.attrs }, parseChildren(content.join("\n")).content));
    }
    if (!children.length) children.push(schema.nodes["structure.tab"].create(null, schema.nodes["block.paragraph"].create()));
    properties.active = Math.max(0, Math.min(children.length - 1, Number(properties.active) || 0));
    return { node: type.create(properties, children), next };
  }
  if (!type.spec.content && body.trim()) return { node: createEditorNode(schema, "opaque_block", { raw: lines.slice(start, next).join("\n") }), next };
  return { node: createEditorNode(schema, name, properties, type.spec.content ? parseChildren(body).content : undefined), next };
}
export function writeObjectBlock(node: PMNode, write: (node: PMNode) => string): string | undefined {
  const canonical = canonicalNotionBlock(node);
  if (canonical !== node) return writeOfficialNotionBlock(canonical, write);
  if (isEditorKind(node, "image_block")) {
    if (node.attrs.syntaxForm === "notion") {
      const image = schema.nodes["inline.image"].create({ src: node.attrs.src, alt: node.attrs.caption, title: node.attrs.title || null });
      const attributes = { ...node.attrs.nfmAttrs, ...(node.attrs.color ? { color: node.attrs.color } : {}), ...node.attrs.markdownAttrs };
      return inlineMarkdown(schema.nodes["block.paragraph"].create(null, image)) +
        (Object.keys(attributes).length ? ` {${attributesXml(attributes).trim()}}` : "");
    }
    // Retired local_figure: new output uses Pandoc's existing image attributes.
    const image = schema.nodes["inline.image"].create({ src: node.attrs.src, alt: node.attrs.caption || node.attrs.alt, title: node.attrs.title || null, markdownAttrs: node.attrs.markdownAttrs });
    const source = inlineMarkdown(schema.nodes["block.paragraph"].create(null, image));
    return source + (node.attrs.caption && node.attrs.alt !== node.attrs.caption ? "{alt=" + JSON.stringify(String(node.attrs.alt || "")) + "}" : "");
  }
  const tag = Object.keys(objectTags).find(t => objectTags[t] === editorKind(node));
  if (!tag) return;
  const values: Record<string, string> = { ...node.attrs.nfmAttrs };
  for (const key of Object.keys(objectSpecs[editorKind(node)]?.attrs || {})) {
    if (["source", "sourceFingerprint", "sourceStart", "sourceEnd", "sourceKey", "nfmAttrs", "markdownAttrs", "color", "html", "syntaxForm"].includes(key)) continue;
    if (node.attrs[key] !== "" && node.attrs[key] !== undefined && node.attrs[key] !== null) values[key] = String(node.attrs[key]);
    else delete values[key];
  }
  const attributes = attributesXml(values).replace(/\r/g, "&#13;").replace(/\n/g, "&#10;");
  if (!node.type.spec.content) return `<${tag}${attributes}/>`;
  const blocks: string[] = []; node.forEach(n => blocks.push(write(n)));
  return `<${tag}${attributes}>\n${blocks.join("\n\n")}\n</${tag}>`;
}
