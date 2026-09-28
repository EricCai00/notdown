import { Plugin, TextSelection, type Command } from "prosemirror-state";
import { createElement, GripVertical, EllipsisVertical, Copy, CircleX, Trash2, PaintRoller, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, AlignLeft, AlignCenter, AlignRight, Table2, Combine, Split, Type, ChevronRight } from "lucide";
import { colorStyle } from "../document/notion-syntax";
import { alignTableColumns, clearTableContents, colorTable, duplicateTableAxis, type TableScope } from "./table-format-commands";
import { isEditorKind } from "../document/node-identity";
import { editTable, type TableAction } from "./table-commands";
import { cellAt, selectTableCells, tableMap, TableSelection } from "./table-selection";
import { tableResizeView } from "./table-resize-view";
import { tableColumnResizeView } from "./table-column-resize-view";
import "./table-controls.css";

type MenuKind = "row" | "column" | "cell" | "table";
const labels: Record<TableAction, string> = {
  "row-before": "Insert row above", "row-after": "Insert row below",
  "column-before": "Insert column left", "column-after": "Insert column right",
  "row-up": "Move row up", "row-down": "Move row down",
  "column-left": "Move column left", "column-right": "Move column right",
  "delete-row": "Delete row", "delete-column": "Delete column",
  "merge-selection": "Merge selection", "merge-right": "Merge right", "merge-down": "Merge down",
  split: "Split cell", caption: "Add caption",
};

/** Transient controls live outside the editable document and never enter Markdown. */
export function tableControls(canCommand: (name: string) => boolean = () => true) {
  return new Plugin({ view(view) {
    const root = document.createElement("div");
    root.className = "pm-table-controls";
    root.setAttribute("aria-label", "Table editing");
    const menu = document.createElement("div");
    menu.className = "pm-table-menu"; menu.setAttribute("role", "menu"); menu.hidden = true;
    const palette = document.createElement("div"); palette.className = "pm-table-menu pm-table-palette"; palette.setAttribute("role", "menu"); palette.setAttribute("aria-label", "Table color"); palette.hidden = true;
    const outline = document.createElement("div"); outline.className = "pm-table-target-outline"; outline.setAttribute("aria-hidden", "true");
    const selectionTools = document.createElement("div");
    selectionTools.className = "pm-table-selection-tools";
    selectionTools.setAttribute("role", "toolbar"); selectionTools.setAttribute("aria-label", "Cell actions");
    let target: { table: number; cell: number } | null = null;
    let hoveredCell: { table: number; cell: number } | null = null;
    let pointerX = -1, pointerY = -1;
    let hovering = false, menuAnchor: HTMLElement | null = null, frame = 0, destroyed = false;
    let menuDoc = view.state.doc, menuSelection = view.state.selection;
    const encoding = () => canCommand("table_grid") ? "grid" : canCommand("table_mmd") ? "mmd" : null;
    const available = (action: TableAction) => view.editable && (action !== "caption" || canCommand("table_caption")) && editTable(action, encoding())(view.state);
    const button = (label: string, className: string, text: string, action: () => void) => {
      const element = document.createElement("button");
      element.type = "button"; element.className = className; element.textContent = text;
      element.setAttribute("aria-label", label); element.title = label;
      element.onmousedown = event => event.preventDefault();
      element.onclick = action;
      return element;
    };
    const closeMenu = (restoreFocus = false) => {
      menu.hidden = true; palette.hidden = true;
      menuAnchor?.setAttribute("aria-expanded", "false"); menuAnchor = null;
      if (restoreFocus) view.focus();
    };
    const run = (action: TableAction) => {
      // Recheck the current state; a dismissed/stale menu cannot edit another table.
      if (!menu.hidden && (menuDoc !== view.state.doc || !menuSelection.eq(view.state.selection))) { closeMenu(); return; }
      closeMenu();
      if (available(action)) editTable(action, encoding())(view.state, view.dispatch);
      view.focus(); schedule();
    };
    const selectTarget = () => {
      if (!target || !isEditorKind(view.state.doc.nodeAt(target.cell), "table_cell")) return false;
      if (cellAt(view.state.selection.$from) !== target.cell)
        view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(target.cell + 1))));
      return true;
    };
    const selectAxis = (axis: "row" | "column" | "table") => {
      const selection = selectTableCells(view.state, axis);
      if (selection) view.dispatch(view.state.tr.setSelection(selection));
    };
    const execute = (command: Command) => {
      if (!view.editable || menuDoc !== view.state.doc || !menuSelection.eq(view.state.selection)) { closeMenu(); return; }
      if (!command(view.state)) return;
      closeMenu(); command(view.state, view.dispatch); view.focus(); schedule();
    };
    const menuItem = (label: string, icon: typeof Copy, action: () => void, enabled = true, reason = "Unavailable for this table or selection.", parent = menu) => {
      const item = button(label, "pm-table-menu-item", "", action);
      item.append(createElement(icon)); const text = document.createElement("span"); text.textContent = label; item.append(text);
      item.setAttribute("role", "menuitem"); item.tabIndex = -1; item.setAttribute("aria-disabled", String(!enabled));
      if (!enabled) item.title = reason;
      parent.append(item); return item;
    };
    const commandItem = (label: string, icon: typeof Copy, command: Command, reason?: string) => menuItem(label, icon, () => execute(command), command(view.state), reason);
    const openPalette = (scope: TableScope) => {
      if (!colorTable(scope, "")(view.state)) return;
      palette.replaceChildren();
      for (const background of [false, true]) {
        const heading = document.createElement("div"); heading.className = "pm-table-menu-heading"; heading.textContent = background ? "Background color" : "Text color"; palette.append(heading);
        for (const color of ["", "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"]) {
          const value = color ? color + (background ? "_bg" : "") : "";
          const label = `${color ? color[0].toUpperCase() + color.slice(1) : "Default"} ${background ? "background" : "text"}`;
          const item = menuItem(label, Type, () => execute(colorTable(scope, value)), true, undefined, palette);
          const swatch = document.createElement("span"); swatch.className = "pm-table-color-swatch"; swatch.textContent = background ? "" : "A"; swatch.style.cssText = colorStyle(value);
          item.firstChild!.replaceWith(swatch);
        }
      }
      palette.hidden = false; layout(); palette.querySelector<HTMLButtonElement>("button")?.focus();
    };
    const searchMenu = () => {
      const input = document.createElement("input"); input.type = "search"; input.className = "pm-table-menu-search"; input.placeholder = "Search actions…"; input.setAttribute("aria-label", "Search table actions");
      const empty = document.createElement("div"); empty.className = "pm-table-menu-heading"; empty.textContent = "No matching actions"; empty.hidden = true; empty.setAttribute("role", "status"); menu.append(empty);
      input.oninput = () => {
        const query = input.value.trim().toLowerCase();
        for (const item of menu.querySelectorAll<HTMLButtonElement>("button")) item.hidden = !item.textContent?.toLowerCase().includes(query);
        for (const line of menu.querySelectorAll<HTMLElement>('[role="separator"]')) line.hidden = !!query;
        empty.hidden = !!menu.querySelector("button:not([hidden])");
        palette.hidden = true; layout();
      };
      menu.prepend(input);
    };
    const addAction = (action: TableAction) => {
      const icon = action.includes("delete") ? Trash2 : action.includes("merge") ? Combine : action === "split" ? Split : action === "caption" ? Type : action.includes("up") || action === "row-before" ? ArrowUp : action.includes("down") || action === "row-after" ? ArrowDown : action.includes("left") || action === "column-before" ? ArrowLeft : ArrowRight;
      const item = menuItem(labels[action], icon, () => { if (available(action)) run(action); });
      item.setAttribute("role", "menuitem"); item.tabIndex = -1;
      // aria-disabled keeps explanations discoverable with keyboard focus.
      item.setAttribute("aria-disabled", String(!available(action)));
      if (!available(action)) item.title = ["merge-selection", "merge-right", "merge-down", "caption"].includes(action) && !encoding()
        ? "The current Markdown dialect cannot preserve this operation."
        : "Unavailable for this selection. Check merged cells, table edges or the required header row.";
      if (action.startsWith("delete")) item.classList.add("is-danger");
      menu.append(item);
    };
    const separator = () => { const line = document.createElement("div"); line.setAttribute("role", "separator"); menu.append(line); };
    const openMenu = (kind: MenuKind, anchor: HTMLElement) => {
      if (!menu.hidden && menuAnchor === anchor) { closeMenu(true); return; }
      closeMenu();
      if (!selectTarget()) return;
      if (kind === "row" || kind === "column") selectAxis(kind);
      menu.replaceChildren();
      menu.setAttribute("aria-label", kind === "table" ? "Table options" : kind === "row" ? "Row actions" : kind === "cell" ? "Cell actions" : "Column actions");
      if (kind === "table") {
        for (const axis of ["row", "column", "table"] as const) {
          const label = axis === "table" ? "Select table" : axis === "row" ? "Row actions" : "Column actions";
          const item = menuItem(label, Table2, () => {
            if (axis !== "table") openMenu(axis, axis === "row" ? row : column);
            else { closeMenu(); selectAxis(axis); view.focus(); }
          });
          if (axis !== "table") item.setAttribute("aria-haspopup", "menu");
          item.setAttribute("role", "menuitem"); item.tabIndex = -1; menu.append(item);
        }
        menuItem("Cell actions", Table2, () => openMenu("cell", cellHandle));
        separator();
        for (const action of ["merge-selection", "merge-right", "merge-down", "split"] as const) addAction(action);
        separator(); addAction("caption");
      } else {
        const color = menuItem("Color", PaintRoller, () => openPalette(kind), colorTable(kind, "")(view.state), "This Markdown table has no native row, column or cell color syntax.");
        color.setAttribute("aria-haspopup", "menu"); color.append(createElement(ChevronRight));
        if (kind !== "cell") {
          for (const action of kind === "row" ? ["row-before", "row-after", "row-up", "row-down"] as const : ["column-before", "column-after", "column-left", "column-right"] as const) addAction(action);
          commandItem("Duplicate", Copy, duplicateTableAxis(kind), "Duplicate one unmerged row or column. Required Markdown header rows cannot be duplicated.");
        }
        commandItem("Clear contents", CircleX, clearTableContents);
        if (kind !== "row" && alignTableColumns("left")(view.state)) {
          separator();
          for (const [align, icon] of [["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const)
            commandItem(`Align column ${align}`, icon, alignTableColumns(align), "Column alignment requires a pipe or MultiMarkdown table and compatible merged headers.");
        }
        const cellActions = kind === "cell" ? ["merge-selection", "merge-right", "merge-down", "split"] as const : ["merge-selection", "split"] as const;
        if (cellActions.some(available)) { separator(); for (const action of cellActions) addAction(action); }
        if (kind !== "cell") { separator(); addAction(kind === "row" ? "delete-row" : "delete-column"); }
      }
      searchMenu();
      menuDoc = view.state.doc; menuSelection = view.state.selection;
      menuAnchor = anchor; anchor.setAttribute("aria-expanded", "true"); menu.hidden = false;
      layout(); menu.querySelector<HTMLInputElement>("input")?.focus();
    };
    const row = button("Row actions", "pm-table-handle pm-table-row-handle", "⋮", () => openMenu("row", row));
    const column = button("Column actions", "pm-table-handle pm-table-column-handle", "⋯", () => openMenu("column", column));
    const hoverAxis = (kind: "row" | "column") => {
      if (!hoveredCell) return;
      target = hoveredCell; openMenu(kind, kind === "row" ? row : column);
    };
    const hoverRow = button("Hovered row actions", "pm-table-handle pm-table-row-handle", "", () => hoverAxis("row"));
    const hoverColumn = button("Hovered column actions", "pm-table-handle pm-table-column-handle", "", () => hoverAxis("column"));
    hoverRow.append(createElement(GripVertical)); hoverColumn.append(createElement(GripVertical));
    const cellHandle = button("Cell actions", "pm-table-handle pm-table-cell-handle", "", () => openMenu("cell", cellHandle));
    row.replaceChildren(createElement(GripVertical)); column.replaceChildren(createElement(GripVertical)); cellHandle.append(createElement(EllipsisVertical));
    const more = button("Table options", "pm-table-handle pm-table-more", "⋯", () => openMenu("table", more));
    more.setAttribute("aria-keyshortcuts", "Alt+F10"); more.title = "Table options (Alt+F10)";
    for (const control of [row, column, hoverRow, hoverColumn, cellHandle, more]) { control.setAttribute("aria-haspopup", "menu"); control.setAttribute("aria-expanded", "false"); }
    const append = (axis: "row" | "column") => {
      if (!target) return;
      const map = tableMap(view.state.doc, target.table);
      const cell = axis === "row" ? map.grid.at(-1)?.[0] : map.grid[0]?.at(-1);
      if (!cell) return;
      closeMenu();
      view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(cell.pos + 1))));
      run(axis === "row" ? "row-after" : "column-after");
    };
    const addRow = button("Add row", "pm-table-add pm-table-add-row", "+", () => append("row"));
    const addColumn = button("Add column", "pm-table-add pm-table-add-column", "+", () => append("column"));
    const merge = button("Merge selection", "", "Merge cells", () => run("merge-selection"));
    const split = button("Split cell", "", "Split cell", () => run("split"));
    selectionTools.append(merge, split);
    root.append(outline, row, column, hoverRow, hoverColumn, cellHandle, more, addRow, addColumn, selectionTools, menu, palette); document.body.append(root);
    const resize = tableResizeView(view, root, addRow, addColumn, () => target, schedule);
    const columnResize = tableColumnResizeView(view, root, schedule, () => canCommand("table_column_widths"));

    const fromSelection = () => {
      const cell = cellAt(view.state.selection.$from);
      if (cell === undefined) return null;
      const pos = view.state.doc.resolve(cell);
      for (let depth = pos.depth; depth; depth--) if (isEditorKind(pos.node(depth), "table")) return { table: pos.before(depth), cell };
      return null;
    };
    const position = (element: HTMLElement, x: number, y: number) => { element.style.left = `${Math.round(x)}px`; element.style.top = `${Math.round(y)}px`; };
    const layout = () => {
      if (destroyed) return;
      const focused = view.hasFocus() || root.contains(document.activeElement);
      root.hidden = !view.editable || !target || (!hovering && !focused && menu.hidden);
      if (root.hidden || !target) { columnResize.hide(); return; }
      const table = view.nodeDOM(target.table), cell = view.nodeDOM(target.cell);
      if (!(table instanceof HTMLElement) || !(cell instanceof HTMLElement) || !table.isConnected) { root.hidden = true; closeMenu(); return; }
      const bounds = table.getBoundingClientRect(), cellBounds = cell.getBoundingClientRect();
      let left = 0, top = 0, right = window.innerWidth, bottom = window.innerHeight;
      for (let parent = table.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), rect = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, rect.left); right = Math.min(right, rect.right); }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, rect.top); bottom = Math.min(bottom, rect.bottom); }
      }
      if (!bounds.width || !bounds.height || bounds.bottom <= top || bounds.top >= bottom || bounds.right <= left || bounds.left >= right) { root.hidden = true; closeMenu(); return; }
      const visibleTop = Math.max(bounds.top, top), visibleBottom = Math.min(bounds.bottom, bottom);
      columnResize.layout(target.table, { left, top, right, bottom }, !menu.hidden || resize.active);
      position(row, Math.max(left + 2, bounds.left - 9), cellBounds.top + cellBounds.height / 2 - 13);
      row.hidden = cellBounds.top < top || cellBounds.bottom > bottom;
      position(column, cellBounds.left + cellBounds.width / 2 - 13, Math.max(top + 2, bounds.top - 9));
      column.hidden = cellBounds.left < left || cellBounds.right > right || bounds.top < top;
      hoverRow.hidden = hoverColumn.hidden = true;
      if (menu.hidden && hoveredCell?.table === target.table && hoveredCell.cell !== target.cell) {
        const hovered = view.nodeDOM(hoveredCell.cell);
        if (hovered instanceof HTMLElement) {
          const rect = hovered.getBoundingClientRect(), map = tableMap(view.state.doc, target.table);
          const primary = map.cells.find(c => c.pos === target!.cell), secondary = map.cells.find(c => c.pos === hoveredCell!.cell);
          position(hoverRow, Math.max(left + 2, bounds.left - 9), rect.top + rect.height / 2 - 13);
          position(hoverColumn, rect.left + rect.width / 2 - 13, Math.max(top + 2, bounds.top - 9));
          hoverRow.hidden = primary?.r === secondary?.r || rect.top < top || rect.bottom > bottom;
          hoverColumn.hidden = primary?.c === secondary?.c || rect.left < left || rect.right > right || bounds.top < top;
        }
      }
      position(more, Math.min(bounds.right - 28, right - 30), Math.max(top + 2, bounds.top - 28));
      position(addRow, Math.max(bounds.left, left), bounds.bottom + 3);
      addRow.style.width = `${Math.min(bounds.right, right) - Math.max(bounds.left, left)}px`;
      addRow.hidden = bounds.bottom + 21 > bottom;
      position(addColumn, bounds.right + 3, visibleTop);
      addColumn.style.height = `${visibleBottom - visibleTop}px`; addColumn.hidden = bounds.right + 21 > right;
      addRow.dataset.near = String(menu.hidden && pointerX >= bounds.left && pointerX <= bounds.right && pointerY >= bounds.bottom - 3 && pointerY <= bounds.bottom + 24);
      addColumn.dataset.near = String(menu.hidden && pointerY >= visibleTop && pointerY <= visibleBottom && pointerX >= bounds.right - 3 && pointerX <= bounds.right + 24);
      const selection = view.state.selection;
      const selected = selection instanceof TableSelection && selection.tablePos === target.table;
      let activeBounds = cellBounds;
      if (selected) {
        const rects = selection.cells.map(c => view.nodeDOM(c.pos)).filter((dom): dom is HTMLElement => dom instanceof HTMLElement).map(dom => dom.getBoundingClientRect());
        const x = Math.min(...rects.map(r => r.left)), y = Math.min(...rects.map(r => r.top));
        activeBounds = new DOMRect(x, y, Math.max(...rects.map(r => r.right)) - x, Math.max(...rects.map(r => r.bottom)) - y);
      }
      const ownsSelection = fromSelection()?.table === target.table && (focused || !menu.hidden);
      outline.hidden = !ownsSelection || activeBounds.top < top || activeBounds.bottom > bottom || activeBounds.left < left || activeBounds.right > right;
      position(outline, activeBounds.left, activeBounds.top); outline.style.width = `${activeBounds.width}px`; outline.style.height = `${activeBounds.height}px`;
      position(cellHandle, activeBounds.right - 9, activeBounds.top + activeBounds.height / 2 - 13);
      cellHandle.hidden = outline.hidden;
      merge.hidden = !selected || selection.cells.length < 2;
      merge.disabled = !available("merge-selection");
      merge.title = merge.disabled ? "This selection cannot be merged in the current Markdown dialect." : "Merge selected cells";
      split.hidden = target.cell !== cellAt(selection.$from) || !available("split");
      selectionTools.hidden = !menu.hidden || (merge.hidden && split.hidden);
      position(selectionTools, Math.max(left + 4, Math.min(cellBounds.left, right - 210)), Math.max(top + 4, bounds.top - 28));
      resize.layout();
      if (!menu.hidden && menuAnchor) {
        menu.style.maxHeight = `${Math.min(480, bottom - top - 8)}px`;
        const anchor = menuAnchor.getBoundingClientRect();
        const x = Math.max(left + 4, Math.min(anchor.left, right - menu.offsetWidth - 4));
        const y = anchor.bottom + menu.offsetHeight + 5 <= bottom ? anchor.bottom + 5 : Math.max(top + 4, anchor.top - menu.offsetHeight - 5);
        position(menu, x, y);
        if (!palette.hidden) {
          palette.style.maxHeight = `${Math.min(480, bottom - top - 8)}px`;
          const px = x + menu.offsetWidth + palette.offsetWidth + 8 <= right ? x + menu.offsetWidth + 5 : Math.max(left + 4, x - palette.offsetWidth - 5);
          position(palette, px, Math.max(top + 4, Math.min(y, bottom - palette.offsetHeight - 4)));
        }
      }
    };
    function schedule() { if (!destroyed && !frame) frame = requestAnimationFrame(() => { frame = 0; layout(); }); }
    const pointer = (event: PointerEvent) => {
      pointerX = event.clientX; pointerY = event.clientY;
      if (resize.active || columnResize.active) return;
      if (!menu.hidden || root.contains(event.target as Node)) { schedule(); return; }
      const cell = event.target instanceof Element ? event.target.closest("td, th") : null;
      hovering = !!cell && view.dom.contains(cell);
      if (hovering && cell) {
        const pos = view.posAtDOM(cell, 0), resolved = view.state.doc.resolve(pos);
        const at = cellAt(resolved);
        if (at !== undefined) {
          for (let depth = resolved.depth; depth; depth--) if (isEditorKind(resolved.node(depth), "table")) {
            hoveredCell = { table: resolved.before(depth), cell: at };
            const selected = fromSelection();
            target = selected?.table === hoveredCell.table ? selected : hoveredCell; break;
          }
        } else hovering = false;
      } else if (target) {
        hoveredCell = null;
        const table = view.nodeDOM(target.table);
        const bounds = table instanceof HTMLElement ? table.getBoundingClientRect() : null;
        hovering = !!bounds && event.clientX >= bounds.left - 30 && event.clientX <= bounds.right + 24 && event.clientY >= bounds.top - 38 && event.clientY <= bounds.bottom + 24;
        if (!hovering && view.hasFocus()) target = fromSelection();
      }
      schedule();
    };
    const outside = (event: PointerEvent) => { if (!root.contains(event.target as Node)) { closeMenu(); hovering = false; schedule(); } };
    const focus = () => { if (view.hasFocus() && menu.hidden) target = fromSelection(); schedule(); };
    const keyboard = (event: KeyboardEvent) => {
      if (event.altKey && event.key === "F10" && view.hasFocus() && fromSelection()) {
        target = fromSelection(); layout(); openMenu("table", more); event.preventDefault(); return;
      }
      if (!root.contains(event.target as Node)) return;
      if (event.key === "Escape" && !palette.hidden) { palette.hidden = true; menu.querySelector<HTMLButtonElement>('[aria-label="Color"]')?.focus(); event.preventDefault(); }
      else if (event.key === "Escape") { closeMenu(true); schedule(); event.preventDefault(); }
      else if (!menu.hidden && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        if (event.target instanceof HTMLInputElement && ["Home", "End"].includes(event.key)) return;
        const items = [...(palette.hidden ? menu : palette).querySelectorAll<HTMLButtonElement>("button:not([hidden])")];
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : index < 0 ? (event.key === "ArrowDown" ? 0 : items.length - 1) : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus(); event.preventDefault();
      } else if (event.key === "Enter" && event.target instanceof HTMLInputElement) { menu.querySelector<HTMLButtonElement>('button:not([hidden])[aria-disabled="false"]')?.click(); event.preventDefault(); }
      else if (event.key === "Tab" && !menu.hidden) { closeMenu(true); schedule(); event.preventDefault(); }
    };
    document.addEventListener("pointermove", pointer);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", focus); document.addEventListener("focusout", schedule);
    document.addEventListener("keydown", keyboard);
    document.addEventListener("scroll", schedule, true); window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule); observer.observe(view.dom);
    target = fromSelection(); layout();
    return {
      update(_view, previous) {
        resize.update();
        columnResize.update();
        if (previous.doc !== view.state.doc || !previous.selection.eq(view.state.selection)) {
          closeMenu(); hovering = false; hoveredCell = null; target = fromSelection();
        }
        schedule();
      },
      destroy() {
        destroyed = true; resize.destroy(); columnResize.destroy(); cancelAnimationFrame(frame); observer.disconnect(); root.remove();
        document.removeEventListener("pointermove", pointer); document.removeEventListener("pointerdown", outside);
        document.removeEventListener("focusin", focus); document.removeEventListener("focusout", schedule);
        document.removeEventListener("keydown", keyboard);
        document.removeEventListener("scroll", schedule, true); window.removeEventListener("resize", schedule);
      },
    };
  } });
}
