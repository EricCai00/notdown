import { Fragment, type Node as PMNode } from "prosemirror-model";
import { canonicalNotionBlock } from "./canonical-notion";
import { editorKind, isEditorKind } from "./node-identity";
import { editorSchema as schema } from "./editor-schema";
import { notionInline } from "./notion-markdown";
import { canonicalDateAttributes } from "../features/dates/date-mention";
import { parseNative, serializeNative } from "../markdown-engine/codec";
import type { SyntaxConfig } from "../markdown-engine/config";

export function canonicalNotionTree(node: PMNode): PMNode {
  let next = canonicalNotionBlock(node);
  if (isEditorKind(next, "mention") && next.attrs.kind === "date") {
    const fields = canonicalDateAttributes(next.attrs.nfmAttrs);
    if (fields !== next.attrs.nfmAttrs) next = next.type.create({ ...next.attrs, nfmAttrs: fields }, next.content, next.marks);
  }
  const children = next.content.content.map(canonicalNotionTree);
  if (children.some((child,index) => child !== next.child(index))) next = next.copy(Fragment.fromArray(children));
  return next;
}

/** Compare persistent meaning, excluding caches and duplicate carrier fields. */
export function canonicalNotionMeaning(node: PMNode): unknown {
  const n = canonicalNotionTree(node), kind = editorKind(n);
  const attrs = Object.fromEntries(Object.entries(n.attrs).filter(([key]) => !key.startsWith("source") && !["syntaxForm", "editorRepresentation"].includes(key)));
  const fields = { ...(attrs.nfmAttrs as Record<string,string> || {}) };
  if (["web_embed", "notion_embed", "web_bookmark", "link_preview"].includes(kind!)) {
    for (const key of ["url", "source"]) delete fields[key];
    for (const key of ["src", "caption", "title", "description", "icon", "image", "width", "height", "align"]) if (Object.hasOwn(attrs,key)) delete fields[key];
  }
  if (kind === "web_embed") delete attrs.src; // Shared schema's attachment alias.
  if (kind === "tabs") delete attrs.active;
  if (kind === "tab" || kind === "meeting_notes") attrs.title = notionInline(String(attrs.title || "")).map(n => n.textContent).join("");
  if (Object.hasOwn(attrs,"nfmAttrs")) attrs.nfmAttrs = fields;
  return { type: n.type.name, attrs, ...(n.isText ? { text: n.text } : {}), marks: n.marks.map(m => m.toJSON()), children: n.content.content.map(canonicalNotionMeaning) };
}

/** Explicit, validated migration. No writes; no global syntax substitutions. */
export function canonicalizeNotdownSource(source: string, syntax: SyntaxConfig) {
  if (syntax.variant !== "notdown") return { source, blocks: 0 };
  const doc = parseNative(source, syntax);
  const edits: { from: number; to: number; value: string }[] = [];
  doc.forEach(node => {
    const canonical = canonicalNotionTree(node);
    if (canonical === node) return;
    const {sourceStart: from, sourceEnd: to, source: original} = node.attrs;
    if (typeof from !== "number" || typeof to !== "number" || source.slice(from,to) !== original) throw new Error("Cannot verify source boundary for canonical conversion");
    const fresh = canonical.type.create({ ...canonical.attrs, source: null, sourceFingerprint: null, sourceKey: null },canonical.content,canonical.marks);
    const value = serializeNative(schema.nodes.doc.create(null,[fresh]),syntax).replace(/\r\n|\n|\r/g, source.includes("\r\n") ? "\r\n" : "\n");
    edits.push({from,to,value});
  });
  let next = source;
  for (const edit of edits.sort((a,b) => b.from-a.from)) next = next.slice(0,edit.from)+edit.value+next.slice(edit.to);
  const stable = (value: unknown): string => JSON.stringify(value, (_key,item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a],[b]) => a.localeCompare(b))) : item);
  if (stable(canonicalNotionMeaning(doc)) !== stable(canonicalNotionMeaning(parseNative(next,syntax)))) throw new Error("Canonical conversion changed document meaning");
  return { source: next, blocks: edits.length };
}
