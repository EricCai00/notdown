import { api, type Page } from "../../shared/types";
import type { DatabaseSnapshot, DatabaseView, DatabaseProperty, DatabaseDataSource } from "./database-model";
import { groupable, queryDatabase } from "./database-query";
/** Shared creation workflow for the Home picker and collection toolbar. */
export async function createDatabaseView(snapshot: DatabaseSnapshot, draft: DatabaseView, current?: DatabaseView): Promise<DatabaseSnapshot> {
  const layout = draft.layout ?? {};
  if (draft.type === "timeline") layout.timelineTable ??= false;
  if (draft.type === "calendar") { layout.calendarWeekStart ??= 1; layout.showPageIcon ??= false; }
  let source = snapshot.dataSources.find(item => item.id === draft.dataSourceId)!;
  if (draft.type === "map" && !layout.mapPlaceId && !layout.mapLatitudeId && !layout.mapLongitudeId) {
    const id = crypto.randomUUID(), existing = source.properties.find(field => field.type === "place");
    const field: DatabaseProperty = existing ?? { id, key: id, name: "Place", type: "place" };
    if (!existing) {
      source = await api<DatabaseDataSource>(`/data-sources/${source.id}`, { method: "PUT", body: JSON.stringify({ baseRevision: source.revision, properties: [...source.properties, field] }) });
      snapshot.dataSources = snapshot.dataSources.map(item => item.id === source.id ? source : item);
    }
    layout.mapPlaceId = field.id;
  }
  if (draft.type === "board" && !layout.groupBy || ["calendar", "timeline"].includes(draft.type) && !layout.datePropertyId) {
    const board = draft.type === "board", id = crypto.randomUUID();
    const existing = source.properties.find(board ? groupable : field => field.type === "date");
    const field: DatabaseProperty = existing ?? { id, key: id, name: board ? "Status" : "Date", type: board ? "status" : "date", ...(board ? { options: [{ id: crypto.randomUUID(), name: "Not started", color: "gray" }, { id: crypto.randomUUID(), name: "In progress", color: "blue" }, { id: crypto.randomUUID(), name: "Done", color: "green" }] } : {}) };
    if (!existing) {
      source = await api<DatabaseDataSource>(`/data-sources/${source.id}`, { method: "PUT", body: JSON.stringify({ baseRevision: source.revision, properties: [...source.properties, field] }) });
      snapshot.dataSources = snapshot.dataSources.map(item => item.id === source.id ? source : item);
    }
    if (board) layout.groupBy = field.id; else layout.datePropertyId = field.id;
  }
  const propertyIds = ["table", "feed", "form", "map", "dashboard"].includes(draft.type) ? undefined : source.properties.filter(field => field.type === "title" || field.id === layout.groupBy || draft.type === "calendar" && field.type === "status" || field.id === layout.datePropertyId).map(field => field.id);
  const rowOrder = current ? queryDatabase(snapshot.pages, source, { ...current, filters: [] }).map((page: Page) => page.id) : snapshot.pages.filter(page => page.dataSourceId === source.id).map(page => page.id);
  return api<DatabaseSnapshot>(`/databases/${snapshot.database.id}/views`, { method: "POST", body: JSON.stringify({ baseRevision: snapshot.database.revision, name: draft.name, icon: draft.icon, dataSourceId: source.id, type: draft.type, layout, propertyIds, rowOrder }) });
}
