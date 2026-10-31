import { selectWikiView } from "./wiki-ui-helper";
import { test, expect } from "@playwright/test";

test("Full width saves pending input without replacing the editor and persists per page", async ({ page, request }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  const note = await (await request.post('/api/pages', { data: { title: 'Width control', body: 'Original body' } })).json();
  await page.goto(`/#page/${note.id}`);
  const editor = page.locator('.pm-document');
  await expect(editor).toBeVisible();
  const narrow = (await page.locator('article.document').boundingBox())!.width;
  await editor.focus(); await page.keyboard.press('Control+End'); await page.keyboard.type(' pending text');
  await editor.evaluate(el => { (el as any).widthTestIdentity = 'same editor'; });
  await page.locator('#page-options > summary').click();
  await page.getByRole('menuitemcheckbox', { name: 'Full width', exact: true }).click();
  await expect(page.locator('.document-wrap')).toHaveClass(/full-width/);
  expect((await page.locator('article.document').boundingBox())!.width).toBeGreaterThan(narrow + 300);
  expect(await editor.evaluate(el => (el as any).widthTestIdentity)).toBe('same editor');
  const saved = await (await request.get(`/api/pages/${note.id}`)).json();
  expect(saved.fullWidth).toBe(true); expect(saved.body).toContain('pending text'); expect(saved.body).not.toContain('fullWidth');
  await page.locator('.editing-modes [data-mode="source"]').click();
  expect((await page.locator('.document-wrap').boundingBox())!.width).toBeGreaterThan(1500);
  await page.locator('.editing-modes [data-mode="document"]').click();
  await editor.focus();
  await page.keyboard.press('Control+z'); await expect(editor).toHaveText('Original body');
  await page.keyboard.press('Control+s'); await page.reload();
  await expect(page.locator('.document-wrap')).toHaveClass(/full-width/);
  await page.locator('#page-options > summary').click();
  await expect(page.getByRole('menuitemcheckbox', { name: 'Full width', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('menuitemcheckbox', { name: 'Full width', exact: true }).click();
  await expect(page.locator('.document-wrap')).not.toHaveClass(/full-width/);
  expect((await page.locator('article.document').boundingBox())!.width).toBeCloseTo(narrow, 0);
});

for (const width of [1920, 1440, 600]) test(`Wiki Home is full width with a shared view picker at ${width}px`, async ({ page, request }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  const snapshot = await (await request.post('/api/databases', { data: { title: 'Wide wiki Home', kind: 'wiki' } })).json();
  await page.goto(`/#page/${snapshot.hostPage.id}`);
  await expect(page.locator('.document-wrap')).toHaveClass(/full-width/);
  const tabs = page.getByRole('navigation', { name: 'Wiki views' });
  const home = tabs.getByRole('button', { name: 'Wiki view: Home', exact: true });
  await expect(home.locator('svg')).toHaveCount(2);
  const styling = await home.evaluate(el => ({ radius: getComputedStyle(el).borderRadius, display: getComputedStyle(el).display, gap: getComputedStyle(el).gap }));
  expect(styling.radius).toBe('20px');
  const doc = (await page.locator('article.document').boundingBox())!;
  const main = (await page.locator('#main').boundingBox())!;
  expect(doc.width).toBeGreaterThan(main.width - 280);
  expect(doc.x).toBeGreaterThanOrEqual(main.x); expect(doc.x + doc.width).toBeLessThanOrEqual(main.x + main.width);
  await page.screenshot({ path: info.outputPath(`wiki-full-width-${width}.png`), fullPage: true });
  await selectWikiView(page, 'All pages');
  await selectWikiView(page, 'Home');
  await expect(page.locator('.document-wrap')).toHaveClass(/full-width/);
  await page.locator('#page-options > summary').click();
  await expect(page.getByRole('menuitemcheckbox', { name: 'Full width', exact: true })).toHaveCount(0);
  if (width === 1920) {
    await page.getByRole('menuitem', { name: 'Undo wiki', exact: true }).click();
    await expect(page.locator('.document-wrap')).not.toHaveClass(/full-width/);
    await page.locator('#page-options > summary').click();
    await expect(page.getByRole('menuitemcheckbox', { name: 'Full width', exact: true })).toHaveAttribute('aria-checked', 'false');
  }
});
