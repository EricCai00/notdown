import { Plugin } from "prosemirror-state";
import { isHistoryTransaction } from "prosemirror-history";
import { mmdCitations } from "../document/mmd-citations";

/** Remove local definitions only when this page edit removes their last citation. */
export function citationCleanup() {
  return new Plugin({
    appendTransaction(transactions, before, after) {
      // Loading, source projection, dialect changes and history restore exact
      // snapshots; they must not silently prune pre-existing unused definitions.
      if (!transactions.some(tr => tr.docChanged) || transactions.some(tr =>
        tr.getMeta("addToHistory") === false || tr.getMeta("pageMetadataProjection") || isHistoryTransaction(tr))) return null;
      const previous = mmdCitations(before.doc), current = mmdCitations(after.doc);
      const removed = new Set(previous.entries.map(entry => entry.key));
      for (const entry of current.entries) removed.delete(entry.key);
      if (!removed.size) return null;
      const definitions = current.unused.filter(definition => removed.has(definition.key));
      const owners = new Set([...previous.unused, ...previous.entries.flatMap(entry => entry.definition ? [entry.definition] : []), ...definitions]
        .filter(definition => removed.has(definition.key) && typeof definition.node.attrs.sourceKey === "number")
        .map(definition => definition.node.attrs.sourceKey));
      const tr = after.tr;
      for (const definition of definitions.sort((a, b) => b.pos - a.pos))
        tr.delete(definition.pos, definition.pos + definition.node.nodeSize);
      // Source recovery must not resurrect a definition deliberately removed
      // here (including when its containing block was deleted by the user).
      const hidden = after.doc.attrs.sourceHidden as { ownerKey: number; source: string }[];
      const retained = hidden.filter(item => !owners.has(item.ownerKey));
      if (retained.length !== hidden.length) tr.setDocAttribute("sourceHidden", retained);
      // Appended steps belong to the same history event as the reference edit.
      return tr.docChanged ? tr : null;
    },
  });
}
