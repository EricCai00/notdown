import type { DatabaseProperty } from "./database-model";
import { t } from "../../shared/i18n";

export const minDatabaseColumnWidth = 64;
export const maxDatabaseColumnWidth = 2000;
const clamp = (width: number) => Math.max(minDatabaseColumnWidth, Math.min(maxDatabaseColumnWidth, Math.round(width)));

/** Delegation also covers the cloned headers in grouped tables. */
export function installDatabaseTableResize(table: HTMLTableElement, fields: DatabaseProperty[], saved: Record<string, number>, canResize: () => boolean, commit: (widths: Record<string, number>) => void) {
  const defaults: Partial<Record<DatabaseProperty["type"], number>> = { title: 230, checkbox: 106, number: 150, date: 260, select: 210, status: 210 };
  const widths = fields.map(field => saved[field.id] ?? defaults[field.type] ?? 200);
  const gutter = table.querySelector(".database-selection-gutter") ? 104 : 0;
  const cols = document.createElement("colgroup");
  for (const width of [...(gutter ? [gutter] : []), ...widths, 40]) { const col = document.createElement("col"); col.style.width = `${width}px`; cols.append(col); }
  table.prepend(cols); table.classList.add("database-resizable-table");
  const paint = () => {
    widths.forEach((width, index) => (cols.children[index + (gutter ? 1 : 0)] as HTMLElement).style.width = `${width}px`);
    table.style.width = `${widths.reduce((sum, width) => sum + width, 40 + gutter)}px`;
    table.querySelectorAll<HTMLElement>(".database-column-resizer").forEach(handle => {
      const index = fields.findIndex(field => field.id === handle.parentElement?.dataset.propertyId);
      if (index >= 0) handle.setAttribute("aria-valuenow", String(widths[index]));
    });
  };
  for (const th of table.querySelectorAll<HTMLElement>("thead th[data-property-id]")) {
    const field = fields.find(field => field.id === th.dataset.propertyId)!;
    const handle = document.createElement("div"); handle.className = "database-column-resizer"; handle.tabIndex = 0;
    handle.setAttribute("role", "separator"); handle.setAttribute("aria-orientation", "vertical");
    handle.setAttribute("aria-label", `${t("Resize column")}: ${field.name}`); handle.title = t("Drag to resize column");
    handle.setAttribute("aria-valuemin", String(minDatabaseColumnWidth)); handle.setAttribute("aria-valuemax", String(maxDatabaseColumnWidth));
    th.append(handle);
  }
  paint();
  let drag: { handle: HTMLElement; index: number; x: number; width: number; pointer: number } | undefined;
  const publish = () => commit(Object.fromEntries(fields.map((field, index) => [field.id, widths[index]])));
  const finish = (cancel: boolean) => {
    if (!drag) return;
    const current = drag; drag = undefined;
    const changed = widths[current.index] !== current.width;
    if (cancel) { widths[current.index] = current.width; paint(); }
    current.handle.classList.remove("is-resizing");
    table.classList.remove("is-column-resizing");
    document.documentElement.classList.remove("database-column-dragging");
    if (current.handle.hasPointerCapture(current.pointer)) current.handle.releasePointerCapture(current.pointer);
    if (!cancel && changed) publish();
  };
  const down = (event: PointerEvent) => {
    const handle = (event.target as Element).closest<HTMLElement>(".database-column-resizer");
    if (!handle || event.button !== 0 || drag || !canResize()) return;
    event.preventDefault();
    const index = fields.findIndex(field => field.id === handle.parentElement?.dataset.propertyId);
    drag = { handle, index, x: event.clientX, width: widths[index], pointer: event.pointerId };
    handle.setPointerCapture(event.pointerId); handle.classList.add("is-resizing");
    table.classList.add("is-column-resizing"); document.documentElement.classList.add("database-column-dragging");
  };
  const move = (event: PointerEvent) => { if (drag && event.pointerId === drag.pointer) { widths[drag.index] = clamp(drag.width + event.clientX - drag.x); paint(); } };
  const up = (event: PointerEvent) => { if (drag && event.pointerId === drag.pointer) finish(event.type !== "pointerup"); };
  const key = (event: KeyboardEvent) => {
    if (drag && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(true); return; }
    const handle = (event.target as Element).closest<HTMLElement>(".database-column-resizer");
    if (!handle || !["ArrowLeft", "ArrowRight"].includes(event.key) || !canResize()) return;
    event.preventDefault(); event.stopPropagation();
    const index = fields.findIndex(field => field.id === handle.parentElement?.dataset.propertyId);
    widths[index] = clamp(widths[index] + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 50 : 10)); paint(); publish();
  };
  const click = (event: MouseEvent) => { if ((event.target as Element).closest(".database-column-resizer")) { event.preventDefault(); event.stopPropagation(); } };
  const blur = () => finish(true);
  table.addEventListener("pointerdown", down); table.addEventListener("click", click);
  table.addEventListener("lostpointercapture", up);
  window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  window.addEventListener("keydown", key, true); window.addEventListener("blur", blur);
  return () => {
    finish(true); table.removeEventListener("pointerdown", down); table.removeEventListener("click", click); table.removeEventListener("lostpointercapture", up);
    window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
    window.removeEventListener("keydown", key, true); window.removeEventListener("blur", blur);
  };
}
