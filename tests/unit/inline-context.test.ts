import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { editorKind } from "../../src/document/node-identity";
import { inlineMarkRange, inlineRevision, inlineSource, inlineToText, isSemanticInlineMark, type InlineTarget } from "../../src/editor/inline-context";
import { inlineSourceDetails } from "../../src/editor/inline-reference-source";
import { projectFootnotes } from "../../src/editor/footnotes";
const config = { version: 1 as const, variant: "notdown" as const, extensions: {} };
const parse = (s: string) => parseNative(s, config), serialize = (doc: ReturnType<typeof parse>) => serializeNative(doc, config);
function targets(doc: ReturnType<typeof parse>, kind: string): InlineTarget[] {
  const result: InlineTarget[] = [];
  doc.descendants((node, from) => {
    if (editorKind(node) === kind) result.push({ node, from, to: from + node.nodeSize });
    for (const mark of node.marks) if (editorKind(mark) === kind) {
      const target = inlineMarkRange(doc, from, mark);
      if (target && !result.some(item => item.from === target.from)) result.push(target);
    }
  });
  return result;
}

test("styles are not semantic inlines; links include all styled spans without neighboring links", () => {
  const doc = parse('[**One** and *two*](https://example.com) | [Other](https://other.example)');
  doc.descendants(node => { for (const mark of node.marks) assert.equal(isSemanticInlineMark(mark), editorKind(mark) === "link"); });
  const [target] = targets(doc, "link");
  assert.equal(doc.textBetween(target.from, target.to), "One and two");
  assert.equal(inlineSource(doc, target, serialize), '[**One** and *two*](https://example.com)');
  const next = EditorState.create({ doc }).apply(inlineToText(EditorState.create({ doc }), target));
  assert.equal(serialize(next.doc), '**One** and *two* | [Other](https://other.example)');
});

test("atom conversion edits only the clicked inline, keeps styles and undoes once", () => {
  const source = 'Before $a$ and **$b^2$** after';
  const doc = parse(source), target = targets(doc, "inline_math")[1];
  let state = EditorState.create({ doc, plugins: [history()] });
  assert.equal(inlineSource(doc, target, serialize), '**$b^2$**');
  state = state.apply(inlineToText(state, target, true));
  assert.equal(serialize(state.doc), 'Before $a$ and **`b^2`** after');
  assert(undo(state, tr => { state = state.apply(tr); })); assert.equal(serialize(state.doc), source);
});

test("rejecting substitution keeps both original payload and outside styles undoable", () => {
  const source = '**{~~old~>new~~}** tail', doc = parse(source), target = targets(doc, "critic")[0];
  let state = EditorState.create({ doc, plugins: [history()] });
  state = state.apply(inlineRevision(state, target, false)!);
  assert.equal(serialize(state.doc), '**old** tail');
  assert(undo(state, tr => { state = state.apply(tr); })); assert.equal(serialize(state.doc), source);
});

test("reference links and images show their original reference and the correct multiline definition, excluding code", () => {
  const source = '```md\n[label][wrong]\n[ref]: https://wrong.example\n```\n\n[**label**][ref] and ![alt][img]\n\n[ref]: <https://example.com/a>\n  "Link title"\n\n[img]: https://example.com/p.png "Image title"\n\n[unused]: https://unused.example';
  const doc = parse(source);
  const link = inlineSourceDetails(doc, targets(doc, "link")[0], serialize);
  assert.equal(link.source, '[**label**][ref]');
  assert.equal(link.reference?.source, '[ref]: <https://example.com/a>\n  "Link title"');
  const image = inlineSourceDetails(doc, targets(doc, "image")[0], serialize);
  assert.equal(image.source, '![alt][img]');
  assert.equal(image.reference?.source, '[img]: https://example.com/p.png "Image title"');
  assert.equal(serialize(doc), source);
});

test("identical destinations resolve each distinct reference definition", () => {
  const doc = parse('[Same][first] and [Same][second]\n\n[first]: https://example.com\n\n[second]: https://example.com');
  const refs = targets(doc, "link");
  assert.equal(inlineSourceDetails(doc, refs[0], serialize).reference?.source, '[first]: https://example.com');
  assert.equal(inlineSourceDetails(doc, refs[1], serialize).reference?.source, '[second]: https://example.com');
});

test("footnotes and citations show only their own supporting source", () => {
  const doc = projectFootnotes(parse('Body [^note] [#book].\n\n[^note]: A **footnote**\n\n[#book]: Jane Doe. Book.\n\n[#other]: Unrelated'));
  const footnote = inlineSourceDetails(doc, targets(doc, "footnote_reference")[0], serialize);
  assert.equal(footnote.source, '[^note]'); assert.match(footnote.reference!.source, /\[\^note\]: A \*\*footnote\*\*/);
  const citation = inlineSourceDetails(doc, targets(doc, "syntax_inline").find(t => t.node.attrs.kind === "citation")!, serialize);
  assert.equal(citation.source, '[#book]'); assert.equal(citation.reference?.source, '[#book]: Jane Doe. Book.');
  const missing = parse('[#missing]');
  assert.match(inlineSourceDetails(missing, targets(missing, "syntax_inline")[0], serialize).reference!.description!, /not found/);
});

test("style marks never become semantic objects and page sources resolve without loading page content", () => {
  const doc = parse('[[target|Visible name]]'), schema = doc.type.schema;
  for (const kind of ['strong', 'em', 'underline', 'strike', 'subscript', 'superscript', 'highlight', 'color', 'small_caps', 'native_span']) {
    if (schema.marks[kind]) assert.equal(isSemanticInlineMark(schema.marks[kind].create()), false, kind);
  }
  const target = targets(doc, 'page_link')[0];
  const details = inlineSourceDetails(doc, target, serialize, { pages: [{ id: 'target', title: 'Destination' }] });
  assert.match(details.reference!.source, /Page: Destination/);
  assert.match(inlineSourceDetails(doc, target, serialize).reference!.description!, /not found/);
});
