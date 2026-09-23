import { Plugin, TextSelection, type Command } from "prosemirror-state";
import { canConvertNotionTable } from "./notdown-boundary";
import type { Node as PMNode } from "prosemirror-model";

export type TableAction = "row-after" | "column-after" | "delete-row" | "delete-column" | "merge-right" | "merge-down" | "split" | "caption";
type Cell = { node: PMNode; r: number; c: number; h: number; w: number };
export function editTable(action: TableAction, complexEncoding: string | null = "grid"): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    let depth = $from.depth; while (depth && $from.node(depth).type.name !== "table") depth--;
    if (!depth) return false;
    const table = $from.node(depth), pos = $from.before(depth), rows: PMNode[] = [];
    let caption: PMNode | undefined, selected: Cell | undefined;
    const cells: Cell[] = [], grid: Cell[][] = [];
    table.forEach((row, offset) => {
      if (row.type.name === "table_caption") { caption = row; return; }
      const r = rows.length; rows.push(row); grid[r] ||= [];
      let c = 0;
      row.forEach((node, childOffset) => {
        while (grid[r][c]) c++;
        const cell: Cell = { node, r, c, h: Number(node.attrs.rowspan) || 1, w: Number(node.attrs.colspan) || 1 };
        const at = pos + offset + childOffset + 2;
        if ($from.pos >= at && $from.pos <= at + node.nodeSize) selected = cell;
        cells.push(cell);
        for (let y = r; y < r + cell.h; y++) { grid[y] ||= []; for (let x = c; x < c + cell.w; x++) grid[y][x] = cell; }
        c += cell.w;
      });
    });
    if (!selected && action !== "caption") return false;
    if (!complexEncoding && ["merge-right", "merge-down", "caption"].includes(action) && ["pipe", "simple", "multiline", "notion"].includes(table.attrs.syntaxForm)) return false;
    const blank = () => state.schema.nodes.table_cell.create(null, state.schema.nodes.paragraph.create());
    let height = rows.length, width = Math.max(1, ...grid.map(r => r.length));
    const widths = [...table.attrs.widths], columnAttrs = [...table.attrs.columnAttrs];
    const current = selected!;
    if (action === "caption") caption ||= state.schema.nodes.table_caption.create(null, state.schema.text("Table caption"));
    else if (action === "merge-right" || action === "merge-down") {
      const other = action === "merge-right" ? grid[current.r]?.[current.c + current.w] : grid[current.r + current.h]?.[current.c];
      if (!other || other === current || (action === "merge-right" ? other.r !== current.r || other.h !== current.h : other.c !== current.c || other.w !== current.w)) return false;
      current.node = current.node.copy(current.node.content.append(other.node.content));
      if (action === "merge-right") current.w += other.w; else current.h += other.h;
      cells.splice(cells.indexOf(other), 1);
    } else if (action === "split") {
      if (current.h === 1 && current.w === 1) return false;
      for (let r = current.r; r < current.r + current.h; r++) for (let c = current.c; c < current.c + current.w; c++)
        if (r !== current.r || c !== current.c) cells.push({ node: blank(), r, c, h: 1, w: 1 });
      current.h = current.w = 1;
    } else if (action === "row-after" || action === "column-after") {
      const row = action === "row-after", at = row ? current.r + current.h : current.c + current.w;
      for (const cell of cells) {
        if (row) { if (cell.r >= at) cell.r++; else if (cell.r + cell.h > at) cell.h++; }
        else { if (cell.c >= at) cell.c++; else if (cell.c + cell.w > at) cell.w++; }
      }
      if (row) { rows.splice(at, 0, state.schema.nodes.table_row.create()); height++; }
      else { width++; if (widths.length) widths.splice(at, 0, ""); if (columnAttrs.length) columnAttrs.splice(at, 0, {}); }
    } else {
      const row = action === "delete-row", at = row ? current.r : current.c;
      if (row ? height === 1 : width === 1) return false;
      for (let i = cells.length - 1; i >= 0; i--) {
        const cell = cells[i], begin = row ? cell.r : cell.c, span = row ? cell.h : cell.w;
        if (begin <= at && begin + span > at) {
          if (span === 1) { cells.splice(i, 1); continue; }
          if (row) cell.h--; else cell.w--;
        } else if (begin > at) { if (row) cell.r--; else cell.c--; }
      }
      if (row) { rows.splice(at, 1); height--; }
      else { width--; widths.splice(at, 1); columnAttrs.splice(at, 1); }
    }
    const occupied = new Set<string>();
    for (const cell of cells) for (let r = cell.r; r < cell.r + cell.h; r++) for (let c = cell.c; c < cell.c + cell.w; c++) occupied.add(`${r},${c}`);
    for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) if (!occupied.has(`${r},${c}`)) cells.push({ node: blank(), r, c, w: 1, h: 1 });
    const result = rows.map((row, r) => row.type.create(row.attrs, cells.filter(c => c.r === r).sort((a,b)=>a.c-b.c).map(cell => cell.node.type.create({ ...cell.node.attrs, colspan: cell.w, rowspan: cell.h }, cell.node.content))));
    const complex = cells.some(c => c.w > 1 || c.h > 1 || c.node.childCount > 1);
    // Use existing Markdown table encodings for spans; NFM does not define them.
    const syntaxForm = (complex || caption && table.attrs.syntaxForm === "notion") && ["pipe", "simple", "multiline", "notion"].includes(table.attrs.syntaxForm) ? complexEncoding || table.attrs.syntaxForm : table.attrs.syntaxForm;
    if (syntaxForm !== table.attrs.syntaxForm && !canConvertNotionTable(table)) return false;
    const next = table.type.create({ ...table.attrs, syntaxForm, widths, columnAttrs }, caption ? [caption, ...result] : result);
    if (dispatch) {
      const tr = state.tr.replaceWith(pos, pos + table.nodeSize, next);
      tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(pos + 3, tr.doc.content.size))));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}
export function tableControls(canCommand: (name: string) => boolean = () => true) {
  return new Plugin({ view(view) {
    const toolbar = document.createElement("div"); toolbar.className = "pm-table-tools"; toolbar.setAttribute("aria-label", "Table editing");
    const buttons: { button: HTMLButtonElement; action: TableAction }[] = [];
    const encoding = () => canCommand("table_grid") ? "grid" : canCommand("table_mmd") ? "mmd" : null;
    for (const [action, label] of Object.entries({ "row-after": "Add row", "column-after": "Add column", "delete-row": "Delete row", "delete-column": "Delete column", "merge-right": "Merge right", "merge-down": "Merge down", split: "Split cell", caption: "Add caption" })) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = label;
      button.onmousedown = e => e.preventDefault(); button.onclick = () => { editTable(action as TableAction, encoding())(view.state, view.dispatch); view.focus(); };
      toolbar.append(button); buttons.push({ button, action: action as TableAction });
    }
    view.dom.parentElement!.append(toolbar);
    const update = () => { let active = false; for (const { button, action } of buttons) { const available = view.editable && (action !== "caption" || canCommand("table_caption")) && editTable(action, encoding())(view.state); button.disabled = !available; active ||= available; } toolbar.hidden = !active; };
    update(); return { update, destroy() { toolbar.remove(); } };
  } });
}
