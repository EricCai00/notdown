import { test, expect } from "@playwright/test";
import { objectSamples } from "../src/object-model";

test("Notdown switches on block defaults, preserves source, and saves overrides across reload", async ({ page, request }) => {
  const body = objectSamples.tabs + '\n\n<button label="Insert text" action="insert-text" target="Added"/>\n\n<callout icon="💡">\nKeep this callout\n</callout>\n\nTail';
  const note = await (await request.post('/api/pages', { data: { title: "Notdown defaults", body, bodyFormat: "notion-markdown", syntax: { version: 1, variant: "notion-markdown", extensions: { future_option: true } } } })).json();
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/#page/${note.id}`);
  const dialect = page.getByRole('combobox', { name: 'Markdown dialect' });
  await expect(page.locator('.pm-object-tabs')).toHaveCount(0);
  await dialect.selectOption('notdown');
  await expect(page.locator('.pm-object-tabs')).toHaveCount(1);
  await expect(page.getByRole('tab', { name: 'First', exact: true })).toBeVisible();
  await page.locator('.syntax-options summary').click();
  const group = page.locator('[data-extension-group="other"]');
  await expect(group.locator('[data-extension-category-heading="product"]')).toHaveText('Notdown Markdown extensions');
  // All displayed Notdown plugins default on. Check the established identities
  // without imposing a fixed upper limit when another plugin is registered.
  await expect(group.locator('input[data-extension^="local_"]:not(:checked)')).toHaveCount(0);
  await expect.poll(() => group.locator('input[data-extension]:checked').evaluateAll(inputs =>
    inputs.map(input => input.getAttribute('data-extension')).sort(),
  )).toEqual(expect.arrayContaining([
    'notion_tabs', 'notion_bookmark', 'notion_link_preview', 'notion_breadcrumb',
    'notion_button', 'notion_meeting_notes', 'notion_ai_block', 'notion_html_document', 'notion_web_embed',
  ]));
  await expect(group.locator('.extension-choice').filter({ has: page.locator('input[data-extension="notion_tabs"]') }).locator('code')).toHaveText('notion_tabs');
  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).syntax.variant).toBe('notdown');
  const saved = (await (await request.get(`/api/pages/${note.id}`)).json());
  expect(saved.body).toBe(body); expect(saved.bodyFormat).toBe('notion-markdown');
  expect(saved.syntax.extensions).toEqual({ future_option: true });
  await page.reload();
  await expect(dialect).toHaveValue('notdown');
  await expect(page.getByRole('tab', { name: 'First', exact: true })).toBeVisible();
  await page.locator('.syntax-options summary').click();
  const tabs = group.locator('[data-extension="notion_tabs"]');
  await tabs.uncheck();
  await expect(page.locator('.pm-object-tabs')).toHaveCount(0);
  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).syntax.extensions.notion_tabs).toBe(false);
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
  await page.getByRole('button', { name: 'Reset dialect defaults' }).click();
  await expect(tabs).toBeChecked();
  await expect(page.locator('.pm-object-tabs')).toHaveCount(1);
  await page.locator('.syntax-options summary').click();
  const tail = page.locator('.pm-document > p').filter({ hasText: /^Tail$/ });
  await tail.click(); await page.keyboard.press('End'); await page.keyboard.type(' pending edit');
  await dialect.selectOption('notion-markdown');
  await expect(page.locator('.pm-object-tabs')).toHaveCount(0);
  await expect(page.locator('.pm-document')).toContainText('Tail pending edit');
  await dialect.selectOption('notdown');
  await expect(page.locator('.pm-object-tabs')).toHaveCount(1);
  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain('Tail pending edit');
  await page.reload();
  await expect(dialect).toHaveValue('notdown');
  await expect(page.locator('.pm-document')).toContainText('Tail pending edit');
  await page.locator('.syntax-options summary').click();
  await page.screenshot({ path: 'test-results/notdown-dialect.png' });
  expect(errors).toEqual([]);
});

test("Notdown is available in Markdown Lab with the same block defaults", async ({ page }) => {
  await page.goto('/markdown-lab.html');
  await page.locator('#variant').selectOption('notdown');
  await page.locator('#configure').click();
  await expect(page.locator('input[data-extension="notion_tabs"]')).toBeChecked();
  await expect(page.locator('#extension-note')).toContainText('enables Notdown blocks by default');
});
