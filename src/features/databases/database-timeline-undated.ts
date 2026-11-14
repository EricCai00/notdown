import { t } from "../../shared/i18n";
import { pageIconElement } from "../../shared/page-icons";
import type { Page } from "../../shared/types";
import type { DatabaseProperty } from "./database-model";
import type { LayoutActions } from "./database-layouts";
import type { DatabasePopover } from "./database-popover";
import { fieldValue } from "./database-query";

/** Undated records stay searchable without taking up lanes in the date grid. */
export function timelineUndatedButton(pages: Page[], field: DatabaseProperty, actions: LayoutActions, openPopover: (anchor: HTMLElement) => DatabasePopover) {
  const trigger = document.createElement("button"); trigger.type = "button"; trigger.className = "database-timeline-undated-button";
  trigger.textContent = `${t("No date")} (${pages.length})`;
  trigger.setAttribute("aria-haspopup", "dialog"); trigger.setAttribute("aria-expanded", "false");
  let pop: DatabasePopover;
  trigger.onclick = () => {
    if (trigger.getAttribute("aria-expanded") === "true") { pop.destroy(); return; }
    pop = openPopover(trigger); const panel = pop.panel("No date", trigger, 0, 400, false);
    panel.classList.add("database-timeline-undated-menu");
    const search = document.createElement("input"); search.type = "search"; search.className = "database-timeline-undated-search";
    search.placeholder = t("Search for a page..."); search.setAttribute("aria-label", search.placeholder); panel.append(search);
    const hint = document.createElement("p"); hint.className = "database-popover-caption"; hint.textContent = t("Click to add to the timeline"); panel.append(hint);
    const list = document.createElement("div"); list.className = "database-timeline-undated-list"; panel.append(list);
    const render = () => {
      list.replaceChildren();
      const query = search.value.trim().toLocaleLowerCase();
      for (const page of pages.filter(page => page.title.toLocaleLowerCase().includes(query))) {
        const row = document.createElement("div"); row.className = "database-timeline-undated-item";
        const add = document.createElement("button"); add.type = "button"; add.className = "database-timeline-undated-add";
        add.setAttribute("aria-label", `${t("Add to timeline")}: ${page.title}`); add.title = `${t("Date")}: ${actions.month}`;
        add.disabled = !actions.writable(page, field);
        const icon = pageIconElement(page.icon || "file-text"); if (icon) add.append(icon);
        const name = document.createElement("span"); name.textContent = page.title; add.append(name);
        add.onclick = () => {
          pop.destroy();
          const value = fieldValue(page, field);
          actions.move(page, field, { ...(value && typeof value === "object" && !Array.isArray(value) ? value : {}), start: actions.month, end: null });
        };
        const open = document.createElement("button"); open.type = "button"; open.className = "database-timeline-undated-open"; open.textContent = t("Open");
        open.setAttribute("aria-label", `${t("Open")} ${page.title}`); open.onclick = () => { pop.destroy(); actions.open(page); };
        row.append(add, open); list.append(row);
      }
      if (!list.childElementCount) { const empty = document.createElement("p"); empty.className = "database-popover-caption"; empty.textContent = t("No pages found"); list.append(empty); }
    };
    search.oninput = render;
    search.onkeydown = event => { if (event.key === "ArrowDown") { event.preventDefault(); list.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus(); } };
    render(); search.focus({ preventScroll: true });
  };
  return trigger;
}
