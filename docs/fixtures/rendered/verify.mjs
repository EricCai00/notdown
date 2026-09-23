import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const folder = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(folder, 'index.html')).href);
  const panels = page.locator('.panel');
  assert.equal(await panels.nth(0).locator('ol input[type=checkbox]').count(), 2);
  assert.equal(await panels.nth(1).locator('ol input[type=checkbox]').count(), 0);
  assert.match(await panels.nth(1).locator('ol').innerText(), /\[ \] ordered task/);
  await page.screenshot({ path: path.join(folder, 'comparison.png'), fullPage: true });
  for (const name of ['cmark-gfm', 'pandoc-gfm']) {
    await page.goto(pathToFileURL(path.join(folder, name + '.html')).href);
    assert.equal(await page.locator('img').first().evaluate(el => el.complete && el.naturalWidth > 0), true);
    assert.ok(await page.getByText('EOF-SENTINEL', { exact: false }).count());
    console.log(name, 'full document loaded, image loaded, EOF sentinel present');
  }
} finally {
  await browser.close();
}
