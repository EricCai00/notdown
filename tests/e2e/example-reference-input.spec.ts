import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

const examples = '(@alpha) First example\n(@beta) Second example\n\nBetween\n\n(@alpha) Repeated example\n(@) Anonymous';
async function open(page: Page, request: APIRequestContext, variant = 'notdown', extensions = {}, tail = 'See') {
  const note = await (await request.post('/api/pages', { data: {
    title: 'Example reference completion', body: examples + '\n\n' + tail,
    bodyFormat: variant === 'markdown' ? 'markdown' : 'notion-markdown', syntax: { version: 1, variant, extensions },
  } })).json();
  await page.addInitScript(() => {
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options) {
      if (typeof options === 'object' && options.block === 'center') (window as any).exampleTarget = this.textContent;
      original.call(this, options);
    };
  });
  await page.goto(`/#page/${note.id}`);
  const editor = page.locator('.pm-document[contenteditable=true]');
  await expect(editor).toBeVisible();
  await editor.locator(':scope > p').last().click();
  await page.keyboard.press('End');
  return { id: note.id, editor, menu: page.getByRole('listbox', { name: 'Example references' }) };
}

for (const variant of ['markdown', 'notdown']) test(`${variant}: (@ offers named examples, keyboard insertion, undo, save and navigation`, async ({ page, request }) => {
  const { id, editor, menu } = await open(page, request, variant);
  await page.keyboard.type(' (@');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('option')).toHaveCount(2);
  await expect(menu.getByRole('option').first()).toContainText('1. First example');
  await expect(menu.getByRole('option').last()).toContainText('@beta');
  await expect(editor).toBeFocused();
  await menu.screenshot({ path: test.info().outputPath('example-reference-menu.png') });
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('option').last()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(editor.locator(':scope > p').last()).toHaveText('See (2)');
  await expect(menu).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(editor.locator(':scope > p').last()).toHaveText('See (@');
  await page.keyboard.type('beta');
  await expect(menu.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(editor.locator(':scope > p').last()).toHaveText('See (2)');
  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await (await request.get(`/api/pages/${id}`)).json()).body).toContain('See (@beta)');
  await page.reload();
  await editor.locator('a[href="#md-example-beta"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).exampleTarget)).toBe('Second example');
  await expect(page.getByText('Linked location not found.', { exact: true })).toHaveCount(0);
});

test('body search and mouse insertion preserve bold formatting and keep paragraph-start references inline', async ({ page, request }) => {
  const { id, editor, menu } = await open(page, request);
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Control+b');
  await page.keyboard.type('(@First example');
  await expect(menu.getByRole('option')).toHaveCount(1);
  await menu.getByRole('option').click();
  await expect(editor.locator(':scope > p').last().locator('strong')).toHaveText('(1)');
  await page.keyboard.press('Control+b');
  await page.keyboard.type(' starts this sentence.');
  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await (await request.get(`/api/pages/${id}`)).json()).body).toContain('@alpha');
  await page.reload();
  await expect(editor.locator(':scope > p').last()).toHaveText('(1) starts this sentence.');
  await expect(editor.locator('li[data-example-label]')).toHaveCount(4);
});

test('Escape, no matches, outside clicks and narrow-screen positioning', async ({ page, request }) => {
  const { editor, menu } = await open(page, request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.type(' (@');
  await expect(menu).toBeVisible();
  const rect = (await menu.boundingBox())!;
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(390);
  expect(rect.y + rect.height).toBeLessThanOrEqual(844);
  await page.keyboard.press('Escape');
  await page.keyboard.type('beta');
  await expect(menu).toHaveCount(0);
  await page.keyboard.type(') (@missing');
  await expect(menu).toContainText('No matching examples');
  await expect(menu.getByRole('option')).toHaveCount(0);
  await page.locator('#page-title').click();
  await expect(menu).toHaveCount(0);
  await expect(editor.locator(':scope > p').last()).toHaveText('See (@beta) (@missing');
});

for (const [variant, extensions] of [['notdown', { example_lists: false }], ['notion-markdown', { example_lists: true }]] as const)
  test(`${variant} ${JSON.stringify(extensions)} does not offer unavailable example syntax`, async ({ page, request }) => {
    const { menu } = await open(page, request, variant, extensions);
    await page.keyboard.type(' (@');
    await expect(menu).toHaveCount(0);
  });

test('code marks and escaped parentheses keep the input literal', async ({ page, request }) => {
  const { menu } = await open(page, request, 'notdown', {}, '`Code`');
  await page.keyboard.type(' (@alpha');
  await expect(menu).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.keyboard.type('\\(@beta');
  await expect(menu).toHaveCount(0);
});
