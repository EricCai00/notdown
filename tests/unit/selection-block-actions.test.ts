import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import { editorSchema as schema } from "../../src/document/editor-schema";
import { selectionBlock, selectionBlockAction } from "../../src/editor/selection-block-actions";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { defaultSyntax } from "../../src/markdown-engine/config";

const config = { ...defaultSyntax(), variant: "notdown" as const };
function state(source: string, text: string) {
  const doc = parseNative(source, config);
  let at = -1;
  doc.descendants((node, pos) => { if (node.isText && node.text === text) at = pos; });
  assert.ok(at >= 0);
  return EditorState.create({ schema, doc, selection: TextSelection.create(doc, at), plugins: [history()] });
}
test("selection actions move a list row with children and undo without losing raw unknown content", () => {
  const original = state("- Parent\n  - Child\n- Sibling\n\n```alien\n<unknown keep='yes'>\n```\n", "Parent");
  const tr = selectionBlockAction(original, "down"); assert.ok(tr);
  const next = original.apply(tr); next.doc.check();
  const source = serializeNative(next.doc, config);
  assert.ok(source.indexOf("Sibling") < source.indexOf("Parent"));
  assert.ok(source.includes("<unknown keep='yes'>"));
  assert.equal(next.doc.firstChild!.lastChild!.childCount, 2);
  let reverted = next;
  assert.ok(undo(next, tr => { reverted = next.apply(tr); }));
  assert.ok(reverted.doc.eq(original.doc));
});
test("whole-block actions reject text spanning rows and refuse to move past sibling bounds", () => {
  let current = state("First\n\nSecond\n", "First");
  assert.equal(selectionBlockAction(current, "up"), null);
  current = current.apply(current.tr.setSelection(TextSelection.create(current.doc, 1, current.doc.content.size - 1)));
  assert.equal(selectionBlock(current), null);
  assert.equal(selectionBlockAction(current, "delete"), null);
});
test("insert below a task creates an unchecked sibling without altering the existing task", () => {
  const original = state("- [x] Done\n  - Child\n", "Done");
  const tr = selectionBlockAction(original, "insert-after"); assert.ok(tr);
  const next = original.apply(tr); next.doc.check();
  assert.equal(next.doc.firstChild!.childCount, 2);
  assert.equal(next.doc.firstChild!.firstChild!.attrs.checked, true);
  assert.equal(next.doc.firstChild!.firstChild!.childCount, 2);
  assert.equal(next.doc.firstChild!.lastChild!.attrs.checked, false);
  assert.equal(next.selection.$from.parent.textContent, "");
});
test("atomic blocks can be duplicated and removing the last block leaves editable text", () => {
  const doc = schema.nodes.doc.create(null, schema.nodes["block.divider"].create());
  const original = EditorState.create({ schema, doc, selection: NodeSelection.create(doc, 0) });
  const duplicate = selectionBlockAction(original, "duplicate"); assert.ok(duplicate);
  assert.equal(duplicate.doc.childCount, 2);
  const remove = selectionBlockAction(original, "delete"); assert.ok(remove);
  remove.doc.check(); assert.equal(remove.doc.firstChild!.type, schema.nodes["block.paragraph"]);
});
