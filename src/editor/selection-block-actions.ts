import { NodeSelection, TextSelection, type EditorState, type Transaction } from "prosemirror-state";
import { isListItem } from "../document/list-items";
import { blockAtPos, deleteEditorBlock, duplicateEditorBlock, indentEditorBlock, moveEditorBlock, outdentEditorBlock } from "./editor-blocks";

export type SelectionBlockAction = "insert-after" | "duplicate" | "delete" | "up" | "down" | "indent" | "outdent";

/** Text ranges spanning different rows must not silently act on just their first row. */
export function selectionBlock(state: EditorState) {
  const block = blockAtPos(state.doc, state.selection.from);
  if (!block) return null;
  if (state.selection instanceof NodeSelection) return block;
  const end = blockAtPos(state.doc, state.selection.to);
  return end?.pos === block.pos ? block : null;
}

export function selectionBlockAction(state: EditorState, action: SelectionBlockAction): Transaction | null {
  const block = selectionBlock(state);
  if (!block) return null;
  if (action === "duplicate") return duplicateEditorBlock(state, block.pos);
  if (action === "delete") return deleteEditorBlock(state, block.pos);
  if (action === "indent" || action === "outdent") {
    let transaction: Transaction | null = null;
    (action === "indent" ? indentEditorBlock : outdentEditorBlock)(state, tr => { transaction = tr; });
    return transaction;
  }
  const $pos = state.doc.resolve(block.pos), parent = $pos.parent, index = $pos.index();
  if (action === "insert-after") {
    const paragraph = state.schema.nodes["block.paragraph"].create();
    const next = isListItem(block.node) ? block.node.type.create({ checked: typeof block.node.attrs.checked === "boolean" ? false : null }, paragraph) : paragraph;
    if (!parent.canReplaceWith(index + 1, index + 1, next.type)) return null;
    const tr = state.tr.insert(block.end, next);
    return tr.setSelection(TextSelection.create(tr.doc, block.end + (isListItem(next) ? 2 : 1)));
  }
  const siblingIndex = index + (action === "up" ? -1 : 1);
  if (siblingIndex < 0 || siblingIndex >= parent.childCount) return null;
  const sibling = parent.child(siblingIndex);
  // Required heading rows in containers cannot be swapped with their children.
  if (!parent.canReplaceWith(index, index + 1, sibling.type) || !parent.canReplaceWith(siblingIndex, siblingIndex + 1, block.node.type)) return null;
  const target = action === "up" ? block.pos - sibling.nodeSize : block.end;
  return moveEditorBlock(state, block.pos, target, action === "up" ? "before" : "after");
}
