import type { DatabaseSourceSummary } from "./database-model";
import { routeHash } from "../pages/page-navigation";

function link(text: string, databaseId: string, viewId?: string, close?: () => void) {
  const a = document.createElement("a"); a.textContent = text;
  a.href = routeHash({ kind: "database", id: databaseId, ...(viewId ? { viewId } : {}) });
  a.addEventListener("click", () => close?.()); return a;
}
export function sourceUsage(source: DatabaseSourceSummary, close?: () => void) {
  const host = document.createElement("div"); host.className = "database-source-usage";
  for (const database of source.databases) {
    const item = document.createElement("div"); item.className = "database-source-usage-item";
    const title = link(database.title, database.id, undefined, close);
    const role = document.createElement("small"); role.textContent = database.isOwner ? "Original" : "Linked";
    item.append(title, role);
    const views = document.createElement("div"); views.className = "database-source-view-links";
    for (const view of database.views) {
      const target = link(view.name, database.id, view.id, close); target.title = `${view.type} view`;
      target.setAttribute("aria-label", `Open ${view.name} in ${database.title}`); views.append(target);
    }
    if (!database.views.length) views.textContent = "No views";
    item.append(views); host.append(item);
  }
  return host;
}

/** Read-only catalog: one row per source, with its original owner and every active usage. */
export function renderSourceCatalog(host: HTMLElement, sources: DatabaseSourceSummary[], close?: () => void) {
  host.classList.add("database-source-catalog"); host.replaceChildren();
  const search = document.createElement("input"); search.type = "search"; search.placeholder = "Search sources, databases or views…"; search.setAttribute("aria-label", "Filter data sources");
  const count = document.createElement("p"); count.className = "database-source-catalog-count"; count.setAttribute("role", "status");
  const scroll = document.createElement("div"); scroll.className = "database-source-catalog-scroll";
  const table = document.createElement("table"); table.setAttribute("aria-label", "Data source relationships");
  const head = table.createTHead().insertRow();
  for (const text of ["Data source", "Original database", "Used in databases / Views"]) { const th = document.createElement("th"); th.textContent = text; th.scope = "col"; head.append(th); }
  const body = table.createTBody(); scroll.append(table); host.append(search, count, scroll);
  function draw() {
    const query = search.value.trim().toLocaleLowerCase();
    const matches = sources.filter(source => [source.title, source.ownerTitle, ...source.databases.flatMap(database => [database.title, ...database.views.map(view => view.name)])].join(" ").toLocaleLowerCase().includes(query));
    count.textContent = `${matches.length} data source${matches.length === 1 ? "" : "s"}`; body.replaceChildren();
    for (const source of matches) {
      const row = body.insertRow(); row.dataset.sourceId = source.id;
      const name = document.createElement("strong"); name.textContent = source.title;
      const note = document.createElement("small"); note.textContent = `${source.recordCount} records · ${source.propertyCount} properties`;
      row.insertCell().append(name, note);
      row.insertCell().append(link(source.ownerTitle, source.ownerDatabaseId, undefined, close));
      row.insertCell().append(sourceUsage(source, close));
    }
    if (!matches.length) { const cell = body.insertRow().insertCell(); cell.colSpan = 3; cell.textContent = "No matching data sources."; }
  }
  search.addEventListener("input", draw); draw();
}
