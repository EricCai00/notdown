import { privateRoot, privateButton, privateApi } from "./notion-private-blocks-fixture.js";
export const copiedId = (suffix: number) => `e8200000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
export const copiedSpace = copiedId(1), copiedAutomation = copiedId(2), copiedAction = copiedId(3), copiedHolder = copiedId(4), copiedText = copiedId(5);
export function copiedSnapshot() {
  const record = <T extends Record<string, unknown>>(id: string, parent_id: string, parent_table: string, more: T) => ({ value: { id, version: 4, space_id: copiedSpace, parent_id, parent_table, alive: true, ...more } });
  return { version: 1, source: { table: "block", id: privateRoot, spaceId: copiedSpace }, data: { action: "copy", blocks: [{ blockId: privateButton, blockSubtree: {
    __version__: 3,
    block: {
      [privateButton]: record(privateButton, privateRoot, "block", { type: "button", last_edited_time: Date.parse(privateApi().last_edited_time) + 28330, format: { automation_id: copiedAutomation } }),
      [copiedHolder]: record(copiedHolder, copiedAction, "automation_action", { type: "text", content: [copiedText] }),
      [copiedText]: record(copiedText, copiedHolder, "block", { type: "text", properties: { title: [["Inserted block"]] } }),
    },
    automation: { [copiedAutomation]: record(copiedAutomation, privateButton, "block", { status: "active", trigger: { id: copiedId(6), type: "button" }, action_ids: [copiedAction], properties: { name: "Insert block" } }) },
    automation_action: { [copiedAction]: record(copiedAction, copiedAutomation, "automation", { type: "duplicate_blocks", blocks: [copiedHolder] }) },
  } }] } };
}
export function clipboardPickle(snapshot = copiedSnapshot()): Buffer {
  const pairs = [["text/_notion-blocks-v3-production", JSON.stringify(snapshot.data)], ["text/_notion-page-source-production", JSON.stringify(snapshot.source)]];
  const fields = pairs.flatMap(pair => pair.flatMap(text => { const bytes = Buffer.from(text, "utf16le"), field = Buffer.alloc(4 + Math.ceil(bytes.length / 4) * 4); field.writeUInt32LE(text.length); bytes.copy(field, 4); return [field]; }));
  const data = Buffer.concat([Buffer.alloc(8), ...fields]); data.writeUInt32LE(data.length - 4); data.writeUInt32LE(pairs.length, 4); return data;
}

export const multiRoot = copiedId(900), multiChild = copiedId(901), multiLeaf = copiedId(902);
export const multiButtons = [copiedId(903), copiedId(904), copiedId(905), copiedId(906)];
export function copiedSelection(pageId: string, buttonId: string, offset: number, text: string) {
  const ids = new Map<string, string>([[privateRoot, pageId], [privateButton, buttonId], ...[2, 3, 4, 5, 6].map(n => [copiedId(n), copiedId(n + offset)] as const)]);
  const remap = (value: any): any => typeof value === "string" ? ids.get(value) ?? value : Array.isArray(value) ? value.map(remap) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [ids.get(key) ?? key, remap(item)])) : value;
  const snapshot = remap(copiedSnapshot()) as ReturnType<typeof copiedSnapshot>;
  Object.assign(snapshot.data.blocks[0].blockSubtree.block[copiedId(5 + offset)].value, { properties: { title: [[text]] } });
  return snapshot;
}
export function multipleCopiedPages() {
  const root = copiedSelection(multiRoot, multiButtons[0], 100, "Root template A");
  root.data.blocks.push(...copiedSelection(multiRoot, multiButtons[1], 200, "Root template B").data.blocks);
  // An ordinary selected block exercises filtering a whole-page copy.
  root.data.blocks.unshift({ blockId: copiedId(907), blockSubtree: { __version__: 3, block: { [copiedId(907)]: { value: { id: copiedId(907), type: "text" } } } } } as any);
  return [root, copiedSelection(multiChild, multiButtons[2], 300, "Child template"), copiedSelection(multiLeaf, multiButtons[3], 400, "Leaf template")];
}
export function multipleButtonsFixture(fallback?: typeof fetch): typeof fetch {
  const pages = new Map([[multiRoot, [multiButtons[0], multiButtons[1]]], [multiChild, [multiButtons[2]]], [multiLeaf, [multiButtons[3]]]]);
  return async (input, init) => {
    const url = new URL(String(input)), id = url.pathname.split("/")[3], buttons = pages.get(id);
    if (!buttons) {
      if (multiButtons.includes(id)) {
        if (url.pathname.endsWith("/markdown")) return new Response(null, { status: 400 });
        const parentId = [...pages].find(([, entries]) => entries.includes(id))![0];
        return Response.json({ ...privateApi(id), parent: { type: "page_id", page_id: parentId } });
      }
      if (fallback) return fallback(input, init);
      throw Error(`Unexpected multi-button request ${url.pathname}`);
    }
    const child = id === multiRoot ? multiChild : id === multiChild ? multiLeaf : undefined;
    if (url.pathname.endsWith("/markdown")) return Response.json({ object: "page_markdown", id, markdown: buttons.map(button => `<unknown url="https://www.notion.so/${button}"/>`).join("\n\n"), truncated: false, unknown_block_ids: buttons });
    if (url.pathname.endsWith("/children")) return Response.json({ results: [...buttons.map(button => ({ ...privateApi(button), parent: { type: "page_id", page_id: id } })), ...(child ? [{ object: "block", id: child, type: "child_page", child_page: { title: "Child buttons" }, has_children: false }] : [])], has_more: false });
    return Response.json({ object: "page", id, properties: { title: { type: "title", title: [{ plain_text: id === multiRoot ? "Root buttons" : id === multiChild ? "Child buttons" : "Leaf buttons" }] } } });
  };
}
