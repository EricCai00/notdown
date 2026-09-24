import { test, expect } from "@playwright/test";

test("official Notion keeps unsupported inline source through visual edits and reload", async ({ page, request }) => {
  const body = 'Before ![inline](https://example.com/a.png) <https://example.com> <a@example.com> [[Page]] after\n\n[Explicit](https://example.com)\n\n# Plain heading\n\tChild\n\nTail';
  const note = await (await request.post("/api/pages", { data: {
    title: "Official Notion boundary", body, bodyFormat: "notion-markdown",
    syntax: { version: 1, variant: "notion-markdown", extensions: { autolink_bare_uris: true, wikilinks_title_after_pipe: true } },
  } })).json();
  await page.goto(`/#page/${note.id}`);
  const editor = page.locator(".pm-document");
  await expect(editor.locator(":scope > p").first()).toHaveText(body.split("\n")[0]);
  await expect(editor.locator("img")).toHaveCount(0);
  await expect(editor.locator('a[href="https://example.com"]')).toHaveCount(1);
  await expect(editor.locator(".page-mention")).toHaveCount(0);
  await expect(editor.locator("h1")).toHaveCount(0);
  await editor.locator(":scope > p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" edited");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body + " edited");
  await page.reload();
  await expect(editor.locator(":scope > p").first()).toHaveText(body.split("\n")[0]);
  await expect(editor.locator(":scope > p").last()).toHaveText("Tail edited");
});

test("catalog distinguishes NFM inline images/autolinks from ordinary internal links", async ({ page }) => {
  for (const [id, status] of [["inline.image", "No registered route"], ["inline.autolink", "No registered route"], ["inline.internal_link", "Default route"]]) {
    await page.goto(`/block-catalog.html#tab=blocks&id=${id}`);
    const variants = page.locator(".catalog-variant-links");
    await variants.locator("summary").click();
    const row = variants.locator("li").filter({ has: page.locator('a[data-variant="notion-markdown"]') });
    await expect(row).toContainText(status);
  }
});

test("pasting a Notion media image splits prose into blocks and survives save", async ({ page, request }) => {
  await page.route("**/notion-test-image.svg", route => route.fulfill({
    contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="blue"/></svg>',
  }));
  const note = await (await request.post("/api/pages", { data: {
    title: "Notion image insertion", body: "BeforeAfter", bodyFormat: "notion-markdown",
    syntax: { version: 1, variant: "notion-markdown", extensions: {} },
  } })).json();
  await page.goto(`/#page/${note.id}`);
  const editor = page.locator(".pm-document");
  await editor.locator(":scope > p").click();
  await page.keyboard.press("Home");
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
  await editor.evaluate(el => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", "![Caption](/notion-test-image.svg)");
    el.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }));
  });
  await expect(editor.locator(":scope > p")).toHaveCount(3);
  await expect(editor.locator(":scope > p").first()).toHaveText("Before");
  await expect(editor.locator(":scope > p").nth(1).locator('img[alt="Caption"]')).toHaveCount(1);
  await expect(editor.locator('img[alt="Caption"]')).toHaveJSProperty("naturalWidth", 10);
  await expect(editor.locator(":scope > p").last()).toHaveText("After");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe("Before\n\n![Caption](/notion-test-image.svg)\n\nAfter");
  await page.reload();
  await expect(editor.locator(":scope > p")).toHaveCount(3);
  await expect(editor.locator('img[alt="Caption"]')).toHaveCount(1);
});
