import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import { parseNative, serializeNative } from "../src/markdown-engine/codec";
import { buttonTarget, buttonTransaction, readButtonActions, validateButtonActions } from "../src/button-actions";
import { escapeXml } from "../src/notion-syntax";

const config = { version: 1 as const, variant: "notdown" as const, extensions: { notion_button: true } };
const parse = (raw: string) => parseNative(raw, config);
const button = '<button label="Add" action="insert-text" target="Legacy **literal**" custom="keep"/>';
test("legacy buttons retain literal text, unknown attributes and exact source until edited", () => {
  const raw = button + "\r\n\r\nTail";
  let state = EditorState.create({ doc: parse(raw), plugins: [history()] });
  const original = state.doc.firstChild!;
  assert.equal(serializeNative(state.doc, config), raw);
  state = state.apply(buttonTransaction(state, 0, original, readButtonActions(original.attrs), parse));
  assert.equal(state.doc.child(1).textContent, "Legacy **literal**");
  assert.equal(state.doc.child(1).firstChild!.marks.length, 0);
  assert(undo(state, tr => { state = state.apply(tr); }));
  assert.equal(serializeNative(state.doc, config), raw);
});
for (const position of ["above", "below", "start", "end"]) test(`ordered rich templates at ${position} survive saving and undo as one action`, () => {
  const raw = "Before\n\n" + button + "\n\nAfter";
  let state = EditorState.create({ doc: parse(raw), plugins: [history()] });
  const pos = state.doc.firstChild!.nodeSize, original = state.doc.nodeAt(pos)!;
  const actions = [
    { type: "insert-blocks", position, content: "## Agenda\n\n- [ ] Task" },
    { type: "insert-blocks", position, content: '```html\n<button label="literal"/>\n```\n\n<future-box value="keep"/>' },
  ];
  state = state.apply(buttonTransaction(state, pos, original, actions, parse));
  const output = serializeNative(state.doc, config), reopened = parse(output);
  reopened.check();
  const types: string[] = []; reopened.forEach(n => types.push(n.type.name));
  assert(types.indexOf("heading") < types.indexOf("code_block"));
  assert.equal(types.filter(t => t === "button").length, 1, output);
  assert(output.includes('<button label="literal"/>'), output);
  assert(output.includes('<future-box value="keep"/>'), output);
  const text = reopened.textContent;
  if (position === "start") assert(text.indexOf("Agenda") < text.indexOf("Before"));
  if (position === "end") assert(text.indexOf("After") < text.indexOf("Agenda"));
  if (position === "above") assert(types.indexOf("code_block") < types.indexOf("button"));
  if (position === "below") assert(types.indexOf("button") < types.indexOf("heading"));
  assert(undo(state, tr => { state = state.apply(tr); }));
  assert.equal(serializeNative(state.doc, config), raw);
});
test("new button configuration round-trips JSON, Unicode, XML and unknown action fields", () => {
  const actions = [{ type: "insert-blocks", position: "below", content: 'A & B\n\n```\n</button>\n```', future: { keep: true } }];
  const raw = `<button label="新增" icon="📝" variant="blue" actions="${escapeXml(JSON.stringify(actions))}" vendor="kept"/>`;
  const state = EditorState.create({ doc: parse(raw) });
  const tr = state.tr.setNodeMarkup(0, undefined, { ...state.doc.firstChild!.attrs, label: "Changed" });
  const reopened = parse(serializeNative(tr.doc, config));
  assert.deepEqual(readButtonActions(reopened.firstChild!.attrs), actions);
  assert.equal(reopened.firstChild!.attrs.nfmAttrs.vendor, "kept");
  assert.equal(reopened.firstChild!.attrs.icon, "📝");
});
test("invalid or future actions never partially run or fall back to a legacy action", () => {
  assert.throws(() => readButtonActions({ actions: "{", action: "toggle-tasks" }), /invalid JSON/);
  assert.throws(() => readButtonActions({ actions: '[null]' }), /action objects/);
  const state = EditorState.create({ doc: parse(button) });
  assert.throws(() => buttonTransaction(state, 0, state.doc.firstChild!, [
    { type: "insert-blocks", content: "Must not insert" }, { type: "future-action", payload: "preserve" },
  ], parse), /not supported/);
  assert.equal(state.doc.childCount, 1);
  assert(validateButtonActions([{ type: "open-url", target: "https://example.com" }, { type: "confirmation", message: "Confirm" }])?.includes("last step"));
  for (const url of ["javascript:alert(1)", "//example.com", "https://", "#page/%ZZ", "https://user:password@example.com", "https://example.com\nattack"]) assert.equal(buttonTarget(url), null);
  assert.deepEqual(buttonTarget("#page/local-id"), { pageId: "local-id" });
  assert.deepEqual(buttonTarget("https://example.com/path"), { url: "https://example.com/path" });
  const changed = state.apply(state.tr.setNodeMarkup(0, undefined, { ...state.doc.firstChild!.attrs, label: "Changed" }));
  assert.throws(() => buttonTransaction(changed, 0, state.doc.firstChild!, readButtonActions(state.doc.firstChild!.attrs), parse), /changed/);
});

test("unclosed templates cannot absorb neighboring content after saving", () => {
  const state = EditorState.create({ doc: parse(button + "\n\nTail") });
  for (const content of ["```js\nUnclosed code", "<callout>\nUnclosed container"]) {
    assert.throws(() => buttonTransaction(state, 0, state.doc.firstChild!, [{ type: "insert-blocks", position: "below", content }], parse), /boundary/);
    assert.equal(state.doc.lastChild!.textContent, "Tail");
  }
});
