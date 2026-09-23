import type { Node as PMNode } from "prosemirror-model";

/** Shared by the editor and HTML export, independent of the source spelling. */
export function tocIncludes(node: PMNode, level: number): boolean {
  return level >= node.attrs.minLevel && level <= node.attrs.maxLevel;
}
