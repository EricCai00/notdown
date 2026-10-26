import { notionFixture, notionChild } from "./notion-import-fixture.js";
export const enrichmentRoot = "99999999-9999-4999-8999-999999999999";
export const blockId = (number: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${number.toString().padStart(12, "0")}`;
export const unknownTag = (number: number, alt = "unreliable-label") => `<unknown url="https://www.notion.so/${enrichmentRoot}#${blockId(number).replace(/-/g, "")}" alt="${alt}" future="keep"/>`;
export const crossLinksRoot = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
export const crossLinksTarget = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const crossLinksSource = `<mention-page url="https://www.notion.so/${crossLinksTarget}">Mentioned target</mention-page>\n\n${unknownTag(9).replace(enrichmentRoot, crossLinksRoot)}\n`;
export const enrichmentSource = [
  `<page url="https://www.notion.so/${notionChild}">Child</page>`, '',
  '<columns>', '\t<column>', '\t\t' + unknownTag(1), '\t\t' + unknownTag(2), '\t</column>',
  '\t<column>', '\t\t' + unknownTag(3), '\t\t' + unknownTag(4), '\t\t' + unknownTag(5), '\t</column>', '</columns>', '',
  unknownTag(6), '', unknownTag(7), '', '```xml', unknownTag(8), '```', '',
].join('\r\n');
const responseBlock = (number: number, type: string, data: object) => ({ object: "block", id: blockId(number), type, has_children: false, [type]: data, future: { preserved: true } });
export const enrichmentBlocks = [
  responseBlock(1, "link_to_page", { type: "page_id", page_id: notionChild }),
  responseBlock(2, "bookmark", { url: "https://example.com/bookmark?x=1&y=2", caption: [{ type: "text", plain_text: 'Caption "quoted"\nNext', annotations: { bold: true } }] }),
  responseBlock(3, "embed", { url: "https://example.com/embed" }),
  responseBlock(4, "link_preview", { url: "https://example.com/preview" }),
  responseBlock(5, "breadcrumb", {}),
  responseBlock(6, "template", { rich_text: [] }),
];
export const enrichmentFixture = (calls: string[] = []): typeof fetch => {
  const base = notionFixture(calls);
  return async (input, init) => {
    const response = await base(input, init), url = new URL(String(input));
    if (url.pathname === `/v1/pages/${crossLinksRoot}/markdown`) return Response.json({
      object: "page_markdown", id: crossLinksRoot, markdown: crossLinksSource, truncated: false, unknown_block_ids: [blockId(9)],
    });
    if (url.pathname === `/v1/blocks/${blockId(9)}`) return Response.json(responseBlock(9, "link_to_page", { type: "page_id", page_id: crossLinksTarget }));
    if (url.pathname.includes("/pages/aaaaaaaa-") && url.pathname.endsWith("/markdown")) return Response.json({}, { status: 404 });
    if (url.pathname === `/v1/pages/${enrichmentRoot}/markdown`) return Response.json({
      object: "page_markdown", id: enrichmentRoot, markdown: enrichmentSource, truncated: true, unknown_block_ids: [blockId(7)],
    });
    if (url.pathname === `/v1/pages/${enrichmentRoot}`) {
      const json = await response.json();
      json.properties.Name.title = [{ plain_text: "Notdown restored blocks" }];
      return Response.json(json);
    }
    if (url.pathname === `/v1/blocks/${enrichmentRoot}/children`) return Response.json({
      results: [{ object: "block", id: notionChild, type: "child_page", has_children: false }, ...enrichmentBlocks], has_more: false, next_cursor: null,
    });
    if (url.pathname === `/v1/blocks/${blockId(7)}`) return Response.json({ secret: "never display upstream body" }, { status: 404 });
    const block = enrichmentBlocks.find(block => url.pathname === `/v1/blocks/${block.id}`);
    return block ? Response.json(block) : response;
  };
};
