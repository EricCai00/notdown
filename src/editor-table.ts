import { Plugin, TextSelection, type Command } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { Decoration, DecorationSet } from "prosemirror-view";
import { colorStyle } from "./notion-syntax.js";

/** The official precedence is cell, then row, then column. */
export function tableCellStyle(
  table: PMNode,
  rowIndex: number,
  columnIndex: number,
): string {
  const row = table.child(rowIndex),
    cell = row.child(columnIndex);
  const color = [
    cell.attrs.nfmAttrs?.color,
    row.attrs.nfmAttrs?.color,
    table.attrs.columnAttrs?.[columnIndex]?.color,
  ]
    .map((value) => colorStyle(value || ""))
    .find(Boolean);
  const header =
    (rowIndex === 0 && table.attrs.nfmAttrs["header-row"] === "true") ||
    (columnIndex === 0 && table.attrs.nfmAttrs["header-column"] === "true");
  return [header ? "background-color:#f7f7f5;font-weight:600" : "", color]
    .filter(Boolean)
    .join(";");
}

export function tableAppearance(): Plugin {
  const decorate = (doc: PMNode) => {
    const decorations: Decoration[] = [];
    doc.descendants((table, tablePos) => {
      if (table.type.name !== "table") return;
      table.forEach((row, rowOffset, rowIndex) =>
        row.forEach((cell, cellOffset, columnIndex) => {
          const pos = tablePos + rowOffset + cellOffset + 2;
          const style = tableCellStyle(table, rowIndex, columnIndex);
          if (style)
            decorations.push(
              Decoration.node(pos, pos + cell.nodeSize, { style }),
            );
        }),
      );
      return false;
    });
    return DecorationSet.create(doc, decorations);
  };
  return new Plugin<DecorationSet>({
    state: {
      init: (_, state) => decorate(state.doc),
      apply: (tr, previous) => (tr.docChanged ? decorate(tr.doc) : previous),
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}

/** Tab moves between table cells and extends the last row, like a block table. */
export function moveTableCell(direction: 1 | -1): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    let cellDepth = $from.depth;
    while (cellDepth > 0 && $from.node(cellDepth).type.name !== "table_cell")
      cellDepth--;
    if (!cellDepth) return false;
    const tableDepth = cellDepth - 2,
      table = $from.node(tableDepth);
    if (table.type.name !== "table") return false;
    const start = $from.before(tableDepth),
      cells: number[] = [];
    table.descendants((node, pos) => {
      if (node.type.name === "table_cell") cells.push(start + 1 + pos);
    });
    const index = cells.indexOf($from.before(cellDepth)),
      target = cells[index + direction];
    if (target !== undefined)
      dispatch?.(
        state.tr
          .setSelection(TextSelection.create(state.doc, target + 2))
          .scrollIntoView(),
      );
    else if (direction === 1) {
      const row = state.schema.nodes.table_row.create(
        null,
        Array.from({ length: table.lastChild!.childCount }, () =>
          state.schema.nodes.table_cell.create(
            null,
            state.schema.nodes.paragraph.create(),
          ),
        ),
      );
      const end = start + 1 + table.content.size;
      const tr = state.tr.insert(end, row);
      dispatch?.(
        tr.setSelection(TextSelection.create(tr.doc, end + 3)).scrollIntoView(),
      );
    }
    return true;
  };
}
