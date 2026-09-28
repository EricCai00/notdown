import type { Node as PMNode } from "prosemirror-model";
import { nodeReference, resolveReferencePage } from "../document/internal-reference";
import type { LinkedPage } from "./editor-links";

/** Compare the whole document so moving a block does not delete its page. */
export function removedChildPages(before: PMNode, after: PMNode, pages: readonly LinkedPage[], currentId?: string): string[] {
  const counts = (doc: PMNode) => {
    const result = new Map<string, number>();
    doc.descendants(node => {
      if (node.type.name !== "block.child_page") return;
      const reference = nodeReference(node);
      const page = reference && resolveReferencePage(reference, pages, currentId);
      if (page) result.set(page.id, (result.get(page.id) ?? 0) + 1);
    });
    return result;
  };
  const remaining = counts(after);
  return [...counts(before)].filter(([id, count]) => count > (remaining.get(id) ?? 0)).map(([id]) => id);
}
