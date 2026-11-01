import { api, type Page } from "../../shared/types";
import type { DatabaseSnapshot, DatabaseView, DatabaseProperty, DatabaseDataSource } from "./database-model";
import { groupable, queryDatabase } from "./database-query";
/** Shared creation workflow for the Home picker and collection toolbar. */
export async function createDatabaseView(snapshot: DatabaseSnapshot, draft: DatabaseView, current?: DatabaseView): Promise<DatabaseSnapshot> {
  const layout = draft.layout ?? {};
  let source = snapshot.dataSources.find(item => item.id === draft.dataSourceId)!;
  if (draft.type === "board" && !layout.groupBy || draft.type === "calendar" && !layout.datePropertyId) {
    const board = draft.type === "board", id = crypto.randomUUID();
    const existing = source.properties.find(board ? groupable : field => field.type === "date");
    const field: DatabaseProperty = existing ?? { id, key: id, name: board ? "Status" : "Date", type: board ? "status" : "date", ...(board ? { options: [{ id: crypto.randomUUID(), name: "Not started", color: "gray" }, { id: crypto.randomUUID(), name: "In progress", color: "blue" }, { id: crypto.randomUUID(), name: "Done", color: "green" }] } : {}) };
    if (!existing) {
      source = await api<DatabaseDataSource>(`/data-sources/${source.id}`, { method: "PUT", body: JSON.stringify({ baseRevision: source.revision, properties: [...source.properties, field] }) });
      snapshot.dataSources = snapshot.dataSources.map(item => item.id === source.id ? source : item);
    }
    if (board) layout.groupBy = field.id; else layout.datePropertyId = field.id;
  }
  const propertyIds = draft.type === "table" ? undefined : source.properties.filter(field => field.type === "title" || field.id === layout.groupBy || field.id === layout.datePropertyId).map(field => field.id);
  const rowOrder = current ? queryDatabase(snapshot.pages, source, { ...current, filters: [] }).map((page: Page) => page.id) : snapshot.pages.filter(page => page.dataSourceId === source.id).map(page => page.id);
  return api<DatabaseSnapshot>(`/databases/${snapshot.database.id}/views`, { method: "POST", body: JSON.stringify({ baseRevision: snapshot.database.revision, name: draft.name, dataSourceId: source.id, type: draft.type, layout, propertyIds, rowOrder }) });
}
