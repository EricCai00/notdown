import { t, setUIText, uiLanguage } from "../../shared/i18n";
import type { Page } from "../../shared/types";
import { pageIconElement } from "../../shared/page-icons";
import type { DatabaseDataSource, DatabaseProperty, DatabaseView } from "./database-model";
import type { LayoutActions } from "./database-layouts";
import { groupHeading } from "./database-layouts";
import { calendarDate, databaseGroups, fieldValue, shiftDay, valueText } from "./database-query";
import { appendFeedProperty } from "./database-feed";
import { timelineEdit, timelineWindow, timelineViewport, timelineScales } from "./database-timeline-model";
import { relationIds } from "./database-dependencies";
import { DatabasePopover, menuChoice } from "./database-popover";
import { referencePicker } from "./database-reference-picker";
import "./database-advanced-layouts.css";
import { createElement, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, ChevronDown, ChevronsLeft, ChevronsRight, CalendarDays, type IconNode } from "lucide";

function button(label: string, action: () => void, className = "") {
  const el = document.createElement("button"); el.type = "button"; el.className = className; el.textContent = label; el.onclick = action; return el;
}
const difference = (a: string, b: string) => Math.round((Date.parse(a.slice(0,10)) - Date.parse(b.slice(0,10))) / 86400000);
const monthLabel = (day: string, year = true) => new Date(day + "T12:00:00Z").toLocaleDateString(uiLanguage(), { month: "long", ...(year ? { year: "numeric" as const } : {}), timeZone: "UTC" });
const states = new WeakMap<HTMLElement, { anchor: string; scale: string; left: number; pop?: DatabasePopover; cleanup?: () => void }>();
const timelineIcon = (node: IconNode) => createElement(node, { width: 16, height: 16, "stroke-width": 1.6, "aria-hidden": "true", focusable: "false" });
export function renderTimeline(host: HTMLElement, source: DatabaseDataSource, rows: Page[], fields: DatabaseProperty[], view: DatabaseView, actions: LayoutActions) {
  const previous = states.get(host); previous?.pop?.destroy(); previous?.cleanup?.();
  const field = source.properties.find(field => field.id === view.layout?.datePropertyId && field.type === "date");
  if (!field) { host.append(button(t("Choose a date property"), actions.settings, "database-layout-setup")); return; }
  const referencePages = actions.pages?.() ?? rows;
  const taskContent = (page: Page, title = page.title) => {
    const content = document.createElement("span"); content.className = "database-timeline-content";
    const name = document.createElement("span"); name.className = "database-timeline-task-name"; name.textContent = title; content.append(name);
    for (const property of fields.filter(item => item.type !== "title")) {
      const value = fieldValue(page, property);
      if (value == null || value === "" || Array.isArray(value) && !value.length) continue;
      const prop = document.createElement("span"); prop.className = "database-timeline-property"; prop.title = property.name;
      prop.dataset.propertyId = property.id; prop.dataset.propertyType = property.type;
      // Read-only projections inside the task button must not nest interactive controls.
      if (appendFeedProperty(prop, property, value, referencePages)) { /* Shared date/reference formatting. */ }
      else if (["select", "status", "multi_select"].includes(property.type)) {
        for (const id of Array.isArray(value) ? value : [value]) {
          const option = property.options?.find(item => item.id === id), tag = document.createElement("span");
          tag.className = "database-tag"; tag.dataset.color = option?.color ?? "gray"; tag.textContent = option?.name ?? String(id); prop.append(tag);
        }
      } else prop.textContent = property.type === "checkbox" ? value ? "☑" : "☐" : valueText(property, value);
      content.append(prop);
    }
    return content;
  };
  const scale = view.layout?.timelineScale ?? "month", window = timelineViewport(actions.month, scale), period = timelineWindow(actions.month, scale);
  host.dataset.timelineScale = scale;
  const periodLabel = (day: string) => scale === "5-years" ? day.slice(0, 4) : monthLabel(day);
  const labelWidth = view.layout?.timelineTable === true ? 210 : 0, plotWidth = window.days * window.dayWidth;
  const state = { anchor: actions.month, scale, left: 0, pop: undefined as DatabasePopover | undefined, cleanup: undefined as (() => void) | undefined }; states.set(host, state);
  const run = (operation: Promise<void>) => void operation.catch(error => { let status = host.querySelector<HTMLElement>(".database-timeline-error"); if (!status) { status = document.createElement("p"); status.className = "database-timeline-error"; status.setAttribute("role", "status"); host.append(status); } status.textContent = error.message; });
  const toolbar = document.createElement("div"); toolbar.className = "database-calendar-toolbar database-timeline-toolbar";
  const controls = document.createElement("div"); controls.className = "database-timeline-controls";
  const table = button("", () => { if (actions.configure) run(actions.configure({ timelineTable: !labelWidth })); }, "database-timeline-nav"); table.append(timelineIcon(labelWidth ? ChevronsLeft : ChevronsRight)); table.title = t(labelWidth ? "Hide table" : "Show table"); table.setAttribute("aria-label", table.title); table.setAttribute("aria-pressed", String(!!labelWidth)); toolbar.append(table);
  const title = document.createElement("h2"); title.textContent = periodLabel(actions.month); toolbar.append(title);
  if (actions.dependencies) {
    const dependencyButton = button(t("Dependencies"), () => {
      const forward = source.properties.find(item => item.dependencyRole === "blockedBy");
      if (!forward) { run(actions.dependencies!()); return; }
      state.pop?.destroy(); const pop = new DatabasePopover(dependencyButton, "Dependencies"); state.pop = pop; const panel = pop.panel("Dependencies");
      if (actions.dependencySettings) {
        for (const [enabled, label] of [[true, "Shift only when dates overlap"], [false, "Do not shift automatically"]] as const) panel.append(menuChoice(label, (source.dependencyAutoShift !== false) === enabled, () => { void pop.perform(() => actions.dependencySettings!({ dependencyAutoShift: enabled })); }));
        const dateLabel = document.createElement("label"); dateLabel.className = "database-dependency-date"; setUIText(dateLabel, "Shift using");
        const select = document.createElement("select"); select.setAttribute("aria-label", t("Shift using"));
        for (const property of source.properties.filter(item => item.type === "date")) { const option = document.createElement("option"); option.value = property.id; option.textContent = property.name; select.append(option); }
        select.value = source.dependencyDatePropertyId ?? source.properties.find(item => item.type === "date")?.id ?? "";
        select.onchange = () => { void pop.perform(() => actions.dependencySettings!({ dependencyDatePropertyId: select.value })); }; dateLabel.append(select); panel.append(dateLabel);
      }
      for (const page of (actions.pages?.() ?? rows).filter(page => page.dataSourceId === source.id && !page.trashed)) {
        const name = document.createElement("p"); name.className = "database-dependency-task"; name.textContent = page.title; panel.append(name);
        const picker = referencePicker(forward, page, fieldValue(page, forward), value => actions.reference?.(page, forward, value), actions.pages?.() ?? rows);
        if (!actions.writable(page, forward)) picker.querySelector<HTMLButtonElement>("button")!.disabled = true;
        panel.append(picker);
      }
      pop.footer(panel);
    }); controls.append(dependencyButton);
  }
  if (actions.calendar) { const calendar = button(t("Manage in Calendar"), () => run(actions.calendar!()), "database-timeline-calendar"); calendar.prepend(timelineIcon(CalendarDays)); controls.append(calendar); }
  const scaleButton = button(t(timelineScales.find(([id]) => id === scale)![1]), () => {
    state.pop?.destroy(); const pop = new DatabasePopover(scaleButton, "Time scale"); state.pop = pop; const panel = pop.panel("Time scale", scaleButton, 0, 180); panel.classList.add("database-timeline-scale-menu");
    for (const [id, label] of timelineScales) panel.append(menuChoice(label, scale === id, () => { if (actions.configure) void pop.perform(() => actions.configure!({ timelineScale: id })); }));
  }); scaleButton.append(timelineIcon(ChevronDown)); scaleButton.setAttribute("aria-label", t("Time scale")); controls.append(scaleButton);
  const navigate = (day: string) => { state.anchor = ""; actions.navigate(day); };
  const before = button("", () => navigate(shiftDay(actions.month, -period.days)), "database-timeline-nav"); before.append(timelineIcon(ChevronLeft)); before.setAttribute("aria-label", t("Previous period")); controls.append(before);
  controls.append(button(t("Today"), () => { const now = new Date(); navigate(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`); }));
  const after = button("", () => navigate(shiftDay(actions.month, period.days)), "database-timeline-nav"); after.append(timelineIcon(ChevronRight)); after.setAttribute("aria-label", t("Next period")); controls.append(after); toolbar.append(controls); host.append(toolbar);
  const scroller = document.createElement("div"); scroller.className = "database-timeline-scroll"; scroller.tabIndex = 0; scroller.setAttribute("aria-label", t("Timeline"));
  const grid = document.createElement("div"); grid.className = "database-timeline-grid"; grid.style.setProperty("--timeline-day", `${window.dayWidth}px`); grid.style.setProperty("--timeline-label", `${labelWidth}px`); grid.style.setProperty("--timeline-width", `${plotWidth}px`);
  const header = document.createElement("div"); header.className = "database-timeline-row database-timeline-header";
  const label = document.createElement("div"); label.className = "database-timeline-label"; if (labelWidth) setUIText(label, "Name"); header.append(label);
  const dates = document.createElement("div"); dates.className = "database-timeline-dates";
  let interacting = false;
  const highlight = document.createElement("i"); highlight.className = "database-timeline-range-highlight"; highlight.hidden = true; dates.append(highlight);
  const highlightRange = (value: unknown) => {
    const range = calendarDate(value); if (!range) return;
    highlight.hidden = false; highlight.style.left = `${difference(range.start, window.start) * window.dayWidth}px`; highlight.style.width = `${(difference(range.end, range.start) + 1) * window.dayWidth}px`;
    highlight.dataset.start = range.start; highlight.dataset.end = range.end;
    for (const tick of dates.querySelectorAll<HTMLElement>(".database-timeline-tick")) tick.classList.toggle("is-highlighted", tick.dataset.date! >= range.start && tick.dataset.date! <= range.end);
  };
  const clearHighlight = () => { highlight.hidden = true; for (const tick of dates.querySelectorAll(".is-highlighted")) tick.classList.remove("is-highlighted"); };
  const interval = scale === "5-years" ? 90 : scale === "year" ? 14 : scale === "quarter" ? 7 : scale === "hours" ? 1/24 : 1;
  const tickOffsets: number[] = [];
  if (scale === "5-years") {
    const month = new Date(window.start + "T12:00:00Z"); month.setUTCDate(1);
    while (difference(month.toISOString().slice(0, 10), window.start) < window.days) {
      const offset = difference(month.toISOString().slice(0, 10), window.start); if (offset >= 0) tickOffsets.push(offset);
      month.setUTCMonth(month.getUTCMonth() + 1);
    }
  } else for (let i = 0; i < window.days; i += interval) tickOffsets.push(i);
  for (const i of tickOffsets) {
    const day = shiftDay(window.start, Math.floor(i + .00001)), tick = document.createElement("span"); tick.className = "database-timeline-tick"; tick.style.left = `${i * window.dayWidth}px`; tick.style.width = `${Math.min(interval, window.days - i) * window.dayWidth}px`;
    tick.dataset.date = day;
    if (scale === "5-years") { const next = new Date(day + "T12:00:00Z"); next.setUTCMonth(next.getUTCMonth() + 1); tick.style.width = `${difference(next.toISOString().slice(0,10), day) * window.dayWidth}px`; }
    tick.textContent = scale === "hours" ? String(Math.round((i % 1) * 24) % 24).padStart(2,"0") + ":00" : scale === "5-years" ? String(Number(day.slice(5,7))) : scale === "year" || scale === "quarter" ? day.slice(5) : String(Number(day.slice(-2))); dates.append(tick);
  }
  let offset = 0;
  while (offset < window.days) {
    const day = shiftDay(window.start, offset), end = new Date(day + "T12:00:00Z");
    if (scale === "5-years") end.setUTCFullYear(end.getUTCFullYear() + 1, 0, 1); else end.setUTCMonth(end.getUTCMonth() + 1, 1);
    const length = Math.min(window.days - offset, difference(end.toISOString().slice(0,10), day));
    const month = document.createElement("b"); month.className = "database-timeline-month"; month.style.left = `${offset * window.dayWidth}px`; month.style.width = `${length * window.dayWidth}px`; month.textContent = scale === "5-years" ? day.slice(0,4) : monthLabel(day, day.slice(5,7) === "01" || offset === 0); dates.append(month); offset += length;
  }
  header.append(dates); grid.append(header);
  const backdrop = document.createElement("div"); backdrop.className = "database-timeline-backdrop"; grid.append(backdrop);
  if (scale === "5-years") for (const offset of tickOffsets) { const line = document.createElement("i"); line.className = "is-period-boundary"; line.style.left = `${offset * window.dayWidth}px`; backdrop.append(line); }
  if (window.dayWidth >= 6) for (let i = 0; i < window.days; i++) {
    const day = new Date(shiftDay(window.start, i) + "T12:00:00Z").getUTCDay(); if (day !== 0 && day !== 6) continue;
    const band = document.createElement("i"); band.style.left = `${i * window.dayWidth}px`; band.style.width = `${window.dayWidth}px`; backdrop.append(band);
  }
  const now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`, todayOffset = difference(today, window.start);
  if (todayOffset >= 0 && todayOffset < window.days) {
    const x = (todayOffset + .5) * window.dayWidth;
    const marker = document.createElement("i"); marker.className = "database-timeline-today"; marker.style.left = `${labelWidth+x}px`; grid.append(marker);
    const badge = document.createElement("span"); badge.className = "database-timeline-today-badge"; badge.textContent = String(now.getDate()); badge.style.left = `${x}px`; dates.append(badge);
  }
  const grouping = source.properties.find(field => field.id === view.layout?.groupBy);
  const groups = grouping ? databaseGroups(rows, grouping, view) : [{ key:"", name:"", color:"gray", pages:rows }];
  const bars = new Map<string, { bar: HTMLElement; page: Page; y: number }>(); let rowY = 0;
  const jumps: { button: HTMLButtonElement; start: number; end: number; bar?: HTMLElement }[] = [];
  const taskJump = (page: Page, range: NonNullable<ReturnType<typeof calendarDate>>, bar?: HTMLElement) => {
    const viewport = document.createElement("div"); viewport.className = "database-timeline-jump-viewport";
    const jump = button("", () => navigate(range.start), "database-timeline-jump"); jump.hidden = true;
    jump.append(timelineIcon(ArrowRight));
    jump.setAttribute("aria-label", `${t("Jump to task")}: ${page.title}`); jump.title = `${page.title}: ${range.start} → ${range.end}`;
    jumps.push({ button: jump, start: difference(range.start, window.start) * window.dayWidth, end: (difference(range.end, window.start) + 1) * window.dayWidth, bar });
    viewport.append(jump); return viewport;
  };
  const insertion = document.createElement("i"); insertion.className = "database-timeline-insertion"; insertion.hidden = true; grid.append(insertion);
  const forward = source.properties.find(item => item.dependencyRole === "blockedBy");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.classList.add("database-timeline-links"); svg.style.left = `${labelWidth}px`; svg.setAttribute("width", String(plotWidth));
  const drawLinks = () => {
    svg.replaceChildren(); svg.setAttribute("height", String(rowY)); svg.style.setProperty("--timeline-links-height", `${rowY}px`);
    if (!forward) return;
    for (const target of bars.values()) for (const id of relationIds(fieldValue(target.page, forward))) {
      const from = bars.get(id); if (!from) continue;
      const x1 = parseFloat(from.bar.style.left) + parseFloat(from.bar.style.width), x2 = parseFloat(target.bar.style.left), y1 = from.y, y2 = target.y;
      const path = document.createElementNS(svg.namespaceURI, "path"), bend = Math.max(18, Math.abs(x2 - x1) / 2);
      // When date ranges overlap, approach the target from the row boundary,
      // keeping the connector out of the target's title and hit area.
      const boundary = y2 + (y2 > y1 ? -18 : 18), direction = y2 > y1 ? 1 : -1;
      const route = x2 >= x1 ? `M${x1},${y1} C${x1+bend},${y1} ${x2-bend},${y2} ${x2-5},${y2}`
        : `M${x1},${y1} C${x1+18},${y1} ${x1+18},${boundary} ${x1+18},${boundary} L${x2-17},${boundary} Q${x2-9},${boundary} ${x2-9},${boundary+direction*8} L${x2-9},${y2-direction*4} Q${x2-9},${y2} ${x2-5},${y2}`;
      path.setAttribute("d", `${route} M${x2-10},${y2-4} L${x2-5},${y2} L${x2-10},${y2+4}`);
      path.setAttribute("data-from", id); path.setAttribute("data-to", target.page.id); path.setAttribute("role", "button"); path.setAttribute("tabindex", "0"); path.setAttribute("aria-label", `${t("Remove dependency")}: ${from.page.title} → ${target.page.title}`);
      const remove = () => { if (actions.writable(target.page, forward)) actions.reference?.(target.page, forward, (fieldValue(target.page, forward) as {pageId?:string}[]).filter(ref => ref.pageId !== id)); };
      path.addEventListener("click", remove); path.addEventListener("keydown", event => { if (["Enter", "Delete", "Backspace"].includes((event as KeyboardEvent).key)) { event.preventDefault(); remove(); } }); svg.append(path);
    }
  };
  for (const group of groups) {
    if (grouping) { grid.append(groupHeading(group, grouping, view, actions)); rowY += 36; if (view.layout?.collapsedGroups?.includes(group.key)) continue; }
    for (const page of group.pages) {
      const row = document.createElement("div"); row.className = "database-timeline-row"; row.dataset.pageId = page.id;
      const name = button("", () => actions.open(page), "database-timeline-label"); name.title = page.title;
      if (labelWidth) { const icon = pageIconElement(page.icon || "file-text"); if (icon && view.layout?.showPageIcon !== false) name.append(icon); const text = document.createElement("span"); text.textContent = page.title; name.append(text); } row.append(name);
      const lane = document.createElement("div"); lane.className = "database-timeline-lane";
      const value = fieldValue(page,field), range = calendarDate(value);
      if (!range) lane.append(button(`${page.title} · ${t("No date")}`, () => actions.open(page), "database-timeline-no-date"));
      else if (range.end < window.start || range.start >= shiftDay(window.start,window.days)) lane.append(taskJump(page, range));
      else {
        let start = Math.max(0, difference(range.start,window.start)), end = Math.min(window.days, difference(range.end,window.start)+1);
        // Preserve stored times and zones; use their written local time for display only.
        if (scale === "hours" || scale === "day") {
          const timed = value as {start?:string;end?:string};
          const fraction = (date?:string) => { const match = /T(\d{2}):(\d{2})/.exec(date ?? ""); return match ? (Number(match[1])*60+Number(match[2]))/1440 : undefined; };
          start += fraction(timed.start) ?? 0;
          if (fraction(timed.end) !== undefined) end = difference(range.end,window.start) + fraction(timed.end)!;
          else if (fraction(timed.start) !== undefined && !timed.end) end = start + 1/24;
        }
        const bar = document.createElement("div"); bar.className = "database-timeline-bar"; bar.style.left = `${start*window.dayWidth+2}px`; bar.style.width = `${Math.max(20,(end-start)*window.dayWidth-4)}px`;
        bar.onpointerenter = () => { if (!interacting) highlightRange(value); };
        bar.onpointerleave = () => { if (!interacting) clearHighlight(); };
        const open = button("", () => actions.open(page), "database-timeline-open"); open.title = `${page.title}: ${range.start} → ${range.end}`; open.setAttribute("aria-label", `${t("Open")} ${page.title}`);
        const content = taskContent(page); content.firstElementChild!.classList.add("database-timeline-bar-title"); open.append(content);
        const titleEditor = actions.titleEditor?.(page); bar.append(titleEditor ?? open);
        lane.append(taskJump(page, range, bar));
        bars.set(page.id, {bar, page, y:rowY+18});
        if (range.movable && actions.writable(page,field)) {
          const tooltip = document.createElement("span"); tooltip.className = "database-timeline-date-tooltip"; tooltip.setAttribute("role", "tooltip"); tooltip.hidden = true; bar.append(tooltip);
          const showDate = (value: unknown, mode: "start" | "end") => { const range = calendarDate(value)!; const day = mode === "start" ? range.start : range.end; tooltip.textContent = new Date(day + "T12:00:00Z").toLocaleDateString(uiLanguage(), { month:"short", day:"numeric", timeZone:"UTC" }); tooltip.dataset.date = day; tooltip.classList.toggle("is-start", mode === "start"); tooltip.hidden = false; };
          const bind = (target: HTMLElement, mode: "move" | "start" | "end") => {
            target.onpointerdown = event => {
              if (event.button !== 0) return;
              const origin = event.clientX, originY = event.clientY, scroll = scroller.scrollLeft, left = parseFloat(bar.style.left), width = parseFloat(bar.style.width), originalY = bars.get(page.id)!.y;
              let delta = 0, dragged = false, placement: { beforeId: string | null } | undefined;
              interacting = true; highlightRange(value);
              target.setPointerCapture(event.pointerId);
              const move = (ev: PointerEvent) => {
                dragged ||= Math.hypot(ev.clientX-origin, ev.clientY-originY)>4; if (!dragged) return;
                const viewport = scroller.getBoundingClientRect();
                if (ev.clientX > viewport.right-24) scroller.scrollLeft += 12; else if (ev.clientX < viewport.left+labelWidth+24) scroller.scrollLeft -= 12;
                const days = Math.round((ev.clientX-origin+scroller.scrollLeft-scroll)/window.dayWidth), next = timelineEdit(value,days,mode); if (!next) return;
                delta = days; bar.classList.toggle("is-dragging", mode === "move"); bar.classList.toggle("is-resizing", mode !== "move"); target.classList.add("is-adjusting");
                bar.style.left = `${left+(mode === "end" ? 0 : days*window.dayWidth)}px`; bar.style.width = `${Math.max(20,width+(mode === "move" ? 0 : mode === "start" ? -days : days)*window.dayWidth)}px`;
                highlightRange(next); if (mode !== "move") showDate(next,mode);
                if (mode === "move" && !view.sorts?.length && !grouping) {
                  const dy = ev.clientY-originY; bar.style.transform = `translateY(${dy}px)`; bars.get(page.id)!.y = originalY+dy;
                  if (Math.abs(dy)>12) {
                    const candidates = [...grid.querySelectorAll<HTMLElement>(".database-timeline-row[data-page-id]")].filter(row => row.dataset.pageId !== page.id);
                    const next = candidates.find(row => { const box = row.getBoundingClientRect(); return ev.clientY < box.top + box.height/2; });
                    const edge = next?.getBoundingClientRect().top ?? candidates.at(-1)?.getBoundingClientRect().bottom;
                    if (edge !== undefined) { insertion.style.top = `${edge-grid.getBoundingClientRect().top}px`; insertion.hidden = false; placement = { beforeId: next?.dataset.pageId ?? null }; }
                  } else { insertion.hidden = true; placement = undefined; }
                }
                drawLinks();
              };
              const cleanup = () => { target.removeEventListener("pointermove",move); target.removeEventListener("pointerup",finish); target.removeEventListener("pointercancel",cancel); target.removeEventListener("lostpointercapture",cancel); document.removeEventListener("keydown",escape); if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId); bar.style.left = `${left}px`; bar.style.width = `${width}px`; bar.style.transform = ""; bars.get(page.id)!.y = originalY; bar.classList.remove("is-dragging","is-resizing"); target.classList.remove("is-adjusting"); interacting = false; insertion.hidden = true; tooltip.hidden = true; clearHighlight(); drawLinks(); };
              const cancel = () => { cleanup(); if (dragged) target.addEventListener("click", ev => { ev.preventDefault(); ev.stopImmediatePropagation(); }, {capture:true,once:true}); };
              const escape = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.preventDefault(); cancel(); } };
              const finish = () => { cleanup(); if (dragged) { target.addEventListener("click", ev => { ev.preventDefault(); ev.stopImmediatePropagation(); }, {capture:true,once:true}); const next = timelineEdit(value,delta,mode); if ((delta || placement) && next) actions.move(page,field,next,placement); } };
              target.addEventListener("pointermove",move); target.addEventListener("pointerup",finish); target.addEventListener("pointercancel",cancel); target.addEventListener("lostpointercapture",cancel); document.addEventListener("keydown",escape);
            };
            target.addEventListener("keydown", event => { if (!event.altKey || !["ArrowLeft","ArrowRight"].includes(event.key)) return; event.preventDefault(); const next = timelineEdit(value,event.key === "ArrowLeft" ? -1 : 1,mode); if (next) actions.move(page,field,next); });
          };
          if (!titleEditor) bind(open,"move");
          for (const edge of ["start","end"] as const) { const handle = button("", () => {}, `database-timeline-handle is-${edge}`); handle.setAttribute("aria-label", `${t(edge === "start" ? "Adjust start date" : "Adjust end date")}: ${page.title}`); handle.onpointerenter = () => { if (!interacting) showDate(value,edge); }; handle.onpointerleave = () => { if (!interacting) tooltip.hidden = true; }; handle.onfocus = () => showDate(value,edge); handle.onblur = () => { tooltip.hidden = true; }; bind(handle,edge); bar.append(handle); }
        }
        if (forward && actions.writable(page, forward)) {
          const connector = button("", () => { state.pop?.destroy(); const pop = new DatabasePopover(connector, "Blocked by"); state.pop = pop; const panel = pop.panel("Blocked by"); panel.append(referencePicker(forward,page,fieldValue(page,forward), value => actions.reference?.(page,forward,value),actions.pages?.() ?? rows)); pop.footer(panel); }, "database-timeline-connector");
          connector.setAttribute("aria-label", `${t("Edit dependencies")}: ${page.title}`); connector.title = t("Drag to connect a task, or drop on empty space to create a page");
          connector.onpointerdown = event => {
            if (event.button !== 0) return;
            const x = event.clientX, y = event.clientY; let dragged = false;
            event.preventDefault();
            interacting = true; connector.classList.add("is-connecting"); svg.classList.add("is-connecting"); connector.setPointerCapture(event.pointerId);
            const preview = document.createElementNS(svg.namespaceURI, "path"); preview.classList.add("database-timeline-dependency-preview");
            const clearTarget = () => { for (const {bar} of bars.values()) bar.classList.remove("is-dependency-target"); };
            const cleanup = () => { connector.onpointermove = null; connector.onpointerup = null; connector.onpointercancel = null; connector.onlostpointercapture = null; document.removeEventListener("keydown",escape); scroller.removeEventListener("scroll", redraw); if (connector.hasPointerCapture(event.pointerId)) connector.releasePointerCapture(event.pointerId); preview.remove(); connector.classList.remove("is-connecting"); svg.classList.remove("is-connecting"); clearTarget(); interacting = false; clearHighlight(); };
            const cancel = () => { cleanup(); if (dragged) connector.addEventListener("click", e => { e.preventDefault(); e.stopImmediatePropagation(); }, {capture:true,once:true}); };
            const escape = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.preventDefault(); cancel(); } };
            let pointerX = x, pointerY = y;
            const hitAtPointer = () => document.elementFromPoint(pointerX, pointerY);
            const targetAtPointer = () => {
              const hit = hitAtPointer()?.closest<HTMLElement>(".database-timeline-bar");
              return [...bars.values()].find(item => item.bar === hit);
            };
            const redraw = () => {
              if (!dragged) return;
              clearTarget(); const target = targetAtPointer();
              if (target && target.page.id !== page.id && actions.writable(target.page, forward)) target.bar.classList.add("is-dependency-target");
              const box = svg.getBoundingClientRect(), x1 = parseFloat(bar.style.left)+parseFloat(bar.style.width), y1 = bars.get(page.id)!.y, x2 = pointerX-box.left, y2 = pointerY-box.top;
              const bend = Math.max(28, Math.abs(x2-x1)/2);
              preview.setAttribute("d", `M${x1},${y1} C${x1+bend},${y1} ${x2-bend},${y2} ${x2},${y2} M${x2-6},${y2-5} L${x2},${y2} L${x2-6},${y2+5}`); svg.append(preview);
            };
            connector.onpointermove = ev => {
              pointerX = ev.clientX; pointerY = ev.clientY;
              dragged ||= Math.hypot(pointerX-x,pointerY-y)>=5; if (!dragged) return;
              const viewport = scroller.getBoundingClientRect();
              if (pointerX > viewport.right-24) scroller.scrollLeft += 12; else if (pointerX < viewport.left+labelWidth+24) scroller.scrollLeft -= 12;
              redraw();
            };
            scroller.addEventListener("scroll", redraw, {passive:true});
            connector.onpointerup = ev => {
              pointerX = ev.clientX; pointerY = ev.clientY;
              const target = targetAtPointer(), hit = hitAtPointer();
              const box = svg.getBoundingClientRect(), viewport = scroller.getBoundingClientRect();
              const dropX = pointerX-box.left;
              const blank = hit && grid.contains(hit) && !hit.closest("button,input,a,.database-timeline-bar,.database-timeline-header,.database-group-heading,.database-timeline-links")
                && pointerX >= viewport.left+labelWidth && pointerX < viewport.right && pointerY >= box.top && pointerY < viewport.bottom && dropX >= 0 && dropX < plotWidth;
              cleanup();
              if (!dragged) return;
              connector.addEventListener("click", e => { e.preventDefault(); e.stopImmediatePropagation(); }, {capture:true,once:true});
              if (target) {
                if (target.page.id !== page.id && actions.writable(target.page,forward)) { const refs = fieldValue(target.page,forward); if (!relationIds(refs).includes(page.id)) actions.reference?.(target.page,forward,[...(Array.isArray(refs)?refs:[]),{pageId:page.id,title:page.title}]); }
              } else if (blank && actions.createSuccessor) {
                const start = shiftDay(window.start, Math.floor(dropX/window.dayWidth));
                const groupPage = rows.find(item => item.id === hit.closest<HTMLElement>(".database-timeline-row[data-page-id]")?.dataset.pageId) ?? page;
                const properties = { ...(grouping ? { [grouping.key]: fieldValue(groupPage, grouping) } : {}), [field.key]: {start, end:shiftDay(start,difference(range.end,range.start))} };
                run(actions.createSuccessor(page, properties));
              }
            };
            connector.onpointercancel = cancel; connector.onlostpointercapture = cancel; document.addEventListener("keydown",escape);
          }; bar.append(connector);
        }
        lane.append(bar);
      }
      row.append(lane); grid.append(row); rowY += 36;
    }
  }
  drawLinks(); grid.append(svg);
  const addRow = document.createElement("div"); addRow.className = "database-timeline-new"; addRow.append(button(t("+ New page"), () => actions.add({ [field.key]: {start: actions.month,end:null} }), "database-layout-add")); grid.append(addRow);
  scroller.append(grid); host.append(scroller);
  const leading = Math.min(7, Math.max(0, 300/window.dayWidth));
  const initialLeft = previous?.anchor === actions.month && previous.scale === scale ? previous.left : Math.max(0,(difference(actions.month,window.start)-leading)*window.dayWidth);
  const updateVisibleRows = () => {
    const left = scroller.scrollLeft, right = left + scroller.clientWidth - labelWidth;
    for (const item of jumps) {
      const { bar, button: jump } = item;
      const start = bar ? parseFloat(bar.style.left) : item.start, end = bar ? start + parseFloat(bar.style.width) : item.end;
      const before = end <= left, outside = before || start >= right;
      jump.hidden = !outside;
      const direction = before ? "left" : "right";
      if (jump.dataset.direction !== direction) { jump.dataset.direction = direction; jump.replaceChildren(timelineIcon(before ? ArrowLeft : ArrowRight)); }
      bar?.classList.toggle("is-offscreen", outside);
    }
  };
  // The workspace may still be hidden while its asynchronous load finishes.
  // Initialize after it has a real viewport, instead of saving a clamped zero.
  let positioned = false;
  const initialize = () => {
    if (positioned || !scroller.isConnected || !scroller.clientWidth) return;
    scroller.scrollLeft = initialLeft; state.left = scroller.scrollLeft;
    title.textContent = periodLabel(shiftDay(window.start, Math.floor(state.left / window.dayWidth)));
    positioned = true;
    updateVisibleRows();
  };
  initialize();
  // Native sticky positioning follows compositor scrolling without waiting for a scroll event.
  const resize = () => {
    grid.style.setProperty("--timeline-viewport", `${Math.max(0, scroller.clientWidth - labelWidth)}px`);
    initialize(); updateVisibleRows();
  };
  resize();
  const observer = new ResizeObserver(() => { if (!scroller.isConnected) { observer.disconnect(); return; } resize(); });
  observer.observe(scroller); state.cleanup = () => observer.disconnect();
  let rebasing = false;
  scroller.addEventListener("scroll", () => {
    if (!scroller.isConnected || !positioned) return;
    state.left = scroller.scrollLeft; const day = shiftDay(window.start, Math.floor(scroller.scrollLeft/window.dayWidth)); title.textContent = periodLabel(day);
    updateVisibleRows();
    if (!interacting && !rebasing && (scroller.scrollLeft < 100 || scroller.scrollLeft + scroller.clientWidth > plotWidth + labelWidth - 100)) {
      rebasing = true;
      const anchor = shiftDay(day, Math.round(leading)), next = timelineViewport(anchor, scale), fraction = scroller.scrollLeft / window.dayWidth % 1;
      state.anchor = anchor; state.left = (difference(day, next.start) + fraction) * window.dayWidth;
      actions.navigate(anchor);
    }
  }, {passive:true});
}
