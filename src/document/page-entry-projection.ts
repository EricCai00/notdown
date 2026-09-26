import { Fragment, type Node as PMNode } from "prosemirror-model";
import { localPageTarget } from "./notion-syntax";
import { editorFingerprint } from "./editor-markdown";

export type PageEntryEvidence = { childTargets: string[]; referenceTargets: string[] };

/** Project proven resource entries to real PM types, without private Markdown attributes.
 * Ambiguous repeated destinations stay links: ownership alone is not block evidence.
 */
export function projectPageEntries(doc: PMNode, evidence?: PageEntryEvidence): PMNode {
  if (!evidence) return doc;
  const child = new Set(evidence.childTargets);
  const references = new Set(evidence.referenceTargets);
  const counts = new Map<string, number>();
  const target = (node: PMNode) => localPageTarget(node.attrs.url || node.attrs.target || "");
  doc.descendants(node => {
    if (!["block.link_to_page", "block.child_page"].includes(node.type.name)) return;
    const id = target(node);
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  });
  const visit = (node: PMNode): PMNode => {
    const retained = (next: PMNode) => node.attrs.sourceFingerprint
      ? next.type.create({ ...next.attrs, sourceFingerprint: editorFingerprint(next) }, next.content, next.marks) : next;
    if (node.type.name === "block.link_to_page") {
      const id = target(node);
      if (id && child.has(id) && !references.has(id) && counts.get(id) === 1)
        return retained(node.type.schema.nodes["block.child_page"].create(node.attrs, node.content, node.marks));
    }
    if (node.isLeaf) return node;
    const content: PMNode[] = [];
    node.forEach(n => content.push(visit(n)));
    return retained(node.copy(Fragment.fromArray(content)));
  };
  return visit(doc);
}
