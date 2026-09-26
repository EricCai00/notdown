import assert from "node:assert/strict";

export const notionRoot = "11111111-1111-4111-8111-111111111111";
export const notionChild = "22222222-2222-4222-8222-222222222222";
export const notionSibling = "33333333-3333-4333-8333-333333333333";
export const notionContainer = "44444444-4444-4444-8444-444444444444";
export const notionDatabase = "55555555-5555-4555-8555-555555555555";
export const notionSource =
  '# API Enhanced Markdown {color="blue"}\r\n\r\n<callout icon="📘" color="blue_bg">\r\n\tOnly API content\r\n</callout>\r\n\r\n<details>\r\n<summary>Toggle</summary>\r\n\tChild text\r\n</details>\r\n\r\n<unknown url="https://www.notion.so/block" alt="Unsupported"/>\r\n\r\n```xml\r\n<page url="keep-this-literal">Code</page>\r\n```\r\n';
export const notionFixture =
  (calls: string[] = []): typeof fetch =>
  async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.notion.com");
    assert.equal(init?.method, "GET");
    assert.equal(init?.redirect, "error");
    assert.equal(
      new Headers(init?.headers).get("Notion-Version"),
      "2026-03-11",
    );
    assert.ok(
      new Headers(init?.headers).get("Authorization")?.startsWith("Bearer "),
    );
    calls.push(url.pathname + url.search);
    const id = url.pathname.split("/")[3];
    if (url.pathname.endsWith("/markdown"))
      return Response.json({
        object: "page_markdown",
        id,
        markdown: id === notionRoot ? notionSource : "Child API Markdown\n",
        truncated: false,
        unknown_block_ids: [],
      });
    if (url.pathname.startsWith("/v1/pages/"))
      return Response.json({
        object: "page",
        id,
        icon: { type: "emoji", emoji: "📘" },
        properties: {
          unrelated: {
            type: "rich_text",
            rich_text: [{ plain_text: "Not a title" }],
          },
          Name: {
            type: "title",
            title: [
              {
                plain_text:
                  id === notionRoot ? "Notion API fixture" : "Same title",
              },
            ],
          },
        },
        untouched: { future: true },
      });
    const block = (id: string, type: string, has_children = false) => ({
      object: "block",
      id,
      type,
      has_children,
    });
    if (id === notionRoot && !url.searchParams.has("start_cursor"))
      return Response.json({
        results: [block(notionContainer, "toggle", true)],
        has_more: true,
        next_cursor: "second page&cursor",
      });
    if (id === notionRoot)
      return Response.json({
        results: [
          block(notionSibling, "child_page"),
          block(notionDatabase, "child_database"),
        ],
        has_more: false,
        next_cursor: null,
      });
    if (id === notionContainer)
      return Response.json({
        results: [
          block(notionChild, "child_page"),
          block(notionSibling, "child_page"),
        ],
        has_more: false,
        next_cursor: null,
      });
    return Response.json({ results: [], has_more: false, next_cursor: null });
  };
