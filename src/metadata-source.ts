import type { Node as PMNode } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";
import { closeHistory } from "prosemirror-history";
import { parseDocument } from "yaml";

/** Code edits change one carrier only; malformed boundaries must not consume following prose. */
export function metadataSourceTransaction(state: EditorState, pos: number, original: PMNode, raw: string, parse: (source: string) => PMNode) {
  const node = state.doc.nodeAt(pos);
  if (!node?.eq(original)) throw new Error("This metadata changed. Close and reopen its details before saving.");
  if (raw === node.attrs.raw) return null;
  const parsed = parse(raw), next = parsed.firstChild;
  if (parsed.childCount !== 1 || !next?.attrs.metadataForm || next.attrs.metadataForm !== node.attrs.metadataForm)
    throw new Error("Keep a single metadata block, including its opening and closing markers. Edit page text in Markdown source.");
  if (node.attrs.metadataForm === "yaml") {
    const content = raw.replace(/^---[^\n]*\n/, "").replace(/\r?\n(?:---|\.\.\.)\s*$/, "");
    const document = parseDocument(content);
    if (document.errors.length) throw new Error(document.errors[0].message);
  }
  return closeHistory(state.tr).setNodeMarkup(pos, undefined, {
    ...node.attrs,
    ...(next.type === node.type ? next.attrs : {}),
    raw,
    sourceKey: node.attrs.sourceKey,
    source: null,
    sourceFingerprint: null,
  }).setMeta("isolateHistory", true);
}
