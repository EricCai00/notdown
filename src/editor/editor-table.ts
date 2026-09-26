import { editorKind, isEditorKind } from "../document/node-identity";
import { Plugin, TextSelection, type Command, type EditorState } from "prosemirror-state";
import { Fragment, Slice, type Node as PMNode } from "prosemirror-model";
import { Decoration, DecorationSet } from "prosemirror-view";
import { colorStyle } from "../document/notion-syntax.js";

export function tableCaptionId(table: PMNode): string {
  if (!isEditorKind(table.firstChild, "table_caption")) return "";
  const label = String(table.attrs.captionId || table.firstChild.textContent);
  return table.attrs.syntaxForm === "mmd" ? label.toLowerCase().replace(/\W+/g, "") : label;
}

export function inTableCell(state: EditorState): boolean {
  const { $from, $to } = state.selection;
  return [$from, $to].some(pos => {
    for (let depth = pos.depth; depth > 0; depth--)
      if (["table_cell", "table_caption"].includes(editorKind(pos.node(depth)))) return true;
    return false;
  });
}

export const tableLineBreak: Command = (state, dispatch) => {
  if (!inTableCell(state)) return false;
  if (state.selection.$from.parent.type.spec.code) {
    dispatch?.(state.tr.insertText("\n").scrollIntoView());
    return true;
  }
  dispatch?.(state.tr.replaceSelectionWith(state.schema.nodes["character.line_break"].create()).scrollIntoView());
  return true;
};

/** Paste rich text into cells as inline content, never as nested block structure. */
export function tableEditing(): Plugin {
  return new Plugin({
    props: {
      transformPasted(slice, view) {
        if (!inTableCell(view.state)) return slice;
        const nodes: PMNode[] = [];
        let blocks = 0;
        slice.content.descendants(node => {
          if (node.isInline) { nodes.push(node); return false; }
          if (node.isTextblock) {
            if (blocks++) nodes.push(view.state.schema.nodes["character.line_break"].create());
          } else if (node.isLeaf && node.attrs.raw) {
            if (blocks++) nodes.push(view.state.schema.nodes["character.line_break"].create());
            nodes.push(view.state.schema.text(node.attrs.raw));
          }
          return true;
        });
        return new Slice(Fragment.fromArray(nodes), 0, 0);
      },
    },
  });
}

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
    row.attrs.header ||
    (rowIndex === (isEditorKind(table.firstChild, "table_caption") ? 1 : 0) && table.attrs.nfmAttrs["header-row"] === "true") ||
    (columnIndex === 0 && table.attrs.nfmAttrs["header-column"] === "true");
  const alignment = cell.attrs.nfmAttrs?.align;
  const width = String(table.attrs.widths?.[columnIndex] || "");
  return [
    /^\d+(?:\.\d+)?(?:px|%)?$/.test(width) ? `width:${/^\d+$/.test(width) ? width + "px" : width}` : "",
    header ? "background-color:#f7f7f5;font-weight:600" : "",
    color,
    ["left", "right", "center"].includes(alignment)
      ? `text-align:${alignment}`
      : "",
  ]
    .filter(Boolean)
    .join(";");
}

export function tableAppearance(): Plugin {
  const decorate = (doc: PMNode) => {
    const decorations: Decoration[] = [];
    doc.descendants((table, tablePos) => {
      if (!isEditorKind(table, "table")) return;
      table.forEach((row, rowOffset, rowIndex) => {
        if (isEditorKind(row, "table_caption")) {
          const id = tableCaptionId(table);
          if (id) decorations.push(Decoration.node(tablePos + rowOffset + 1, tablePos + rowOffset + 1 + row.nodeSize, { id }));
        }
        if (!isEditorKind(row, "table_row")) return;
        row.forEach((cell, cellOffset, columnIndex) => {
          const pos = tablePos + rowOffset + cellOffset + 2;
          const style = tableCellStyle(table, rowIndex, columnIndex);
          if (style)
            decorations.push(
              Decoration.node(pos, pos + cell.nodeSize, { style }),
            );
        });
      });
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
    while (cellDepth > 0 && !isEditorKind($from.node(cellDepth), "table_cell"))
      cellDepth--;
    if (!cellDepth) return false;
    const tableDepth = cellDepth - 2,
      table = $from.node(tableDepth);
    if (!isEditorKind(table, "table")) return false;
    const start = $from.before(tableDepth),
      cells: number[] = [];
    table.descendants((node, pos) => {
      if (isEditorKind(node, "table_cell")) cells.push(start + 1 + pos);
    });
    const index = cells.indexOf($from.before(cellDepth)),
      target = cells[index + direction];
    if (target !== undefined)
      dispatch?.(
        state.tr
          .setSelection(TextSelection.near(state.doc.resolve(target + 1)))
          .scrollIntoView(),
      );
    else if (direction === 1) {
      let width = 1;
      table.forEach(row => {
        if (!isEditorKind(row, "table_row")) return;
        let count = 0;
        row.forEach(cell => count += Number(cell.attrs.colspan) || 1);
        width = Math.max(width, count);
      });
      const row = state.schema.nodes["structure.table_row"].create({ section: table.lastChild?.attrs.section || 0 }, Array.from({ length: width }, () =>
          state.schema.nodes["structure.table_cell"].create(null, state.schema.nodes["block.paragraph"].create()),
        ));
      const end = start + 1 + table.content.size;
      const tr = state.tr.insert(end, row);
      dispatch?.(
        tr.setSelection(TextSelection.create(tr.doc, end + 3)).scrollIntoView(),
      );
    }
    return true;
  };
}
