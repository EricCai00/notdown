import test from "node:test";
import assert from "node:assert/strict";
import { readNotionClipboard, notionClipboardMap } from "../../src/desktop/notion-clipboard.js";
import { parseCopiedNotionBlocks, recoverCopiedNotionButton } from "../../server/notion-copied-blocks.js";
import { prepareNotionImport } from "../../server/notion-import.js";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec.js";
import { editorKind } from "../../src/document/node-identity.js";
import { readButtonActions, buttonTransaction } from "../../src/blocks/button-actions.js";
import { EditorState } from "prosemirror-state";
import { privateRoot, privateButton, privateApi, privateFixture } from "./notion-private-blocks-fixture.js";
import { copiedSnapshot, clipboardPickle, copiedAutomation, copiedAction, copiedHolder, copiedText } from "./notion-copied-blocks-fixture.js";

const syntax = { variant: "notdown", version: 1, notionVersion: "v2", extensions: {} } as const;
const parse = (source: string) => parseNative(source, syntax);
test("the explicit clipboard reader consumes only Notion custom data with bounded Chromium framing", async () => {
  const bytes = clipboardPickle();
  const read = (data: Uint8Array) => readNotionClipboard([{ types: ['text/plain', 'text/html', 'electron application/osclipboard;format="Chromium Web Custom MIME Data Format"'], getType: async type => {
    assert.ok(!['text/plain', 'text/html'].includes(type)); return new Blob([data as Uint8Array<ArrayBuffer>]);
  } }]);
  const copied = await read(bytes);
  assert.equal(parseCopiedNotionBlocks(copied)!.source.id, privateRoot);
  for (const invalid of [bytes.subarray(1), bytes.subarray(0, 12), Buffer.alloc(6 * 1024 * 1024)]) await assert.rejects(read(invalid));
  const badCount = Buffer.from(bytes); badCount.writeUInt32LE(999, 4); assert.throws(() => notionClipboardMap(badCount));
  await assert.rejects(readNotionClipboard([{ types: ["text/plain"], getType: async () => { throw Error("Should not read unrelated clipboard data"); } }]));
});

test("copied insert-below workflows retain real button identity, label, nested template and a single local undoable transaction", () => {
  const snapshot = copiedSnapshot();
  const result = recoverCopiedNotionButton(privateApi(privateButton), privateRoot, parseCopiedNotionBlocks(JSON.stringify(snapshot)));
  assert.match(result.source!, /label="Insert block"/);
  const doc = parse(result.source!), button = doc.firstChild!;
  assert.equal(editorKind(button), "button");
  assert.equal(serializeNative(doc, syntax), result.source);
  const actions = readButtonActions(button.attrs);
  assert.deepEqual(actions, [{ type: "insert-blocks", position: "below", content: "<p>Inserted block</p>" }]);
  const state = EditorState.create({ schema: doc.type.schema, doc });
  const inserted = buttonTransaction(state, 0, button, actions, parse).doc;
  assert.equal(inserted.childCount, 2);
  assert.equal(inserted.child(1).textContent, "Inserted block");
  assert.ok(result.evidence!.records.automation_action[copiedAction]);
  Object.assign(snapshot.data.blocks[0].blockSubtree.block[copiedText].value, { properties: { title: [['A & <button />']] } });
  const escaped = recoverCopiedNotionButton(privateApi(privateButton), privateRoot, parseCopiedNotionBlocks(JSON.stringify(snapshot)));
  assert.equal(parse(readButtonActions(parse(escaped.source!).firstChild!.attrs)[0].content!).textContent, "A & <button />");
});

test("mismatched, partial, future and active cloud workflows never become guessed or partially executable buttons", () => {
  const base = copiedSnapshot();
  const recover = (s: any, api = privateApi(privateButton)) => recoverCopiedNotionButton(api, privateRoot, parseCopiedNotionBlocks(JSON.stringify(s)));
  for (const mutate of [
    (s: any) => { s.source.id = copiedText; },
    (s: any) => { s.data.blocks[0].blockSubtree.block[privateButton].value.last_edited_time -= 60000; },
    (s: any) => { s.data.blocks[0].blockSubtree.block[privateButton].value.parent_id = copiedText; },
    (s: any) => { s.data.blocks[0].blockSubtree.automation[copiedAutomation].value.space_id = copiedText; },
    (s: any) => { s.data.blocks[0].blockSubtree.automation[copiedAutomation].value.status = 'inactive'; },
    (s: any) => { s.data.blocks[0].blockSubtree.automation[copiedAutomation].value.variables = {}; },
    (s: any) => { s.data.blocks[0].blockSubtree.automation_action[copiedAction].value.type = 'send_webhook'; },
    (s: any) => { s.data.blocks[0].blockSubtree.automation_action[copiedAction].value.position = 'above'; },
    (s: any) => { delete s.data.blocks[0].blockSubtree.block[copiedText]; },
    (s: any) => { s.data.blocks[0].blockSubtree.block[copiedText].value.parent_id = copiedAction; },
    (s: any) => { s.data.blocks[0].blockSubtree.block[copiedText].value.space_id = copiedText; },
    (s: any) => { s.data.blocks[0].blockSubtree.block[copiedText].value.content = [copiedHolder]; },
    (s: any) => { s.data.blocks[0].blockSubtree.block[copiedText].value.type = 'future'; },
  ]) { const snapshot = structuredClone(base); mutate(snapshot); assert.equal(recover(snapshot).source, undefined); }
  assert.equal(recover(base, { ...privateApi(privateButton), archived: true } as any).source, undefined);
  for (const input of ['{', JSON.stringify({ ...base, version: 99 }), JSON.stringify({ ...base, source: { table: 'block', id: privateRoot, spaceId: 'invalid' } }), 'x'.repeat(6 * 1024 * 1024)]) assert.throws(() => parseCopiedNotionBlocks(input), /Copied Notion blocks/);
});

test("API preview adopts only supplied copied buttons in Notdown, archives evidence and includes it in batch identity", async () => {
  const input = { token: "test-copied-token", pageId: privateRoot, variant: "notdown", includeChildren: true, useDesktopCache: false, downloadAssets: false, copiedBlocks: JSON.stringify(copiedSnapshot()) };
  const options = { fetch: privateFixture(), wait: async () => {} };
  const plan = await prepareNotionImport(input, options);
  assert.ok(plan.pages[0].source.includes('<button label="Insert block"'));
  assert.ok(plan.originals.some(item => item.path === `copied-blocks/${privateButton}.json`));
  assert.ok(!JSON.stringify(plan).includes(input.token));
  const changed = copiedSnapshot(); changed.data.blocks[0].blockSubtree.automation[copiedAutomation].value.properties.name = "Different name";
  assert.notEqual(plan.id, (await prepareNotionImport({ ...input, copiedBlocks: JSON.stringify(changed) }, options)).id);
  for (const overrides of [{ copiedBlocks: undefined }, { variant: "notion-markdown" }]) assert.ok(!(await prepareNotionImport({ ...input, ...overrides }, options)).pages[0].source.includes('<button label='));
});
