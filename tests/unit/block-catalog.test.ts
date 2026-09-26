import { createEditorNode, editorKind } from "../../src/document/node-identity";
import assert from "node:assert/strict";
import test from "node:test";
import {
  blockCatalog,
  implementationCatalog,
  blockTypeLabel,
  syntaxKinds,
} from "../../src/catalog/block-catalog-data";
import { editorSchema } from "../../src/document/editor-schema";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { dialects, type SyntaxConfig } from "../../src/markdown-engine/config";
import { EditorState } from "prosemirror-state";

test("catalog covers schema nodes and extension block kinds, with real native examples", () => {
  for (const name of Object.keys(editorSchema.nodes).filter(
    (name) => name !== "doc",
  ))
    assert.ok(
      implementationCatalog.some((e) => e.id === name),
      name,
    );
  for (const kind of Object.keys(syntaxKinds))
    assert.ok(
      implementationCatalog.some((e) => e.id === `syntax:${kind}`),
      kind,
    );
  assert.equal(
    new Set(blockCatalog.map((e) => e.id)).size,
    blockCatalog.length,
  );
  for (const entry of implementationCatalog.filter((e) => e.sample)) {
    const doc = parseNative(entry.sample!, {
      version: 1,
      variant: entry.variant,
      extensions: Object.fromEntries(
        (entry.extensions || []).map((id) => [id, true]),
      ),
    });
    doc.check();
    let found = false;
    doc.descendants((node) => {
      if (
        (node.type.name === entry.node || editorKind(node) === entry.node) &&
        (entry.node !== "syntax_block" || !entry.id.startsWith("syntax:") ||
          entry.id === `syntax:${node.attrs.kind}`)
      )
        found = true;
    });
    assert.ok(found, `Sample must render its advertised type: ${entry.id}`);
  }
});

test("menu labels distinguish heading levels, task rows and ordered rows", () => {
  const s = editorSchema;
  assert.equal(
    blockTypeLabel(createEditorNode(s, "heading", { level: 3 })),
    "Heading 3",
  );
  const task = s.nodes["block.task_list_item"].create({ checked: true }, s.nodes["block.paragraph"].create());
  assert.equal(blockTypeLabel(task), "Task list item");
  const item = s.nodes["block.numbered_list_item"].create(null, s.nodes["block.paragraph"].create());
  assert.equal(
    blockTypeLabel(item, s.nodes["structure.ordered_list"].create(null, item)),
    "Numbered list item",
  );
});

test("the Unsupported specimen leaves following sections editable in every dialect", () => {
  const sample = blockCatalog.find(entry => entry.id === "block.unsupported")!.sample!;
  for (const { id } of dialects) {
    const config: SyntaxConfig = { version: 1, variant: id, extensions: {} };
    const source = sample + "\n\n## Next case\n\nEditable tail";
    const doc = parseNative(source, config);
    assert.equal(editorKind(doc.child(doc.childCount - 2)), "heading", id);
    assert.equal(doc.child(doc.childCount - 2).textContent, "Next case", id);
    assert.equal(editorKind(doc.lastChild!), "paragraph", id);
    assert.equal(doc.lastChild!.textContent, "Editable tail", id);
    if (id === "gfm") {
      // GFM's grammar treats unknown directive text as a paragraph; source
      // preservation must not replace ordinary Markdown with an opaque block.
      assert.equal(editorKind(doc.firstChild!), "paragraph", id);
    } else if (id !== "notion-markdown") {
      assert.equal(editorKind(doc.firstChild!), "opaque_block", id);
      assert.equal(doc.firstChild!.attrs.raw, sample, id);
    }
    assert.equal(serializeNative(doc, config), source, id);
    const changed = EditorState.create({ doc }).tr.insertText(" edited", doc.content.size - 1).doc;
    const saved = serializeNative(changed, config);
    assert.equal(saved, source + " edited", id);
    assert.equal(parseNative(saved, config).lastChild!.textContent, "Editable tail edited", id);
  }
});
