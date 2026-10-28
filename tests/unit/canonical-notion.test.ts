import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeNotdownSource } from "../../src/document/canonical-source";
import { parseNative, serializeNative } from "../../src/markdown-engine/codec";
import { editorSchema as schema } from "../../src/document/editor-schema";
import { canonicalDateAttributes } from "../../src/features/dates/date-mention";

const base = {version: 1 as const, variant: "notdown" as const, extensions: {}};
for (const notionVersion of [undefined,"v2"] as const) test(`canonical carriers preserve content and supplemental properties (${notionVersion || "union"})`,() => {
  const config = {...base,notionVersion};
  const cases = [
    ['<web-embed url="https://example.com" caption="Caption" title="Title" width="600" future="keep"/>', '<embed'],
    ['<bookmark url="https://example.com" title="Title" description="Description" icon="assets/icon.png" caption="Caption" future="keep"/>', '<bookmark'],
    ['<link-preview url="https://example.com" title="Title" description="Description" caption="Preview caption" icon="future-icon" future="keep"/>','<link-preview'],
    ['<tabs active="1" future="keep">\n<tab title="First">\nBody\n</tab>\n<tab title="Second">\nOther\n</tab>\n</tabs>','<tabs'],
    ['<tabs active="0" future="keep">\n<tab title="&lt;date start=&quot;2026-10-27&quot;/&gt; &amp; **literal**">\nBody\n</tab>\n</tabs>','<tabs'],
    ['<meeting-notes title="Meeting" audio="assets/a.wav" language="en" transcript="Transcript" future="keep">\nNotes\n</meeting-notes>','<meeting-notes'],
    ['<columns>\n<column width-ratio="0.3" future="keep">Left</column>\n<column width-ratio="0.7">Right</column>\n</columns>','<columns'],
    ['<details open="false" future="keep">\n<summary>Title</summary>\n\tChild\n</details>',notionVersion === 'v2' ? '<toggle' : '<details'],
  ];
  for (const [entry,tag] of cases) {
    const source = 'Before\r\n\r\n'+entry.replaceAll('\n','\r\n')+'\r\n\r\nAfter';
    const migrated = canonicalizeNotdownSource(source,config);
    assert.equal(migrated.blocks,tag === '<link-preview' ? 0 : 1,entry); assert.ok(migrated.source.includes(tag));
    assert.ok(migrated.source.includes('future="keep"'));
    assert.ok(migrated.source.startsWith('Before\r\n\r\n') && migrated.source.endsWith('\r\n\r\nAfter'));
    assert.doesNotMatch(migrated.source,/<web-embed|<bookmark url=|width-ratio=|<tab title=|<tabs active=|<meeting-notes title=/);
    assert.equal(canonicalizeNotdownSource(migrated.source,config).source,migrated.source);
    assert.equal(serializeNative(parseNative(migrated.source,config),config),migrated.source);
  }
});
test("canonical migration leaves literal code, unknown containers, ordinary text and conflicting attributes intact",() => {
  const literal = '<web-embed url="https://example.com"/>';
  const source = '`'+literal+'`\n\n```xml\n'+literal+'\n```\n\n<future>\n'+literal+'\n</future>\n\nPlain text';
  assert.equal(canonicalizeNotdownSource(source,base).source,source);
  const conflicting = '<web-embed url="https://example.com" source="future-ref"/>';
  assert.equal(canonicalizeNotdownSource(conflicting,base).source,conflicting);
});
test("newly constructed cards and embeds serialize with official carriers",() => {
  for (const name of ['block.web_embed','block.web_bookmark','block.link_preview']) {
    const node = schema.nodes[name].create({url:'https://example.com',title:'Title',caption:'Caption'});
    const result = serializeNative(schema.nodes.doc.create(null,node),base);
    assert.doesNotMatch(result,/<web-embed|<bookmark url=/);
    if (name !== 'block.link_preview') assert.doesNotMatch(result,/caption=/);
    assert.equal(parseNative(result,base).firstChild!.attrs.url,'https://example.com');
  }
});
test("date carriers use official split fields without rounding seconds or resolving conflicting zones",() => {
  const original = {start:'2026-10-27T09:00:00Z', 'time-zone':'UTC',reminder:'2026-10-27T08:00:00Z',future:'keep'};
  const result = canonicalDateAttributes(original);
  assert.deepEqual(result,{start:'2026-10-27',startTime:'09:00',timeZone:'UTC',reminder:original.reminder,future:'keep'});
  const source = '<mention-date start="2026-10-27T09:00:00Z" time-zone="UTC" future="keep"/>';
  const migrated = canonicalizeNotdownSource(source,base);
  assert.match(migrated.source,/startTime="09:00"/); assert.match(migrated.source,/timeZone="UTC"/);
  for (const fields of [{start:'2026-10-27T09:00:03Z'}, {...original,timeZone:'Europe/London'}]) assert.equal(canonicalDateAttributes(fields),fields);
});
