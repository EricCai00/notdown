import { Plugin } from "prosemirror-state";

/** Example numbering is document-wide and updates with edits and reordering. */
export function exampleLists() {
  return new Plugin({ appendTransaction(transactions, _previous, state) {
    if (!transactions.some(t => t.docChanged)) return;
    let number = 0; const labels = new Map<string, number>(), tr = state.tr;
    state.doc.descendants((node, pos) => {
      if (node.type.name === "example_list" && node.attrs.start !== number + 1)
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, start: number + 1 });
      if (node.type.name !== "example_list_item") return;
      number++;
      if (node.attrs.label) labels.set(node.attrs.label, number);
      if (node.attrs.number !== number) tr.setNodeMarkup(pos, undefined, { ...node.attrs, number });
    });
    state.doc.descendants((node, pos) => {
      if (node.type.name !== "syntax_inline" || node.attrs.kind !== "example-reference") return;
      const label = String(labels.get(String(node.attrs.raw).replace(/^@/, "")) ?? node.attrs.raw);
      if (label !== node.attrs.label) tr.setNodeMarkup(pos, undefined, { ...node.attrs, label });
    });
    return tr.docChanged ? tr : undefined;
  } });
}
