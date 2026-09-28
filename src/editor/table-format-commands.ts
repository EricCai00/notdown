import { TextSelection, type Command, type EditorState } from "prosemirror-state";
import { isEditorKind } from "../document/node-identity";
import { syncTableWidthAttributes } from "../document/table-width-attributes";
import { cellAt, tableMap, TableSelection } from "./table-selection";

export type TableScope = "row" | "column" | "cell";
function context(state: EditorState) {
  const at = cellAt(state.selection.$from);
  if (at === undefined) return null;
  const resolved = state.doc.resolve(at);
  for (let d = resolved.depth; d; d--) if (isEditorKind(resolved.node(d), "table")) {
    const pos = resolved.before(d), map = tableMap(state.doc, pos);
    const current = map.cells.find(cell => cell.pos === at)!;
    const cells = state.selection instanceof TableSelection ? state.selection.cells : [current];
    return { pos, map, current, cells };
  }
  return null;
}

export const clearTableContents: Command = (state, dispatch) => {
  const ctx = context(state); if (!ctx) return false;
  if (dispatch) {
    const tr = state.tr;
    for (const cell of [...ctx.cells].reverse()) tr.replaceWith(cell.pos + 1, cell.pos + cell.node.nodeSize - 1, state.schema.nodes["block.paragraph"].create());
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/** Colors have an existing carrier in official Notion tables only. Never turn
 * a Markdown table into HTML or discard its spans just to apply a color. */
export function colorTable(scope: TableScope, color: string): Command {
  return (state, dispatch) => {
    const ctx = context(state);
    if (!ctx || ctx.map.node.attrs.syntaxForm !== "notion" || !/^(?:(?:gray|brown|orange|yellow|green|blue|purple|pink|red)(?:_bg)?)?$/.test(color)) return false;
    const attrs = (old: Record<string, string>) => { const next = { ...old }; if (color) next.color = color; else delete next.color; return next; };
    if (dispatch) {
      const tr = state.tr;
      if (scope === "column") {
        const columns = [...ctx.map.node.attrs.columnAttrs];
        for (const index of new Set(ctx.cells.flatMap(cell => Array.from({ length: cell.w }, (_, i) => cell.c + i)))) {
          while (columns.length <= index) columns.push({});
          columns[index] = attrs(columns[index]);
        }
        tr.setNodeMarkup(ctx.pos, undefined, { ...ctx.map.node.attrs, columnAttrs: columns });
      } else if (scope === "row") {
        const indices = new Set(ctx.cells.flatMap(cell => Array.from({ length: cell.h }, (_, i) => cell.r + i)));
        let index = 0;
        ctx.map.node.forEach((row, offset) => {
          if (isEditorKind(row, "table_row") && indices.has(index++)) tr.setNodeMarkup(ctx.pos + offset + 1, undefined, { ...row.attrs, nfmAttrs: attrs(row.attrs.nfmAttrs) });
        });
      } else for (const cell of ctx.cells) tr.setNodeMarkup(cell.pos, undefined, { ...cell.node.attrs, nfmAttrs: attrs(cell.node.attrs.nfmAttrs) });
      dispatch(tr);
    }
    return true;
  };
}

/** Markdown alignment belongs to a logical column, including its header. */
export function alignTableColumns(align: "left" | "center" | "right"): Command {
  return (state, dispatch) => {
    const ctx = context(state);
    if (!ctx || !["pipe", "mmd"].includes(ctx.map.node.attrs.syntaxForm)) return false;
    const columns = new Set(ctx.cells.flatMap(cell => Array.from({ length: cell.w }, (_, i) => cell.c + i)));
    const affected = ctx.map.cells.filter(cell => Array.from({ length: cell.w }, (_, i) => cell.c + i).some(c => columns.has(c)));
    // A merged header cannot encode different alignment for its covered columns.
    if (affected.some(cell => Array.from({ length: cell.w }, (_, i) => cell.c + i).some(c => !columns.has(c)))) return false;
    if (dispatch) {
      const tr = state.tr;
      for (const cell of affected) tr.setNodeMarkup(cell.pos, undefined, { ...cell.node.attrs, nfmAttrs: { ...cell.node.attrs.nfmAttrs, align } });
      dispatch(tr);
    }
    return true;
  };
}

/** Duplicate a single unspanned row/column without splitting merged cells. */
export function duplicateTableAxis(axis: "row" | "column"): Command {
  return (state, dispatch) => {
    const ctx = context(state); if (!ctx) return false;
    const { map, current, pos } = ctx, rowAxis = axis === "row";
    if (map.cells.some(cell => cell.h > 1 || cell.w > 1)) return false;
    if (new Set(ctx.cells.map(cell => rowAxis ? cell.r : cell.c)).size !== 1) return false;
    const rows = [...map.node.content.content];
    const offset = isEditorKind(rows[0], "table_caption") ? 1 : 0;
    if (rowAxis) {
      const source = rows[current.r + offset];
      // Required Markdown header semantics cannot be duplicated into a body row.
      if (source.attrs.header || source.firstChild?.attrs.header) return false;
      rows.splice(current.r + offset + 1, 0, source);
    } else {
      for (let r = offset; r < rows.length; r++) {
        const cells = [...rows[r].content.content]; cells.splice(current.c + 1, 0, cells[current.c]);
        rows[r] = rows[r].copy(state.schema.nodes["structure.table_row"].create(null, cells).content);
      }
    }
    const widths = [...map.node.attrs.widths], columns = [...map.node.attrs.columnAttrs];
    if (!rowAxis) {
      if (widths.length) widths.splice(current.c + 1, 0, widths[current.c] || "");
      if (columns.length) columns.splice(current.c + 1, 0, { ...columns[current.c] });
    }
    if (dispatch) {
      const next = map.node.type.create(syncTableWidthAttributes({ ...map.node.attrs, columnAttrs: columns }, widths), rows);
      const tr = state.tr.replaceWith(pos, pos + map.node.nodeSize, next);
      const inserted = tableMap(tr.doc, pos).grid[current.r + (rowAxis ? 1 : 0)][current.c + (rowAxis ? 0 : 1)];
      dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(inserted.pos + 1))).scrollIntoView());
    }
    return true;
  };
}
