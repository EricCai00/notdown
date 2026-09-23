import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';

let installed: { pages: { key:string; id:string; title:string }[] };
const keys = [
  ...['typora','obsidian','notion-markdown','notdown','commonmark','gfm','markdown','commonmark_x','markdown_strict','markdown_phpextra','markdown_mmd','markdown_github'].map(id => 'dialect-' + id),
  ...['blocks','inline','lexical','product','mmd','math','notion'].map(id => 'extensions-' + id),
  ...['display_math','hard_line_breaks','ignore_line_breaks','east_asian_line_breaks','wikilinks_title_before_pipe','literate_haskell','pandoc_title_block'].map(id => 'extension-' + id),
  'extensions-tools','objects-local','outside',
];
test.beforeAll(async () => {
  test.setTimeout(90000);
  const base = `http://127.0.0.1:${process.env.NOTDOWN_E2E_PORT || 4329}`;
  const status = await (await fetch(base + '/api/status')).json();
  const parent = await (await fetch(base + '/api/pages', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ title:'Tests — isolated acceptance specimens', body:'Keep this parent unchanged.' }) })).json();
  await promisify(execFile)(process.execPath, ['--import','tsx','docs/fixtures/install-manual-test-pages.ts', base, parent.id, status.vaultPath]);
  installed = JSON.parse(await readFile('test-results/manual-pages-installed.json','utf8'));
  expect(installed.pages.map(p => p.key)).toEqual(keys);
});
for (const key of keys) test(`acceptance specimen renders and preserves source: ${key}`, async ({ page, request }) => {
  const specimen = installed.pages.find(p => p.key === key)!;
  const before = await (await request.get('/api/pages/' + specimen.id)).json();
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(id => { if (window === window.top) localStorage.setItem('notdown-page', id); }, specimen.id);
  await page.goto('/');
  await expect(page.locator('.pm-document')).toBeVisible();
  await expect(page.getByRole('textbox', { name:'Page title', exact:true })).toHaveValue(specimen.title);
  await expect(page.getByRole('combobox', { name:'Markdown dialect', exact:true })).toHaveValue(before.syntax.variant);
  const headings = await page.locator('.pm-document > h2').allTextContents();
  for (const [, title] of before.body.matchAll(/^## ([DEILRU]\d+ — .+)$/gm)) expect(headings).toContain(title);
  if (key === 'dialect-markdown') {
    await expect(page.locator('.pm-document > p > code').filter({ hasText: '**literal**' })).toHaveCount(1);
    const tail = page.locator('.pm-document > p').filter({ hasText: 'Text with **literal** code.' });
    await tail.click();
    await page.keyboard.press('End');
    await page.keyboard.insertText(' BOUNDARYEDIT');
    await expect(tail).toHaveText('Text with **literal** code. BOUNDARYEDIT');
    await expect.poll(async () => (await (await request.get('/api/pages/' + specimen.id)).json()).body).toBe(before.body.replace('Text with `**literal**` code.', 'Text with `**literal**` code. BOUNDARYEDIT'));
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await (await request.get('/api/pages/' + specimen.id)).json()).body).toBe(before.body);
    await page.reload();
    await expect(tail).toHaveText('Text with **literal** code.');
    await page.locator('.pm-document > h2').filter({ hasText: /— Unsupported$/ }).scrollIntoViewIfNeeded();
    await page.screenshot({ path:'test-results/unsupported-boundaries.png' });
  }
  await page.locator('[data-mode=source]').click();
  await expect(page.locator('.cm-editor')).toBeVisible();
  await page.locator('[data-mode=document]').click();
  await expect(page.locator('.pm-document')).toBeVisible();
  expect((await (await request.get('/api/pages/' + specimen.id)).json()).body).toBe(before.body);
  expect(errors).toEqual([]);
  if (key === 'objects-local') {
    await expect(page.locator('.pm-object-tabs')).toHaveCount(1);
    await page.screenshot({ path:'test-results/manual-objects-page.png', fullPage:false });
  }
  if (key === 'extensions-notion') {
    await expect.poll(() => page.locator('.pm-document img').evaluateAll(images => images.every(i => (i as HTMLImageElement).complete))).toBe(true);
    expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.error?.message || '')).toBe('');
  }
});
