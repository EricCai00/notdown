import { DOMSerializer, type Node as PMNode } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";
import { closeHistory } from "prosemirror-history";
import type { EditorView } from "prosemirror-view";
import { tableMap } from "./table-selection";
import { resizeTable } from "./table-resize";
import { tableCellStyle } from "./editor-table";
import { isEditorKind } from "../document/node-identity";

/** Pointer preview stays outside ProseMirror; release creates one undoable edit. */
export function tableResizeView(view: EditorView, root: HTMLElement, row: HTMLButtonElement, column: HTMLButtonElement,
  getTarget: () => { table: number } | null, changed: () => void) {
  const preview = document.createElement("div"), badge = document.createElement("div");
  preview.className = "pm-table-resize-preview"; badge.className = "pm-table-resize-count";
  badge.setAttribute("role", "status"); preview.hidden = badge.hidden = true; root.append(preview, badge);
  let drag: { axis: "row" | "column"; button: HTMLButtonElement; id: number; pos: number; doc: PMNode;
    original: PMNode; next: PMNode; width: number; height: number; x: number; y: number; step: number;
    bounds: DOMRect; moved: boolean } | null = null;
  let suppressClick = false;
  const cancel = () => {
    const previous = drag; drag = null; preview.hidden = badge.hidden = true; root.classList.remove("is-resizing");
    row.removeAttribute("data-dragging"); column.removeAttribute("data-dragging");
    if (previous?.button.hasPointerCapture(previous.id)) previous.button.releasePointerCapture(previous.id);
    if (previous?.moved) suppressClick = true;
    changed();
  };
  const layout = () => {
    if (!drag?.moved) return;
    const { bounds, button, axis } = drag;
    const height = preview.firstElementChild?.getBoundingClientRect().height ?? bounds.height;
    if (axis === "row") button.style.top = `${bounds.top + height + 3}px`;
    badge.style.left = `${Math.min(window.innerWidth - 80, bounds.left + bounds.width / 2 - 30)}px`;
    badge.style.top = `${Math.max(4, Math.min(window.innerHeight - 40, bounds.top + height - 40))}px`;
  };
  const start = (axis: "row" | "column", button: HTMLButtonElement, event: PointerEvent) => {
    if (event.button !== 0 || !view.editable) return;
    const target = getTarget(); if (!target) return;
    const dom = view.nodeDOM(target.table); if (!(dom instanceof HTMLElement)) return;
    event.preventDefault(); suppressClick = false;
    const map = tableMap(view.state.doc, target.table), bounds = dom.getBoundingClientRect();
    const firstRow = dom.querySelector("tr")?.getBoundingClientRect();
    drag = { axis, button, id: event.pointerId, pos: target.table, doc: view.state.doc, original: map.node, next: map.node,
      width: map.width, height: map.height, x: event.clientX, y: event.clientY,
      step: axis === "row" ? Math.max(24, firstRow?.height ?? 40) : Math.max(40, Math.min(120, bounds.width / map.width)), bounds, moved: false };
    const style = getComputedStyle(dom); preview.style.font = style.font; preview.style.color = style.color;
    preview.style.left = `${bounds.left}px`; preview.style.top = `${bounds.top}px`; preview.style.width = `${bounds.width}px`;
    preview.style.minHeight = `${bounds.height}px`;
    button.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (drag.doc !== view.state.doc || !view.editable) { cancel(); return; }
    const delta = drag.axis === "row" ? event.clientY - drag.y : event.clientX - drag.x;
    if (!drag.moved && Math.abs(delta) < 4) return;
    drag.moved = true; event.preventDefault();
    const count = Math.round(delta / drag.step);
    const next = resizeTable(drag.original, drag.width + (drag.axis === "column" ? count : 0), drag.height + (drag.axis === "row" ? count : 0));
    if (next !== drag.next || preview.hidden) {
      drag.next = next;
      const rendered = DOMSerializer.fromSchema(view.state.schema).serializeNode(next) as HTMLElement;
      rendered.style.width = "100%"; rendered.style.tableLayout = "fixed";
      let rowIndex = 0;
      next.forEach((node, _offset, index) => {
        if (!isEditorKind(node, "table_row")) return;
        const cells = (rendered as HTMLTableElement).rows[rowIndex++]?.cells;
        node.forEach((_cell, _cellOffset, columnIndex) => {
          if (cells?.[columnIndex]) cells[columnIndex].style.cssText = tableCellStyle(next, index, columnIndex);
        });
      });
      preview.replaceChildren(rendered);
      const map = tableMap(view.state.schema.topNodeType.create(null, next), 0);
      badge.textContent = `${map.width} × ${map.height}`;
    }
    preview.hidden = badge.hidden = false; root.classList.add("is-resizing"); drag.button.dataset.dragging = "true"; layout();
  };
  const end = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const finished = drag; cancel();
    if (!finished.moved || finished.doc !== view.state.doc || !view.editable || finished.next.eq(finished.original)) return;
    const tr = closeHistory(view.state.tr).replaceWith(finished.pos, finished.pos + finished.original.nodeSize, finished.next);
    const first = tableMap(tr.doc, finished.pos).cells[0];
    tr.setSelection(TextSelection.near(tr.doc.resolve(first.pos + 1)));
    view.dispatch(tr); view.dispatch(closeHistory(view.state.tr)); view.focus();
  };
  const escape = (event: KeyboardEvent) => { if (drag && event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); cancel(); } };
  const click = (event: MouseEvent) => { if (suppressClick) { suppressClick = false; event.preventDefault(); event.stopImmediatePropagation(); } };
  row.onpointerdown = event => start("row", row, event); column.onpointerdown = event => start("column", column, event);
  row.addEventListener("click", click, true); column.addEventListener("click", click, true);
  document.addEventListener("pointermove", move); document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", cancel); document.addEventListener("keydown", escape, true);
  window.addEventListener("blur", cancel); window.addEventListener("resize", cancel); document.addEventListener("scroll", cancel, true);
  return { layout, get active() { return !!drag; }, update() { if (drag && drag.doc !== view.state.doc) cancel(); }, destroy() {
    cancel(); preview.remove(); badge.remove();
    document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", end);
    document.removeEventListener("pointercancel", cancel); document.removeEventListener("keydown", escape, true);
    window.removeEventListener("blur", cancel); window.removeEventListener("resize", cancel); document.removeEventListener("scroll", cancel, true);
  } };
}
