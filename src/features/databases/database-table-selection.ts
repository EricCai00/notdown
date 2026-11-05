import { t } from "../../shared/i18n";
import type { DatabaseProperty } from "./database-model";
import "./database-table-selection.css";

/** Selection is view-local; only displayed records participate in bulk actions. */
export function installTableSelection(table: HTMLTableElement, selected: Set<string>, actions: {
  fields: DatabaseProperty[];
  canReorder: boolean;
  edit(field: DatabaseProperty, anchor: HTMLElement, ids: string[]): void;
  add(id: string): void;
  reorder(ids: string[], target: string, after: boolean): void;
}) {
  const toolbar = document.createElement("div"); toolbar.className = "database-selection-toolbar"; toolbar.setAttribute("role", "toolbar"); toolbar.setAttribute("aria-label", t("Selected rows"));
  table.parentElement!.before(toolbar);
  const visible = () => [...table.querySelectorAll<HTMLTableRowElement>("tbody tr[data-page-id]")].filter(row => !row.hidden);
  const button = (label: string, text: string, run: () => void) => {
    const el = document.createElement("button"); el.type = "button"; el.textContent = text; el.title = label; el.setAttribute("aria-label", label); el.onclick = run; return el;
  };
  let anchor: string | undefined;
  let signature = "";
  const update = () => {
    const rows = visible(), ids = new Set(rows.map(row => row.dataset.pageId!));
    for (const id of selected) if (!ids.has(id)) selected.delete(id);
    for (const row of table.querySelectorAll<HTMLTableRowElement>("tbody tr[data-page-id]")) {
      const checked = selected.has(row.dataset.pageId!); row.classList.toggle("database-row-selected", checked);
      row.querySelector<HTMLInputElement>(".database-row-select")!.checked = checked;
    }
    for (const input of table.querySelectorAll<HTMLInputElement>(".database-select-all")) { input.checked = !!rows.length && selected.size === rows.length; input.indeterminate = selected.size > 0 && selected.size < rows.length; input.disabled = !rows.length; }
    const next = JSON.stringify([...selected]);
    if (next === signature) return; signature = next;
    toolbar.hidden = !selected.size; toolbar.replaceChildren();
    if (!selected.size) return;
    const count = document.createElement("span"); count.textContent = t("{count} selected", { count: selected.size }); toolbar.append(count);
    for (const field of actions.fields) {
      const edit = button(`${t("Edit property")}: ${field.name}`, field.name, () => actions.edit(field, edit, [...selected])); toolbar.append(edit);
    }
    toolbar.append(button(t("Clear selection"), "×", () => { selected.clear(); update(); }));
  };
  const header = document.createElement("th"); header.className = "database-selection-gutter";
  const all = document.createElement("input"); all.type = "checkbox"; all.className = "database-select-all"; all.setAttribute("aria-label", t("Select all visible rows")); header.append(all); table.querySelector("thead tr")!.prepend(header);
  // Delegation also supports group headers cloned by the workspace.
  table.addEventListener("change", event => {
    if (!(event.target as Element).matches(".database-select-all")) return;
    const checked = (event.target as HTMLInputElement).checked; for (const row of visible()) { if (checked) selected.add(row.dataset.pageId!); else selected.delete(row.dataset.pageId!); } update();
  });
  for (const row of table.querySelectorAll<HTMLTableRowElement>("tbody tr[data-page-id]")) {
    const id = row.dataset.pageId!, cell = document.createElement("td"); cell.className = "database-selection-gutter";
    const controls = document.createElement("div"); controls.className = "database-row-controls";
    const add = button(t("Add row above"), "+", () => actions.add(id)); add.className = "database-row-add"; add.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 3v12M3 9h12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    const drag = button(t("Drag selected rows"), "⠿", () => { if (!selected.has(id)) { selected.clear(); selected.add(id); update(); } }); drag.className = "database-row-handle"; drag.innerHTML = '<svg width="12" height="18" viewBox="0 0 12 18" aria-hidden="true">' + [3, 9, 15].flatMap(y => [3, 9].map(x => `<circle cx="${x}" cy="${y}" r="1.35" fill="currentColor"/>`)).join("") + "</svg>"; drag.draggable = actions.canReorder;
    if (!actions.canReorder) drag.title = t("Turn off sorting and grouping to reorder rows");
    drag.addEventListener("dragstart", event => { if (!actions.canReorder) { event.preventDefault(); return; } if (!selected.has(id)) { selected.clear(); selected.add(id); } update(); event.dataTransfer?.setData("application/x-notdown-table-rows", JSON.stringify([...selected])); if (event.dataTransfer) event.dataTransfer.effectAllowed = "move"; });
    const check = document.createElement("input"); check.type = "checkbox"; check.className = "database-row-select"; check.setAttribute("aria-label", `${t("Select row")}: ${row.querySelector<HTMLInputElement>('[data-type="title"] input')?.value ?? id}`);
    check.addEventListener("click", event => {
      const rows = visible(), start = rows.findIndex(row => row.dataset.pageId === anchor), end = rows.indexOf(row);
      if (event.shiftKey && start >= 0) for (const item of rows.slice(Math.min(start, end), Math.max(start, end) + 1)) { if (check.checked) selected.add(item.dataset.pageId!); else selected.delete(item.dataset.pageId!); }
      else if (check.checked) selected.add(id); else selected.delete(id);
      anchor = id; update();
    });
    controls.append(add, drag, check); cell.append(controls); row.prepend(cell);
    row.addEventListener("dragover", event => { if (actions.canReorder && event.dataTransfer?.types.includes("application/x-notdown-table-rows")) { event.preventDefault(); const after = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2; row.dataset.drop = after ? "after" : "before"; } });
    row.addEventListener("dragleave", () => { delete row.dataset.drop; });
    row.addEventListener("drop", event => { const after = row.dataset.drop === "after"; delete row.dataset.drop; if (!actions.canReorder) return; const data = event.dataTransfer?.getData("application/x-notdown-table-rows"); if (!data) return; event.preventDefault(); try { const ids: unknown = JSON.parse(data); if (Array.isArray(ids) && ids.every(id => typeof id === "string")) actions.reorder(ids, id, after); } catch { /* Ignore unrelated drag data. */ } });
  }
  table.addEventListener("dragend", () => table.querySelectorAll<HTMLElement>("[data-drop]").forEach(row => delete row.dataset.drop));
  table.addEventListener("keydown", event => { if (event.key === "Escape" && !(event.target as Element).matches("input:not([type=checkbox]),textarea")) { selected.clear(); update(); } });
  update(); return update;
}
