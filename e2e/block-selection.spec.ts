import { test, expect, type Page, type APIRequestContext, type Locator } from "@playwright/test";

const syntax = { version: 1, variant: "notdown", extensions: {
  notion_tabs: true, notion_breadcrumb: true, notion_button: true, notion_bookmark: true,
} };
const source = [
  '<breadcrumb/>',
  '<details>\n<summary>Toggle heading</summary>\nToggle body\n</details>',
  '<page role="child" url="https://example.com/child">Child page</page>',
  '<page url="https://example.com/link">Link to page</page>',
  '- [ ] Task row\n- Bullet row\n- Parent row\n  - Nested child',
  '1. Numbered row',
  '<callout icon="💡" color="gray_bg">\nCallout first\n\nCallout last\n</callout>',
  '> Quote first\n>\n> Quote last',
  '<tabs>\n<tab title="First">\nActive tab\n</tab>\n<tab title="Second">\nHidden tab\n</tab>\n</tabs>',
  '<bookmark url="https://example.com" title="Bookmark" description="Description"/>',
  '<button label="Button" action="insert-text" target="New note"/>',
  '<columns>\n<column>\nLeft column\n</column>\n<column>\nRight column\n</column>\n</columns>',
  '| Table | Header |\n| --- | --- |\n| Cell | Value |',
  '```text\nCode block\n```',
  '$$\nx^2\n$$',
  '<synced_block>\nSynced first\n\nSynced last\n</synced_block>',
  '<file src="https://example.com/sample.pdf">Sample file</file>',
  '<unknown alt="Preserved content"/>',
  '---',
  'Tail paragraph',
].join('\n\n');

async function open(page: Page, request: APIRequestContext, body = source) {
  await page.setViewportSize({ width: 1440, height: 3000 });
  const response = await request.post('/api/pages', { data: { title: 'Block selection coverage', body, bodyFormat: 'notion-markdown', syntax } });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator('#page-title')).toHaveValue(note.title);
  return note;
}

async function selectBand(page: Page, row: Locator, y: number, height = 4) {
  const editor = (await page.locator('.pm-document').boundingBox())!;
  const rect = (await row.boundingBox())!;
  await page.mouse.move(editor.x - 65, rect.y + y);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + y + height, { steps: 12 });
  await page.mouse.up();
}

async function expectSelectionBounds(page: Page) {
  const diffs = await page.evaluate(() => {
    const selected = [...document.querySelectorAll<HTMLElement>('.pm-document .pm-block-selected')];
    const frames = [...document.querySelectorAll<HTMLElement>('.pm-block-highlight')];
    return selected.map((node, i) => {
      const block = node.getBoundingClientRect(), frame = frames[i]?.getBoundingClientRect();
      const left = node.tagName === 'LI' ? node.parentElement!.getBoundingClientRect().left : block.left;
      const height = node.tagName === 'HR' ? Math.max(12, block.height) : block.height;
      const top = block.top - (height - block.height) / 2;
      return frame ? Math.max(Math.abs(frame.left - left), Math.abs(frame.right - block.right), Math.abs(frame.top - top), Math.abs(frame.height - height)) : Infinity;
    });
  });
  expect(diffs.length).toBeGreaterThan(0);
  for (const difference of diffs) expect(difference).toBeLessThan(1);
}

test('every visible block gets a full blue overlay, including node views, list markers and container backgrounds', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const note = await open(page, request);
  const editor = page.locator('.pm-document');
  const rows = editor.locator(':scope > :not(ul):not(ol), :scope > ul > li, :scope > ol > li');
  const count = await rows.count();
  expect(count).toBeGreaterThan(20);
  const first = (await rows.first().boundingBox())!, last = (await rows.last().boundingBox())!;
  await page.mouse.move(first.x - 65, first.y + 1);
  await page.mouse.down();
  // Repeated updates used to erase earlier node-view selection classes.
  await page.mouse.move(last.x + 200, last.y + last.height - 1, { steps: 35 });
  await page.mouse.up();
  await expect(editor.locator('.pm-block-selected')).toHaveCount(count);
  await expect(page.locator('.pm-block-highlight')).toHaveCount(count);
  await expect(page.locator('.pm-block-highlight').first()).toHaveCSS('background-color', 'rgba(46, 116, 216, 0.13)');
  await expect(editor.locator('.child-page-node.pm-block-selected')).toHaveCount(2);
  await expect(editor.locator('.pm-callout.pm-block-selected')).toHaveCount(1);
  await expect(editor.locator('.note-columns.pm-block-selected')).toHaveCount(1);
  await expectSelectionBounds(page);
  await page.screenshot({ path: 'test-results/block-selection-all.png', fullPage: true });
  const columns = (await editor.locator('.note-columns').boundingBox())!;
  await page.screenshot({ path: 'test-results/block-selection-preview.png', clip: {
    x: first.x - 6, y: first.y - 6, width: first.width + 12, height: columns.y + columns.height - first.y + 12,
  } });
  await page.setViewportSize({ width: 1100, height: 3000 });
  await expect.poll(async () => {
    try { await expectSelectionBounds(page); return true; } catch { return false; }
  }).toBe(true);
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(source);
  await page.keyboard.press('Delete');
  await expect(page.locator('.pm-block-highlight')).toHaveCount(0);
  await expect(editor).not.toContainText('Callout first');
  await page.keyboard.press('Control+z');
  await expect(editor).toContainText('Callout first');
  await expect(rows).toHaveCount(count);
  expect(errors).toEqual([]);
});

test('the bottom of a container selects the whole block; nested list children remain independent', async ({ page, request }) => {
  await open(page, request);
  for (const selector of ['.pm-callout', 'blockquote', '.pm-object-tabs', '.note-columns', '.pm-table', '.pm-object-synced_block']) {
    const row = page.locator('.pm-document').locator(selector).first();
    const rect = (await row.boundingBox())!;
    await selectBand(page, row, rect.height - 6);
    await expect(row).toHaveClass(/pm-block-selected/);
    await expect(page.locator('.pm-block-highlight')).toHaveCount(1);
    await expectSelectionBounds(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('.pm-block-highlight')).toHaveCount(0);
  }
  const child = page.locator('.pm-document li').filter({ has: page.locator('p', { hasText: /^Nested child$/ }) }).last();
  await selectBand(page, child, 2);
  await expect(child).toHaveClass(/pm-block-selected/);
  await expect(page.locator('.pm-document .pm-block-selected')).toHaveCount(1);
  await expectSelectionBounds(page);
  await page.keyboard.press('Delete');
  await expect(page.locator('.pm-document')).not.toContainText('Nested child');
  await expect(page.locator('.pm-document')).toContainText('Parent row');
  await page.keyboard.press('Control+z');
  await expect(page.locator('.pm-document')).toContainText('Nested child');
});

test('closed toggles and blank blocks have visible selection bounds and Escape leaves source untouched', async ({ page, request }) => {
  const note = await open(page, request, '<details open="false">\n<summary>Closed toggle</summary>\nHidden child\n</details>\n\nTail');
  const toggle = page.locator('.pm-toggle');
  await expect(toggle).toHaveClass(/pm-toggle-closed/);
  await selectBand(page, toggle, 1);
  await expectSelectionBounds(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.pm-block-highlight')).toHaveCount(0);
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(note.body);
  const tail = page.locator('.pm-document > p').last();
  await tail.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  const blank = page.locator('.pm-document > p').last();
  await selectBand(page, blank, 1);
  await expect(blank).toHaveClass(/pm-block-selected/);
  await expectSelectionBounds(page);
});
