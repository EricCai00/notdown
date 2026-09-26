import { isEditorKind } from "../document/node-identity";
import { Fragment, type Node as PMNode } from "prosemirror-model";
import { splitBlockKeepMarks } from "prosemirror-commands";
import { TextSelection, type Command } from "prosemirror-state";

/** Enter keeps lines together; Enter on an empty line exits to a paragraph. */
export const lineBlockEnter: Command = (state, dispatch, view) => {
  const { selection } = state;
  const { $from, $to } = selection;
  if (!(selection instanceof TextSelection) || $from.depth < 2 || $to.depth < 2 ||
    !isEditorKind($from.parent, "line") || !isEditorKind($from.node(-1), "line_block") ||
    $from.node(-1) !== $to.node(-1)) return false;
  if (!selection.empty || $from.parent.content.size) return splitBlockKeepMarks(state, dispatch, view);

  const depth = $from.depth - 1;
  const block = $from.node(depth);
  const index = $from.index(depth);
  const lines: PMNode[] = [];
  block.forEach(line => lines.push(line));
  const before = index ? block.copy(Fragment.fromArray(lines.slice(0, index))) : null;
  const after = index + 1 < lines.length ? block.copy(Fragment.fromArray(lines.slice(index + 1))) : null;
  const replacement = Fragment.fromArray([
    ...(before ? [before] : []), state.schema.nodes["block.paragraph"].create(), ...(after ? [after] : []),
  ]);
  const parentIndex = $from.index(depth - 1);
  if (!$from.node(depth - 1).canReplace(parentIndex, parentIndex + 1, replacement)) return false;
  if (dispatch) {
    const pos = $from.before(depth);
    const tr = state.tr.replaceWith(pos, pos + block.nodeSize, replacement);
    dispatch(tr.setSelection(TextSelection.create(tr.doc, pos + (before?.nodeSize ?? 0) + 1)).scrollIntoView());
  }
  return true;
};
