import { test, expect, type Page, type Locator } from "@playwright/test";

async function viewSource(page: Page, block: Locator) {
  await block.hover();
  await page.locator('.pm-block-handle').click();
  await page.getByRole('menuitem', { name: 'View source', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Block source', exact: true })).toBeVisible();
  return page.getByRole('textbox', { name: 'Block Markdown source' });
}

test('block source preserves raw fences, is read-only, copies and closes without saving', async ({ page, request, context }) => {
  const code = '~~~~js\nconst html = "<button>safe</button>";\n~~~~';
  const body = `Before\n\n${code}\n\nAfter`;
  const response = await request.post('/api/pages', { data: {
    title: 'Block source fences', body, syntax: { version: 1, variant: 'markdown', extensions: {} },
  } });
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  const input = await viewSource(page, page.locator('.pm-document pre').first());
  await expect(input).toHaveValue(code);
  await expect(input).toHaveAttribute('readonly', '');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy source', exact: true }).click();
  await expect(page.locator('.pm-block-source-dialog output')).toHaveText('Copied');
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(code);
  await page.keyboard.press('Escape');
  await expect(input).toHaveCount(0);
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
});

test('source includes current edits and only the selected list item and its children', async ({ page, request }) => {
  const body = 'Before\n\n7. First\n8. Second\n    - Child\n9. Last\n\nAfter';
  const response = await request.post('/api/pages', { data: {
    title: 'Block source list', body, syntax: { version: 1, variant: 'commonmark', extensions: {} },
  } });
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  const paragraph = page.locator('.pm-document > p').first();
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' edited');
  let input = await viewSource(page, paragraph);
  await expect(input).toHaveValue('Before edited');
  await page.getByRole('button', { name: 'Close block source' }).click();
  await expect(page.locator('.pm-document > ol > li').nth(1).locator('ul li')).toHaveText('Child');
  input = await viewSource(page, page.locator('.pm-document > ol > li').nth(1).locator('p').first());
  expect(await input.inputValue()).toMatch(/^8\. Second\n\s+- Child$/);
  await page.keyboard.press('Escape');
});

test('container source keeps its syntax and excludes adjacent blocks', async ({ page, request }) => {
  const source = '::: {.container custom="keep"}\nFirst child\n\nSecond child\n:::';
  const response = await request.post('/api/pages', { data: {
    title: 'Block source container', body: `${source}\n\nTail`,
    syntax: { version: 1, variant: 'markdown', extensions: { fenced_divs: true } },
  } });
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  const group = page.locator('.pm-object-fenced_div');
  await expect(group).toBeVisible();
  const bounds = (await group.boundingBox())!;
  await page.mouse.move(bounds.x - 72, bounds.y + 10);
  await page.locator('.pm-block-handle').click();
  await page.getByRole('menuitem', { name: 'View source', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Block Markdown source' })).toHaveValue(source);
  await page.keyboard.press('Escape');
});

for (const variant of ['notion-markdown', 'notdown']) {
  test(`${variant} block source retains callout attributes and fits a narrow screen`, async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const source = '<callout icon="💡" color="blue_bg">\n\t**Keep** this\n\n\tSecond paragraph\n</callout>';
    const response = await request.post('/api/pages', { data: {
      title: 'Callout source', body: `${source}\n\nTail`, bodyFormat: 'notion-markdown',
      syntax: { version: 1, variant, extensions: {} },
    } });
    const note = await response.json();
    await page.goto(`/#page/${note.id}`);
    const input = await viewSource(page, page.locator('.pm-callout p').first());
    await expect(input).toHaveValue(source);
    const rect = (await page.getByRole('dialog', { name: 'Block source', exact: true }).boundingBox())!;
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(390);
    expect(rect.y + rect.height).toBeLessThanOrEqual(844);
    await page.keyboard.press('Escape');
    await expect(input).toHaveCount(0);
  });
}
