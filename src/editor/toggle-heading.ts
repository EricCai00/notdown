import { TextSelection, type Command } from "prosemirror-state";
import { isEditorKind } from "../document/node-identity";

/** Keep the title a single heading; new text belongs to the body or a visible sibling. */
export const toggleHeadingEnter: Command = (state, dispatch, view) => {
  const { $from, $to } = state.selection;
  if (!(state.selection instanceof TextSelection) || !$from.sameParent($to) ||
      $from.depth < 2 || !isEditorKind($from.parent, "heading") || !$from.parent.attrs.toggle ||
      !isEditorKind($from.node(-1), "nested_block") || $from.index(-1) !== 0) return false;
  const groupPos = $from.before($from.depth - 1);
  const dom = view?.nodeDOM(groupPos);
  const expanded = !(dom as HTMLElement | null)?.classList?.contains("pm-toggle-closed");
  if (!dispatch) return true;
  const paragraph = state.schema.nodes["block.paragraph"];
  const tr = state.tr;
  if (state.selection.empty && $from.parentOffset === 0 && $from.parent.content.size) {
    // Enter at the title's start leaves the title and its subtree together.
    tr.insert(groupPos, paragraph.create());
    tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map($from.pos)));
  } else {
    tr.deleteSelection();
    const $head = tr.selection.$from;
    const tail = $head.parent.content.cut($head.parentOffset);
    const insertAt = expanded ? $head.pos + 1 : $head.after($head.depth - 1) - ($head.end() - $head.pos);
    const firstChild = $head.node(-1).maybeChild(1);
    tr.delete($head.pos, $head.end());
    // A newly inserted toggle may already contain an empty first paragraph.
    if (!(expanded && !tail.size && isEditorKind(firstChild, "paragraph") && !firstChild.content.size))
      tr.insert(insertAt, paragraph.create(null, tail));
    tr.setSelection(TextSelection.create(tr.doc, insertAt + 1));
  }
  dispatch(tr.scrollIntoView());
  return true;
};
