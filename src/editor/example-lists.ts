import { exampleNumbering } from "../document/example-numbering";
import { Plugin } from "prosemirror-state";

/** Example numbering is document-wide and updates with edits and reordering. */
export function exampleLists() {
  return new Plugin({ appendTransaction(transactions, _previous, state) {
    if (!transactions.some(t => t.docChanged)) return;
    const tr = state.tr;
    for (const [pos, attrs] of exampleNumbering(state.doc)) tr.setNodeMarkup(pos, undefined, attrs);
    return tr.docChanged ? tr : undefined;
  } });
}
