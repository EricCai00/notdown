import type { Page } from "../../shared/types";
import type { DatabaseDataSource, DatabaseProperty } from "./database-model";
import { relationIds } from "./database-dependencies";
import { calendarDate, shiftDay } from "./database-query";
import { timelineEdit } from "./database-timeline-model";

export type RecordChange = { page: Page; field: DatabaseProperty; value: unknown };

/** Plan from the full source, before queuing any CAS writes. Never mutate pages. */
export function scheduleDependencies(pages: Page[], source: DatabaseDataSource, changes: RecordChange[]): RecordChange[] {
  const forward = source.properties.find(field => field.dependencyRole === "blockedBy");
  const date = source.properties.find(field => field.type === "date" && (!source.dependencyDatePropertyId || field.id === source.dependencyDatePropertyId));
  if (!forward || !changes.some(change => change.field.id === forward.id || change.field.id === date?.id)) return changes;
  const members = pages.filter(page => page.dataSourceId === source.id && !page.trashed);
  const properties = new Map(members.map(page => [page.id, { ...page.properties }]));
  const affected = new Set<string>();
  for (const change of changes) {
    const values = properties.get(change.page.id); if (!values) continue;
    if (change.field.id === date?.id || change.field.id === forward.id && relationIds(change.value).some(id => !relationIds(values[forward.key]).includes(id))) affected.add(change.page.id);
    values[change.field.key] = change.value;
  }
  const ordered: Page[] = [], visiting = new Set<string>(), visited = new Set<string>(), byId = new Map(members.map(page => [page.id, page]));
  const visit = (page: Page) => {
    if (visiting.has(page.id)) throw new Error("Dependencies cannot form a cycle");
    if (visited.has(page.id)) return;
    visiting.add(page.id);
    for (const id of relationIds(properties.get(page.id)![forward.key])) { const predecessor = byId.get(id); if (predecessor) visit(predecessor); }
    visiting.delete(page.id); visited.add(page.id); ordered.push(page);
  };
  members.forEach(visit);
  if (!date || source.dependencyAutoShift === false) return changes;
  const result = new Map(changes.map(change => [`${change.page.id}/${change.field.id}`, change]));
  for (const page of ordered) {
    const values = properties.get(page.id)!, predecessors = relationIds(values[forward.key]);
    if (predecessors.some(id => affected.has(id))) affected.add(page.id);
    if (!affected.has(page.id)) continue;
    const range = calendarDate(values[date.key]); if (!range) continue;
    const earliest = predecessors.map(id => calendarDate(properties.get(id)?.[date.key])?.end).filter((day): day is string => !!day).sort().at(-1);
    if (!earliest || range.start > earliest) continue;
    const days = Math.round((Date.parse(shiftDay(earliest, 1)) - Date.parse(range.start)) / 86400000);
    const next = timelineEdit(values[date.key], days, "move");
    if (!next) throw new Error(`Edit the timed or zoned date for ${page.title} before scheduling this dependency`);
    values[date.key] = next; result.set(`${page.id}/${date.id}`, { page, field: date, value: next });
  }
  return [...result.values()];
}
