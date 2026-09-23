import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { codeCaption } from "../../src/document/code-caption";
import { renderNotionMarkdown } from "../../src/document/document-format";
import { commandEnabled, type SyntaxConfig } from "../../src/markdown-engine/config";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";

const config = (variant: SyntaxConfig["variant"], extensions: Record<string, boolean> = {}): SyntaxConfig =>
  ({ version: 1, variant, extensions });

test("Notdown code captions reuse fenced attributes and preserve code and other attributes", () => {
  const c = config("notdown");
  const original = '```python {#sample future="keep" caption="old"}\nprint("hello")\n```\n\nTail';
  const doc = parseNative(original, c);
  assert.equal(doc.firstChild?.type.name, "code_block");
  assert.equal(codeCaption(doc.firstChild!), "old");
  assert.equal(serializeNative(doc, c), original);
  const nextCaption = 'A "quote" {brace} & literal &quot;';
  const state = EditorState.create({ doc });
  const edited = state.apply(state.tr.setNodeMarkup(0, undefined, {
    ...doc.firstChild!.attrs,
    markdownAttrs: { ...doc.firstChild!.attrs.markdownAttrs, caption: nextCaption },
  })).doc;
  const written = serializeNative(edited, c);
  assert.match(written, /^```python \{#sample future="keep" caption="A &quot;quote&quot; &#123;brace&#125; &amp; literal &amp;quot;"\}/);
  assert.match(written, /print\("hello"\)\n```\n\nTail$/);
  const reopened = parseNative(written, c);
  assert.equal(codeCaption(reopened.firstChild!), nextCaption);
  assert.equal(reopened.firstChild!.attrs.markdownAttrs.future, "keep");
  const html = renderNotionMarkdown(written, [], { document: reopened });
  assert.match(html, /<figcaption>A &quot;quote&quot; \{brace\} &amp; literal &amp;quot;<\/figcaption>/);
});

test("official Notion and disabled fenced attributes keep a captioned code fence as source", () => {
  const source = '```python {caption="Example"}\nprint(1)\n```\n\nTail';
  for (const c of [
    config("notion-markdown", { fenced_code_attributes: true }),
    config("notdown", { fenced_code_attributes: false }),
  ]) {
    const doc = parseNative(source, c);
    assert.equal(doc.firstChild?.type.name, "opaque_block");
    assert.equal(serializeNative(doc, c), source);
  }
  const notdown = parseNative(source, config("notdown"));
  assert.throws(() => serializeNative(notdown, config("notion-markdown")), /only.*Notdown/);
  assert.equal(parseNative("```python\nprint(1)\n```", config("notion-markdown")).firstChild?.type.name, "code_block");
  assert.equal(commandEnabled(config("notion-markdown"), "code_caption"), false);
  assert.equal(commandEnabled(config("notdown"), "code_caption"), true);
});
