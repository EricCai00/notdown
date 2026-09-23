import test from 'node:test';
import assert from 'node:assert/strict';
import { buildManualPages, auditManualPages } from '../../docs/fixtures/manual-test-pages';

export const fixtureResources = { image: 'assets/example.png', audio: 'assets/example.wav', video: 'assets/example.webm', pdf: 'assets/example.pdf', text: 'assets/example.txt', bibliography: 'assets/refs.txt', target: '00000000-0000-4000-8000-000000000001' };
test('manual acceptance pages cover each dialect and all in-scope extensions without changing source', () => {
  const pages = buildManualPages(fixtureResources), audit = auditManualPages(pages);
  assert.equal(audit.dialects, 12); assert.equal(audit.extensions, 114); assert.equal(audit.objects, 81);
  assert.equal(pages.filter(p => p.key.startsWith('dialect-')).length, 12);
  assert.equal(pages.at(-1)?.key, 'outside');
  assert.equal(new Set(pages.map(p => p.key)).size, pages.length);
  for (const page of pages.filter(p => p.key.startsWith('dialect-'))) {
    assert.deepEqual(page.syntax.extensions, {});
    assert(page.objects.length >= 10, page.key);
  }
  assert(pages.every(p => !p.body.includes('reminder="') && !p.body.includes('auto-refresh="true"')));
  const pandoc = pages.find(page => page.key === 'dialect-markdown')!;
  const others = pages.filter(page => page !== pandoc);
  const swallowed = pandoc.body.replace(':::unknown {custom="keep"}\nPreserved content\n:::', ':::unknown\nPreserved content\n:::endunknown');
  assert.notEqual(swallowed, pandoc.body);
  assert.throws(() => auditManualPages([{ ...pandoc, body: swallowed }, ...others]), /Missing acceptance section: dialect-markdown/);
  const joined = pandoc.body.replace(/(备注：\n)\n(## D\d+)/, '$1$2');
  assert.notEqual(joined, pandoc.body);
  assert.throws(() => auditManualPages([{ ...pandoc, body: joined }, ...others]), /Missing acceptance section: dialect-markdown/);
});
