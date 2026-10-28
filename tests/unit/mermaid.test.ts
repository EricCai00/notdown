import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { enabled, type SyntaxConfig } from "../../src/markdown-engine/config";
import { editorKind } from "../../src/document/node-identity";

const fence = '```mermaid\nflowchart LR\nA[Start] --> B[Finish]\n```';

for (const variant of ["notdown", "notion-markdown"] as const) {
  for (const notionVersion of ["v1", "v2"] as const) {
    const config: SyntaxConfig = { version: 1, variant, notionVersion, extensions: {} };
    test(`${variant} ${notionVersion} renders Mermaid without rewriting source or neighboring edits`, () => {
      assert.equal(enabled(config, "diagrams"), true);
      for (const sample of [fence, fence.replace("mermaid", "MeRmAiD"),
        `<callout>\n${fence.split("\n").map(line => "\t" + line).join("\n")}\n</callout>`,
        `- Parent\n${fence.split("\n").map(line => "\t" + line).join("\n")}`,
        fence.replace("mermaid", 'mermaid {color="blue" future="keep"}')]) {
        const source = sample.replaceAll("\n", "\r\n") + "\r\n\r\nTail\r\n";
        const doc = parseNative(source, config);
        doc.check();
        const diagrams: PMNode[] = [];
        doc.descendants(node => { if (node.type.name === "block.diagram") diagrams.push(node); });
        assert.equal(diagrams.length, 1, sample);
        assert.equal(diagrams[0].attrs.data.language, "mermaid");
        assert.match(diagrams[0].attrs.data.code, /A\[Start\] --> B\[Finish\]/);
        assert.equal(serializeNative(doc, config), source);
        const changed = EditorState.create({ doc }).tr.insertText("!", doc.content.size - 1).doc;
        assert.ok(serializeNative(changed, config).includes(sample.replaceAll("\n", "\r\n")), sample);
        let diagramPos = 0;
        doc.descendants((node, pos) => { if (node === diagrams[0]) diagramPos = pos; });
        const attrs = diagrams[0].attrs;
        const edited = EditorState.create({ doc }).tr.setNodeMarkup(diagramPos, undefined, {
          ...attrs, raw: attrs.raw.replace("Start", "Changed"), source: null, sourceFingerprint: null,
          data: { ...attrs.data, code: attrs.data.code.replace("Start", "Changed") },
        }).doc;
        const saved = serializeNative(edited, config), reopened = parseNative(saved, config);
        assert.ok(saved.includes("Changed"), sample);
        assert.ok(!sample.includes('future="keep"') || saved.includes('future="keep"'));
        let recovered = false;
        reopened.descendants(node => { recovered ||= node.type.name === "block.diagram" && node.attrs.data.code.includes("Changed"); });
        assert.ok(recovered, saved);
      }
    });

    test(`${variant} ${notionVersion} keeps disabled, literal and incomplete diagrams as code`, () => {
      const disabled = { ...config, extensions: { diagrams: false } };
      const doc = parseNative(fence, disabled);
      assert.equal(editorKind(doc.firstChild!), "code_block");
      assert.equal(serializeNative(doc, disabled), fence);
      for (const source of ['````markdown\n' + fence + '\n````', fence.replace(/\n```$/, ""),
        '```python\n' + fence.split("\n").slice(1, -1).join("\n") + '\n```']) {
        const literal = parseNative(source, config);
        literal.descendants(node => assert.notEqual(node.type.name, "block.diagram"));
        assert.equal(serializeNative(literal, config), source);
      }
      if (variant === "notion-markdown") for (const language of ["sequence", "flow"]) {
        const other = parseNative(fence.replace("mermaid", language), config);
        assert.equal(editorKind(other.firstChild!), "code_block");
      }
    });
  }
}
