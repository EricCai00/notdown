import { Pencil, PaintRoller, SlidersHorizontal, Database, Link, Eye, Copy, Trash2, Table2, Columns3, LayoutGrid, List, Calendar } from "lucide";
import { DatabasePopover, menuButton, menuChoice, menuInput, menuSection } from "./database-popover";
import { databaseViewTypes, type DatabaseView, type DatabaseDataSource } from "./database-model";
import { routeHash } from "../pages/page-navigation";
import { viewLabel } from "./database-view-settings";

const icons = { table: Table2, board: Columns3, gallery: LayoutGrid, list: List, calendar: Calendar };
export function openTabMenu(anchor: HTMLElement, hooks: {
  view: DatabaseView; source: DatabaseDataSource; wiki: boolean; showSourceTitle: boolean; canDelete: boolean;
  save(view: DatabaseView): Promise<void>;
  edit(section?: "Source"): void;
  duplicate(): Promise<void>; remove(): Promise<void>;
}) {
  const pop = new DatabasePopover(anchor, "View options", { replace: true });
  const draft = structuredClone(hooks.view), panel = pop.panel("View options", anchor, 0, 240);
  panel.classList.add("database-tab-menu"); pop.commit = () => hooks.save(draft);
  panel.append(menuButton("Rename", Pencil, button => {
    const child = pop.panel("Rename view", button, 1, 240), input = menuInput("View name", draft.name, value => draft.name = value);
    child.append(input); pop.footer(child, "Save view"); input.querySelector("input")!.select();
    input.querySelector("input")!.onkeydown = event => { if (event.key === "Enter") { event.preventDefault(); void pop.close(); } };
  }));
  panel.append(menuButton("Display as", PaintRoller, button => {
    const child = pop.panel("Display as", button, 1, 240);
    for (const type of databaseViewTypes) child.append(menuChoice(viewLabel(type), draft.type === type, () => { draft.type = type; pop.dirty = true; void pop.close(); }, icons[type]));
  }, "", true));
  panel.append(menuButton("Edit view", SlidersHorizontal, () => { pop.destroy(); hooks.edit(); }));
  if (!hooks.wiki) panel.append(menuButton("Source", Database, () => { pop.destroy(); hooks.edit("Source"); }, hooks.source.title, true));
  const links = menuSection(panel);
  links.append(menuButton("Copy link to view", Link, async button => {
    const url = new URL(location.href); url.hash = routeHash({ kind: "database", id: draft.databaseId, viewId: draft.id });
    try { await navigator.clipboard.writeText(url.href); button.querySelector(".database-popover-label")!.textContent = "Link copied"; }
    catch { const child = pop.panel("Link to view", button, 1, 300), input = menuInput("View link", url.href, () => {}); input.querySelector("input")!.readOnly = true; child.append(input); input.querySelector("input")!.select(); }
  }));
  if (!hooks.wiki) links.append(menuButton(hooks.showSourceTitle ? "Hide data source titles" : "Show data source titles", Eye, () => {
    draft.layout = { ...draft.layout, showDataSourceTitle: !hooks.showSourceTitle }; pop.dirty = true; void pop.close();
  }));
  const actions = menuSection(panel);
  actions.append(menuButton("Duplicate view", Copy, () => { void pop.perform(hooks.duplicate); }));
  const remove = menuButton("Delete view", Trash2, () => { void pop.perform(hooks.remove); });
  remove.classList.add("database-popover-danger"); remove.disabled = !hooks.canDelete;
  if (!hooks.canDelete) remove.title = "Keep at least one view in this database";
  actions.append(remove); return pop;
}
