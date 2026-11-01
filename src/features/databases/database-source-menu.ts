import { Database, Link, Plus, Search, Ellipsis } from "lucide";
import { DatabasePopover, menuButton, menuInput, menuSection } from "./database-popover";
import type { DatabaseSnapshot, DatabaseSourceSummary } from "./database-model";
import { renderSourceCatalog, sourceUsage } from "./database-source-catalog";

export function openSourceMenu(anchor: HTMLElement, hooks: {
  snapshot: DatabaseSnapshot;
  list(): Promise<DatabaseSourceSummary[]>;
  create(title: string): Promise<void>;
  link(source: DatabaseSourceSummary): Promise<void>;
  select(sourceId: string): void;
  surface?: HTMLElement;
}, navigation?: { pop: DatabasePopover; level: number }) {
  const pop = navigation?.pop ?? new DatabasePopover(anchor, "Manage data sources", { replace: true, surface: hooks.surface });
  const level = navigation?.level ?? 0;
  if (!navigation) pop.saveOnDismiss = false;
  const panel = pop.panel("Manage data sources", anchor, level, 300, false);
  const current = document.createElement("div"); panel.append(current);
  let catalog: DatabaseSourceSummary[] | undefined;
  const loading = hooks.list().then(items => { catalog = items; if (panel.isConnected) drawCurrent(); return items; });
  void loading.catch(error => { if (panel.isConnected) panel.querySelector<HTMLElement>("[role=status]")!.textContent = error.message ?? "Data sources could not be loaded."; });
  function drawCurrent() {
    current.replaceChildren();
    for (const kind of ["Source", "Linked", "Other sources"] as const) {
      const sources = hooks.snapshot.dataSources.filter(source => {
        const owner = catalog?.find(item => item.id === source.id)?.ownerDatabaseId ?? source.ownerDatabaseId;
        return (owner === hooks.snapshot.database.id ? "Source" : owner ? "Linked" : "Other sources") === kind;
      });
      if (!sources.length && kind === "Other sources") continue;
      const section = menuSection(current, kind);
      for (const source of sources) {
        const item = catalog?.find(item => item.id === source.id), row = document.createElement("div"); row.className = "database-source-menu-item";
        const select = menuButton(source.title, kind === "Linked" ? Link : Database, () => { pop.destroy(); hooks.select(source.id); });
        select.setAttribute("aria-label", `Show data source ${source.title}`);
        const note = document.createElement("small"); note.className = "database-source-description";
        const views = hooks.snapshot.views.filter(view => view.dataSourceId === source.id);
        select.title = `${kind === "Source" ? "Owned here" : item ? `From ${item.ownerTitle}` : "Owner unavailable"} · Views: ${views.map(view => view.name).join(", ") || "None"}`;
        note.textContent = `${views.length} view${views.length === 1 ? "" : "s"}`;
        select.append(note);
        const details = menuButton(`Details for ${source.title}`, Ellipsis, button => { void detail(source.id, button); });
        details.className = "database-source-details-button"; row.append(select, details); section.append(row);
      }
      if (kind === "Source") section.append(menuButton("Add data source", Plus, button => create(button)));
      if (kind === "Linked") section.append(menuButton("Link existing data source", Plus, button => { void existing(button); }));
    }
  }
  drawCurrent();
  async function detail(id: string, button: HTMLElement) {
    const form = pop.panel("Data source details", button, level + 1, 380, false), status = form.querySelector<HTMLElement>("[role=status]")!;
    status.textContent = "Loading source relationships…";
    try {
      const source = (await loading).find(item => item.id === id); if (!form.isConnected) return;
      if (!source) { status.textContent = "Source relationships are unavailable. Its original database may be in Trash."; return; }
      status.textContent = "";
      menuSection(form, source.title).append(sourceUsage(source, () => pop.destroy()));
    } catch (error) { if (form.isConnected) status.textContent = error instanceof Error ? error.message : "Source relationships could not be loaded."; }
  }
  const actions = menuSection(panel);
  function create(button: HTMLElement) {
    const form = pop.panel("New data source", button, level + 1, 320, false);
    let title = "New data source";
    const input = menuInput("Data source name", title, value => { title = value; }, Database);
    form.append(input);
    menuSection(form, "Creates an independent set of properties and records, with a Table view.");
    const submit = () => { void pop.perform(() => hooks.create(title.trim())); };
    const footer = document.createElement("footer"); footer.className = "database-popover-footer";
    const done = menuButton("Create data source", undefined, submit); done.className = "database-popover-done"; footer.append(done); form.append(footer);
    input.querySelector("input")!.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); submit(); } });
    input.querySelector("input")!.select();
  }
  actions.append(menuButton("Browse all data sources", Search, button => {
    const form = pop.panel("All data sources", button, level + 1, 660, false), status = form.querySelector<HTMLElement>("[role=status]")!;
    status.textContent = "Loading data sources…";
    void loading.then(items => { if (!form.isConnected) return; status.textContent = ""; const content = document.createElement("div"); form.append(content); renderSourceCatalog(content, items, () => pop.destroy()); })
      .catch(error => { if (form.isConnected) status.textContent = error.message; });
  }));

  async function existing(button: HTMLElement) {
    const form = pop.panel("Link existing data source", button, level + 1, 360, false);
    menuSection(form, "Fields and records stay shared with the original database. Changes are visible in both places.");
    const results = document.createElement("div");
    let query = "", sources: DatabaseSourceSummary[] = [];
    const search = menuInput("Search data sources", "", value => { query = value; draw(); }, Search);
    form.append(search, results);
    const status = form.querySelector<HTMLElement>("[role=status]")!;
    status.textContent = "Loading data sources…";
    try {
      sources = (await loading).filter(source => !hooks.snapshot.database.dataSourceIds.includes(source.id));
      if (!form.isConnected) return;
      status.textContent = ""; draw(); search.querySelector("input")!.focus();
    } catch (error) { if (form.isConnected) status.textContent = error instanceof Error ? error.message : "Data sources could not be loaded."; }
    function draw() {
      results.replaceChildren();
      const matches = sources.filter(source => `${source.title} ${source.ownerTitle}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
      for (const source of matches) {
        const row = menuButton(source.title, Link, () => { void pop.perform(() => hooks.link(source)); });
        row.setAttribute("aria-label", `Link ${source.title} from ${source.ownerTitle}`);
        const note = document.createElement("small"); note.className = "database-source-description";
        note.textContent = `${source.ownerTitle} · ${source.recordCount} records · ${source.propertyCount} properties`;
        row.querySelector(".database-popover-label")!.append(note); results.append(row);
      }
      if (!matches.length) menuSection(results, query ? "No matching data sources." : "No other available data sources in this vault.");
    }
  }
  return pop;
}
