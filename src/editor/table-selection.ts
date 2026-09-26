import { isEditorKind } from "../document/node-identity";
import { Fragment, Slice, type Node as PMNode, type ResolvedPos } from "prosemirror-model";
import { Plugin, Selection, SelectionRange, TextSelection, type EditorState, type Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Mappable } from "prosemirror-transform";

export interface TableCell { node: PMNode; pos: number; r: number; c: number; h: number; w: number }
export function tableMap(doc: PMNode, pos: number) {
  const node = doc.nodeAt(pos);
  if (!isEditorKind(node, "table")) throw new Error("Expected a table.");
  const cells: TableCell[] = [], grid: TableCell[][] = [];
  let r = 0;
  node.forEach((row, offset) => {
    if (!isEditorKind(row, "table_row")) return;
    grid[r] ||= []; let c = 0;
    row.forEach((cell, childOffset) => {
      while (grid[r][c]) c++;
      const item = { node: cell, pos: pos + offset + childOffset + 2, r, c, h: Number(cell.attrs.rowspan) || 1, w: Number(cell.attrs.colspan) || 1 };
      cells.push(item);
      for (let y = r; y < r + item.h; y++) { grid[y] ||= []; for (let x = c; x < c + item.w; x++) grid[y][x] = item; }
      c += item.w;
    }); r++;
  });
  return { node, cells, grid, height: r, width: Math.max(0, ...grid.map(row => row.length)) };
}
export function cellAt($pos: ResolvedPos): number | undefined {
  if (isEditorKind($pos.nodeAfter, "table_cell")) return $pos.pos;
  for (let depth = $pos.depth; depth; depth--) if (isEditorKind($pos.node(depth), "table_cell")) return $pos.before(depth);
}
function tableAtCell($cell: ResolvedPos) {
  for (let depth = $cell.depth; depth; depth--) if (isEditorKind($cell.node(depth), "table")) return $cell.before(depth);
  throw new Error("Cell is outside a table.");
}
export class TableSelection extends Selection {
  readonly tablePos: number;
  readonly cells: TableCell[];
  readonly rect: { top: number; left: number; bottom: number; right: number };
  constructor(readonly $anchorCell: ResolvedPos, readonly $headCell: ResolvedPos) {
    const tablePos = tableAtCell($anchorCell);
    if (tableAtCell($headCell) !== tablePos) throw new Error("Select cells within one table.");
    const { cells } = tableMap($anchorCell.doc, tablePos), a = cells.find(c => c.pos === $anchorCell.pos)!, b = cells.find(c => c.pos === $headCell.pos)!;
    if (!a || !b) throw new Error("Invalid cell selection.");
    let top = Math.min(a.r, b.r), left = Math.min(a.c, b.c), bottom = Math.max(a.r + a.h, b.r + b.h), right = Math.max(a.c + a.w, b.c + b.w);
    // Expand to whole merged cells; no command cuts through a span.
    let changed = true;
    while (changed) { changed = false; for (const c of cells) {
      if (c.r < bottom && c.r + c.h > top && c.c < right && c.c + c.w > left) {
        const next = [Math.min(top, c.r), Math.min(left, c.c), Math.max(bottom, c.r + c.h), Math.max(right, c.c + c.w)];
        if (next.join() !== [top, left, bottom, right].join()) { [top, left, bottom, right] = next; changed = true; }
      }
    } }
    const selected = cells.filter(c => c.r >= top && c.r < bottom && c.c >= left && c.c < right);
    const ranges = selected.map(c => new SelectionRange($anchorCell.doc.resolve(c.pos + 1), $anchorCell.doc.resolve(c.pos + c.node.nodeSize - 1)));
    super(ranges[0].$from, ranges.at(-1)!.$to, ranges);
    this.tablePos = tablePos; this.cells = selected; this.rect = { top, left, bottom, right };
  }
  map(doc: PMNode, mapping: Mappable): Selection {
    const a = mapping.map(this.$anchorCell.pos), b = mapping.map(this.$headCell.pos);
    try { return new TableSelection(doc.resolve(a), doc.resolve(b)); } catch { return TextSelection.near(doc.resolve(Math.min(a, doc.content.size))); }
  }
  content() { return new Slice(Fragment.fromArray(this.cells.flatMap(c => [...c.node.content.content])), 0, 0); }
  eq(other: Selection) { return other instanceof TableSelection && this.$anchorCell.pos === other.$anchorCell.pos && this.$headCell.pos === other.$headCell.pos; }
  toJSON() { return { type: "notdown-table", anchor: this.$anchorCell.pos, head: this.$headCell.pos }; }
  static fromJSON(doc: PMNode, json: { anchor: number; head: number }) { return new TableSelection(doc.resolve(json.anchor), doc.resolve(json.head)); }
  getBookmark() { const a = this.$anchorCell.pos, b = this.$headCell.pos; return tableBookmark(a, b); }
  replace(tr: Transaction, content = Slice.empty) {
    const start = tr.steps.length;
    for (let i = this.cells.length - 1; i >= 0; i--) {
      const cell = this.cells[i], pos = tr.mapping.slice(start).map(cell.pos);
      tr.replaceWith(pos + 1, pos + cell.node.nodeSize - 1, i === 0 && content.size ? content.content : tr.doc.type.schema.nodes["block.paragraph"].create());
    }
    tr.setSelection(TextSelection.near(tr.doc.resolve(tr.mapping.slice(start).map(this.cells[0].pos) + 1)));
  }
  replaceWith(tr: Transaction, node: PMNode) {
    this.replace(tr, new Slice(Fragment.from(node.isInline ? tr.doc.type.schema.nodes["block.paragraph"].create(null, node) : node), 0, 0));
  }
}
function tableBookmark(anchor: number, head: number): { map(mapping: Mappable): ReturnType<typeof tableBookmark>; resolve(doc: PMNode): Selection } {
  return { map: mapping => tableBookmark(mapping.map(anchor), mapping.map(head)), resolve: doc => {
    try { return new TableSelection(doc.resolve(anchor), doc.resolve(head)); } catch { return TextSelection.near(doc.resolve(Math.min(anchor, doc.content.size))); }
  } };
}
Selection.jsonID("notdown-table", TableSelection);

export function selectTableCells(state: EditorState, axis: "row" | "column" | "table") {
  const at = cellAt(state.selection.$from); if (at === undefined) return null;
  const pos = tableAtCell(state.doc.resolve(at)), map = tableMap(state.doc, pos), cell = map.cells.find(c => c.pos === at)!;
  const a = axis === "row" ? map.grid[cell.r][0] : axis === "column" ? map.grid[0][cell.c] : map.grid[0][0];
  const b = axis === "row" ? map.grid[cell.r][map.width - 1] : axis === "column" ? map.grid[map.height - 1][cell.c] : map.grid[map.height - 1][map.width - 1];
  return new TableSelection(state.doc.resolve(a.pos), state.doc.resolve(b.pos));
}
export function selectedTableText(selection: TableSelection) {
  const { grid } = tableMap(selection.$from.doc, selection.tablePos), { top, left, bottom, right } = selection.rect;
  return Array.from({ length: bottom - top }, (_, y) => Array.from({ length: right - left }, (_, x) => {
    const cell = grid[top + y][left + x];
    return cell.r === top + y && cell.c === left + x ? cell.node.textBetween(0, cell.node.content.size, " ").replace(/[\t\r\n]/g, " ") : "";
  }).join("\t")).join("\n");
}
export function pasteTableText(state: EditorState, text: string): Transaction | null {
  const selection = state.selection; if (!(selection instanceof TableSelection)) return null;
  const values = text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n").map(row => row.split("\t"));
  const { top, left, bottom, right } = selection.rect;
  if (values.length !== 1 || values[0].length !== 1) {
    if (values.length !== bottom - top || values.some(r => r.length !== right - left) || selection.cells.some(c => c.w !== 1 || c.h !== 1)) return null;
  }
  const tr = state.tr;
  for (const cell of [...selection.cells].reverse()) {
    const value = values.length === 1 && values[0].length === 1 ? values[0][0] : values[cell.r - top][cell.c - left];
    tr.replaceWith(cell.pos + 1, cell.pos + cell.node.nodeSize - 1, state.schema.nodes["block.paragraph"].create(null, value ? state.schema.text(value) : undefined));
  }
  return tr;
}
export function tableSelections() {
  return new Plugin({ props: {
    decorations(state) { return state.selection instanceof TableSelection ? DecorationSet.create(state.doc, state.selection.cells.map(c => Decoration.node(c.pos, c.pos + c.node.nodeSize, { class: "pm-selected-cell" }))) : null; },
    handleClickOn(view, _pos, node, pos, event) {
      if (!isEditorKind(node, "table_cell") || !event.shiftKey) return false;
      const anchor = view.state.selection instanceof TableSelection ? view.state.selection.$anchorCell.pos : cellAt(view.state.selection.$from);
      if (anchor === undefined) return false;
      try { view.dispatch(view.state.tr.setSelection(new TableSelection(view.state.doc.resolve(anchor), view.state.doc.resolve(pos)))); event.preventDefault(); return true; } catch { return false; }
    },
    handleKeyDown(view, event) {
      const selection = view.state.selection;
      if (!(selection instanceof TableSelection)) return false;
      if (event.key === "Escape") { view.dispatch(view.state.tr.setSelection(TextSelection.near(selection.$anchorCell))); return true; }
      if (["Backspace", "Delete"].includes(event.key) && view.editable) { const tr = view.state.tr; selection.replace(tr); view.dispatch(tr); return true; }
      return false;
    },
    handleDOMEvents: { copy(view, event) {
      if (!(view.state.selection instanceof TableSelection) || !event.clipboardData) return false;
      event.clipboardData.setData("text/plain", selectedTableText(view.state.selection)); event.preventDefault(); return true;
    }, cut(view, event) {
      if (!view.editable || !(view.state.selection instanceof TableSelection) || !event.clipboardData) return false;
      event.clipboardData.setData("text/plain", selectedTableText(view.state.selection)); event.preventDefault();
      const tr = view.state.tr; view.state.selection.replace(tr); view.dispatch(tr); return true;
    } },
    handlePaste(view, event) {
      if (!view.editable || !(view.state.selection instanceof TableSelection)) return false;
      const tr = pasteTableText(view.state, event.clipboardData?.getData("text/plain") || "");
      if (tr) view.dispatch(tr);
      // Reject mismatched matrices without truncating source or expanding the table silently.
      return true;
    },
  } });
}
