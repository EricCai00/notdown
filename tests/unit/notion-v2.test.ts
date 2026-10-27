import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "prosemirror-state";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { notionSourceTags } from "../../src/document/notion-v2";
import { editorKind } from "../../src/document/node-identity";
import { blockPropertyFields } from "../../src/editor/block-properties";
import { editorSchema as schema } from "../../src/document/editor-schema";
import { inlineColors } from "../../src/document/notion-syntax";

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

test("Notdown v2 reads observed code tags as literal inline code without changing official mode", () => {
  const config = { version: 1 as const, variant: "notdown" as const, notionVersion: "v2" as const, extensions: {} };
  const entry = "<code>rdkit.Chem.BRICS.BRICSDecompose</code>";
  const samples = [entry, `Before ${entry} after`, `<p>${entry}</p>`, `## ${entry}`, `- ${entry}`,
    `<callout>\n${entry}\n</callout>`, `<columns><column>${entry}</column><column>Other</column></columns>`,
    `<table><tr><td>${entry}</td></tr></table>`, `| Code |\n| --- |\n| ${entry} |`, `<b>${entry}</b>`];
  for (const sample of samples) {
    const source = sample + "\n\nTail", doc = parseNative(source, config); doc.check();
    const code: string[] = [];
    doc.descendants(node => {
      assert.notEqual(node.type.name, "block.unsupported", source);
      if (node.isText && node.marks.some(mark => mark.type === schema.marks.code)) code.push(node.text!);
    });
    assert.deepEqual(code, ["rdkit.Chem.BRICS.BRICSDecompose"], source);
    assert.equal(serializeNative(doc, config), source);
    const changed = EditorState.create({ doc }).tr.insertText("!", doc.content.size - 1).doc;
    assert.ok(serializeNative(changed, config).includes(sample));
  }
  for (const value of ["a &lt; b &amp; c", "[link](https://example.com) <mention url=\"https://notion.so/test\">literal</mention>", "*literal* `tick` <b>literal</b>", "`unclosed </b> <p> literal"]) {
    const source = `<code>${value}</code>`, doc = parseNative(source, config);
    const expected = value.replaceAll("&lt;", "<").replaceAll("&amp;", "&");
    assert.equal(doc.firstChild!.textContent, expected);
    assert.equal(doc.firstChild!.firstChild!.marks[0].type, schema.marks.code);
    assert.deepEqual(notionSourceTags(source).map(tag => tag.tag), ["code"]);
    const changed = EditorState.create({ doc }).tr.insertText("!", 1).doc;
    const saved = serializeNative(changed, config);
    assert.ok(saved.startsWith("`"), saved);
    const reopened = parseNative(saved, config);
    assert.equal(reopened.firstChild!.textContent, "!" + expected);
    assert.equal(reopened.firstChild!.firstChild!.marks[0].type, schema.marks.code);
    for (const wrapper of ["p", "b"]) {
      const wrapped = parseNative(`<${wrapper}>${source}</${wrapper}>`, config);
      assert.equal(wrapped.firstChild!.textContent, expected);
      assert.ok(wrapped.firstChild!.firstChild!.marks.some(mark => mark.type === schema.marks.code));
    }
  }
  const hidden = '<code>`unclosed <page url="https://notion.so/hidden">literal</page></code>\n\n<page url="https://notion.so/real">Real</page>';
  assert.deepEqual(notionSourceTags(hidden).map(tag => [tag.tag, tag.attrs.url]), [["code", undefined], ["page", "https://notion.so/real"]]);
  for (const variant of ["notdown", "notion-markdown"] as const) {
    const standard = parseNative("`rdkit.Chem.BRICS.BRICSDecompose`", { ...config, variant });
    assert.equal(standard.firstChild!.firstChild!.marks[0].type, schema.marks.code);
  }
  for (const strict of [{ ...config, variant: "notion-markdown" as const }, { ...config, notionVersion: undefined }]) {
    const doc = parseNative(entry, strict);
    doc.descendants(node => assert.ok(!node.marks.some(mark => mark.type === schema.marks.code)));
    assert.equal(serializeNative(doc, strict), entry);
  }
  for (const source of ["```html\n" + entry + "\n```", "`" + entry + "`", "<future>" + entry + "</future>", '<code future="keep">unknown</code>', "<code>unclosed"]) {
    const doc = parseNative(source, config);
    assert.equal(serializeNative(doc, config), source);
  }
});

for (const variant of ["notion-markdown", "notdown"] as const) {
  const config = { version: 1 as const, variant, extensions: {}, notionVersion: "v2" as const };
  test(`${variant}: nested official colors retain independent text/background channels through edits`, () => {
    const cases = [
      ['<span color="red"><span color="yellow_bg">Both</span></span>', { color: "red", bg_color: "yellow" }],
      ['<span color="yellow_bg"><span color="red">Both</span></span>', { color: "red", bg_color: "yellow" }],
      ['<span color="red"><span color="blue">Both</span></span>', { color: "blue", bg_color: "" }],
      ['<span color="yellow_bg"><span color="green_bg">Both</span></span>', { color: "", bg_color: "green" }],
      ['<span color="red" future="outer"><span color="yellow_bg" discussion-urls="https://example.com/thread"><b>Both</b></span></span>', { color: "red", bg_color: "yellow" }],
    ] as const;
    for (const [entry, expected] of cases) {
      const source = entry + "\n\nTail", doc = parseNative(source, config);
      assert.equal(doc.firstChild!.type.name, "block.paragraph");
      const mark = doc.firstChild!.firstChild!.marks.find(mark => mark.type === schema.marks.color)!;
      assert.deepEqual(inlineColors(mark.attrs), expected, entry);
      assert.equal(serializeNative(doc, config), source);
      const changed = EditorState.create({ doc }).tr.insertText("!", 2).doc;
      const saved = serializeNative(changed, config);
      assert.ok(!saved.includes("bg_color="), saved);
      const reopened = parseNative(saved, config); reopened.check();
      assert.deepEqual(inlineColors(reopened.firstChild!.firstChild!.marks.find(mark => mark.type === schema.marks.color)!.attrs), expected, saved);
      if (entry.includes("future=")) { assert.ok(saved.includes('future="outer"')); assert.ok(saved.includes('discussion-urls="https://example.com/thread"')); }
    }
    const mixed = parseNative('<span color="red">Outer <span color="yellow_bg">Both</span> Outer</span>', config);
    const colors: object[] = []; mixed.firstChild!.forEach(node => colors.push(inlineColors(node.marks.find(mark => mark.type === schema.marks.color)!.attrs)));
    assert.deepEqual(colors, [{ color: "red", bg_color: "" }, { color: "red", bg_color: "yellow" }, { color: "red", bg_color: "" }]);
    const entry = '<span color="red"><span color="yellow_bg">Both</span></span>';
    const disabled = { ...config, extensions: { notion_colors: false } };
    parseNative(entry, disabled).descendants(node => assert.ok(!node.marks.some(mark => mark.type === schema.marks.color)));
    assert.equal(serializeNative(parseNative(entry, disabled), disabled), entry);
    if (variant === "notion-markdown") {
      const custom = '<span color="red" bg_color="yellow">Both</span>';
      parseNative(custom, config).descendants(node => assert.ok(!node.marks.some(mark => mark.type === schema.marks.color)));
      assert.equal(serializeNative(parseNative(custom, config), config), custom);
    }
  });
  test(`${variant}: official v2 block carriers parse multiline bodies without opaque fallbacks`, () => {
    const target = "https://www.notion.so/a980f8f4c1065213b898fa6458487ce5";
    const cases: [string, string, string, string][] = [
      ["p", ' color="blue"', "Text", "block.paragraph"],
      ...[1, 2, 3, 4].map(level => [`h${level}`, "", "Heading", "block.heading"] as [string, string, string, string]),
      ["quote", "", "Title\n\nChild", "block.quote"],
      ["toggle", "", "Title\n\nChild", "block.toggle"],
      ["ul", "", "<li>\nItem\n</li>", "structure.bullet_list"],
      ["ol", ' type="a"', "<li>\nItem\n</li>", "structure.ordered_list"],
      ["todo", ' checked="true"', "Done", "structure.bullet_list"],
      ["columns", "", "<column>\nLeft\n</column>\n<column>\nRight\n</column>", "block.columns"],
      ["tabs", "", "<tab>\nFirst\n\nContent\n</tab>", "block.tabs"],
      ["callout", ' icon="💡"', "Body", "block.callout"],
      ["mail", ' from="writer@example.com"', "Mail body", "block.mail"],
      ["meeting-notes", "", "Meeting\n<meeting-notes-section-notes>\nNotes\n</meeting-notes-section-notes>\n<meeting-notes-section-summary>\nSummary\n</meeting-notes-section-summary>\n<meeting-notes-section-transcript>\nTranscript\n</meeting-notes-section-transcript>", "block.meeting_notes"],
      ["synced-block", ` url="${target}"`, "Shared", "block.synced_block"],
      ["synced-block-reference", ` url="${target}"`, "Snapshot", "block.synced_block"],
      ["table", "", "<tr>\n<th>Head</th>\n<td>Cell</td>\n</tr>", "block.table"],
      ["equation", ' color="blue"', "x + y = z", "block.math_block"],
      ["page", ` url="${target}"`, "<b>Rich</b> title", "block.child_page"],
      ["folder", ` url="${target}"`, "<b>Rich</b> title", "block.folder"],
      ["database", ` url="${target}" data-source-url="collection://source" inline="true" wiki="true" icon="📚"`, "<b>Rich</b> title", "block.database"],
      ...["image", "file", "audio", "video", "pdf", "bookmark", "embed"].map(tag => [tag, ' source="https://example.com/file"', "<b>Rich</b> caption", ({ image: "block.image_block", file: "block.file", audio: "block.audio", video: "block.video", pdf: "block.pdf", bookmark: "block.web_bookmark", embed: "block.web_embed" } as Record<string, string>)[tag]] as [string, string, string, string]),
      ["external_object_instance", ' integration="github"', "Repository", "block.external_object_instance"],
    ];
    for (const [tag, attrs, body, expected] of cases) {
      for (const wrapped of [false, true]) {
        const entry = `<${tag}${attrs} future="keep">\n${body}\n</${tag}>`;
        const source = (wrapped ? `<columns><column>\n${entry}\n</column><column>Other</column></columns>` : entry) + "\n\nTail";
        const doc = parseNative(source, config); doc.check();
        const node = wrapped ? doc.firstChild!.firstChild!.firstChild! : doc.firstChild!;
        assert.equal(node.type.name, expected, source);
        assert.equal((tag === "todo" ? node.firstChild! : node).attrs.nfmAttrs.future, "keep", source);
        if (["page", "folder", "database"].includes(tag)) assert.equal(node.attrs.label, "Rich title");
        if (tag === "database") {
          assert.equal(node.attrs.dataSourceUrl, "collection://source");
          assert.equal(node.attrs.inline, true);
          assert.equal(node.attrs.wiki, true);
          assert.equal(node.attrs.icon, "📚");
        }
        doc.descendants(child => assert.notEqual(child.type.name, "block.unsupported", source));
        assert.equal(serializeNative(doc, config), source);
        const changed = EditorState.create({ doc }).tr.insertText("!", doc.content.size - 1).doc;
        assert.ok(serializeNative(changed, config).includes(entry));
      }
    }
  });

  test(`${variant}: v2 child pages accept multiline rich titles and retain source inside columns`, () => {
    const target = "a980f8f4-c106-5213-b898-fa6458487ce5";
    for (const [body, label] of [["Child page", "Child page"], ["\n<b>基因表达</b>的调研 &amp; CADD\n", "基因表达的调研 & CADD"], ["", ""]]) {
      for (const newline of ["\n", "\r\n"]) {
        const entry = `<page url="#page/${target}" future="keep">${body}</page>`.replaceAll("\n", newline);
        for (const wrapped of [false, true]) {
          const source = (wrapped ? `<columns>\n<column>\n## Knowledge\n\n${entry}\n</column>\n<column>Engineering</column>\n</columns>` : entry).replace(/\r?\n/g, newline) + newline + newline + "Tail";
          const doc = parseNative(source, config); doc.check();
          const entries: typeof doc[] = [];
          doc.descendants(node => { if (node.type.name === "block.child_page") entries.push(node); });
          assert.equal(entries.length, 1, source);
          assert.equal(entries[0].attrs.target, target);
          assert.equal(entries[0].attrs.label, label);
          assert.equal(entries[0].attrs.nfmAttrs.future, "keep");
          assert.equal(serializeNative(doc, config), source);
          // Editing a sibling must keep the rich title, unknown fields and URL.
          const changed = EditorState.create({ doc }).tr.insertText("!", doc.content.size - 1).doc;
          const saved = serializeNative(changed, config);
          assert.ok(saved.includes(entry), saved);
          assert.equal(parseNative(saved, config).lastChild!.textContent, "Tail!");
        }
      }
    }
    const selfClosing = parseNative(`<page url="#page/${target}" />`, config);
    assert.equal(selfClosing.firstChild!.type.name, "block.child_page");
    const malformed = `<page url="#page/${target}">\nUnclosed`;
    assert.equal(serializeNative(parseNative(malformed, config), config), malformed);
    for (const literal of [`\`\`\`xml\n<page url="#page/${target}">\nExample\n</page>\n\`\`\``, `<future>\n<page url="#page/${target}">\nExample\n</page>\n</future>`]) {
      const doc = parseNative(literal, config);
      doc.descendants(node => assert.notEqual(node.type.name, "block.child_page"));
      assert.equal(serializeNative(doc, config), literal);
    }
    const disabled = { ...config, extensions: { notion_pages: false } };
    const source = `<page url="#page/${target}">\nChild\n</page>`;
    assert.equal(parseNative(source, disabled).firstChild!.type.name, "block.unsupported");
    assert.equal(serializeNative(parseNative(source, disabled), disabled), source);
  });

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
