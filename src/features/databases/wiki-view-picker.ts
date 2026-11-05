import { databaseViewIcon } from "./database-view-icon";
import { createElement, FileText, Table2, List, Columns3, LayoutGrid, Calendar, ChevronDown, Check, Plus, Ellipsis } from "lucide";
import { ChartNoAxesCombined, GanttChart, Rss } from "lucide";
import type { DatabaseSnapshot, DatabaseView } from "./database-model";
import { DatabasePopover, menuButton } from "./database-popover";
import { openTabMenu } from "./database-tab-menu";
import { api } from "../../shared/types";

/** Home and collection layouts use exactly the same view selector. */
export function mountWikiViewPicker(host: HTMLElement, snapshot: DatabaseSnapshot, selected: string, hooks: {
  select(id: string): Promise<unknown>;
  create(anchor: HTMLElement): Promise<unknown>;
  edit(id: string, anchor: HTMLElement): Promise<unknown>;
  prepare(): Promise<boolean>;
  menuOpened(pop: DatabasePopover): void;
  updated(snapshot: DatabaseSnapshot): void;
  report(error: unknown): void;
}) {
  const trigger = document.createElement("button"); trigger.type = "button"; trigger.className = "wiki-view-trigger";
  trigger.setAttribute("aria-haspopup", "menu"); trigger.setAttribute("aria-expanded", "false"); host.append(trigger);
  const refreshTrigger = () => {
    const current = snapshot.views.find(view => view.id === selected), name = selected === "home" ? "Home" : current?.name ?? "All pages";
    trigger.replaceChildren(createElement(selected === "home" ? FileText : current ? databaseViewIcon(current) : Table2, { width: 17, height: 17 }), document.createTextNode(name), createElement(ChevronDown, { width: 14, height: 14 }));
    trigger.setAttribute("aria-label", `Wiki view: ${name}`);
  };
  refreshTrigger();
  let pop: DatabasePopover | undefined;
  const events = new AbortController();
  const act = (action: () => Promise<unknown>) => { void (async () => { if (pop && !await pop.save()) return; pop?.destroy(); pop = undefined; await action(); })().catch(hooks.report); };
  trigger.onclick = async () => {
    if (trigger.getAttribute("aria-expanded") === "true") { void pop?.dismiss(); return; }
    if (!await hooks.prepare().catch(error => { hooks.report(error); return false; }) || !trigger.isConnected) return;
    pop = new DatabasePopover(trigger, "Wiki views"); pop.saveOnDismiss = false;
    hooks.menuOpened(pop);
    const panel = pop.panel("Wiki views", trigger, 0, 330); panel.classList.add("wiki-view-menu"); panel.setAttribute("role", "menu");
    const entries = [{ id: "home", name: "Home", type: "home" }, ...snapshot.views];
    for (const entry of entries) {
      const row = document.createElement("div"); row.className = "wiki-view-menu-row";
      const button = menuButton(entry.name, entry.id === "home" ? FileText : databaseViewIcon(entry as DatabaseView), () => act(() => hooks.select(entry.id)), "", false, "database-popover-row", false);
      button.setAttribute("role", "menuitemradio"); button.setAttribute("aria-checked", String(entry.id === selected));
      if (entry.id === selected) button.append(createElement(Check, { width: 17, height: 17 }));
      const more = menuButton(`${entry.name} view options`, Ellipsis, async () => {
        if (entry.id === "home") { act(() => hooks.edit(entry.id, trigger)); return; }
        if (!pop || !await pop.save() || !panel.isConnected) return;
        const view = snapshot.views.find(view => view.id === entry.id)!, source = snapshot.dataSources.find(source => source.id === view.dataSourceId)!;
        const publish = (next: DatabaseSnapshot) => {
          Object.assign(snapshot, next); refreshTrigger(); hooks.updated(snapshot);
          document.dispatchEvent(new CustomEvent("notdown-database-updated", { detail: snapshot }));
        };
        pop.saveOnDismiss = true;
        openTabMenu(more, {
          view, source, wiki: true, showSourceTitle: false, ownsSource: false,
          lastSourceView: snapshot.views.filter(item => item.dataSourceId === source.id).length === 1,
          save: async draft => {
            const saved = await api<DatabaseView>(`/database-views/${view.id}`, { method: "PUT", body: JSON.stringify({ baseRevision: view.revision, name: draft.name, icon: draft.icon, type: draft.type, layout: draft.layout }) });
            publish({ ...snapshot, views: snapshot.views.map(item => item.id === saved.id ? saved : item) });
          },
          edit: () => { void hooks.edit(view.id, trigger).catch(hooks.report); },
          duplicate: async () => {
            const { id: _id, databaseId: _databaseId, revision: _revision, ...copy } = view;
            publish(await api<DatabaseSnapshot>(`/databases/${snapshot.database.id}/views`, { method: "POST", body: JSON.stringify({ ...copy, name: `${view.name} (copy)`, baseRevision: snapshot.database.revision }) }));
          },
          remove: async () => publish(await api<DatabaseSnapshot>(`/database-views/${view.id}/delete`, { method: "POST", body: JSON.stringify({ baseRevision: view.revision, databaseRevision: snapshot.database.revision }) })),
        }, { pop, level: 1 });
        pop.panels[1]?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
      }, "", false, "wiki-view-more");
      more.setAttribute("aria-haspopup", "dialog");
      row.append(button, more); panel.append(row);
    }
    const add = menuButton("New view", Plus, () => act(() => hooks.create(trigger))); add.classList.add("wiki-new-view"); panel.append(add);
    panel.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
  };
  document.addEventListener("keydown", event => { if (event.key === "Escape" && pop?.panels.length === 1) trigger.focus({ preventScroll: true }); }, { capture: true, signal: events.signal });
  return () => { pop?.destroy(); events.abort(); trigger.remove(); };
}
