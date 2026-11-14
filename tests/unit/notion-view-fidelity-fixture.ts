import type { CachedNotionView } from "../../server/notion-view-cache.js";
export const fidelityDatabase = "d7000000-0000-4000-8000-000000000001", fidelitySource = "d7000000-0000-4000-8000-000000000002";
export const fidelityViews = Array.from({ length: 5 }, (_, i) => `d7000000-0000-4000-8000-${String(i + 10).padStart(12, "0")}`);
export const fidelityPages = Array.from({ length: 7 }, (_, i) => `d7000000-0000-4000-8000-${String(i + 20).padStart(12, "0")}`);
const rich = (text: string) => [{ plain_text: text, text: { content: text } }];
export const fidelitySchema = { object: "data_source", id: fidelitySource, title: rich("Database 1"), properties: {
  "Blocked by": { id: "Cz%3BS", type: "relation", relation: { data_source_id: fidelitySource } },
  Place: { id: "KHBf", type: "place", place: {} },
  Assign: { id: "_unc", type: "people", people: {} },
  Status: { id: "bUwW", type: "status", status: { options: [{ id: "todo", name: "Not started", color: "gray" }] } },
  Blocking: { id: "fyS%5D", type: "relation", relation: { data_source_id: fidelitySource } },
  Date: { id: "yjkW", type: "date", date: {} },
  Name: { id: "title", type: "title", title: {} },
} };
export const fidelityRawViews = ["timeline", "table", "calendar", "feed", "map"].map((type, index) => index === 3 ? { object: "view", id: fidelityViews[index] } : {
  object: "view", id: fidelityViews[index], type, name: index === 0 ? "Timeline view" : "", data_source_id: fidelitySource,
  parent: { type: "database_id", database_id: fidelityDatabase }, configuration: { type, ...(type === "timeline" ? { arrows_by: { property_id: "fyS]" } } : {}), ...(type === "map" ? { map_by: "KHBf" } : ["timeline", "calendar"].includes(type) ? { date_property_id: "yjkW" } : { subtasks: { toggle_column_id: "title" } }) },
});
export const fidelityCache = (): CachedNotionView[] => ["timeline", "table", "calendar", "feed", "map"].map((type, index) => ({
  id: fidelityViews[index], parentId: fidelityDatabase, sourceId: fidelitySource, type, name: index === 0 ? "Timeline view" : null, version: 8,
  format: type === "feed" ? { feed_properties: [{ property: "_unc", visible: true }, { property: "bUwW", visible: true }] } : {},
  query: type === "map" ? { map_by: "KHBf" } : {}, pageOrder: type === "table" ? [fidelityPages[0], fidelityPages[2], fidelityPages[1], fidelityPages[3]] : [],
}));
export function fidelityFixture(fallback?: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input)), p = url.pathname;
    if (!url.href.includes("d7000000-0000-4000-8000-")) { if (fallback) return fallback(input, init); throw Error(`Unexpected fixture ${url}`); }
    if (p === `/v1/pages/${fidelityDatabase}`) return Response.json({}, { status: 404 });
    if (p === `/v1/databases/${fidelityDatabase}`) return Response.json({ object: "database", id: fidelityDatabase, title: rich("Database 1"), data_sources: [{ id: fidelitySource }] });
    if (p === `/v1/data_sources/${fidelitySource}`) return Response.json(fidelitySchema);
    const record = (id: string) => { const index = fidelityPages.indexOf(id); return { object: "page", id, parent: { type: "data_source_id", data_source_id: fidelitySource }, properties: {
      Name: { id: "title", type: "title", title: rich(index < 4 ? `Card ${index + 1}` : `Extra ${index + 1}`) },
      Assign: { id: "_unc", type: "people", people: [] }, Place: { id: "KHBf", type: "place", place: null },
      Status: { id: "bUwW", type: "status", status: { id: "todo", name: "Not started" } },
      Date: { id: "yjkW", type: "date", date: { start: "2026-11-14" } },
      Blocking: { id: "fyS%5D", type: "relation", relation: index === 3 ? [{ id: fidelityPages[1] }] : index === 2 ? [{ id: fidelityPages[4] }] : [] },
    } }; };
    if (p.endsWith("/query")) return Response.json({ results: [...fidelityPages].reverse().map(record), has_more: false, next_cursor: null });
    if (p === "/v1/views") return Response.json({ results: fidelityViews.map(id => ({ object: "view", id })), has_more: false, next_cursor: null });
    if (p.startsWith("/v1/views/")) { const view = fidelityRawViews.find(v => v.id === p.split("/")[3]); return view && view.type ? Response.json(view) : Response.json({}, { status: 404 }); }
    if (p.endsWith("/children")) return Response.json({ results: [], has_more: false, next_cursor: null });
    if (p.endsWith("/markdown")) return Response.json({ object: "page_markdown", id: p.split("/")[3], markdown: "Body\n", truncated: false, unknown_block_ids: [] });
    if (p.startsWith("/v1/pages/")) return Response.json(record(p.split("/")[3]));
    throw Error(`Unexpected fixture ${url}`);
  };
}
