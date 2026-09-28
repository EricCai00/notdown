import { isEditorKind } from "../document/node-identity";
import type { Node as PMNode } from "prosemirror-model";
import { parseNative } from "../markdown-engine/codec";
import { defaultSyntax } from "../markdown-engine/config";
import type { Page } from "../shared/types";

export function syncedSource(url: string) {
  const match = /^#page\/([^#]+)#block=([a-zA-Z0-9_-]+)$/.exec(url);
  if (!match) throw new Error("Use #page/PAGE_ID#block=BLOCK_ID to refer to a local synced block.");
  return { pageId: decodeURIComponent(match[1]), blockId: match[2] };
}
export function findSyncedSource(page: Page, id: string): { doc: PMNode; node: PMNode; pos: number } {
  const doc = parseNative(page.body, page.syntax || defaultSyntax(page.bodyFormat));
  return findSyncedSourceInDoc(doc, id);
}
export function findSyncedSourceInDoc(doc: PMNode, id: string): { doc: PMNode; node: PMNode; pos: number } {
  let found: { doc: PMNode; node: PMNode; pos: number } | undefined;
  doc.descendants((node, pos) => {
    if (isEditorKind(node, "synced_block") && node.attrs.nfmAttrs.id === id && !node.attrs.reference) {
      if (found) throw new Error("Source block ID is ambiguous.");
      found = { doc, node, pos };
    }
  });
  if (!found) throw new Error("Source synced block was not found.");
  return found;
}
