import assert from "node:assert/strict";
import test from "node:test";
import { type Node as PMNode } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { type EditorView } from "prosemirror-view";
import { undoInputRule } from "prosemirror-inputrules";
import { editorSchema as schema } from "../../src/document/editor-schema.js";
import { markdownRules } from "../../src/editor/editor-input-rules.js";
import { commandEnabled, dialects } from "../../src/markdown-engine/config";
import { parseNative } from "../../src/markdown-engine/codec";
import {
  parseEditorMarkdown,
  serializeEditorMarkdown,
} from "../../src/document/editor-markdown.js";

function harness(
  doc = schema.nodes.doc.create(null, schema.nodes.paragraph.create()),
  position?: number,
  allow?: (command: string) => boolean,
) {
  const plugin = markdownRules(allow);
  let state = EditorState.create({ schema, doc, plugins: [plugin] });
  state = state.apply(
    state.tr.setSelection(
      TextSelection.create(state.doc, position ?? state.doc.content.size - 1),
    ),
  );
  const view = {
    get state() {
      return state;
    },
    composing: false,
    dispatch(tr: Parameters<EditorView["dispatch"]>[0]) {
      state = state.apply(tr);
    },
  } as unknown as EditorView;
  const type = (value: string) => {
    for (const character of value) {
      const { from, to } = state.selection;
      const handled = plugin.props.handleTextInput!.call(
        plugin,
        view,
        from,
        to,
        character,
        () => state.tr.insertText(character, from, to),
      );
      if (!handled) view.dispatch(state.tr.insertText(character, from, to));
      state.doc.check();
    }
  };
  const input = (value: string) => {
    const { from, to } = state.selection;
    const handled = plugin.props.handleTextInput!.call(
      plugin,
      view,
      from,
      to,
      value,
      () => state.tr.insertText(value, from, to),
    );
    if (!handled) view.dispatch(state.tr.insertText(value, from, to));
    state.doc.check();
    return handled;
  };
  return {
    get state() {
      return state;
    },
    view,
    type,
    input,
  };
}

test("typed headings, parenthesized lists and backtick fences follow each active dialect", () => {
  for (const { id: variant } of dialects) {
    const config = { version: 1 as const, variant, extensions: {} };
    for (const [typed, source] of [
      ["##### ", "##### Heading"], ["###### ", "###### Heading"],
      ["1) ", "1) Item"], ["``` ", "```\ncode\n```"],
    ]) {
      const editor = harness(undefined, undefined, command => commandEnabled(config, command));
      editor.type(typed);
      const expected = parseNative(source, config).firstChild!;
      assert.equal(editor.state.doc.firstChild!.type.name, expected.type.name, `${variant}: ${typed}`);
      if (expected.type.name === "heading") assert.equal(editor.state.doc.firstChild!.attrs.level, expected.attrs.level, variant);
    }
  }
});

function paragraph(...nodes: PMNode[]) {
  return schema.nodes.doc.create(
    null,
    schema.nodes.paragraph.create(null, nodes),
  );
}

test("typed Markdown marks remove delimiters without flattening existing linked text", () => {
  const doc = paragraph(
    schema.text("**"),
    schema.text("linked", [
      schema.marks.link.create({ href: "https://example.com" }),
    ]),
    schema.text("*"),
  );
  const editor = harness(doc);
  editor.type("*");
  const text = editor.state.doc.child(0).child(0);
  assert.equal(text.text, "linked");
  assert.deepEqual(
    text.marks.map((mark) => mark.type.name),
    ["link", "strong"],
  );
  assert.equal(text.marks[0].attrs.href, "https://example.com");
  assert.equal(
    serializeEditorMarkdown(editor.state.doc),
    "[**linked**](https://example.com)",
  );
  assert.equal(undoInputRule(editor.state, editor.view.dispatch), true);
  assert.equal(editor.state.doc.textContent, "**linked**");
  assert.equal(editor.state.doc.child(0).child(1).marks[0].type.name, "link");
});

test("emphasis and strike retain strong marks and page-link atoms", () => {
  for (const delimiter of ["*", "~~"]) {
    const atom = schema.nodes.page_link.create({
      target: "中文/🧠",
      label: "计划",
    });
    const doc = paragraph(
      schema.text(delimiter),
      schema.text("Bold ", [schema.marks.strong.create()]),
      atom,
      ...(delimiter.length > 1 ? [schema.text(delimiter.slice(0, -1))] : []),
    );
    const editor = harness(doc);
    editor.type(delimiter.at(-1)!);
    const content = editor.state.doc.child(0);
    assert.equal(content.childCount, 2);
    assert.equal(content.child(0).text, "Bold ");
    assert.equal(
      content.child(0).marks.some((mark) => mark.type.name === "strong"),
      true,
    );
    assert.equal(content.child(1).type.name, "page_link");
    assert.equal(content.child(1).attrs.target, "中文/🧠");
    assert.equal(
      content
        .child(1)
        .marks.some(
          (mark) => mark.type.name === (delimiter === "*" ? "em" : "strike"),
        ),
      true,
    );
  }
});

test("inline code converts only text and leaves atoms intact", () => {
  const editor = harness(paragraph(schema.text("`hello")));
  editor.type("`");
  assert.equal(editor.state.doc.textContent, "hello");
  assert.equal(editor.state.doc.child(0).child(0).marks[0].type.name, "code");
  const atom = schema.nodes.page_link.create({ target: "page", label: "Page" });
  const mixed = harness(paragraph(schema.text("`"), atom));
  mixed.type("`");
  assert.equal(mixed.state.doc.child(0).child(1).type.name, "page_link");
  assert.equal(mixed.state.doc.child(0).childCount, 3);
  assert.equal(mixed.state.doc.child(0).child(1).marks.length, 0);
});

test("typing a completed link preserves the label's existing strong mark", () => {
  const editor = harness(
    paragraph(
      schema.text("["),
      schema.text("Label", [schema.marks.strong.create()]),
      schema.text("](https://example.com"),
    ),
  );
  editor.type(")");
  const label = editor.state.doc.child(0).child(0);
  assert.equal(label.text, "Label");
  assert.deepEqual(
    label.marks.map((mark) => mark.type.name),
    ["link", "strong"],
  );
  assert.equal(label.marks[0].attrs.href, "https://example.com");
});

test("Unicode and emoji wiki syntax becomes one page atom with a stable label", () => {
  const editor = harness();
  editor.type("[[研究/🧠|每日计划]]");
  const atom = editor.state.doc.child(0).child(0);
  assert.equal(atom.type.name, "page_link");
  assert.deepEqual(
    { ...atom.attrs },
    { target: "研究/🧠", label: "每日计划", url: "", nfmAttrs: {} },
  );
  assert.equal(
    serializeEditorMarkdown(editor.state.doc),
    "[[研究/🧠|每日计划]]",
  );
});

test("bullet shortcut then checkbox shortcut produces a task without an extra nested list", () => {
  const editor = harness();
  editor.type("- ");
  assert.equal(editor.state.doc.child(0).type.name, "bullet_list");
  editor.type("[ ] Buy milk");
  const list = editor.state.doc.child(0);
  assert.equal(list.childCount, 1);
  assert.equal(list.child(0).attrs.checked, false);
  assert.equal(list.child(0).childCount, 1);
  assert.equal(list.child(0).textContent, "Buy milk");
  assert.equal(serializeEditorMarkdown(editor.state.doc), "- [ ] Buy milk");
});

test("standalone completed todo and nested todo shortcuts preserve surrounding items", () => {
  const standalone = harness();
  standalone.type("[x] Done");
  assert.equal(standalone.state.doc.child(0).child(0).attrs.checked, true);
  const doc = parseEditorMarkdown("- Parent\n  - Child\n- Sibling");
  let childPosition = 0;
  doc.descendants((node, pos) => {
    if (node.type.name === "paragraph" && node.textContent === "Child")
      childPosition = pos + 1;
  });
  const nested = harness(doc, childPosition);
  nested.type("[ ] ");
  const parent = nested.state.doc.child(0).child(0);
  assert.equal(parent.attrs.checked, null);
  assert.equal(parent.child(1).child(0).attrs.checked, false);
  assert.equal(parent.child(1).child(0).textContent, "Child");
  assert.equal(nested.state.doc.child(0).child(1).textContent, "Sibling");
});

test("heading shortcut in a list lifts just that item and keeps nested children", () => {
  const doc = parseEditorMarkdown("- Before\n- Target\n  - Child\n- After");
  let position = 0;
  doc.descendants((node, pos) => {
    if (node.type.name === "paragraph" && node.textContent === "Target")
      position = pos + 1;
  });
  const editor = harness(doc, position);
  editor.type("## ");
  let heading: PMNode | undefined;
  const texts: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "heading") heading = node;
    if (node.isTextblock) texts.push(node.textContent);
  });
  assert.equal(heading?.attrs.level, 2);
  assert.equal(heading?.textContent, "Target");
  assert.deepEqual(texts, ["Before", "Target", "Child", "After"]);
});

test("nested heading shortcut preserves the containing parent item", () => {
  const doc = parseEditorMarkdown(
    "- Parent\n  - Target\n    - Child\n  - Following\n- Sibling",
  );
  let position = 0;
  doc.descendants((node, pos) => {
    if (node.type.name === "paragraph" && node.textContent === "Target")
      position = pos + 1;
  });
  const editor = harness(doc, position);
  editor.type("#### ");
  assert.equal(editor.state.doc.childCount, 1);
  const list = editor.state.doc.child(0);
  assert.equal(list.childCount, 2);
  const parent = list.child(0);
  assert.equal(parent.child(0).textContent, "Parent");
  assert.equal(parent.child(1).type.name, "nested_block");
  assert.equal(parent.child(1).firstChild!.attrs.level, 4);
  assert.equal(parent.child(1).firstChild!.textContent, "Target");
  assert.equal(parent.child(1).child(1).textContent, "Child");
  assert.equal(parent.child(2).textContent, "Following");
  assert.equal(list.child(1).textContent, "Sibling");
});

test("whole-input composition conversion and literal escaped syntax are safe", () => {
  const composed = harness();
  assert.equal(composed.input("**中文**"), true);
  assert.equal(composed.state.doc.textContent, "中文");
  assert.equal(
    composed.state.doc.child(0).child(0).marks[0].type.name,
    "strong",
  );
  const escaped = harness();
  escaped.type("\\**literal**");
  assert.equal(escaped.state.doc.textContent, "\\**literal**");
  assert.equal(escaped.state.doc.child(0).child(0).marks.length, 0);
});

test("unsafe URLs and dividers typed before existing text remain literal", () => {
  const unsafe = harness();
  unsafe.type("[label](javascript:evil)");
  assert.equal(unsafe.state.doc.textContent, "[label](javascript:evil)");
  assert.equal(unsafe.state.doc.child(0).child(0).marks.length, 0);
  const divider = harness(paragraph(schema.text("Keep")), 1);
  divider.type("---");
  assert.equal(divider.state.doc.child(0).type.name, "paragraph");
  assert.equal(divider.state.doc.textContent, "---Keep");
});

test("replacement input and composition-end conversion retain the matched inline content", () => {
  const replacement = harness(paragraph(schema.text("**bold*tail")));
  replacement.view.dispatch(
    replacement.state.tr.setSelection(
      TextSelection.create(replacement.state.doc, 8, 12),
    ),
  );
  replacement.type("*");
  assert.equal(replacement.state.doc.textContent, "bold");
  assert.equal(
    replacement.state.doc.child(0).child(0).marks[0].type.name,
    "strong",
  );
  const compositionEnd = harness(paragraph(schema.text("**中文**")));
  assert.equal(compositionEnd.input(""), true);
  assert.equal(compositionEnd.state.doc.textContent, "中文");
  assert.equal(
    compositionEnd.state.doc.child(0).child(0).marks[0].type.name,
    "strong",
  );
});

test("balanced URL parentheses convert and a page mention never becomes a nested anchor", () => {
  const editor = harness();
  editor.type('[Guide](https://example.com/a_(b) "A guide")');
  assert.equal(editor.state.doc.textContent, "Guide");
  assert.equal(
    editor.state.doc.child(0).child(0).marks[0].attrs.href,
    "https://example.com/a_(b)",
  );
  assert.equal(
    editor.state.doc.child(0).child(0).marks[0].attrs.title,
    "A guide",
  );
  const atom = schema.nodes.page_link.create({ target: "page", label: "Page" });
  const mixed = harness(
    paragraph(schema.text("["), atom, schema.text("](https://example.com")),
  );
  mixed.type(")");
  assert.equal(mixed.state.doc.child(0).child(1).type.name, "page_link");
  assert.equal(mixed.state.doc.child(0).child(1).marks.length, 0);
});
