import { isEditorKind } from "../document/node-identity";
import { syncTableWidthAttributes } from "../document/table-width-attributes";
import { TextSelection, type Command } from "prosemirror-state";
import { canConvertNotionTable } from "../document/notdown-boundary";
import type { Node as PMNode } from "prosemirror-model";
import { TableSelection, tableMap } from "./table-selection";

export type TableAction = "row-before" | "row-after" | "column-before" | "column-after" | "row-up" | "row-down" | "column-left" | "column-right" | "delete-row" | "delete-column" | "merge-right" | "merge-down" | "merge-selection" | "split" | "caption";
type Cell = { node: PMNode; r: number; c: number; h: number; w: number };
export function editTable(action: TableAction, complexEncoding: string | null = "grid"): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    let depth = $from.depth; while (depth && !isEditorKind($from.node(depth), "table")) depth--;
    if (!depth) return false;
    const table = $from.node(depth), pos = $from.before(depth), rows: PMNode[] = [];
    let caption: PMNode | undefined, selected: Cell | undefined;
    const cells: Cell[] = [], grid: Cell[][] = [];
    table.forEach((row, offset) => {
      if (isEditorKind(row, "table_caption")) { caption = row; return; }
      const r = rows.length; rows.push(row); grid[r] ||= [];
      let c = 0;
      row.forEach((node, childOffset) => {
        while (grid[r][c]) c++;
        const cell: Cell = { node, r, c, h: Number(node.attrs.rowspan) || 1, w: Number(node.attrs.colspan) || 1 };
        const at = pos + offset + childOffset + 2;
        if ($from.pos >= at && $from.pos < at + node.nodeSize) selected = cell;
        cells.push(cell);
        for (let y = r; y < r + cell.h; y++) { grid[y] ||= []; for (let x = c; x < c + cell.w; x++) grid[y][x] = cell; }
        c += cell.w;
      });
    });
    if (!selected && action !== "caption") return false;
    if (!complexEncoding && ["merge-right", "merge-down", "merge-selection", "caption"].includes(action) && ["pipe", "simple", "multiline", "notion"].includes(table.attrs.syntaxForm)) return false;
    const blank = () => state.schema.nodes["structure.table_cell"].create(null, state.schema.nodes["block.paragraph"].create());
    let height = rows.length, width = Math.max(1, ...grid.map(r => r.length));
    const widths = [...table.attrs.widths], columnAttrs = [...table.attrs.columnAttrs];
    const current = selected!;
    const canMerge = (first: Cell, others: Cell[]) => others.every(cell => Object.entries(cell.node.attrs.nfmAttrs || {}).every(([key, value]) => first.node.attrs.nfmAttrs?.[key] === value));
    const rectangle = state.selection instanceof TableSelection ? state.selection.rect : undefined;
    if (action === "caption") caption ||= state.schema.nodes["structure.table_caption"].create(null, state.schema.text("Table caption"));
    else if (action === "merge-selection") {
      if (!rectangle || !(state.selection instanceof TableSelection) || state.selection.cells.length < 2) return false;
      const group = cells.filter(c => c.r >= rectangle.top && c.r < rectangle.bottom && c.c >= rectangle.left && c.c < rectangle.right);
      const first = group[0];
      if (!canMerge(first, group.slice(1))) return false;
      first.node = first.node.copy(group.slice(1).reduce((content, cell) => content.append(cell.node.content), first.node.content));
      first.h = rectangle.bottom - rectangle.top; first.w = rectangle.right - rectangle.left;
      for (const cell of group.slice(1)) cells.splice(cells.indexOf(cell), 1);
    } else if (["row-up", "row-down", "column-left", "column-right"].includes(action)) {
      const row = action.startsWith("row"), begin = row ? current.r : current.c, target = begin + (["row-up", "column-left"].includes(action) ? -1 : 1);
      if (target < 0 || target >= (row ? height : width)) return false;
      // A move cannot split a merged cell or change the required Markdown header row.
      if (cells.some(cell => row ? cell.h > 1 && cell.r <= Math.max(begin, target) && cell.r + cell.h > Math.min(begin, target) : cell.w > 1 && cell.c <= Math.max(begin, target) && cell.c + cell.w > Math.min(begin, target))) return false;
      if (row && Math.min(begin, target) === 0 && ["pipe", "simple", "multiline", "mmd"].includes(table.attrs.syntaxForm)) return false;
      if (rectangle && (row ? rectangle.bottom - rectangle.top : rectangle.right - rectangle.left) > 1) return false;
      for (const cell of cells) { if (row) { if (cell.r === begin) cell.r = target; else if (cell.r === target) cell.r = begin; } else { if (cell.c === begin) cell.c = target; else if (cell.c === target) cell.c = begin; } }
      if (row) [rows[begin], rows[target]] = [rows[target], rows[begin]];
      else { if (widths.length) [widths[begin], widths[target]] = [widths[target], widths[begin]]; if (columnAttrs.length) [columnAttrs[begin], columnAttrs[target]] = [columnAttrs[target], columnAttrs[begin]]; }
    }
    else if (action === "merge-right" || action === "merge-down") {
      const other = action === "merge-right" ? grid[current.r]?.[current.c + current.w] : grid[current.r + current.h]?.[current.c];
      if (!other || other === current || (action === "merge-right" ? other.r !== current.r || other.h !== current.h : other.c !== current.c || other.w !== current.w)) return false;
      if (!canMerge(current, [other])) return false;
      current.node = current.node.copy(current.node.content.append(other.node.content));
      if (action === "merge-right") current.w += other.w; else current.h += other.h;
      cells.splice(cells.indexOf(other), 1);
    } else if (action === "split") {
      if (current.h === 1 && current.w === 1) return false;
      for (let r = current.r; r < current.r + current.h; r++) for (let c = current.c; c < current.c + current.w; c++)
        if (r !== current.r || c !== current.c) cells.push({ node: blank(), r, c, h: 1, w: 1 });
      current.h = current.w = 1;
    } else if (["row-before", "row-after", "column-before", "column-after"].includes(action)) {
      const row = action.startsWith("row"), before = action.endsWith("before"), at = row ? current.r + (before ? 0 : current.h) : current.c + (before ? 0 : current.w);
      for (const cell of cells) {
        if (row) { if (cell.r >= at) cell.r++; else if (cell.r + cell.h > at) cell.h++; }
        else { if (cell.c >= at) cell.c++; else if (cell.c + cell.w > at) cell.w++; }
      }
      if (row) { rows.splice(at, 0, state.schema.nodes["structure.table_row"].create()); height++; }
      else { width++; if (widths.length) widths.splice(at, 0, ""); if (columnAttrs.length) columnAttrs.splice(at, 0, {}); }
    } else {
      const row = action === "delete-row", at = row ? rectangle?.top ?? current.r : rectangle?.left ?? current.c;
      const count = rectangle ? row ? rectangle.bottom - rectangle.top : rectangle.right - rectangle.left : 1;
      if (row ? height <= count : width <= count) return false;
      for (let i = cells.length - 1; i >= 0; i--) {
        const cell = cells[i], begin = row ? cell.r : cell.c, span = row ? cell.h : cell.w;
        const overlap = Math.max(0, Math.min(begin + span, at + count) - Math.max(begin, at));
        if (overlap === span) { cells.splice(i, 1); continue; }
        const next = begin >= at + count ? begin - count : begin >= at ? at : begin;
        if (row) { cell.h -= overlap; cell.r = next; } else { cell.w -= overlap; cell.c = next; }
      }
      if (row) { rows.splice(at, count); height -= count; }
      else { width -= count; widths.splice(at, count); columnAttrs.splice(at, count); }
    }
    const occupied = new Set<string>();
    for (const cell of cells) for (let r = cell.r; r < cell.r + cell.h; r++) for (let c = cell.c; c < cell.c + cell.w; c++) occupied.add(`${r},${c}`);
    for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) if (!occupied.has(`${r},${c}`)) cells.push({ node: blank(), r, c, w: 1, h: 1 });
    const result = rows.map((row, r) => row.type.create(row.attrs, cells.filter(c => c.r === r).sort((a,b)=>a.c-b.c).map(cell => cell.node.type.create({ ...cell.node.attrs, colspan: cell.w, rowspan: cell.h }, cell.node.content))));
    const complex = cells.some(c => c.w > 1 || c.h > 1 || c.node.childCount > 1);
    // Use existing Markdown table encodings for spans; NFM does not define them.
    const syntaxForm = (complex || caption && table.attrs.syntaxForm === "notion") && ["pipe", "simple", "multiline", "notion"].includes(table.attrs.syntaxForm) ? complexEncoding || table.attrs.syntaxForm : table.attrs.syntaxForm;
    if (syntaxForm !== table.attrs.syntaxForm && !canConvertNotionTable(table)) return false;
    const next = table.type.create(syncTableWidthAttributes({ ...table.attrs, syntaxForm, columnAttrs }, widths), caption ? [caption, ...result] : result);
    if (dispatch) {
      const tr = state.tr.replaceWith(pos, pos + table.nodeSize, next);
      const map = tableMap(tr.doc, pos);
      const cell = map.grid[0]?.[0];
      tr.setSelection(TextSelection.near(tr.doc.resolve(action === "caption" || !cell ? Math.min(pos + 3, tr.doc.content.size) : cell.pos + 1)));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}
