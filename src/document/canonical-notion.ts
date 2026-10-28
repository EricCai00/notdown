import type { Node as PMNode } from "prosemirror-model";
import { editorSchema as schema } from "./editor-schema";
import { createEditorNode, editorKind } from "./node-identity";
import { escapeXml } from "./notion-syntax";

/** Replace redundant local carriers. Service settings and unknown fields survive.
 * Callers retain source for unedited documents; explicit migrations patch ranges. */
export function canonicalNotionBlock(node: PMNode): PMNode {
  const kind = editorKind(node), attrs = { ...node.attrs }, fields = { ...attrs.nfmAttrs };
  let content = node.content;
  if (["heading", "toggle_block"].includes(kind) && ["true","false"].includes(fields.open)) {
    delete fields.open; // Expanded/collapsed is a transient view choice.
  } else if (kind === "column" && Object.hasOwn(fields, "width-ratio")) {
    const fraction = Number(fields["width-ratio"]);
    if (!Number.isFinite(fraction) || fraction <= 0 || fraction >= 1 ||
        Object.hasOwn(fields, "ratio") && Number(fields.ratio) !== fraction * 100) return node;
    fields.ratio = String(Number((fraction * 100).toFixed(8))); delete fields["width-ratio"];
  } else if (["web_embed", "web_bookmark", "link_preview"].includes(kind) && attrs.syntaxForm !== "notion") {
    if (fields.source && fields.source !== attrs.url) return node;
    delete fields.url; delete fields.caption;
    attrs.syntaxForm = "notion";
  } else if (["tabs", "tab"].includes(kind) && attrs.syntaxForm !== "notion") {
    delete fields.active; delete fields.title;
    attrs.syntaxForm = "notion";
    if (kind === "tab") attrs.title = escapeXml(attrs.title || "").replace(/[\\`*_~\[\]]/g, "\\$&").replace(/\r?\n/g, "<br>") || "<p />";
    if (kind === "tabs") {
      attrs.active = 0; // Selection belongs to the view, not the body contract.
      content = schema.nodes["doc"].create(null, node.content.content.map(canonicalNotionBlock)).content;
    }
  } else if (kind === "meeting_notes" && attrs.syntaxForm !== "notion") {
    let config: Record<string, unknown> = {};
    if (fields["meeting-config"]) {
      try { config = JSON.parse(fields["meeting-config"]); } catch { return node; }
      if (!config || Array.isArray(config) || typeof config !== "object") return node;
    }
    for (const key of ["audio", "language"]) if (attrs[key]) {
      if (config[key] !== undefined && config[key] !== attrs[key]) return node;
      config[key] = attrs[key];
    }
    if (Object.keys(config).length) fields["meeting-config"] = JSON.stringify(config);
    for (const key of ["title", "audio", "language", "transcript"]) delete fields[key];
    attrs.syntaxForm = "notion";
    attrs.title = escapeXml(attrs.title || "Meeting notes").replace(/[\\`*_~\[\]]/g, "\\$&").replace(/\r?\n/g, "<br>");
    const sections = node.content.content.some(child => editorKind(child) === "meeting_section");
    if (sections) return node; // Mixed old sections require an explicit repair.
    const children = [createEditorNode(schema, "meeting_section", { section: "notes" }, content)];
    if (attrs.transcript) children.push(createEditorNode(schema, "meeting_section", { section: "transcript" },
      schema.nodes["block.paragraph"].create(null, schema.text(String(attrs.transcript)))));
    content = schema.nodes["doc"].create(null, children).content;
    attrs.audio = attrs.language = attrs.transcript = "";
  } else return node;
  return node.type.create({ ...attrs, nfmAttrs: fields, source: null, sourceFingerprint: null }, content, node.marks);
}
