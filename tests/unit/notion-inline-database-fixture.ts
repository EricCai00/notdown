import assert from "node:assert/strict";

export const inlineRoot = "d1000000-0000-4000-8000-000000000001";
export const inlineDatabases = ["d1000000-0000-4000-8000-000000000002", "d1000000-0000-4000-8000-000000000003"];
export const inlineSources = ["d1000000-0000-4000-8000-000000000004", "d1000000-0000-4000-8000-000000000005"];
export const inlineRecords = ["d1000000-0000-4000-8000-000000000006", "d1000000-0000-4000-8000-000000000007"];
export const inlineTitles = ["Used note apps", "Unused note apps"];
const inlineView = "d1000000-0000-4000-8000-000000000008";
export const inlineUrl = (id: string) => `https://app.notion.com/p/${id.replace(/-/g, "")}`;
export const inlineDatabaseSource = inlineDatabases.map((id, index) =>
  `<database url="${inlineUrl(id)}" inline="true"${index === 0 ? ' icon="🗒️"' : ""} data-source-url="collection://${inlineSources[index]}">${inlineTitles[index]}</database>`,
).join("\n") + "\n<empty-block/>\n";
const rich = (text: string) => [{ type: "text", plain_text: text, text: { content: text } }];

/** Two real resources behind two official inline references, matching the reported import. */
export function inlineDatabaseFixture(fallback?: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    if (!url.href.includes("d1000000-0000-4000-8000-")) {
      if (fallback) return fallback(input, init);
      throw new Error(`Unexpected fixture URL ${url}`);
    }
    assert.equal(url.origin, "https://api.notion.com");
    const pathname = url.pathname, id = pathname.split("/")[3];
    assert.equal(init?.method, pathname.endsWith("/query") ? "POST" : "GET");
    if (pathname.startsWith("/v1/databases/")) {
      const index = inlineDatabases.indexOf(id);
      assert.ok(index >= 0);
      return Response.json({ object: "database", id, title: rich(inlineTitles[index]), is_inline: true,
        data_sources: [{ id: inlineSources[index] }], icon: index === 0 ? { type: "emoji", emoji: "🗒️" } : null });
    }
    if (pathname.startsWith("/v1/data_sources/")) {
      const index = inlineSources.indexOf(id);
      assert.ok(index >= 0);
      if (pathname.endsWith("/query")) return Response.json({ results: [record(index)], has_more: false, next_cursor: null });
      return Response.json({ object: "data_source", id, title: rich(inlineTitles[index]), properties: {
        Comments: { id: "comments", type: "rich_text", rich_text: {} },
        ...(index === 0 ? { Markdown: { id: "markdown", type: "select", select: { options: [{ id: "no", name: "Not supported", color: "red" }] } }, Since: { id: "since", type: "number", number: {} } } : {}),
        Name: { id: "title", type: "title", title: {} },
      } });
    }
    if (pathname === "/v1/views") return Response.json({ results: url.searchParams.get("database_id") === inlineDatabases[0] ? [{ object: "view", id: inlineView }] : [], has_more: false, next_cursor: null });
    if (pathname === `/v1/views/${inlineView}`) return Response.json({ object: "view", id: inlineView, type: "table", data_source_id: inlineSources[0], configuration: { type: "table", properties: ["title", "since", "markdown", "comments"].map(property_id => ({ property_id, visible: true })) } });
    if (pathname.endsWith("/children")) return Response.json({ results: id === inlineRoot ? inlineDatabases.map(id => ({ object: "block", id, type: "child_database", has_children: false })) : [], has_more: false, next_cursor: null });
    if (pathname.endsWith("/markdown")) return Response.json({ object: "page_markdown", id, markdown: id === inlineRoot ? inlineDatabaseSource : "Record body\n", truncated: false, unknown_block_ids: [] });
    if (pathname === `/v1/pages/${inlineRoot}`) return Response.json({ object: "page", id, icon: { type: "emoji", emoji: "🗒️" }, properties: { Name: { type: "title", title: rich("Note apps") } } });
    throw new Error(`Unexpected fixture URL ${url}`);
  };
}

function record(index: number) {
  return { object: "page", id: inlineRecords[index], parent: { type: "data_source_id", data_source_id: inlineSources[index] }, properties: {
    Name: { id: "title", type: "title", title: rich(index === 0 ? "Xiaomi Notes" : "Anytype") },
    ...(index === 0 ? { Since: { id: "since", type: "number", number: 2014 }, Markdown: { id: "markdown", type: "select", select: { id: "no", name: "Not supported" } } } : {}),
    Comments: { id: "comments", type: "rich_text", rich_text: rich(index === 0 ? "Text" : "Notion-like; Object Oriented Programming-like") },
  } };
}
