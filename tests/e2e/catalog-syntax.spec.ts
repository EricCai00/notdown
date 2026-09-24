import { test, expect } from "@playwright/test";

test("syntax examples retain workbook text and navigate between extensions and objects", async ({ page }) => {
  await page.goto("/block-catalog.html#tab=extensions&id=mmd_citations&variant=markdown_mmd");
  const entry = page.locator('[data-syntax-id="workbook-extended-36"]');
  await entry.locator("summary").click();
  await expect(entry.locator("pre")).toContainText("[#Doe:2006]");
  await expect(entry.locator("pre")).toContainText("[#Doe2006]:");
  await expect(entry).toContainText("不一致");
  await entry.locator('[data-syntax-object="inline.citation"]').click();
  await expect(page.locator('.catalog-detail > h2')).toHaveText("Citation");
  await expect(page.locator('[data-syntax-id="workbook-extended-36"] pre')).toContainText("[#Doe2006]:");
  await page.reload();
  await expect(page.locator('[data-syntax-id="workbook-extended-36"]')).toHaveCount(1);
  await expect(page.locator('.catalog-detail > .catalog-source')).toContainText("[#paper]");
  // Both citation and heading now have working examples.
  await page.goto("/block-catalog.html#tab=blocks&id=block.heading&variant=commonmark");
  await expect(page.locator('.catalog-detail > .catalog-source')).not.toBeEmpty();
  await expect(page.locator('[data-syntax-id="workbook-markdown-6"] pre')).toHaveText("# header 1");
  await page.locator('[data-syntax-id="workbook-markdown-6"] summary').click();
  await page.screenshot({ path: "test-results/catalog-syntax-desktop.png" });
});

test("variant guides expose corrections and scope; source snippets never execute", async ({ page }) => {
  const remote: string[] = [];
  page.on("request", request => { if (!request.url().startsWith("http://127.0.0.1:") && /^https?:/.test(request.url())) remote.push(request.url()); });
  await page.goto("/block-catalog.html#tab=dialects&id=notion-markdown&variant=notion-markdown");
  const toggle = page.locator('[data-syntax-id="workbook-extended-78"]');
  await toggle.locator("summary").click();
  await expect(toggle).toContainText("PHP Extra");
  await expect(toggle.locator("pre")).toHaveText('# heading {toggle="true"}');
  await page.goto("/block-catalog.html#tab=extensions&id=html_embed&variant=typora");
  const embed = page.locator('[data-syntax-id="workbook-extended-12"]');
  await embed.locator("summary").click();
  await expect(embed.locator("pre")).toContainText("<iframe");
  await expect(page.locator(".catalog-syntax iframe")).toHaveCount(0);
  expect(remote).toEqual([]);
  await page.goto("/block-catalog.html#tab=extensions&id=empty_paragraphs");
  await page.locator('[data-syntax-id="pandoc-empty_paragraphs"] summary').click();
  await expect(page.locator('.catalog-syntax')).toContainText("No Markdown input syntax");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator('[data-syntax-id="pandoc-empty_paragraphs"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/catalog-syntax-mobile.png" });
});

test("source locations are searchable in object, variant and extension descriptions", async ({ page }) => {
  await page.goto("/block-catalog.html#tab=extensions&id=tex_math_double_backslash");
  await page.getByRole("searchbox").fill("extended!A53:E53");
  await expect(page.locator('.catalog-results [data-extension-id]')).toHaveCount(1);
  await expect(page.locator('.catalog-detail > code')).toHaveText("tex_math_double_backslash");
  await page.goto("/block-catalog.html#tab=blocks");
  await page.getByRole("searchbox").fill("extended!A53:E53");
  await expect(page.locator('[data-entry="block.math_block"]')).toHaveCount(1);
  await expect(page.locator('[data-entry="inline.inline_math"]')).toHaveCount(1);
});
