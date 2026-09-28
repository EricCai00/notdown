import type { Node as PMNode } from "prosemirror-model";
import { closeHistory } from "prosemirror-history";
import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { cellAt, tableMap } from "./table-selection";
import { adjustColumnWidths, setViewTableWidths, tableWidthAttrs } from "./table-column-widths";

type Clip = { left: number; top: number; right: number; bottom: number };
type Target = { pos: number; table: HTMLTableElement; widths: number[]; bounds: DOMRect; edges: number[] };

/** Boundary dragging is separate from the cell menu's small, centered hit target. */
export function tableColumnResizeView(view: EditorView, root: HTMLElement, changed: () => void, markdownWidths: () => boolean = () => false) {
  const layer = document.createElement("div"), preview = document.createElement("div"), guide = document.createElement("div");
  layer.className = "pm-table-width-controls"; preview.className = "pm-table-resize-preview"; guide.className = "pm-table-width-guide";
  layer.hidden = preview.hidden = guide.hidden = true; root.append(layer, preview, guide);
  const handles: HTMLElement[] = [];
  let target: Target | null = null;
  let drag: { target: Target; index: number; id: number; x: number; doc: PMNode; widths: number[]; handle: HTMLElement; moved: boolean } | null = null;
  const cancel = () => {
    const old = drag; drag = null; preview.hidden = guide.hidden = true; root.classList.remove("is-column-resizing");
    if (old?.handle.hasPointerCapture(old.id)) old.handle.releasePointerCapture(old.id);
    if (old) changed();
  };
  const commit = (value: Target, widths: number[]) => {
    if (!view.editable) return;
    const table = view.state.doc.nodeAt(value.pos); if (!table) return;
    const attrs = tableWidthAttrs(table, widths, markdownWidths());
    const tr = attrs ? closeHistory(view.state.tr).setNodeMarkup(value.pos, undefined, attrs) : setViewTableWidths(view.state, value.pos, widths);
    const map = tableMap(tr.doc, value.pos);
    if (!map.cells.some(cell => cell.pos === cellAt(tr.selection.$from)))
      tr.setSelection(TextSelection.near(tr.doc.resolve(map.cells[0].pos + 1)));
    view.dispatch(tr);
    if (attrs) view.dispatch(closeHistory(view.state.tr));
    target = { ...value, widths };
    view.focus(); changed();
  };
  const start = (index: number, handle: HTMLElement, event: PointerEvent) => {
    if (!target || !view.editable || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    drag = { target, index, id: event.pointerId, x: event.clientX, doc: view.state.doc, widths: target.widths, handle, moved: false };
    handle.setPointerCapture(event.pointerId);
  };
  const render = () => {
    if (!drag) return;
    const { target: value, widths, index } = drag;
    const clone = value.table.cloneNode(true) as HTMLTableElement;
    clone.querySelectorAll("[id]").forEach(element => element.removeAttribute("id")); clone.removeAttribute("id");
    clone.style.width = "100%"; clone.style.tableLayout = "fixed";
    const map = tableMap(view.state.doc, value.pos), cells = [...clone.querySelectorAll<HTMLElement>("td,th")], total = widths.reduce((a, b) => a + b, 0);
    map.cells.forEach((cell, index) => {
      if (!cells[index]) return;
      cells[index].style.width = `${widths.slice(cell.c, cell.c + cell.w).reduce((a, b) => a + b, 0) / total * 100}%`;
      cells[index].style.boxSizing = "border-box";
    });
    preview.replaceChildren(clone); preview.hidden = guide.hidden = false;
    preview.style.left = `${value.bounds.left}px`; preview.style.top = `${value.bounds.top}px`;
    preview.style.width = `${value.bounds.width}px`; preview.style.minHeight = `${value.bounds.height}px`;
    preview.style.font = getComputedStyle(value.table).font;
    const x = value.bounds.left + widths.slice(0, index + 1).reduce((a, b) => a + b, 0);
    guide.style.left = `${x}px`; guide.style.top = `${value.bounds.top}px`; guide.style.height = `${Math.max(value.bounds.height, clone.getBoundingClientRect().height)}px`;
    root.classList.add("is-column-resizing");
  };
  const move = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (view.state.doc !== drag.doc || !view.editable) { cancel(); return; }
    const delta = event.clientX - drag.x;
    if (!drag.moved && Math.abs(delta) < 3) return;
    event.preventDefault(); drag.moved = true;
    drag.widths = adjustColumnWidths(drag.target.widths, drag.index, delta); render();
  };
  const end = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const completed = drag; cancel();
    if (completed.doc === view.state.doc && completed.moved && completed.widths.some((width, i) => Math.abs(width - completed.target.widths[i]) > 0.1))
      commit(completed.target, completed.widths);
  };
  const key = (event: KeyboardEvent) => {
    if (drag && event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); cancel(); }
  };
  document.addEventListener("pointermove", move); document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", cancel); document.addEventListener("keydown", key, true);
  document.addEventListener("scroll", cancel, true); window.addEventListener("resize", cancel); window.addEventListener("blur", cancel);
  return {
    get active() { return !!drag; },
    hide() { if (!drag) { layer.hidden = true; target = null; } },
    layout(pos: number, clip: Clip, blocked: boolean) {
      if (drag) return;
      const table = view.nodeDOM(pos);
      if (blocked || !(table instanceof HTMLTableElement)) { layer.hidden = true; target = null; return; }
      const map = tableMap(view.state.doc, pos), bounds = table.getBoundingClientRect();
      const gridTop = table.rows[0]?.getBoundingClientRect().top ?? bounds.top;
      const gridBottom = table.rows[table.rows.length - 1]?.getBoundingClientRect().bottom ?? bounds.bottom;
      const edges: number[] = Array(map.width + 1).fill(NaN); edges[0] = bounds.left; edges[map.width] = bounds.right;
      for (const cell of map.cells) {
        const dom = view.nodeDOM(cell.pos); if (!(dom instanceof HTMLElement)) continue;
        const rect = dom.getBoundingClientRect(); edges[cell.c] = rect.left; edges[cell.c + cell.w] = rect.right;
      }
      // A fully merged track has no visible internal boundary; infer only its hidden widths.
      for (let i = 1; i < edges.length - 1; i++) if (!Number.isFinite(edges[i])) {
        let end = i + 1; while (!Number.isFinite(edges[end])) end++;
        const step = (edges[end] - edges[i - 1]) / (end - i + 1);
        for (let j = i; j < end; j++) edges[j] = edges[i - 1] + step * (j - i + 1);
      }
      const widths = edges.slice(1).map((x, i) => x - edges[i]);
      target = { pos, table, widths, bounds, edges }; layer.hidden = false;
      for (let index = 0; index < map.width - 1; index++) {
        let handle = handles[index];
        if (!handle) {
          handle = document.createElement("div"); handles.push(handle); layer.append(handle);
          handle.className = "pm-table-width-handle"; handle.tabIndex = 0;
          handle.setAttribute("role", "separator"); handle.setAttribute("aria-orientation", "vertical");
          handle.setAttribute("aria-label", `Resize column ${index + 1}`);
          handle.onpointerdown = event => start(index, handle, event);
          handle.onmousedown = event => event.preventDefault();
          handle.onkeydown = event => {
            if (!target || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
            event.preventDefault(); commit(target, adjustColumnWidths(target.widths, index, (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 30 : 10)));
            handle.focus();
          };
        }
        const x = edges[index + 1];
        handle.hidden = x < clip.left + 4 || x > clip.right - 4;
        handle.style.left = `${x - 3}px`; handle.style.top = `${Math.max(gridTop, clip.top)}px`;
        handle.style.height = `${Math.min(gridBottom, clip.bottom) - Math.max(gridTop, clip.top)}px`;
        // Do not intercept clicks through the middle of a spanning cell.
        // Only portions where an actual cell ends form a resize hit area.
        const segments = map.cells.filter(cell => cell.c + cell.w === index + 1).flatMap(cell => {
          const dom = view.nodeDOM(cell.pos); if (!(dom instanceof HTMLElement)) return [];
          const rect = dom.getBoundingClientRect(), top = Math.max(rect.top, clip.top), bottom = Math.min(rect.bottom, clip.bottom);
          if (bottom <= top) return [];
          const segment = document.createElement("span"); segment.className = "pm-table-width-hit";
          segment.style.top = `${top - Math.max(gridTop, clip.top)}px`; segment.style.height = `${bottom - top}px`;
          return [segment];
        });
        handle.replaceChildren(...segments);
        handle.setAttribute("aria-valuenow", String(Math.round(widths[index]))); handle.setAttribute("aria-valuemin", "48");
        handle.setAttribute("aria-valuemax", String(Math.round(widths[index] + widths[index + 1] - 48)));
        handle.title = map.node.attrs.syntaxForm === "notion" || markdownWidths() ? "Drag to resize column" : "Drag to resize column (this editing view only; this Markdown format does not store widths)";
      }
      for (let i = Math.max(0, map.width - 1); i < handles.length; i++) handles[i].hidden = true;
    },
    update() { if (drag && drag.doc !== view.state.doc) cancel(); },
    destroy() {
      cancel(); layer.remove(); preview.remove(); guide.remove();
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", cancel); document.removeEventListener("keydown", key, true);
      document.removeEventListener("scroll", cancel, true); window.removeEventListener("resize", cancel); window.removeEventListener("blur", cancel);
    },
  };
}
