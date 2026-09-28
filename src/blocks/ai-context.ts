import type { Node as PMNode } from "prosemirror-model";
import { isEditorKind } from "../document/node-identity";
import { decodeXml, openingTag } from "../document/notion-syntax";

// Reuse the existing mention vocabulary inside prompt/context attributes.
// Unrecognized text remains intact, including when an adjacent chip is removed.
export function aiReferences(source: string) {
  const result: { start: number; end: number; source: string; kind: string; target: string; label: string }[] = [];
  const pattern = /<mention-(page|user|date)\b[^>]*(?:\/>|>[\s\S]*?<\/mention-\1>)/g;
  for (const match of source.matchAll(pattern)) {
    const tag = openingTag(match[0]);
    if (!tag) continue;
    const label = tag.selfClosing ? "" : decodeXml(match[0].slice(tag.length, match[0].lastIndexOf("</")));
    result.push({ start: match.index!, end: match.index! + match[0].length, source: match[0], kind: match[1], target: tag.attrs.url || tag.attrs.start || "", label });
  }
  return result;
}

export function aiPrompt(mode: string, prompt: string) {
  const instruction = mode === "summary" ? "Summarize this page concisely, preserving its main ideas."
    : mode === "key-points" ? "Extract the key points from this page as a concise bulleted list." : "";
  return instruction || prompt.trim();
}

/** Use the live document, without feeding previous AI outputs back into generation. */
export function aiPageText(doc: PMNode): string {
  const lines: string[] = [];
  doc.descendants(node => {
    if (isEditorKind(node, "ai_block")) return false;
    if (node.isTextblock) { lines.push(node.textContent); return false; }
  });
  return lines.join("\n\n");
}
