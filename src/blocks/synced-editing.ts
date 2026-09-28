import { Plugin, type EditorState } from "prosemirror-state";
import { Mapping } from "prosemirror-transform";
import { Fragment, type Node as PMNode } from "prosemirror-model";
import { isEditorKind } from "../document/node-identity";
import { editorFingerprint } from "../document/editor-markdown";
import { editorSchema as schema } from "../document/editor-schema";

export const syncContent = (node: PMNode) => editorFingerprint(schema.nodes.doc.create(null, node.content));
export const syncUrl = (pageId: string, blockId: string) => `#page/${encodeURIComponent(pageId)}#block=${blockId}`;
export function syncKey(node: PMNode, pageId: string) {
  if (!isEditorKind(node, "synced_block")) return "";
  return node.attrs.reference ? String(node.attrs.url || "") : node.attrs.nfmAttrs.id ? syncUrl(pageId, node.attrs.nfmAttrs.id) : "";
}
export function syncedNodes(doc: PMNode) {
  const nodes: { node: PMNode; pos: number }[] = [];
  doc.descendants((node, pos) => {
    if (isEditorKind(node, "synced_block")) { nodes.push({ node, pos }); return false; }
  });
  return nodes;
}

/** Mirror edits inside one document in the same history event. Never use stale DOM. */
export function syncedEditing(currentPage: () => string | undefined, enabled: () => boolean) {
  return new Plugin({
    appendTransaction(transactions, before, after) {
      const pageId = currentPage();
      if (!pageId || !enabled() || !transactions.some(tr => tr.docChanged) || transactions.some(tr => tr.getMeta("synced-copies"))) return null;
      const mapping = new Mapping(); transactions.forEach(tr => mapping.appendMapping(tr.mapping));
      const previous = new Map(syncedNodes(before.doc).map(item => [mapping.map(item.pos), item.node]));
      const groups = new Map<string, ReturnType<typeof syncedNodes>>();
      for (const item of syncedNodes(after.doc)) {
        const key = syncKey(item.node, pageId);
        if (!key || item.node.attrs.reference && item.node.attrs.nfmAttrs["auto-sync"] !== "true") continue;
        groups.set(key, [...(groups.get(key) || []), item]);
      }
      const tr = after.tr;
      for (const group of groups.values()) {
        if (group.filter(item => !item.node.attrs.reference).length > 1) continue;
        const changed = group.filter(({ node, pos }) => {
          const old = previous.get(pos);
          return old && syncKey(old, pageId) === syncKey(node, pageId) && syncContent(old) !== syncContent(node);
        });
        // A bulk source edit can intentionally contain divergent snapshots; keep them recoverable.
        if (!changed.length || changed.some(item => syncContent(item.node) !== syncContent(changed[0].node))) continue;
        const content = changed[0].node.content;
        for (const item of group) {
          if (syncContent(item.node) === syncContent(changed[0].node)) continue;
          const pos = tr.mapping.map(item.pos);
          tr.replaceWith(pos + 1, pos + item.node.nodeSize - 1, content);
        }
      }
      return tr.docChanged ? tr.setMeta("synced-copies", true) : null;
    },
  });
}

export function wrapSyncedBlocks(state: EditorState, positions: number[]) {
  const sorted = [...new Set(positions)].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const nodes = sorted.map(pos => state.doc.nodeAt(pos));
  if (nodes.some(node => !node || !node.isBlock || isEditorKind(node, "synced_block"))) return null;
  for (let i = 1; i < sorted.length; i++) if (sorted[i] !== sorted[i - 1] + nodes[i - 1]!.nodeSize) return null;
  const from = sorted[0], to = sorted.at(-1)! + nodes.at(-1)!.nodeSize;
  const $from = state.doc.resolve(from), $to = state.doc.resolve(to);
  for (let depth = 1; depth <= $from.depth; depth++) if (isEditorKind($from.node(depth), "synced_block")) return null;
  if (!$from.sameParent($to) || !$from.parent.canReplaceWith($from.index(), $to.index(), schema.nodes["block.synced_block"])) return null;
  if (nodes.some(node => syncedNodes(node!).length)) return null;
  return state.tr.replaceWith(from, to, schema.nodes["block.synced_block"].create({ nfmAttrs: { id: crypto.randomUUID() } }, nodes as PMNode[]));
}

/** Nested source slices include container indentation; invalidate only the cache on reparenting. */
export function unsyncTransaction(state: EditorState, pos: number) {
  const node = state.doc.nodeAt(pos);
  if (!node || !isEditorKind(node, "synced_block")) return null;
  const detach = (child: PMNode): PMNode => {
    if (child.isText) return child;
    const children: PMNode[] = []; child.forEach(item => children.push(detach(item)));
    return child.type.create({ ...child.attrs, source: null, sourceFingerprint: null, sourceKey: null, sourceStart: null, sourceEnd: null }, Fragment.from(children), child.marks);
  };
  const children: PMNode[] = []; node.forEach(child => children.push(detach(child)));
  return state.tr.replaceWith(pos, pos + node.nodeSize, children);
}
