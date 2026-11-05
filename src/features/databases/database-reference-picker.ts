import { t } from "../../shared/i18n";
import { DatabasePopover, menuButton } from "./database-popover";
import { allPeople, refreshPeople, requestPeople } from "../people/people-client";
import type { Page } from "../../shared/types";
import type { DatabaseProperty } from "./database-model";

type Reference = Record<string, unknown>;
const identity = (value: Reference) => String(value.pageId ?? value.id ?? value.notionPageId ?? value.url);
export function referencePicker(field: DatabaseProperty, page: Page, value: unknown, commit: (value: unknown) => void, pages?: Page[], optionHost?: HTMLElement) {
  const wrapper = document.createElement("div"); wrapper.className = "database-cell database-reference-cell";
  const control = document.createElement("button"); control.type = "button"; control.className = "database-select-control";
  control.setAttribute("aria-label", `${field.name}: ${page.title}`); control.setAttribute("aria-haspopup", "dialog");
  const selected = new Map((Array.isArray(value) ? value : []).map(item => [identity(item), item as Reference]));
  const label = (item: Reference) => String((field.type === "people" ? allPeople().find(person => person.id === item.id)?.name : pages?.find(page => page.id === item.pageId)?.title) ?? item.name ?? item.title ?? t("Unavailable reference"));
  const draw = () => {
    control.replaceChildren();
    for (const item of selected.values()) { const tag = document.createElement("span"); tag.className = "database-tag"; tag.textContent = label(item); control.append(tag); }
    if (!selected.size) { const hint = document.createElement("span"); hint.className = "database-empty-value"; hint.textContent = t("Empty"); control.append(hint); }
  };
  draw(); wrapper.append(control);
  control.onclick = () => {
    const pop = new DatabasePopover(control, field.name), panel = pop.panel(field.name, control, 0, 280);
    optionHost?.append(panel);
    const search = document.createElement("input"); search.type = "search"; search.placeholder = t(field.type === "people" ? "Search people…" : "Search records…"); search.setAttribute("aria-label", search.placeholder); search.className = "database-reference-search";
    const choices = document.createElement("div"); choices.className = "database-reference-choices"; choices.setAttribute("role", "listbox"); choices.setAttribute("aria-multiselectable", "true"); panel.append(search, choices);
    const render = () => {
      const available: Reference[] = field.type === "people" ? allPeople().filter(person => !person.deleted).map(person => ({ id: person.id, name: person.name })) : (pages ?? []).filter(item => item.id !== page.id && item.dataSourceId === page.dataSourceId && !item.trashed).map(item => ({ pageId: item.id, title: item.title }));
      const items = new Map([...selected, ...available.map(item => [identity(item), item] as const)]);
      choices.replaceChildren();
      for (const [id, item] of items) {
        if (!label(item).toLocaleLowerCase().includes(search.value.toLocaleLowerCase())) continue;
        const option = menuButton(label(item), undefined, () => {
          if (selected.has(id)) selected.delete(id); else selected.set(id, item);
          draw(); pop.destroy(); commit([...selected.values()]);
          wrapper.dispatchEvent(new Event("change", { bubbles: true }));
        }, selected.has(id) ? "✓" : "", false, "database-popover-row", false);
        option.setAttribute("role", "option"); option.setAttribute("aria-selected", String(selected.has(id))); choices.append(option);
      }
      if (!choices.children.length) { const hint = document.createElement("p"); hint.textContent = t("No matching records"); choices.append(hint); }
    };
    search.oninput = render; render(); search.focus();
    if (field.type === "people") {
      panel.append(menuButton("Manage people…", undefined, () => { pop.destroy(); requestPeople(); }));
      void refreshPeople().then(() => { if (panel.isConnected) render(); }).catch(error => { panel.querySelector<HTMLElement>("[role=status]")!.textContent = error.message; });
    }
    pop.footer(panel);
  };
  return wrapper;
}
