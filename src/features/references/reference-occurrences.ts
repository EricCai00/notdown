import type { Node as PMNode } from "prosemirror-model";
import { editorKind } from "../../document/node-identity";
import { markReference, nodeReference, type InternalReference } from "../../document/internal-reference";
import { localAssetPath } from "../assets/asset-model";
import { externalIdentity, externalKey, type ExternalObservation } from "./external-entity";

export interface ReferenceOccurrenceTarget { key: string; occurrence: number }
export interface ReferenceOccurrence extends ReferenceOccurrenceTarget {
  from: number;
  to: number;
  label: string;
  external?: ExternalObservation;
  internal?: InternalReference;
}

/** Semantic references only: ordinary URLs, code and opaque examples stay untouched. */
export function referenceOccurrences(doc: PMNode): ReferenceOccurrence[] {
  const result: ReferenceOccurrence[] = [], counts = new Map<string, number>();
  // Footnotes are displayed in reference order, but occurrence IDs follow source order.
  const definitions = new Map<string, { node: PMNode; pos: number }>(), inlineDefinitions = new Map<string, { node: PMNode; pos: number }>();
  const anchored = new Set<string>();
  doc.descendants((node, pos) => {
    if (editorKind(node) === "footnote" && node.attrs.footnoteKey) {
      definitions.set(node.attrs.footnoteKey, { node, pos });
      if (node.attrs.inlineNote) inlineDefinitions.set(node.attrs.label, { node, pos });
    }
    if (editorKind(node) === "footnote_anchor") anchored.add(node.attrs.key);
  });
  const add = (from: number, to: number, label: string, external?: ExternalObservation, internal?: InternalReference) => {
    if (!external && (!internal || internal.addressing === "url" || localAssetPath(internal.raw))) return;
    const key = external ? externalKey(external) : `internal:${internal!.syntax}:${internal!.raw}`;
    const previous = result.at(-1);
    // A styled link can span several text nodes but is still one occurrence.
    if (internal && previous?.internal && previous.key === key && previous.to === from) {
      previous.to = to; previous.label += label; return;
    }
    const occurrence = counts.get(key) ?? 0;
    counts.set(key, occurrence + 1);
    result.push({ key, occurrence, from, to, label, external, internal });
  };
  const visit = (node: PMNode, pos: number) => {
    const kind = editorKind(node);
    if (["code_block", "executable_chunk", "executable_inline", "math_block", "inline_math", "opaque_block", "unknown_block", "unsupported"].includes(kind)) return;
    if (kind === "footnote_anchor") {
      const definition = definitions.get(node.attrs.key);
      if (definition) visit(definition.node, definition.pos);
      return;
    }
    if (kind === "footnote_section") {
      node.forEach((child, offset) => {
        if (!anchored.has(child.attrs.footnoteKey) && !child.attrs.inlineNote) visit(child, pos + 1 + offset);
      });
      return;
    }
    if (kind === "footnote_reference" && node.attrs.inlineNote) {
      const definition = inlineDefinitions.get(node.attrs.label);
      if (definition) visit(definition.node, definition.pos);
    }
    if (["page_link", "child_page", "mention", "database"].includes(kind)) {
      const url = node.attrs.url || node.attrs.nfmAttrs?.url || node.attrs.target;
      const type = kind === "database" || node.attrs.kind === "database" ? "database" : node.attrs.kind === "data-source" ? "data-source" : undefined;
      const identity = externalIdentity(url, type);
      const label = String(node.attrs.label || node.textContent || "");
      add(pos, pos + node.nodeSize, label, identity ? { ...identity, url: String(url), label } : undefined, nodeReference(node) ?? undefined);
    }
    for (const mark of node.marks) if (editorKind(mark) === "link" && !mark.attrs.attributes?.download)
      add(pos, pos + node.nodeSize, node.textContent, undefined, markReference(mark) ?? undefined);
    node.forEach((child, offset) => visit(child, pos + 1 + offset));
  };
  doc.forEach((node, pos) => visit(node, pos));
  return result;
}
