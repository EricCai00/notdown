import { Mark, type Schema } from "prosemirror-model";
import {
  Plugin,
  TextSelection,
  type Command,
  type EditorState,
} from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { inlineMarkCaret } from "./inline-mark-caret";

export function inlineMarkBoundary(state: EditorState) {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;
  const { $from } = selection;
  if (!$from.parent.inlineContent) return null;
  const before = $from.nodeBefore;
  const after = $from.nodeAfter;
  const left = before?.marks ?? Mark.none;
  const right = after?.marks ?? Mark.none;
  const ending = left.filter((mark) => !mark.isInSet(right));
  const starting = right.filter((mark) => !mark.isInSet(left));
  if (!ending.length && !starting.length) return null;
  return { left, right, ending, starting, before, after };
}

/** At a boundary: left formatting <-> shared formatting <-> right formatting.
 * This also provides a plain slot between adjacent colors or links with
 * different attributes. Marks spanning the boundary are never removed. */
export function moveAcrossInlineMarks(direction: -1 | 1): Command {
  return (state, dispatch) => {
    const boundary = inlineMarkBoundary(state);
    if (!boundary) return false;
    const current = state.storedMarks ?? state.selection.$from.marks();
    const leaving = direction === 1 ? boundary.ending : boundary.starting;
    const entering = direction === 1 ? boundary.starting : boundary.ending;
    let next = current;
    if (leaving.some((mark) => mark.isInSet(current))) {
      for (const mark of leaving) next = mark.removeFromSet(next);
    } else {
      for (const mark of entering) next = mark.addToSet(next);
    }
    if (Mark.sameSet(current, next)) return false;
    dispatch?.(state.tr.setStoredMarks(next));
    return true;
  };
}

function codeDecorations(state: EditorState) {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty)
    return DecorationSet.empty;
  const mark = state.schema.marks.code?.isInSet(
    state.storedMarks ?? selection.$from.marks(),
  );
  if (!mark) return DecorationSet.empty;
  const ranges: { from: number; to: number }[] = [];
  selection.$from.parent.forEach((node, offset) => {
    if (!node.isText || !mark.isInSet(node.marks)) return;
    const from = selection.$from.start() + offset;
    const previous = ranges.at(-1);
    if (previous?.to === from) previous.to += node.nodeSize;
    else ranges.push({ from, to: from + node.nodeSize });
  });
  const range = ranges.find(
    ({ from, to }) => from <= selection.from && selection.from <= to,
  );
  return range
    ? DecorationSet.create(state.doc, [
        Decoration.inline(range.from, range.to, {
          class: "pm-inline-code-active",
        }),
      ])
    : DecorationSet.empty;
}

export function inlineMarkNavigation(schema: Schema) {
  const caret = inlineMarkCaret(schema);
  let arrowOrigin: { state: EditorState; direction: -1 | 1 } | null = null;
  const clearOrigin = () => {
    arrowOrigin = null;
    return false;
  };
  return new Plugin({
    props: {
      markViews: caret.markViews,
      handleDOMEvents: {
        pointerdown: clearOrigin,
        compositionstart: clearOrigin,
        blur: clearOrigin,
      },
      handleKeyDown(view, event) {
        arrowOrigin = null;
        if (
          !view.editable ||
          view.composing ||
          event.isComposing ||
          event.shiftKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          !["ArrowLeft", "ArrowRight"].includes(event.key)
        )
          return false;
        const direction = event.key === "ArrowRight" ? 1 : -1;
        if (moveAcrossInlineMarks(direction)(view.state, view.dispatch, view))
          return true;
        if (
          view.state.selection instanceof TextSelection &&
          view.state.selection.empty
        ) {
          arrowOrigin = { state: view.state, direction };
        }
        return false;
      },
      decorations: codeDecorations,
      handleTextInput(view, _from, _to, _text, defaultTransaction) {
        // Noninclusive marks (links/native spans) otherwise lose their inside
        // state after typing the final character. Keep that state until an
        // explicit exit, using the DOM/input transaction's own inserted marks.
        // Markdown input rules run earlier and retain their explicit exit.
        const current =
          view.state.storedMarks ?? view.state.selection.$from.marks();
        const noninclusive = current.filter(
          (mark) => mark.type.spec.inclusive === false,
        );
        if (!noninclusive.length) return false;
        const tr = defaultTransaction();
        if (!(tr.selection instanceof TextSelection) || !tr.selection.empty)
          return false;
        const before = tr.selection.$from.nodeBefore;
        const continued = noninclusive.filter(
          (mark) => before?.isText && mark.isInSet(before.marks),
        );
        if (!continued.length) return false;
        let marks = tr.storedMarks ?? tr.selection.$from.marks();
        for (const mark of continued) marks = mark.addToSet(marks);
        view.dispatch(tr.setStoredMarks(marks));
        return true;
      },
    },
    view: caret.view,
    appendTransaction(transactions, oldState, state) {
      const origin = arrowOrigin;
      arrowOrigin = null;
      if (
        !origin ||
        origin.state !== oldState ||
        transactions.some(
          (tr) => tr.docChanged || tr.storedMarksSet || tr.getMeta("pointer"),
        ) ||
        !transactions.some((tr) => tr.selectionSet)
      )
        return null;
      const boundary = inlineMarkBoundary(state);
      if (
        !boundary ||
        (state.selection.from - oldState.selection.from) * origin.direction <=
          0 ||
        !oldState.selection.$from.sameParent(state.selection.$from)
      )
        return null;
      // Native movement handles grapheme clusters. Upon arrival, inherit the
      // actual text on the side we came from, including noninclusive marks.
      const marks = origin.direction === 1 ? boundary.left : boundary.right;
      if (
        Mark.sameSet(marks, state.storedMarks ?? state.selection.$from.marks())
      )
        return null;
      return state.tr.setStoredMarks(marks);
    },
  });
}
