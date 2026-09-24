import { test, expect } from "@playwright/test";

test("cleaned objects have direct catalog routes and no Existing content section", async ({ page }) => {
  await page.goto("/block-catalog.html#tab=compatibility&id=inline.inline_html");
  await expect(page.getByRole("button", { name: "Existing content", exact: true })).toHaveCount(0);
  await expect(page.locator('[data-tab="blocks"]')).toHaveAttribute("aria-pressed", "true");
  const detail = page.locator(".catalog-detail");
  await expect(detail.locator(":scope > h2")).toHaveText("Inline HTML");
  await expect(detail.locator(".catalog-source")).toContainText("{=html}");
  await expect(detail.locator('.catalog-preview .pm-html-inline')).toBeVisible();
  await detail.locator('.catalog-links a[data-extension="raw_attribute"]').click();
  await detail.locator('a[data-object="inline.inline_html"]').click();
  await expect(detail.locator(":scope > h2")).toHaveText("Inline HTML");
  const search = page.getByRole("searchbox", { name: "Search catalog" });
  for (const removed of ["Mention agent", "Inline media", "date ot reminder", "Inline raw source"]) {
    await search.fill(removed);
    await expect(page.locator("[data-entry]")).toHaveCount(0);
  }
  await search.fill("inline file transclusion");
  await expect(detail.locator(":scope > h2")).toHaveText("File transclusion");
  await expect(detail).toContainText("block/inline inclusion");
  await expect(detail.locator('a[href*="src/transclude.c"]')).toBeVisible();
  await detail.locator('.catalog-links a[data-extension="transclusion"]').click();
  await detail.locator('a[data-object="block.file_transclusion"]').click();
  await expect(detail.locator(":scope > h2")).toHaveText("File transclusion");
  await page.reload();
  await expect(detail.locator(":scope > h2")).toHaveText("File transclusion");
});

test("Block Explorer browses registered blocks, previews, variants and extension defaults", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/block-catalog.html");
  await expect(
    page.getByRole("heading", { name: "Block Explorer" }),
  ).toBeVisible();
  await expect(page.locator("[data-entry]")).toHaveCount(78);
  await expect(page.locator('[data-entry="block.raw_tex"]')).toHaveCount(0);
  await expect(page.locator(".catalog-preview .pm-document")).toContainText(
    "A paragraph",
  );
  await page
    .getByRole("button", { name: "Child structures", exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "Search catalog" })
    .fill("Table cell");
  await expect(page.locator("[data-entry]")).toHaveCount(1);
  await expect(page.locator('.catalog-detail a[data-object="block.table"]')).toBeVisible();
  await page.locator('.catalog-detail a[data-object="block.table"]').click();
  await expect(page.locator('.catalog-detail > h2')).toHaveText('Table');
  await page
    .getByRole("button", { name: "Markdown variants", exact: true })
    .click();
  await expect(page.locator("[data-dialect]")).toHaveCount(13);
  await page.locator('[data-dialect="notion-markdown"]').click();
  await expect(
    page.getByRole("combobox", { name: "Catalog dialect" }),
  ).toHaveValue("notion-markdown");
  expect(
    await page
      .locator(".catalog-results article:not(.catalog-pending)")
      .count(),
  ).toBeGreaterThan(50);
  await page.getByRole("searchbox").fill("definition_lists");
  await expect(page.locator(".catalog-results")).toContainText(
    "Not applicable",
  );
  await page
    .getByRole("combobox", { name: "Catalog dialect" })
    .selectOption("markdown");
  await expect(page.locator(".catalog-results")).toContainText(
    "Enabled by default",
  );
  await page.getByRole("searchbox").fill("grid_tables");
  await expect(page.locator(".catalog-results")).toContainText(
    "Enabled by default",
  );
  await page
    .getByRole("button", { name: "Content objects", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/block-explorer.png",
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test("content objects expose aliases, dialect capabilities and planned boundaries", async ({
  page,
}) => {
  await page.goto("/block-catalog.html");
  const search = page.getByRole("searchbox", { name: "Search catalog" });
  await search.fill('MultiMarkdown title block');
  await expect(page.locator('.catalog-detail > h2')).toHaveText('YAML front matter');
  await expect(page.locator('.catalog-detail')).toContainText('not full YAML');
  await expect(page.locator('.catalog-detail a[href$="metadata.html"]')).toBeVisible();
  for (const [alias, label] of [
    ["Alerts and callouts", "Callout"],
    ["Div containers", "Native div"],
    ["Heading 3", "Heading"],
  ]) {
    await search.fill(alias);
    await expect(page.locator("[data-entry]")).toHaveCount(1);
    await expect(page.locator(".catalog-detail > h2")).toHaveText(label);
  }
  await search.fill("admonition");
  await expect(page.locator("[data-entry]")).toHaveCount(1);
  await expect(page.locator(".catalog-detail > h2")).toHaveText("Callout");
  await expect(page.locator(".catalog-detail")).toContainText("Direct editing");
  await search.fill("tabs");
  await expect(page.locator(".catalog-detail")).toContainText("implemented · P3");
  await expect(page.locator(".catalog-preview").getByRole("tab", { name: "First", exact: true })).toBeVisible();
  await search.fill("date ot reminder");
  await expect(page.locator("[data-entry]")).toHaveCount(0);
  await search.fill("date or reminder");
  await expect(page.locator(".catalog-detail > h2")).toHaveText(
    "Date or reminder",
  );
  await expect(page.locator(".catalog-detail")).toContainText(
    "while the app is open",
  );
  await search.fill("");
  await page
    .getByRole("combobox", { name: "Block category" })
    .selectOption("character");
  await expect(page.locator("[data-entry]")).toHaveCount(4);
});

test("catalog cross-links work in all six directions and survive history and reload", async ({
  page,
}) => {
  await page.goto("/block-catalog.html");
  const detail = page.locator(".catalog-detail");
  const title = detail.locator(":scope > h2");
  await page.getByRole("searchbox").fill("admonition");
  await expect(title).toHaveText("Callout");
  // Object -> extension -> object.
  await detail.locator('.catalog-links a[data-extension="alerts"]').click();
  await expect(title).toHaveText("Alerts and callouts");
  await expect(detail).toContainText("Pandoc manual");
  await detail.locator('a[data-object="block.callout"]').click();
  await expect(title).toHaveText("Callout");
  // Object -> variant -> object.
  await detail.locator(".catalog-variant-links summary").click();
  await detail
    .locator('.catalog-variant-links a[data-variant="notion-markdown"]')
    .click();
  await expect(title).toHaveText("Notion-flavored Markdown");
  await detail.locator('a[data-object="block.callout"]').click();
  await expect(title).toHaveText("Callout");
  // Extension -> variant -> extension.
  await detail
    .locator('.catalog-links a[data-extension="notion_callouts"]')
    .click();
  await expect(title).toHaveText("Notion callout tags");
  await expect(detail).toContainText("notion_callouts");
  await expect(detail.getByRole("link", { name: "Notion enhanced Markdown ↗", exact: true })).toHaveAttribute(
    "href",
    /enhanced-markdown#callout$/,
  );
  await detail.locator('a[data-variant="notion-markdown"]').click();
  await expect(title).toHaveText("Notion-flavored Markdown");
  await detail.locator('a[data-extension="notion_callouts"]').click();
  await expect(title).toHaveText("Notion callout tags");
  await page.reload();
  await expect(title).toHaveText("Notion callout tags");
  await page.goBack();
  await expect(title).toHaveText("Notion-flavored Markdown");
  await page.goForward();
  await expect(title).toHaveText("Notion callout tags");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "test-results/catalog-relations.png",
    fullPage: false,
  });
});

test("extension source filters, reference-only syntax and filtered return paths stay accurate", async ({
  page,
}) => {
  await page.goto(
    "/block-catalog.html#tab=extensions&id=notion_underline&variant=typora",
  );
  const detail = page.locator(".catalog-detail");
  await page
    .getByRole("combobox", { name: "Extension source" })
    .selectOption("notion");
  await expect(page.locator(".catalog-results article")).toHaveCount(22);
  await page.getByRole("searchbox").fill("notion_underline");
  await expect(page.locator(".catalog-results article")).toHaveCount(1);
  await expect(detail.locator(":scope > h2")).toHaveText(
    "Notion underline",
  );
  await detail.locator('a[data-object="inline.underline"]').click();
  await expect(detail.locator(":scope > h2")).toHaveText("Underline");
  await page.goBack();
  await expect(page.getByRole("searchbox")).toHaveValue("notion_underline");
  await expect(
    page.getByRole("combobox", { name: "Extension source" }),
  ).toHaveValue("notion");
  await page
    .getByRole("combobox", { name: "Extension source" })
    .selectOption("");
  await page.getByRole("searchbox").fill("grid_tables");
  await expect(detail).toContainText("Disabled by default · optional");
  await expect(detail).toContainText("Encoding adapter");
  await detail.locator('a[data-object="block.table"]').click();
  await expect(detail.locator('.catalog-links a[data-extension="grid_tables"]').first()).toBeVisible();
  await page.goto("/block-catalog.html#tab=extensions&id=amuse");
  await expect(detail).toContainText("Outside Markdown scope");
  await page.goto("/block-catalog.html#tab=extensions&id=notion_databases");
  await expect(detail.locator('a[data-object="block.database_reference"]')).toHaveCount(0);
  await detail.locator('a[data-object="block.unsupported"]').click();
  await expect(page.locator('[data-tab="blocks"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(detail.locator(":scope > h2")).toHaveText("Unsupported");
});
