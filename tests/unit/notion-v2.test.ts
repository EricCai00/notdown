import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { notionSourceTags } from "../../src/document/notion-v2";
import { editorKind } from "../../src/document/node-identity";
import { blockPropertyFields } from "../../src/editor/block-properties";
import { editorSchema as schema } from "../../src/document/editor-schema";

const samples: [string, string][] = [
  ['<p color="blue">Paragraph\n\nChild</p>', 'structure.nested_block'],
  ['<h2 color="green">Heading</h2>', 'block.heading'],
  ['<quote color="purple_bg">Title\n\n- Child\n\n<callout icon="💡">Nested</callout></quote>', 'block.quote'],
  ['<toggle heading="h2">Heading\n\nBody</toggle>', 'structure.nested_block'],
  ['<ul><li>First\n\nNested</li><li>Second</li></ul>', 'structure.bullet_list'],
  ['<ol type="a"><li>First</li><li>Second</li></ol>', 'structure.ordered_list'],
  ['<todo checked="true" color="green">Done</todo>', 'structure.bullet_list'],
  ['<columns><column ratio="40">Left</column><column ratio="60">Right</column></columns>', 'block.columns'],
  ['<tabs><tab icon="📕">First\n\nContent</tab><tab>Second\n\nMore</tab></tabs>', 'block.tabs'],
  ['<meeting-notes attendees="user://one">Meeting<meeting-notes-section-notes>Notes</meeting-notes-section-notes><meeting-notes-section-summary>Summary</meeting-notes-section-summary><meeting-notes-section-transcript>Transcript</meeting-notes-section-transcript></meeting-notes>', 'block.meeting_notes'],
  ['<mail from="writer@example.com" to="reader@example.com" subject="Subject">Body</mail>', 'block.mail'],
  ['<synced-block url="https://notion.so/11111111111141118111111111111111">Body</synced-block>', 'block.synced_block'],
  ['<image source="https://example.com/photo.png">Caption</image>', 'block.image_block'],
  ['<audio source="https://example.com/a.mp3">Audio</audio>', 'block.audio'],
  ['<bookmark source="https://example.com"><b>Rich</b> caption</bookmark>', 'block.web_bookmark'],
  ['<table><tr><th>A</th><td>B</td></tr></table>', 'block.table'],
  ['<custom-block definition-id="11111111-1111-4111-8111-111111111111" />', 'block.custom_block'],
  ['<external_object_instance integration="github">Repository</external_object_instance>', 'block.external_object_instance'],
  ['![](https://example.com/empty.png)', 'block.image_block'],
  ['<callout>\n\t![](https://example.com/nested.png)\n</callout>', 'block.callout'],
];

for (const variant of ["notion-markdown", "notdown"] as const) {
  const config = { version: 1 as const, variant, extensions: {}, notionVersion: "v2" as const };
  test(`${variant}: v2 edited ordinary blocks prefer Markdown over XML tags`, () => {
    const cases = [
      ["<h2>Heading</h2>", "## !Heading"],
      ["<h2>Heading ##</h2>", "## !Heading \\#\\#"],
      ["<h2>Heading\t##</h2>", "## !Heading\t\\#\\#"],
      ["<p>Text</p>", "!Text"],
      ["<quote>Quote</quote>", "> !Quote"],
      ["<ul><li>First</li><li>Second</li></ul>", "- !First\n- Second"],
      ['<ol type="1"><li>First</li><li>Second</li></ol>', "1. !First\n2. Second"],
      ['<todo checked="true">Done</todo>', "- [x] !Done"],
      ["<p><b>Bold</b> <i>italic</i> <s>strike</s> <u>under</u></p>", "**!Bold** *italic* ~~strike~~ <u>under</u>"],
      ["<equation>x + y</equation>", "$$\n!x + y\n$$"],
      ["<table><tr><th>Header</th><th>Two</th></tr><tr><td>Cell</td><td>Other</td></tr></table>", "| !Header | Two |\n| --- | --- |\n| Cell | Other |"],
      ["| Header | Two |\n| --- | --- |\n| Cell | Other |", "| !Header | Two |\n| --- | --- |\n| Cell | Other |"],
    ];
    for (const [source, expected] of cases) {
      const doc = parseNative(source, config);
      let pos = -1; doc.descendants((child, at) => { if (pos < 0 && child.isText) pos = at; });
      const changed = EditorState.create({ doc }).tr.insertText("!", pos).doc;
      const saved = serializeNative(changed, config);
      assert.equal(saved, expected, source);
      const reopened = parseNative(saved, config); reopened.check();
      assert.equal(reopened.firstChild!.type.name, changed.firstChild!.type.name, saved);
      assert.equal(reopened.textContent, changed.textContent, saved);
    }
    const doc = parseNative('<image source="https://example.com/photo.png">Caption</image>', config);
    const changed = EditorState.create({ doc }).tr.setNodeMarkup(0, undefined, { ...doc.firstChild!.attrs, caption: "New [caption]" }).doc;
    const saved = serializeNative(changed, config);
    assert.equal(saved, '![New \\[caption\\]](https://example.com/photo.png)');
    assert.equal(parseNative(saved, config).firstChild!.attrs.caption, "New [caption]");
    for (const caption of ["*literal* &amp; symbols", "Back\\slash [x]", "中文图片"]) {
      const changed = EditorState.create({ doc }).tr.setNodeMarkup(0, undefined, { ...doc.firstChild!.attrs, caption }).doc;
      const saved = serializeNative(changed, config);
      assert.ok(saved.startsWith("!["), saved);
      assert.equal(parseNative(saved, config).firstChild!.attrs.caption, caption, saved);
    }
  });

  test(`${variant}: v2 delimiter fallback retains whitespace, overlap, unknown attributes and literal code`, () => {
    const paragraph = schema.nodes["block.paragraph"], bold = schema.marks.strong.create(), em = schema.marks.em.create();
    const examples = [
      [schema.text("Bold", [bold, em])],
      [schema.text(" edge ", [bold])],
      [schema.text("a", [bold]), schema.text("b", [em])],
      [schema.text("one", [bold]), schema.text(" two ", [bold, em]), schema.text("three", [em])],
      [schema.text("CJK中文", [bold, em])],
      [schema.text("*<tag> & symbols*", [em])],
    ];
    for (const children of examples) {
      const doc = schema.nodes.doc.create(null, paragraph.create(null, children));
      const saved = serializeNative(doc, config), reopened = parseNative(saved, config);
      assert.ok(reopened.firstChild!.content.eq(doc.firstChild!.content), saved);
    }
    const source = '<h2 color="blue" future="keep">Title</h2>\n\n```html\n<b>literal</b>\n```\n\n<future odd="keep">Unknown</future>\n\nTail';
    const doc = parseNative(source, config), changed = EditorState.create({ doc }).tr.insertText("!", 1).doc;
    const saved = serializeNative(changed, config);
    assert.ok(saved.startsWith('<h2 color="blue" future="keep">!Title</h2>'));
    assert.ok(saved.includes('```html\n<b>literal</b>\n```'));
    assert.ok(saved.includes('<future odd="keep">Unknown</future>'));
  });

  test(`${variant}: v2 pipe tables retain escaped pipes, code and styled-table attributes`, () => {
    const paragraph = (text: string, code = false) => schema.nodes["block.paragraph"].create(null, schema.text(text, code ? [schema.marks.code.create()] : []));
    const cell = (text: string, header: boolean, code = false) => schema.nodes["structure.table_cell"].create({ header }, paragraph(text, code));
    for (const [text, code] of [["a|b", false], ["a|b", true], ["a\\|b", true]] as const) {
      const table = schema.nodes["block.table"].create(null, [
        schema.nodes["structure.table_row"].create(null, [cell("Head", true), cell("Two", true)]),
        schema.nodes["structure.table_row"].create(null, [cell(text, false, code), cell("Value", false)]),
      ]);
      const saved = serializeNative(schema.nodes.doc.create(null, table), config), reopened = parseNative(saved, config);
      assert.equal(reopened.firstChild!.childCount, 2, saved);
      assert.equal(reopened.firstChild!.lastChild!.firstChild!.textContent, text, saved);
      assert.equal(reopened.firstChild!.lastChild!.firstChild!.firstChild!.firstChild!.marks.some(mark => mark.type === schema.marks.code), code, saved);
    }
    const source = '<table header-row="true" future="keep"><colgroup><col width="120" /></colgroup><tr><th>Head</th></tr><tr color="red"><td>Value</td></tr></table>';
    const doc = parseNative(source, config);
    let pos = 0; doc.descendants((child, at) => { if (!pos && child.isText) pos = at; });
    const saved = serializeNative(EditorState.create({ doc }).tr.insertText("!", pos).doc, config);
    assert.ok(saved.startsWith('<table header-row="true" future="keep">'), saved);
    assert.ok(saved.includes('width="120"'), saved); assert.ok(saved.includes('<tr color="red">'), saved);
  });
}
for (const variant of ['notdown', 'notion-markdown'] as const) {
  const config = { version: 1 as const, variant, extensions: {}, notionVersion: 'v2' as const };
  test(`${variant}: v2 official carriers have real nodes and preserve adjacent edits and CRLF`, () => {
    for (const [sample, type] of samples) {
      const source = sample.replaceAll('\n', '\r\n') + '\r\n\r\nTail';
      const doc = parseNative(source, config); doc.check();
      assert.equal(doc.firstChild?.type.name, type, sample);
      assert.equal(serializeNative(doc, config), source);
      const changed = EditorState.create({ doc }).tr.insertText('!', doc.content.size - 1).doc;
      assert.equal(serializeNative(changed, config), source + '!');
    }
  });
  test(`${variant}: editing v2 containers, captions and inline entities round trips`, () => {
    for (const [source, type] of samples) {
      const doc = parseNative(source, config), node = doc.firstChild!;
      let tr = EditorState.create({ doc }).tr;
      let position: number | undefined;
      doc.descendants((child, pos) => { if (position === undefined && child.isText) position = pos; });
      if (position !== undefined) tr.insertText('Changed ', position);
      else tr.setNodeMarkup(0, undefined, { ...node.attrs, color: 'red', nfmAttrs: { ...node.attrs.nfmAttrs, color: 'red' } });
      const saved = serializeNative(tr.doc, config), reopened = parseNative(saved, config); reopened.check();
      assert.equal(reopened.firstChild?.type.name, type, saved);
      if (position !== undefined) assert.ok(reopened.textContent.includes('Changed '), saved);
    }
    const source = '<p><b> bold </b><u>under</u> <mention url="https://notion.so/11111111111141118111111111111111">Page</mention> <date start="2026-10-23" start-time="09:00" time-zone="America/Los_Angeles" /> <link-preview url="https://example.com" source="github" /></p>';
    const doc = parseNative(source, config), changed = EditorState.create({ doc }).tr.insertText('!', 1).doc;
    const saved = serializeNative(changed, config), reopened = parseNative(saved, config);
    assert.ok(saved.includes('<u>under</u>')); assert.ok(saved.includes('<mention url=')); assert.ok(saved.includes('start-time="09:00"'));
    const kinds: string[] = []; reopened.descendants(node => { kinds.push(editorKind(node)); });
    assert.ok(kinds.includes('page_link')); assert.ok(kinds.includes('mention')); assert.ok(kinds.includes('link_mention'));
  });
}
test('v2 source scanning protects fenced and inline code, unknown containers and mention labels', () => {
  const hidden = '<unknown url="https://notion.so/11111111111141118111111111111111" />';
  const source = '```xml\n' + hidden + '\n```\n`' + hidden + '`\n<future>' + hidden + '</future>\n<mention url="user://one">' + hidden + '</mention>\n<quote>Title\n\n' + hidden + '</quote>';
  assert.equal(notionSourceTags(source).filter(tag => tag.tag === 'unknown').length, 1);
});

for (const variant of ['notdown','notion-markdown'] as const) test(`${variant}: v2 CommonMark paragraphs, breaks, nested lists and ordered starts survive editing`, () => {
  const config = { version:1 as const, variant, notionVersion:'v2' as const, extensions:{} };
  for (const source of ['First line\nsecond line', 'First\\\nSecond', '7. Seven\n8. Eight\n   - Child', '- [x] Done\n- [ ] Pending', '<p> edge <b> bold </b> </p>']) {
    const doc = parseNative(source,config); doc.check();
    if (source.startsWith('First')) assert.equal(doc.childCount,1);
    if (source.startsWith('7.')) assert.equal(doc.firstChild!.attrs.order,7);
    if (source.startsWith('- [x]')) assert.equal(doc.firstChild!.firstChild!.attrs.checked,true);
    let position = -1; doc.descendants((node,pos)=>{if(position < 0 && node.isText) position = pos;});
    const changed = EditorState.create({doc}).tr.insertText('!',position).doc;
    const reopened = parseNative(serializeNative(changed,config),config); reopened.check();
    assert.equal(reopened.firstChild!.type.name,doc.firstChild!.type.name);
    if (source.startsWith('7.')) assert.equal(reopened.firstChild!.attrs.order,7);
    if (source.startsWith('- [x]')) assert.equal(reopened.firstChild!.firstChild!.attrs.checked,true);
    assert.equal(reopened.textContent,changed.textContent);
  }
});

test('v2 malformed atom bodies and deep nesting remain recoverable', () => {
  const config = {version:1 as const, variant:'notion-markdown' as const, notionVersion:'v2' as const, extensions:{}};
  for (const source of ['<custom-block definition-id="x">Keep content</custom-block>', '<unknown url="https://example.com">Keep content</unknown>', '<callout>'.repeat(45)+'Deep content'+'</callout>'.repeat(45)]) {
    const doc = parseNative(source,config); doc.check(); assert.equal(serializeNative(doc,config),source);
    assert.ok(JSON.stringify(doc.toJSON()).includes(source.includes('Deep') ? 'Deep content' : 'Keep content'));
  }
});

test('Notdown v2 preserves local object properties and Markdown encodings after editing', () => {
  const config = {version:1 as const, variant:'notdown' as const, notionVersion:'v2' as const, extensions:{}};
  const sources = [
    '<bookmark url="https://example.com" title="Local title" description="Description" />',
    '<link-preview url="https://example.com" title="Local title" description="Description" />',
    '<web-embed url="https://example.com" title="Frame" />',
    '![Caption](https://example.com/image.png "Image title")',
    '###### Sixth heading',
    '> [!WARNING]\n> Keep warning',
    '| A | B |\n| --- | --- |\n| One | Two |',
  ];
  for (const source of sources) {
    const doc = parseNative(source,config), node = doc.firstChild!;
    let position = -1; doc.descendants((child,pos)=>{if(position < 0 && child.isText) position=pos;});
    const state = EditorState.create({doc});
    const changed = position >= 0 ? state.tr.insertText('!',position).doc : state.tr.setNodeMarkup(0,undefined,{...node.attrs,caption:'Edited'}).doc;
    const saved = serializeNative(changed,config), reopened = parseNative(saved,config); reopened.check();
    assert.equal(reopened.firstChild!.type.name, node.type.name, saved);
    for (const key of ['title','description','level','kind']) if (node.attrs[key]) assert.equal(reopened.firstChild!.attrs[key],node.attrs[key],saved);
    if (position >= 0) assert.equal(reopened.textContent,changed.textContent,saved);
  }
  const doc = parseNative('<bookmark source="https://example.com"><b>Rich</b> caption</bookmark>',config);
  const changed = EditorState.create({doc}).tr.setNodeMarkup(0,undefined,{...doc.firstChild!.attrs,title:'Saved title',description:'Details'}).doc;
  const saved = serializeNative(changed,config), reopened = parseNative(saved,config);
  assert.equal(reopened.firstChild!.attrs.title,'Saved title');
  assert.equal(reopened.firstChild!.attrs.description,'Details');
  assert.equal(reopened.firstChild!.attrs.sourceCaption,'<b>Rich</b> caption');
  const official = parseNative(saved,{...config,variant:'notion-markdown'});
  assert.equal(official.firstChild!.attrs.title,''); // Extra properties have no official semantics.
  assert.deepEqual(blockPropertyFields(official.firstChild!,false).map(field => field.key),['url','caption']);
  assert.ok(blockPropertyFields(reopened.firstChild!,true).some(field => field.key === 'title'));
  assert.equal(serializeNative(official,{...config,variant:'notion-markdown'}),saved);
});
