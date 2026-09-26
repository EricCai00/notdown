import { test, expect, type Page, type Locator } from "@playwright/test";

async function expectSource(input: Locator, source: string) {
  await expect(input.locator('.cm-line')).toHaveText(source.split('\n'));
}

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
  await expectSource(input, code);
  await expect(input).toHaveAttribute('aria-readonly', 'true');
  await input.focus();
  await page.keyboard.type('must not edit');
  await expectSource(input, code);
  const dialog = page.getByRole('dialog', { name: 'Block source', exact: true });
  await expect(dialog.locator('.cm-lineNumbers .cm-gutterElement').filter({ hasText: /^[1-3]$/ })).toHaveText(['1', '2', '3']);
  // Fenced JavaScript tokens receive real syntax colors, not a single code color.
  await expect.poll(() => input.locator('.cm-line').nth(1).locator('span').evaluateAll(spans => new Set(spans.map(span => getComputedStyle(span).color)).size)).toBeGreaterThan(1);
  expect((await dialog.boundingBox())!.height).toBeLessThan(220);
  await dialog.screenshot({ path: 'test-results/block-source-short-highlighted.png' });
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
  await expectSource(input, 'Before edited');
  await page.getByRole('button', { name: 'Close block source' }).click();
  await expect(page.locator('.pm-document > ol > li').nth(1).locator('ul li')).toHaveText('Child');
  input = await viewSource(page, page.locator('.pm-document > ol > li').nth(1).locator('p').first());
  expect((await input.locator('.cm-line').allTextContents()).join('\n')).toMatch(/^8\. Second\n\s+- Child$/);
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
  await expectSource(page.getByRole('textbox', { name: 'Block Markdown source' }), source);
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
    await expectSource(input, source);
    const rect = (await page.getByRole('dialog', { name: 'Block source', exact: true }).boundingBox())!;
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(390);
    expect(rect.y + rect.height).toBeLessThanOrEqual(844);
    await page.getByRole('dialog', { name: 'Block source', exact: true }).screenshot({ path: `test-results/block-source-${variant}-compact.png` });
    await page.keyboard.press('Escape');
    await expect(input).toHaveCount(0);
  });
}

test('source height grows with lines and long code scrolls inside the dialog', async ({ page, request }) => {
  const short = 'Just one line';
  const medium = '```js\n' + Array.from({ length: 8 }, (_, i) => `const value${i} = ${i};`).join('\n') + '\n```';
  const long = '```js\n' + Array.from({ length: 100 }, (_, i) => `const value${i} = ${i};`).join('\n') + '\n```';
  const response = await request.post('/api/pages', { data: {
    title: 'Source sizing', body: [short, medium, long].join('\n\n'),
    syntax: { version: 1, variant: 'commonmark', extensions: {} },
  } });
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  const dialog = page.getByRole('dialog', { name: 'Block source', exact: true });
  await viewSource(page, page.locator('.pm-document > p').first());
  const shortHeight = (await dialog.boundingBox())!.height;
  expect(shortHeight).toBeLessThan(160);
  await page.keyboard.press('Escape');
  await viewSource(page, page.locator('.pm-document pre').nth(0));
  const mediumHeight = (await dialog.boundingBox())!.height;
  expect(mediumHeight - shortHeight).toBeGreaterThan(150);
  await page.keyboard.press('Escape');
  await viewSource(page, page.locator('.pm-document pre').nth(1));
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.height).toBeGreaterThan(mediumHeight);
  expect(bounds.y + bounds.height).toBeLessThan(1000);
  const scroller = dialog.locator('.cm-scroller');
  expect(await scroller.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await scroller.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(dialog.locator('.cm-lineNumbers .cm-gutterElement').filter({ hasText: /^102$/ })).toBeVisible();
  await dialog.screenshot({ path: 'test-results/block-source-long-highlighted.png' });
  await page.keyboard.press('Escape');
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe([short, medium, long].join('\n\n'));
});
