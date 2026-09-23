import { test, expect } from "@playwright/test";

test("old block IDs open canonical details and figures use Pandoc", async ({ page }) => {
  await page.goto("/block-catalog.html#tab=extensions&id=local_meeting_notes&variant=typora");
  await expect(page.locator('.catalog-detail > code')).toHaveText("notion_meeting_notes");
  await expect(page.locator('.catalog-detail > small')).toHaveText("Notdown Notion extensions");
  await page.goto("/block-catalog.html#tab=extensions&id=implicit_figures&variant=markdown");
  await expect(page.locator('.catalog-detail > small').first()).toHaveText("Pandoc extensions");
  await expect(page.locator('.catalog-detail')).toContainText("implicit_figures");
});

test("color and underline settings stay independent and saved configuration uses canonical IDs", async ({ page, request }) => {
  const source = '<span underline="true">Underlined</span>\n\nTail';
  const response = await request.post('/api/pages', { data: { title: "Independent Notion formatting", body: source, bodyFormat: "notion-markdown", syntax: { version: 1, variant: "notdown", extensions: { local_tabs: false, future_option: true } } } });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  await page.locator('.syntax-options summary').click();
  const colors = page.locator('input[data-extension="notion_colors"]');
  const underline = page.locator('input[data-extension="notion_underline"]');
  await expect(page.locator('input[data-extension="notion_tabs"]')).not.toBeChecked();
  await expect(colors).toBeChecked();
  await expect(underline).toBeChecked();
  await colors.uncheck();
  await expect(underline).toBeChecked();
  await underline.uncheck();
  await expect(colors).not.toBeChecked();
  await colors.check();
  await expect(underline).not.toBeChecked();
  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).syntax.extensions).toMatchObject({ notion_colors: true, notion_underline: false, notion_tabs: false, future_option: true });
  const saved = await (await request.get(`/api/pages/${note.id}`)).json();
  expect(saved.syntax.extensions).not.toHaveProperty('local_tabs');
  expect(saved.body).toBe(source);
  await page.reload();
  await page.locator('.syntax-options summary').click();
  await expect(colors).toBeChecked();
  await expect(underline).not.toBeChecked();
  await underline.check();
  await expect(page.locator('.pm-document')).toContainText('Underlined');
});
