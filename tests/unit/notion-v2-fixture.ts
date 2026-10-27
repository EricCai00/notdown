import assert from "node:assert/strict";
import type { ReadNotionAsset } from "../../server/notion-assets.js";

export const v2Id = (n: number) => `e2000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const v2Root = v2Id(1), v2Child = v2Id(2), v2Folder = v2Id(3);
const url = (n: number) => `https://www.notion.so/${v2Id(n)}`;
const unknown = (n: number) => `<unknown url="${url(1)}#${v2Id(n).replaceAll("-", "")}" alt="Original placeholder" />`;
export const v2Source = [
  '<h2 color="blue">Notion v2 import</h2>',
  `<p>See <mention url="${url(2)}">Child mention</mention> and [child](${url(2)}).</p>`,
  '<code>rdkit.Chem.BRICS.BRICSDecompose</code>',
  `<page url="${url(2)}">\n<b>Child</b> page\n</page>`,
  `<folder url="${url(3)}">Research folder</folder>`,
  '<toggle heading="h2">Toggle heading\n\nEditable child</toggle>',
  `<columns><column ratio="40">Left\n\n<page url="${url(2)}">\n<b>Child</b> page\n</page>\n</column><column ratio="60">Right</column></columns>`,
  '<tabs><tab icon="📘">Notes\n\nTab content</tab><tab>More\n\nSecond tab</tab></tabs>',
  '<meeting-notes attendees="user://one">Planning<meeting-notes-section-notes>Notes</meeting-notes-section-notes><meeting-notes-section-summary>Summary</meeting-notes-section-summary><meeting-notes-section-transcript>Complete transcript</meeting-notes-section-transcript></meeting-notes>',
  '<mail from="writer@example.com" subject="Imported message" attachments="https://files.example.test/report.pdf">Mail body</mail>',
  `<custom-block definition-id="${v2Id(99)}" url="${url(20)}" />`,
  '<external_object_instance integration="github">Repository connection</external_object_instance>',
  unknown(10), unknown(11), unknown(12), unknown(13),
  '<image source="https://files.example.test/photo.png">Local image</image>',
  '<pdf source="https://files.example.test/report.pdf">Report</pdf>',
  `<synced-block url="${url(21)}">Shared content</synced-block>`,
  '```xml\n' + unknown(90) + '\n![literal](https://files.example.test/never.png)\n```',
  'Tail',
].join('\n\n');

export const v2Asset: ReadNotionAsset = async (url, _signal, max) => {
  assert.ok(max > 0); assert.ok(url.startsWith("https://files.example.test/")); assert.ok(!url.includes("never"));
  if (url.endsWith(".pdf")) return { data: Buffer.from("%PDF-1.4\nfixture\n%%EOF"), contentType: "application/pdf" };
  return { data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="100"><rect width="360" height="100" fill="#c9ded4"/><text x="20" y="58" font-size="24">Local attachment</text></svg>'), contentType: "image/svg+xml" };
};

export function v2Fixture(fallback?: typeof fetch, calls: string[] = []): typeof fetch {
  return async (input, init) => {
    const request = new URL(String(input)), id = request.pathname.split("/")[3];
    if (!id?.startsWith("e2000000-")) { if (fallback) return fallback(input, init); throw new Error(`Unexpected fixture path ${request.pathname}`); }
    assert.equal(request.origin, "https://api.notion.com"); assert.equal(init?.method, "GET");
    calls.push(request.pathname + request.search);
    const markdown = (body: string) => Response.json({ object: "page_markdown", id, markdown: body, truncated: false, unknown_block_ids: [] });
    if (id === v2Id(85)) {
      const code = 'for i in $(ls *.pdbqt); do\nname=${i%.*};\necho "$name shen"\ndone';
      if (request.pathname.endsWith("/markdown")) return markdown('```shen\n' + code + '\n```\n\n```shen\n\n```');
      if (request.pathname.endsWith("/children")) return Response.json({ results: [{ object: "block", id: v2Id(86), type: "code", code: { language: "shell", rich_text: [{ type: "text", text: { content: code } }] } }, { object: "block", id: v2Id(87), type: "code", code: { language: "shell", rich_text: [] } }], has_more: false, next_cursor: null });
      return Response.json({ object: "page", id, properties: { Name: { type: "title", title: [{ plain_text: "Shell export mismatch" }] } } });
    }
    if (id === v2Id(82)) {
      if (request.pathname.endsWith("/markdown")) return markdown('<span color="red">API words</span>\n\n<span color="blue">Cache words</span>');
      if (request.pathname.endsWith("/children")) return Response.json({ results: [[83, "API words", "pink_background"], [84, "Cache words", "blue"]].map(([n,text,color]) => ({ object: "block", id: v2Id(Number(n)), type: "paragraph", last_edited_time: "2026-10-27T07:04:00.000Z", paragraph: { rich_text: [{ type: "text", text: { content: text, link: null }, plain_text: text, annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color } }] } })), has_more: false, next_cursor: null });
      return Response.json({ object: "page", id, properties: { Name: { type: "title", title: [{ plain_text: "Dual color fixture" }] } } });
    }
    if (id === v2Id(80)) {
      if (request.pathname.endsWith("/markdown")) return markdown('<date start="2026-10-24" start-time="09:00" time-zone="America/Los_Angeles"/>');
      if (request.pathname.endsWith("/children")) return Response.json({ results: [{ object: "block", id: v2Id(81), type: "paragraph", last_edited_time: "2026-10-26T15:53:00.000Z", paragraph: { rich_text: [{ type: "mention", mention: { type: "date", date: { start: "2026-10-24T09:00:00-07:00", end: null } } }] } }], has_more: false, next_cursor: null });
      return Response.json({ object: "page", id, properties: { Name: { type: "title", title: [{ plain_text: "Cached reminder fixture" }] } } });
    }
    const block = (n: number, type: string, data: object, has_children = false) => ({ object: "block", id: v2Id(n), type, has_children, [type]: data });
    const blocks = [block(10,"toggle",{ rich_text: [{ type: "text", plain_text: "Recovered subtree" }] },true), block(11,"unsupported",{ block_type: "button" }), block(12,"template",{ rich_text: [{ type: "text", plain_text: "Insert template" }] },true), block(13,"unsupported",{ block_type: "ai_block" },true), block(14,"paragraph",{ rich_text: [{ type: "text", plain_text: "Template content", annotations: { bold: true } }] }), block(15,"paragraph",{ rich_text: [{ type: "text", plain_text: "Saved AI result" }] })];
    if (request.pathname.endsWith("/markdown")) {
      assert.equal(request.searchParams.get("markdown_version"), "v2"); assert.equal(request.searchParams.get("include_transcript"), "true");
      if (id === v2Root) return markdown(v2Source);
      if (id === v2Child) return markdown(`<synced-block-reference url="${url(21)}">Shared content</synced-block-reference>\n\nChild body`);
      if (id === v2Folder) return markdown(`<page url="${url(4)}">Folder child</page>`);
      if (id === v2Id(4)) return markdown("Folder descendant");
      if (id === v2Id(10)) return markdown('<toggle>Recovered subtree\n\nRecovered nested content</toggle>');
      return Response.json({}, { status: 404 });
    }
    if (request.pathname.startsWith("/v1/pages/")) {
      assert.notEqual(id, v2Folder, "Folders are read through Markdown, not the page metadata endpoint");
      return Response.json({ object: "page", id, properties: { Name: { type: "title", title: [{ plain_text: id === v2Root ? "Notion v2 fixture" : "V2 child" }] } }, ...(id === v2Root ? { icon: { type: "custom_emoji", custom_emoji: { url: "https://files.example.test/icon.png" } }, cover: { type: "external", external: { url: "https://files.example.test/cover.png" } } } : {}) });
    }
    if (request.pathname.endsWith("/children")) {
      const results = id === v2Root ? [block(2,"child_page",{ title: "V2 child" }), ...blocks.slice(0,4)] : id === v2Id(12) ? [blocks[4]] : id === v2Id(13) ? [blocks[5]] : [];
      return Response.json({ results, has_more: false, next_cursor: null });
    }
    const found = blocks.find(block => block.id === id); return found ? Response.json(found) : Response.json({}, { status: 404 });
  };
}
