import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {canonicalHtml,compareHtml} from '../../scripts/dialect-audit/compare.js';
import {dialects} from '../../src/markdown-engine/config.js';
import {comparisonOutputs,previewDocument} from '../../scripts/dialect-audit/viewer.js';

test('audit viewer deduplicates parser identity, retains equal independent parsers and omits missing outputs',()=>{
 assert.deepEqual(comparisonOutputs({variant:'markdown',official:'stale default'}, {pandoc:'active profile',notdown:'native'}),[{label:'官方 · Pandoc HTML',html:'active profile'},{label:'Notdown HTML',html:'native'}]);
 assert.equal(comparisonOutputs({variant:'gfm',official:'same'}, {pandoc:'same',notdown:'same'}).length,3);
 assert.deepEqual(comparisonOutputs({variant:'obsidian',official:null},{notdown:'',pandocSkipped:'no reader'}),[{label:'Notdown HTML',html:''}]);
 assert.equal(comparisonOutputs({variant:'markdown'},{notdown:'native',pandocError:'unavailable'}).length,1);
 const html=previewDocument('<h1>Hello</h1><script>alert(1)</script><iframe srcdoc="bad"></iframe><img src="x" onerror="bad()"><a href="javascript:bad()">bad</a><meta http-equiv="refresh" content="0;url=https://example.com">');
 assert.match(html,/<h1>Hello<\/h1>/);
 assert.doesNotMatch(html,/<script|<iframe|onerror=|javascript:|http-equiv="refresh"/);
 assert.match(html,/script-src 'none'/);
});

test('audit comparison ignores serialization trivia but preserves semantic differences',()=>{
 assert.equal(canonicalHtml('<p a="1" b="2">A &amp; B</p>\n<p>C</p>'),canonicalHtml('<p b="2" a="1">A &#38; B</p><p>C</p>'));
 for(const [a,b]of [['<pre><code> a\n</code></pre>','<pre><code>a\n</code></pre>'],['<a href="/a">link</a>','<a href="/b">link</a>'],['<em>x</em>','<strong>x</strong>'],['<ul><li>x</li></ul>','<ul><li><p>x</p></li></ul>'],['<input checked>','<input>'],['<td align="left">x</td>','<td align="right">x</td>']])assert.notEqual(canonicalHtml(a),canonicalHtml(b));
 assert.equal(compareHtml('<em>x</em>','<strong>x</strong>').textEqual,true);
 assert.equal(compareHtml('<em>x</em>','<strong>x</strong>').domEqual,false);
});
test('2026-09-23 upstream dialect fixtures are indexed with exact independent source slices',()=>{
 const dir=new URL('../../docs/fixtures/dialect-audit/',import.meta.url);
 const corpus=JSON.parse(readFileSync(new URL('cases.json',dir),'utf8'));
 // R Markdown and Quarto were added after this immutable dated audit; its execution and
 // source-preservation coverage lives in rmarkdown.test.ts and rmarkdown.Rmd.
 assert.deepEqual(Object.keys(corpus.suites).sort(),dialects.map(d=>d.id).filter(id=>id!=='notdown' && id!=='rmarkdown' && id!=='quarto').sort());
 for(const [variant,suite]of Object.entries<any>(corpus.suites)){
  const source=readFileSync(new URL(suite.file,dir),'utf8');
  const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
  assert.equal(hash(source),suite.sha256,variant);
  const ids=new Set();
  for(const c of suite.cases){assert(!ids.has(c.id));ids.add(c.id);assert.equal(hash(source.slice(c.start,c.end)),c.sha256,c.id);assert(c.url);}
 }
 assert.equal(corpus.suites.commonmark.cases.filter((c:any)=>c.id.startsWith('cm-')).length,652);
 assert.equal(corpus.suites.gfm.cases.filter((c:any)=>c.id.startsWith('gfm-example-')).length,677);
 for(const [variant,flags]of Object.entries<any>(corpus.pandocExtensions))for(const id of Object.keys(flags))assert(corpus.suites[variant].cases.some((c:any)=>c.id==='pandoc-'+id),variant+' '+id);
});
