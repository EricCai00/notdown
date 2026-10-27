import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

async function open(page: Page, request: APIRequestContext, body: string, variant = "notdown") {
  const response = await request.post("/api/pages", { data: { title: "Inline context actions", body, bodyFormat: variant === "notdown" ? "notion-markdown" : "markdown", syntax: { version: 1, variant, extensions: {} } } });
  expect(response.status()).toBe(201); const note = await response.json();
  await page.goto(`/#page/${note.id}`); await expect(page.locator(".pm-document")).toBeVisible(); return note;
}
const menu = (page: Page) => page.locator('.pm-inline-context-menu');
const preview = (page: Page) => page.getByRole("dialog", { name: "Inline source", exact: true });
const codeText = (page: Page, label: string) => preview(page).getByRole("textbox", { name: label, exact: true }).locator(".cm-line").allTextContents();

test("styles stay outside the inline menu; styled links target the whole link and preserve formatting", async ({ page, request }) => {
  const note = await open(page, request, '**Bold** *Italic* ==Highlight== ~sub~ ^sup^ <span color="red" underline="true">Colored</span>\n\nBefore [**One** and *two*](https://example.com/a) | [Other](https://example.com/b) after');
  for (const selector of ["strong", "em", "mark", "sub", "sup", '[data-text-color="red"]', 'u']) {
    await page.locator(`.pm-document > p:first-child ${selector}`).click({ button: "right" }); await expect(menu(page)).toHaveCount(0);
  }
  const link = page.locator('.pm-document a[href="https://example.com/a"]');
  await link.locator("em").click({ button: "right" });
  await expect(menu(page).locator('.pm-inline-context-heading')).toHaveText("Link");
  await menu(page).getByRole("menuitem", { name: "View source", exact: true }).click();
  await expect.poll(() => codeText(page, "Inline Markdown source")).toEqual(['[**One** and *two*](https://example.com/a)']);
  await expect.poll(() => codeText(page, "Reference source")).toEqual(['https://example.com/a']);
  await preview(page).getByRole("button", { name: "Close inline source" }).click();
  await link.click({ button: "right" }); await menu(page).getByRole("menuitem", { name: "Remove link", exact: true }).click();
  await expect(link).toHaveCount(0); await expect(page.locator('.pm-document strong').last()).toHaveText('One');
  await expect(page.locator('.pm-document a[href="https://example.com/b"]')).toHaveText('Other');
  await page.keyboard.press("Control+z"); await expect(link).toBeVisible();
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain('[**One** and *two*](https://example.com/a)');
});

test("equation menus hit deep rendered content, edit and convert one atom, undo and persist", async ({ page, request }) => {
  const note = await open(page, request, 'Before $a$ and **$b^2$** after');
  const maths = page.locator('.pm-inline-math');
  await maths.nth(1).locator('.katex-html').click({ button: "right" });
  await expect(menu(page).locator('.pm-inline-context-heading')).toHaveText('Inline math');
  await page.screenshot({ path: 'test-results/inline-context-menu.png' });
  await menu(page).getByRole("menuitem", { name: "Edit equation", exact: true }).click();
  await page.getByRole("textbox", { name: "Equation content" }).fill('c^3');
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await maths.nth(1).click({ button: 'right' }); await menu(page).getByRole("menuitem", { name: "Turn into", exact: true }).click();
  await menu(page).getByRole("menuitem", { name: "Inline code", exact: true }).click();
  await expect(maths).toHaveCount(1); await expect(page.locator('.pm-document strong code')).toHaveText('c^3');
  await page.keyboard.press('Control+z'); await expect(maths).toHaveCount(2);
  await page.keyboard.press('Control+Shift+z'); await expect(maths).toHaveCount(1);
  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe('Before $a$ and **`c^3`** after');
  await page.reload(); await expect(page.locator('.pm-document strong code')).toHaveText('c^3');
});

test("reference source separates exact link and image references from their definitions", async ({ page, request, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const body = '[Label][ref] and ![small][img]\n\n[ref]: https://example.com "Title"\n\n[img]: /assets/small.png\n\n[unused]: https://unused.example';
  const note = await open(page, request, body, 'commonmark');
  for (const [selector, syntax, definition] of [
    ['.pm-document a[href="https://example.com"]', '[Label][ref]', '[ref]: https://example.com "Title"'],
    ['.pm-document img[alt="small"]', '![small][img]', '[img]: /assets/small.png'],
  ]) {
    await page.locator(selector).click({ button: 'right' }); await menu(page).getByRole('menuitem', { name: 'View source', exact: true }).click();
    await expect(preview(page).getByRole('heading', { name: 'Inline reference', exact: true })).toBeVisible();
    await expect.poll(() => codeText(page, 'Inline Markdown source')).toEqual([syntax]);
    await expect.poll(() => codeText(page, 'Reference source')).toEqual([definition]);
    await preview(page).getByRole('button', { name: 'Copy source', exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(syntax);
    await preview(page).getByRole('button', { name: 'Copy reference source', exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(definition);
    await page.screenshot({ path: 'test-results/inline-reference-source.png' });
    await page.keyboard.press('Escape'); await expect(preview(page)).toHaveCount(0);
    await page.locator(selector).click({ button: 'right' }); await menu(page).getByRole('menuitem', { name: 'Copy source', exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(syntax);
  }
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
});

test("citations and footnotes show their own source; revisions have accept and reject actions", async ({ page, request }) => {
  await open(page, request, 'Refs [#book] [^note] and **{~~old~>new~~}**\n\n[#book]: Jane Doe. Book.\n\n[^note]: Footnote body');
  for (const [selector, source] of [['.md-mmd-citation', '[#book]: Jane Doe. Book.'], ['.pm-footnote-ref', '[^note]: Footnote body']]) {
    await page.locator(selector).first().click({ button: 'right' }); await menu(page).getByRole('menuitem', { name: 'View source', exact: true }).click();
    await expect(preview(page).getByRole('textbox', { name: 'Reference source', exact: true })).toContainText(source);
    await page.keyboard.press('Escape');
  }
  await page.locator('.pm-critic-new').click({ button: 'right' });
  await expect(menu(page).locator('.pm-inline-context-heading')).toHaveText('Substitution');
  await menu(page).getByRole('menuitem', { name: 'Reject revision', exact: true }).click();
  await expect(page.locator('.pm-document strong')).toHaveText('old');
  await page.keyboard.press('Control+z'); await expect(page.locator('.pm-critic-new')).toHaveText('new');
});

test("menu clamps to the viewport, supports keys, and respects dialect conversion limits", async ({ page, request }) => {
  await page.setViewportSize({ width: 740, height: 560 });
  await open(page, request, 'Before `inline` after', 'commonmark');
  const code = page.locator('.pm-document code'); await code.click({ button: 'right' });
  const box = await menu(page).boundingBox(); expect(box!.x + box!.width).toBeLessThanOrEqual(733); expect(box!.y + box!.height).toBeLessThanOrEqual(553);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight');
  await expect(menu(page).getByRole('menuitem', { name: 'Plain text', exact: true })).toBeVisible();
  await expect(menu(page).getByRole('menuitem', { name: 'Inline equation', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(menu(page)).toHaveCount(0);
  await code.click(); await page.keyboard.press('Shift+F10'); await expect(menu(page)).toBeVisible();
  await page.locator('#page-title').click(); await expect(menu(page)).toHaveCount(0);
});

test("inline source editing refuses blocks, preserves neighbors and prevents stale submissions", async ({ page, request }) => {
  await open(page, request, 'Before $a$ after');
  const math = page.locator('.pm-inline-math'); await math.click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: 'Edit source', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Edit inline source' });
  await panel.getByRole('textbox', { name: 'Inline source', exact: true }).fill('# Heading');
  await panel.getByRole('button', { name: 'Save', exact: true }).click(); await expect(panel.locator('output')).toContainText('inline content only');
  await panel.getByRole('textbox', { name: 'Inline source', exact: true }).fill('$b$');
  await page.locator('.pm-document > p').click({ position: { x: 3, y: 5 } }); await page.keyboard.type('changed ');
  await panel.getByRole('button', { name: 'Save', exact: true }).click(); await expect(panel.locator('output')).toContainText('Content changed');
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
  await math.click({ button: 'right' }); await menu(page).getByRole('menuitem', { name: 'Edit source', exact: true }).click();
  await panel.getByRole('textbox', { name: 'Inline source', exact: true }).fill('$b$'); await panel.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.pm-document')).toContainText('Before'); await expect(page.locator('.pm-document')).toContainText('after'); await expect(math.locator('annotation')).toHaveText('b');
});

test("page references show their destination and date menus reuse the date editor", async ({ page, request }) => {
  const response = await request.post('/api/pages', { data: { title: 'Linked destination', body: 'Target content' } }); const destination = await response.json();
  await open(page, request, `Before [[${destination.id}|Target]] and <mention-date start="2030-01-15"/> after`);
  const link = page.locator('.pm-document .page-mention');
  await link.click({ button: 'right' }); await menu(page).getByRole('menuitem', { name: 'View source', exact: true }).click();
  await expect(preview(page).getByRole('textbox', { name: 'Reference source', exact: true })).toContainText('Page: Linked destination');
  await page.keyboard.press('Escape');
  await page.locator('.pm-date-mention').click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: 'Edit date', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Edit date', exact: true });
  await expect(panel.getByRole('textbox', { name: 'Start date', exact: true })).toHaveValue('2030-01-15');
  await panel.getByRole('button', { name: 'Done', exact: true }).click();
  await link.click({ button: 'right' }); await menu(page).getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(link).toHaveCount(0); await expect(page.locator('.pm-date-mention')).toBeVisible();
  await page.keyboard.press('Control+z'); await expect(link).toBeVisible();
});
