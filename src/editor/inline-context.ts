import { Fragment, type Mark, type Node as PMNode } from "prosemirror-model";
import { type EditorState, type Transaction } from "prosemirror-state";
import { closeHistory } from "prosemirror-history";
import { editorKind } from "../document/node-identity";
import { resolveContentObject, resolveMarkObject } from "../document/content-objects";
import { restoreFootnotes } from "./footnotes";

export interface InlineTarget {
  from: number;
  to: number;
  node: PMNode;
  mark?: Mark;
}

/** Presentation marks belong to the formatting toolbar, not the inline menu. */
export function isSemanticInlineMark(mark: Mark): boolean {
  const kind = editorKind(mark);
  return ["link", "code", "abbreviation"].includes(kind) ||
    kind === "critic" && ["addition", "deletion", "substitution", "comment"].includes(mark.attrs.kind);
}

/** Include the entire semantic object even when its text has several styles. */
export function inlineMarkRange(doc: PMNode, pos: number, mark: Mark): InlineTarget | null {
  const resolved = doc.resolve(pos);
  if (!resolved.parent.inlineContent || !isSemanticInlineMark(mark)) return null;
  const children: InlineTarget[] = [];
  resolved.parent.forEach((node, offset) => children.push({ from: resolved.start() + offset, to: resolved.start() + offset + node.nodeSize, node }));
  let index = children.findIndex(child => child.from <= pos && child.to > pos && mark.isInSet(child.node.marks));
  if (index < 0) index = children.findIndex(child => child.to === pos && mark.isInSet(child.node.marks));
  if (index < 0) return null;
  let first = index, last = index;
  while (first > 0 && mark.isInSet(children[first - 1].node.marks)) first--;
  while (last + 1 < children.length && mark.isInSet(children[last + 1].node.marks)) last++;
  return { from: children[first].from, to: children[last].to, node: children[index].node, mark };
}

export function inlineTypeLabel(target: InlineTarget): string {
  return (target.mark ? resolveMarkObject(target.mark) : resolveContentObject(target.node))?.name || "Inline object";
}

/** No page metadata, neighboring text or supporting definitions in the source preview. */
export function inlineSource(doc: PMNode, target: InlineTarget, serialize: (doc: PMNode) => string): string {
  const content = doc.slice(target.from, target.to).content;
  const paragraph = doc.type.schema.nodes["block.paragraph"].create(null, content);
  return serialize(restoreFootnotes(doc.type.create({ sourceFormat: doc.attrs.sourceFormat, sourceNewline: doc.attrs.sourceNewline }, paragraph)));
}

export function inlineText(doc: PMNode, target: InlineTarget): string {
  if (target.mark || !target.node.isAtom) return doc.textBetween(target.from, target.to, "", "");
  const { node } = target;
  return String(editorKind(node) === "inline_math" ? node.attrs.value :
    node.attrs.label || node.attrs.alt || node.attrs.nfmAttrs?.start || node.attrs.url || node.attrs.target || node.attrs.raw || node.textContent || "");
}

/** Only the chosen semantic mark is removed; surrounding text styles survive. */
export function inlineToText(state: EditorState, target: InlineTarget, code = false): Transaction {
  let tr = closeHistory(state.tr);
  if (target.mark) tr = tr.removeMark(target.from, target.to, target.mark);
  else {
    const text = inlineText(state.doc, target);
    tr = tr.replaceWith(target.from, target.to, text ? state.schema.text(text, target.node.marks) : Fragment.empty);
  }
  if (code) tr.addMark(target.from, tr.mapping.map(target.to, -1), state.schema.marks.code.create());
  return tr.setMeta("isolateHistory", true);
}

export function inlineRevision(state: EditorState, target: InlineTarget, accept: boolean): Transaction | null {
  const mark = target.mark;
  if (!mark || editorKind(mark) !== "critic" || !["addition", "deletion", "substitution"].includes(mark.attrs.kind)) return null;
  const tr = closeHistory(state.tr).setMeta("isolateHistory", true);
  if (accept && mark.attrs.kind === "deletion" || !accept && mark.attrs.kind === "addition") return tr.delete(target.from, target.to);
  if (!accept && mark.attrs.kind === "substitution") {
    const old = String(mark.attrs.old || "");
    return tr.replaceWith(target.from, target.to, old ? state.schema.text(old, target.node.marks.filter(m => m.type !== mark.type)) : Fragment.empty);
  }
  return tr.removeMark(target.from, target.to, mark);
}
