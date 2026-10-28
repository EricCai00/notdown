import type { NotionCacheSnapshot } from "../../server/notion-desktop-cache.js";

export const privateRoot = "d8100000-0000-4000-8000-000000000001";
export const privateAi = "d8100000-0000-4000-8000-000000000002";
export const privateOutput = "d8100000-0000-4000-8000-000000000003";
export const privateButton = "d8100000-0000-4000-8000-000000000004";
export const privateSource = `<unknown url="https://www.notion.so/${privateRoot}#${privateAi.replaceAll("-", "")}"/>\n\n<unknown url="https://www.notion.so/${privateButton}"/>`;
export const privateApi = (id = privateAi) => ({ object: "block", id, type: "unsupported", unsupported: { block_type: id === privateAi ? "ai_block" : "button" }, has_children: id === privateAi, last_edited_time: "2026-10-28T10:18:00.000Z" });
export function privateSnapshot(): NotionCacheSnapshot {
  return { blocks: [], privateBlocks: [
    { id: privateAi, type: "ai_block", version: 16, lastEdited: Date.parse("2026-10-28T10:18:28.330Z"), properties: {}, format: { ai_block_configuration_menu: { type: "custom", version: 3, autofillInstructions: [["hi"]] }, ai_last_edited: 1793182708330 }, content: [privateOutput], parentId: privateRoot, parentTable: "block" },
    { id: privateOutput, type: "text", version: 6, lastEdited: Date.parse("2026-10-28T10:18:28.330Z"), properties: { title: [["Hi!"]] }, format: {}, content: [], parentId: privateAi, parentTable: "block" },
    { id: privateButton, type: "button", version: 4, lastEdited: Date.parse("2026-10-28T10:18:28.330Z"), properties: {}, format: { automation_id: "d8100000-0000-4000-8000-000000000005" }, content: [], parentId: privateRoot, parentTable: "block" },
  ] };
}
export function privateFixture(fallback?: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input)), id = url.pathname.split("/")[3];
    if (![privateRoot, privateAi, privateButton].includes(id)) {
      if (fallback) return fallback(input, init);
      throw Error(`Unexpected request ${url.pathname}`);
    }
    if (url.pathname.endsWith("/markdown")) return Response.json({ object: "page_markdown", id, markdown: id === privateRoot ? privateSource : `<unknown url="https://www.notion.so/${id}"/>`, truncated: false, unknown_block_ids: id === privateRoot ? [privateAi, privateButton] : [id] });
    if (url.pathname.endsWith("/children")) return id === privateAi
      ? Response.json({ object: "error", code: "validation_error", message: "Block type ai_block is not supported via the API for your bot type." }, { status: 400 })
      : Response.json({ results: id === privateRoot ? [privateApi(), privateApi(privateButton)] : [], has_more: false });
    if (id === privateRoot) return Response.json({ object: "page", id, properties: { title: { type: "title", title: [{ plain_text: "Private block recovery" }] } } });
    return Response.json(privateApi(id));
  };
}
