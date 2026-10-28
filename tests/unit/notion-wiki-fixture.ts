export const wikiId = (n: number) => `aabbccdd-1000-4000-8000-${n.toString().padStart(12, "0")}`;
export const wiki = wikiId(1), wikiSource = wikiId(2), childDatabase = wikiId(3), childSource = wikiId(4), otherSource = wikiId(5);
const rich = (text: string) => [{ type: "text", text: { content: text }, plain_text: text }];
const list = (results: unknown[]) => ({ object: "list", results, has_more: false, next_cursor: null });
const source = (id: string, parent: string, name: string) => ({ object: "data_source", id, parent: { type: "database_id", database_id: parent }, title: rich(name), properties: {
  Name: { id: "title", name: "Name", type: "title", title: {} },
  Notes: { id: "n%3At", name: "Notes", type: "rich_text", rich_text: {} },
  Count: { id: "count", name: "Count", type: "number", number: {} },
  ...(id === wikiSource ? { Verification: { id: "verify", type: "verification", verification: {} } } : {}),
} });
export const wikiHome = `# Knowledge home\n\n<columns>\n\t<column>\n\t\tRead this first\n\t</column>\n\t<column>\n\t\t<todo checked="true">Reviewed</todo>\n\t</column>\n</columns>\n\n<page url="https://www.notion.so/${wikiId(10)}">Guide</page>\n\n<database url="https://www.notion.so/${childDatabase}" inline="true" data-source-url="collection://${otherSource}">Projects</database>\n`;
export function wikiFixture(options: { noMarkdown?: boolean; noHome?: boolean; inaccessibleChild?: boolean; reverse?: boolean } = {}, fallback?: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input)), route = url.pathname.replace(/^\/v1/, "");
    if (!route.includes("aabbccdd-1000-4000-8000-") && !(route === "/views" && [...url.searchParams.values()].some(value => value.includes("aabbccdd-1000-4000-8000-")))) {
      if (fallback) return fallback(input, init); throw new Error(`Unexpected URL ${url}`);
    }
    const id = route.split("/")[2];
    const unavailable = () => Response.json({}, { status: 404 });
    const record = (id: string, ds: string, title: string, count = 0) => ({ object: "page", id, parent: { type: "data_source_id", data_source_id: ds }, properties: {
      Name: { id: "title", type: "title", title: rich(title) }, Notes: { id: "n%3At", type: "rich_text", rich_text: rich("Keep this") }, Count: { id: "count", type: "number", number: count },
    } });
    const rows: Record<string, any> = { [wikiId(10)]: record(wikiId(10), wikiSource, "Guide"), [wikiId(11)]: record(wikiId(11), childSource, "Keep project", 8), [wikiId(12)]: record(wikiId(12), otherSource, "Other record", 2) };
    const sources: Record<string, any> = { [wikiSource]: source(wikiSource, wiki, "Knowledge"), [childSource]: source(childSource, childDatabase, "Projects"), [otherSource]: source(otherSource, childDatabase, "Tasks") };
    const view = (n: number, db: string, ds: string, name: string, config: any = {}) => ({ object: "view", id: wikiId(n), parent: { type: "database_id", database_id: db }, data_source_id: ds, name, type: "table", ...config });
    const views = [view(20, wiki, wikiSource, "All pages"), view(21, wiki, wikiSource, "Pages I own", { filter: { property: "Owner", people: { contains: "me" } } }),
      view(22, childDatabase, childSource, "Selected projects", { filter: { property: "Name", title: { contains: "Keep" } }, sorts: [{ property: "Count", direction: "descending" }], configuration: { type: "table", properties: [{ property_id: "count", visible: true }, { property_id: "title", visible: true }, { property_id: "n:t", visible: false }] } }),
      view(23, childDatabase, childSource, "Board", { type: "board", configuration: { type: "board", group_by: { property_id: "count" } } }), view(24, childDatabase, otherSource, "Tasks")];
    if (route.startsWith("/databases/")) {
      if (id === wiki) return Response.json({ object: "database", id, title: rich("Team wiki"), data_sources: [{ id: wikiSource, name: "Knowledge" }] });
      if (id === childDatabase && !options.inaccessibleChild) return Response.json({ object: "database", id, title: rich("Projects database"), data_sources: [{ id: childSource }, { id: otherSource }] });
      return unavailable();
    }
    if (route.startsWith("/data_sources/")) {
      if (route.endsWith("/query")) {
        if (id === wikiSource) {
          const body = JSON.parse(String(init?.body));
          // Two child sources refer to one database, across query pages.
          return Response.json({ ...list(body.start_cursor ? [sources[otherSource]] : [rows[wikiId(10)], sources[childSource]]), has_more: !body.start_cursor, next_cursor: body.start_cursor ? null : "wiki-next" });
        }
        return Response.json(list(Object.values(rows).filter(row => row.parent.data_source_id === id)));
      }
      return sources[id] ? Response.json(sources[id]) : unavailable();
    }
    if (route === "/views") {
      const result = views.filter(view => url.searchParams.has("database_id") ? view.parent.database_id === url.searchParams.get("database_id") : view.data_source_id === url.searchParams.get("data_source_id"));
      return Response.json(list(options.reverse ? result.reverse() : result));
    }
    if (route.startsWith("/views/")) return Response.json(views.find(view => view.id === id));
    if (route.endsWith("/markdown")) {
      if (id === childDatabase || id === wiki && (options.noMarkdown || options.noHome)) return unavailable();
      return Response.json({ object: "page_markdown", id, markdown: id === wiki ? wikiHome : `Body of ${rows[id]?.properties.Name.title[0].plain_text}\n`, truncated: false, unknown_block_ids: [] });
    }
    if (route.startsWith("/pages/")) return rows[id] ? Response.json(rows[id]) : unavailable();
    if (route.endsWith("/children")) {
      if (id === wiki && options.noHome) return unavailable();
      const children = id === wiki ? [
        { object: "block", id: wikiId(30), type: "heading_1", heading_1: { rich_text: rich("Knowledge home") } },
        { object: "block", id: wikiId(31), type: "to_do", to_do: { rich_text: rich("Reviewed"), checked: true } },
        { object: "block", id: wikiId(10), type: "child_page", child_page: { title: "Guide" } },
        { object: "block", id: childDatabase, type: "child_database", child_database: { title: "Projects database" } },
      ] : [];
      return Response.json(list(children));
    }
    throw new Error(`Unexpected Wiki fixture request ${route}`);
  };
}
