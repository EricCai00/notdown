import { viewIconButton } from "./database-view-icon";
import { setUIText, setUIAttribute } from "../../shared/i18n";
import { Pencil, PaintRoller, SlidersHorizontal, Database, Link, Eye, Copy, Trash2, Table2, Columns3, LayoutGrid, List, Calendar } from "lucide";
import { ChartNoAxesCombined, GanttChart, Rss, LayoutDashboard, ClipboardList, MapPin } from "lucide";
import { DatabasePopover, menuButton, menuChoice, menuInput, menuSection } from "./database-popover";
import { databaseViewTypes, type DatabaseView, type DatabaseDataSource } from "./database-model";
import { routeHash } from "../pages/page-navigation";
import { viewLabel } from "./database-view-settings";

const icons = { table: Table2, board: Columns3, gallery: LayoutGrid, list: List, calendar: Calendar, timeline: GanttChart, chart: ChartNoAxesCombined, feed: Rss, dashboard: LayoutDashboard, form: ClipboardList, map: MapPin };
export function openTabMenu(anchor: HTMLElement, hooks: {
  view: DatabaseView; source: DatabaseDataSource; wiki: boolean; showSourceTitle: boolean; lastSourceView: boolean; ownsSource: boolean;
  save(view: DatabaseView): Promise<void>;
  edit(section?: "Source"): void;
  duplicate(): Promise<void>; remove(trashSource?: boolean): Promise<void>;
}, existing?: { pop: DatabasePopover; level: number }) {
  const pop = existing?.pop ?? new DatabasePopover(anchor, "View options", { replace: true });
  const level = existing?.level ?? 0;
  const draft = structuredClone(hooks.view), panel = pop.panel("View options", anchor, level, 240);
  panel.classList.add("database-tab-menu"); pop.commit = () => hooks.save(draft);
  panel.append(menuButton("Rename", Pencil, button => {
    const child = pop.panel("Rename view", button, level + 1, 240), input = menuInput("View name", draft.name, value => draft.name = value);
    child.append(input); pop.footer(child, "Save view"); input.querySelector("input")!.select();
    input.querySelector("input")!.onkeydown = event => { if (event.key === "Enter") { event.preventDefault(); void pop.close(); } };
  }));
  panel.append(viewIconButton(pop, draft, level + 1));
  if (!hooks.wiki) panel.append(menuButton("Display as", PaintRoller, button => {
    const child = pop.panel("Display as", button, level + 1, 240);
    for (const type of databaseViewTypes) child.append(menuChoice(viewLabel(type), draft.type === type, () => { draft.type = type; pop.dirty = true; void pop.close(); }, icons[type]));
  }, "", true));
  panel.append(menuButton("Edit view", SlidersHorizontal, () => { pop.destroy(); hooks.edit(); }));
  if (!hooks.wiki) panel.append(menuButton("Source", Database, () => { pop.destroy(); hooks.edit("Source"); }, hooks.source.title, true));
  const links = menuSection(panel);
  links.append(menuButton("Copy link to view", Link, async button => {
    const url = new URL(location.href); url.hash = routeHash({ kind: "database", id: draft.databaseId, viewId: draft.id });
    try { await navigator.clipboard.writeText(url.href); setUIText(button.querySelector(".database-popover-label")!, "Link copied"); }
    catch { const child = pop.panel("Link to view", button, level + 1, 300, false), input = menuInput("View link", url.href, () => {}); input.querySelector("input")!.readOnly = true; child.append(input); input.querySelector("input")!.select(); }
  }));
  if (!hooks.wiki) links.append(menuButton(hooks.showSourceTitle ? "Hide data source titles" : "Show data source titles", Eye, () => {
    draft.layout = { ...draft.layout, showDataSourceTitle: !hooks.showSourceTitle }; pop.dirty = true; void pop.close();
  }));
  const actions = menuSection(panel);
  actions.append(menuButton("Duplicate view", Copy, () => { void pop.perform(hooks.duplicate); }));
  const remove = menuButton("Delete view", Trash2, () => {
    if (!hooks.lastSourceView) { void pop.perform(() => hooks.remove()); return; }
    const dialog = document.createElement("dialog"); dialog.className = "database-delete-view-dialog"; setUIAttribute(dialog, "aria-label", "Delete last view");
    const title = document.createElement("h3"); title.textContent = `Delete the last view for ${hooks.source.title}?`; dialog.append(title);
    dialog.insertAdjacentHTML("beforeend", `<form><label><input type="radio" name="delete" value="view" checked><strong data-i18n="Delete view only">Delete view only</strong><small data-i18n="The data source and all of its pages will be kept in this database.">The data source and all of its pages will be kept in this database.</small></label><label><input type="radio" name="delete" value="source"><strong data-i18n="Delete view and data source">Delete view and data source</strong><small data-i18n="The data source and all of its pages will move to Trash.">The data source and all of its pages will move to Trash.</small></label><p role="status"></p><footer><button type="submit" class="danger" data-i18n="Delete view">Delete view</button><button type="button" data-cancel data-i18n="Cancel">Cancel</button></footer></form>`);
    const form = dialog.querySelector("form")!, choice = form.querySelector<HTMLInputElement>('[value="source"]')!;
    choice.disabled = !hooks.ownsSource || hooks.wiki; if (choice.disabled) choice.closest("label")!.title = "This source belongs to another database or is a Wiki page source";
    let busy = false; const close = () => { if (!busy) { dialog.close(); dialog.remove(); } };
    form.querySelector<HTMLButtonElement>("[data-cancel]")!.onclick = close; dialog.oncancel = event => { event.preventDefault(); close(); };
    form.onsubmit = event => { event.preventDefault(); if (busy) return; busy = true; form.querySelectorAll<HTMLButtonElement>("button").forEach(button => button.disabled = true); void hooks.remove(choice.checked).then(() => { busy = false; pop.destroy(); close(); }).catch(error => { form.querySelector("[role=status]")!.textContent = error instanceof Error ? error.message : String(error); }).finally(() => { busy = false; form.querySelectorAll<HTMLButtonElement>("button").forEach(button => button.disabled = false); }); };
    document.body.append(dialog); dialog.showModal();
  });
  remove.classList.add("database-popover-danger");
  actions.append(remove); return pop;
}
