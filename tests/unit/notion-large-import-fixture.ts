export const largeNotionId = (index: number) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(index).padStart(12, "0")}`;
export const largeNotionRoot = largeNotionId(0);

/** Pagination, a forward link beyond page 500, and duplicate discoveries. */
export function largeNotionFixture(count = 601, padding = 0, calls: string[] = []): typeof fetch {
  return async input => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    const id = url.pathname.split("/")[3];
    const index = Number(id.split("-").at(-1));
    if (url.pathname.endsWith("/markdown")) return Response.json({ object: "page_markdown", id,
      markdown: index === 0 ? `[Last page](https://www.notion.so/${largeNotionId(count - 1)})\n\n<page url="https://www.notion.so/${largeNotionId(count - 1)}">Last</page>\n` : `Page ${index}\n`,
      truncated: false, unknown_block_ids: [] });
    if (url.pathname.startsWith("/v1/pages/")) return Response.json({ object: "page", id,
      properties: { Name: { type: "title", title: [{ plain_text: `Large tree ${index}` }] } }, future: "x".repeat(padding) });
    const offset = Number(url.searchParams.get("start_cursor") ?? 1);
    return Response.json({ results: index === 0 ? Array.from({ length: Math.min(100, count - offset) }, (_, i) => ({ object: "block", id: largeNotionId(offset + i), type: "child_page", has_children: false })) : [],
      has_more: index === 0 && offset + 100 < count, next_cursor: String(offset + 100) });
  };
}
