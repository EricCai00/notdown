import { t } from "../../shared/i18n";
import { shiftDay } from "./database-query";

/** A full-width empty date lane. Hover previews are transient; only activation creates a record. */
export function timelineSubitemLane(options: {
  title: string; parentId: string; scroller: HTMLElement;
  window: { start: string; days: number; dayWidth: number }; labelWidth: number; disabled: boolean;
  changed(date?: { start: string; end: string }): void;
  create(date: { start: string; end: string }): Promise<void>;
  error(error: unknown): void;
}) {
  const { window, scroller } = options;
  const row = document.createElement("div"); row.className = "database-timeline-row database-timeline-subitem-add"; row.dataset.parentId = options.parentId;
  const label = document.createElement("div"); label.className = "database-timeline-label"; row.append(label);
  const lane = document.createElement("button"); lane.type = "button"; lane.className = "database-timeline-subitem-lane";
  lane.setAttribute("aria-label", `${t("New sub-item")}: ${options.title}`); lane.disabled = options.disabled;
  const preview = document.createElement("span"); preview.className = "database-timeline-subitem-preview"; preview.hidden = true; preview.setAttribute("aria-hidden", "true"); lane.append(preview); row.append(lane);
  let index = 0, pointerX: number | undefined, busy = false, visible = false;
  const date = () => ({ start: shiftDay(window.start, index), end: shiftDay(window.start, index + 4) });
  const show = (day: number) => {
    if (lane.disabled) return;
    index = Math.max(0, Math.min(window.days - 1, day)); visible = true; preview.hidden = false;
    preview.style.left = `${index * window.dayWidth + 2}px`;
    preview.style.width = `${Math.max(20, Math.min(5, window.days - index) * window.dayWidth - 4)}px`;
    lane.dataset.start = date().start; lane.dataset.end = date().end;
    options.changed(date());
  };
  const point = (clientX: number) => show(Math.floor((clientX - lane.getBoundingClientRect().left) / window.dayWidth));
  const hide = () => { visible = false; preview.hidden = true; options.changed(); };
  lane.onpointermove = event => { pointerX = event.clientX; point(pointerX); };
  lane.onpointerleave = () => { pointerX = undefined; if (!lane.matches(":focus-visible")) hide(); };
  lane.onpointerdown = event => { if (event.button === 0) { event.stopPropagation(); pointerX = event.clientX; point(pointerX); } };
  lane.onfocus = () => { if (!visible) point(scroller.getBoundingClientRect().left + options.labelWidth + 40); };
  lane.onblur = () => { if (pointerX === undefined) hide(); };
  lane.onkeydown = event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); pointerX = undefined; hide(); lane.blur(); }
    if (["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); pointerX = undefined; show(index + (event.key === "ArrowRight" ? 1 : -1)); }
  };
  lane.onclick = event => {
    event.stopPropagation(); if (busy || lane.disabled) return;
    if (event.detail) point(event.clientX);
    if (!visible) return;
    const selected = date(); busy = true; lane.disabled = true; lane.setAttribute("aria-busy", "true");
    void options.create(selected).catch(options.error).finally(() => { busy = false; lane.disabled = options.disabled; lane.removeAttribute("aria-busy"); });
  };
  const scroll = () => { if (pointerX !== undefined && visible && row.isConnected) point(pointerX); };
  scroller.addEventListener("scroll", scroll, { passive: true });
  return { row, x: () => visible ? index * window.dayWidth + 2 : undefined, cleanup: () => scroller.removeEventListener("scroll", scroll) };
}
