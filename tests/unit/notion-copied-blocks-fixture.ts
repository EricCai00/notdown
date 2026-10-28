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
