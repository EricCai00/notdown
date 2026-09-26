import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

async function create(request: APIRequestContext, title: string, body: string, variant = "notdown") {
  const response = await request.post("/api/pages", { data: { title, body, bodyFormat: ["notdown", "notion-markdown"].includes(variant) ? "notion-markdown" : "markdown", syntax: { version: 1, variant, extensions: {} } } });
  expect(response.status()).toBe(201);
  return response.json();
}
async function open(page: Page, id: string) {
  await page.goto(`/#page/${id}`);
  await expect(page.locator(".pm-document")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options) {
      if (typeof options === "object" && options.block === "center")
        (window as any).referenceScroll = this.getAttribute("data-md-id") || this.textContent;
      original.call(this, options);
    };
  });
});
async function expectScroll(page: Page, text: string) {
  await expect.poll(() => page.evaluate(() => (window as any).referenceScroll || "")).toContain(text);
}

test('inserting new examples twice assigns unused labels and consecutive new numbers', async ({ page, request }) => {
  const note = await create(request, 'New example labels', '(@example) First\n(@s) Second\n(@d) Third\n\nTail');
  await open(page, note.id);
  const editor = page.locator('.pm-document');
  for (const label of ['example-2', 'example-3']) {
    await editor.locator(':scope > p').filter({ hasText: /^Tail$/ }).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/example');
    await page.locator('[data-insert="example_list_item"]').click();
    await expect(editor.locator(`li[data-example-label="${label}"]`)).toHaveCount(1);
  }
  const rows = editor.locator('li[data-example-label]');
  await expect(rows).toHaveCount(5);
  await expect.poll(() => rows.evaluateAll(nodes => nodes.map(node => (node as HTMLLIElement).value))).toEqual([1, 2, 3, 4, 5]);
  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain('(@example-3) Example text');
  await page.reload();
  await expect.poll(() => rows.evaluateAll(nodes => nodes.map(node => (node as HTMLLIElement).value))).toEqual([1, 2, 3, 4, 5]);
});

for (const variant of ["markdown", "notdown"]) test(`${variant}: clicking example references finds the first label and follows deletion across reload`, async ({ page, request }) => {
  const body = '(@foo) Original example\n(@bar) Another example\n\nBetween\n\n(@foo) Repeated example\n\nSee (@foo) and (@bar).';
  const note = await create(request, 'Example navigation', body, variant);
  await open(page, note.id);
  const editor = page.locator('.pm-document');
  const foo = editor.locator('a[href="#md-example-foo"]');
  await foo.click();
  await expectScroll(page, 'Original example');
  await editor.locator('a[href="#md-example-bar"]').click();
  await expectScroll(page, 'Another example');
  await expect(page.getByText('Linked location not found.', { exact: true })).toHaveCount(0);

  const row = editor.locator('li[data-example-label="foo"]').first();
  const rect = (await row.boundingBox())!, bounds = (await editor.boundingBox())!;
  await page.mouse.move(bounds.x - 65, rect.y + 8);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + 12, { steps: 12 });
  await page.mouse.up();
  await expect(row).toHaveClass(/pm-block-selected/);
  await page.keyboard.press('Delete');
  await expect(editor.locator('li[data-example-label="foo"]')).toHaveCount(1);
  await foo.click();
  await expectScroll(page, 'Repeated example');
  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).not.toContain('Original example');
  await page.reload();
  await foo.click();
  await expectScroll(page, 'Repeated example');
  await expect(page.getByText('Linked location not found.', { exact: true })).toHaveCount(0);
});

test("Wiki page and cross-page heading/block links keep custom labels and navigate", async ({ page, request }) => {
  const target = await create(request, "Reference destination", "## Details\n\nParagraph target ^para\n\n- List line ^item", "obsidian");
  const source = await create(request, "Reference source", `[[${target.id}]] [[${target.id}#Details|Section alias]] [[${target.id}#^item|List alias]]`);
  await open(page, source.id);
  await expect(page.locator('[data-reference-kind="page"] .page-link-label')).toHaveText("Reference destination");
  await expect(page.locator('[data-reference-kind="location"]')).toHaveCount(2);
  await page.getByRole("link", { name: "Section alias", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(target.id));
  await expectScroll(page, "details");
  await expect(page).toHaveURL(new RegExp(`${target.id}#Details$`));
  await page.reload();
  await expectScroll(page, "details");
  await open(page, source.id);
  await page.getByRole("link", { name: "List alias", exact: true }).click();
  await expectScroll(page, "List line");
});

test("Typora Markdown location links preserve cross-page fragments and HTML anchors", async ({ page, request }) => {
  const target = await create(request, "Typora destination", '## Details\n\n<a id="custom"></a> Anchor destination', "typora");
  const source = await create(request, "Typora source", "[To heading](Typora%20destination.md#details) [To anchor](Typora%20destination.md#custom)", "typora");
  await open(page, source.id);
  await page.getByRole("link", { name: "To heading", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(target.id));
  await expectScroll(page, "details");
  await open(page, source.id);
  await page.getByRole("link", { name: "To anchor", exact: true }).click();
  await expectScroll(page, "custom");
});

test("slash menu separates page/location insertion and saves the chosen cross-page block", async ({ page, request }) => {
  const target = await create(request, "Picker destination", "## Details\n\n- Pick this line ^pick", "obsidian");
  const source = await create(request, "Picker source", "Start");
  await open(page, source.id);
  const paragraph = page.locator(".pm-document > p").first();
  await paragraph.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/");
  await expect(page.locator('[data-insert="page_link"]')).toHaveText(/Page link/);
  await expect(page.locator('[data-insert="location_link"]')).toHaveText(/Location link/);
  await expect(page.locator('[data-insert="mention"]')).toHaveCount(0);
  await page.locator('[data-insert="location_link"]').click();
  await page.getByLabel("Reference page", { exact: true }).selectOption(target.id);
  await page.getByLabel("Reference display text").fill("Selected line");
  await page.getByLabel("Find location").fill("pick");
  await page.locator('[data-location-index]').filter({ hasText: "Pick this line" }).click();
  await expect(page.getByRole("link", { name: "Selected line", exact: true })).toBeVisible();
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${source.id}`)).json()).body).toContain(`#^pick|Selected line]]`);
  await page.reload();
  await page.getByRole("link", { name: "Selected line", exact: true }).click();
  await expectScroll(page, "Pick this line");
});

test("Block Explorer unifies mention, Wiki and Markdown references", async ({ page }) => {
  await page.goto("/block-catalog.html#tab=blocks&id=inline.internal_link");
  await expect(page.getByText("Mention page or data source", { exact: true })).toHaveCount(0);
  await expect(page.locator("body")).toContainText("Internal link");
  await expect(page.locator("body")).toContainText("Unified page and location references");
});

test("page insertion falls back to Markdown in Typora and survives reload", async ({ page, request }) => {
  const target = await create(request, "Page picker target", "Body", "typora");
  const source = await create(request, "Page picker source", "Start", "typora");
  await open(page, source.id);
  await page.locator(".pm-document > p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/");
  await page.locator('[data-insert="page_link"]').click();
  await page.getByLabel("Reference page", { exact: true }).selectOption(target.id);
  await page.getByLabel("Reference display text").fill("Page alias");
  await page.getByRole("button", { name: "Insert page link", exact: true }).click();
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${source.id}`)).json()).body).toContain(`[Page alias](#page/${target.id})`);
  await page.reload();
  await page.getByRole("link", { name: "Page alias", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(target.id));
});

test("Notion Wiki input resolves a named page before writing an official location link", async ({ page, request }) => {
  const target = await create(request, "Shortcut target", "## Details", "typora");
  const source = await create(request, "Shortcut source", "Start", "notion-markdown");
  await open(page, source.id);
  await page.locator(".pm-document > p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" [[Shortcut target#Details|Typed location]]");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${source.id}`)).json()).body).toContain(`[Typed location](#page/${target.id}#Details)`);
  await page.reload();
  await page.getByRole("link", { name: "Typed location", exact: true }).click();
  await expectScroll(page, "details");
});
