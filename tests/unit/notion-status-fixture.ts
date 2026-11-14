export const statusDatabase = "d6000000-0000-4000-8000-000000000001";
export const statusSource = "d6000000-0000-4000-8000-000000000002";
export const statusRecords = ["d6000000-0000-4000-8000-000000000003", "d6000000-0000-4000-8000-000000000004"];
const rich = (text: string) => [{ plain_text: text, text: { content: text } }];
export const statusSchema = { object: "data_source", id: statusSource, title: rich("Tasks"), properties: {
  Name: { id: "title", type: "title", title: {} },
  Status: { id: "status", type: "status", status: { options: [{ id: "todo", name: "Not started", color: "default" }, { id: "progress", name: "In progress", color: "blue" }, { id: "done", name: "Done", color: "green" }], groups: [{ id: "to-do", name: "To-do", option_ids: ["todo"] }, { id: "in-progress", name: "In progress", option_ids: ["progress"] }, { id: "complete", name: "Complete", option_ids: ["done"] }] } },
  Class: { id: "class", type: "select", select: { options: [{ id: "main", name: "Main", color: "orange" }] } },
  Dates: { id: "dates", type: "date", date: {} },
  Files: { id: "files", type: "files", files: {} },
} };
export function statusFixture(fallback?: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input)), endpoint = url.pathname;
    if (!url.href.includes("d6000000-0000-4000-8000-")) {
      if (fallback) return fallback(input, init);
      throw Error(`Unexpected fixture URL: ${url}`);
    }
    if (endpoint === `/v1/pages/${statusDatabase}`) return Response.json({}, { status: 404 });
    if (endpoint === `/v1/databases/${statusDatabase}`) return Response.json({ object: "database", id: statusDatabase, title: rich("Status import"), data_sources: [{ id: statusSource }] });
    if (endpoint === `/v1/data_sources/${statusSource}`) return Response.json(statusSchema);
    const record = (id: string) => ({ object: "page", id, parent: { type: "data_source_id", data_source_id: statusSource }, properties: {
      Name: { id: "title", type: "title", title: rich(id === statusRecords[0] ? "First" : "Empty record") },
      Status: { id: "status", type: "status", status: id === statusRecords[0] ? { id: "progress", name: "In progress" } : null },
      Class: { id: "class", type: "select", select: id === statusRecords[0] ? { id: "main", name: "Main" } : null },
      Dates: { id: "dates", type: "date", date: id === statusRecords[0] ? { start: "2026-11-13", end: "2026-11-14" } : null },
      Files: { id: "files", type: "files", files: [] },
    } });
    if (endpoint.endsWith("/query")) return Response.json({ results: statusRecords.map(record), has_more: false, next_cursor: null });
    if (endpoint === "/v1/views" || endpoint.endsWith("/children")) return Response.json({ results: [], has_more: false, next_cursor: null });
    if (endpoint.endsWith("/markdown")) return Response.json({ object: "page_markdown", id: endpoint.split("/")[3], markdown: "Record body\n", truncated: false, unknown_block_ids: [] });
    const id = endpoint.split("/")[3];
    if (endpoint.startsWith("/v1/pages/") && statusRecords.includes(id)) return Response.json(record(id));
    throw Error(`Unexpected fixture URL: ${url}`);
  };
}
