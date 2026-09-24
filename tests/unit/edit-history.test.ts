import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { DocumentSession } from "../../src/markdown-engine/session.js";
import { defaultSyntax } from "../../src/markdown-engine/config.js";

for (const pane of ["source", "document"] as const) {
  test(`${pane}: slower adjacent typing in a multiline document shares undo/redo`, (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 10_000 });
    const original = "Start\n\nTail\n";
    const session = new DocumentSession(original, defaultSyntax("markdown"));
    let text = "";
    for (const char of "word") {
      t.mock.timers.tick(600);
      text += char;
      if (pane === "source") session.sourceChanged(`${text}${original}`, true);
      else session.documentChanged(EditorState.create({ doc: session.snapshot.doc }).tr.insertText(char, text.length).doc);
    }
    const final = session.snapshot.source;
    assert.equal(final, `word${original}`);
    assert(session.undo());
    assert.equal(session.snapshot.source, original);
    assert(session.redo());
    assert.equal(session.snapshot.source, final);
  });
}

test("a typing pause starts a new undo group", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 10_000 });
  const session = new DocumentSession("Start\n", defaultSyntax("markdown"));
  session.sourceChanged("Starta\n", true);
  t.mock.timers.tick(1100);
  session.sourceChanged("Startab\n", true);
  session.undo();
  assert.equal(session.snapshot.source, "Starta\n");
  session.undo();
  assert.equal(session.snapshot.source, "Start\n");
});

test("separate positions, line breaks and replacements remain separate undo steps", () => {
  const session = new DocumentSession("abc\n\nTail\n", defaultSyntax("markdown"));
  session.sourceChanged("abcd\n\nTail\n", true);
  session.sourceChanged("abcd\n\nTail!\n", true);
  session.undo();
  assert.equal(session.snapshot.source, "abcd\n\nTail\n");
  session.sourceChanged("abcd\n\n\nTail\n", true);
  session.sourceChanged("abcde\n\n\nTail\n", true);
  session.undo();
  assert.equal(session.snapshot.source, "abcd\n\n\nTail\n");
  session.sourceChanged("WXYZ\n\n\nTail\n", true);
  session.sourceChanged("WXYZa\n\n\nTail\n", true);
  session.undo();
  assert.equal(session.snapshot.source, "WXYZ\n\n\nTail\n");
});

test("adjacent backspaces group without absorbing later insertion", () => {
  const session = new DocumentSession("word\n", defaultSyntax("markdown"));
  for (const source of ["wor\n", "wo\n", "w\n"]) session.sourceChanged(source, true);
  session.sourceChanged("wx\n", true);
  session.undo();
  assert.equal(session.snapshot.source, "w\n");
  session.undo();
  assert.equal(session.snapshot.source, "word\n");
});
