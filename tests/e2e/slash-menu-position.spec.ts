import { expect, test, type Page } from "@playwright/test";

async function expectClearTypingLine(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return false;
    const caret = selection.getRangeAt(0).getBoundingClientRect();
    const menu = document.querySelector(".inline-slash")?.getBoundingClientRect();
    return !!menu && caret.height > 0 &&
      (menu.bottom <= caret.top - 7 || menu.top >= caret.bottom + 7) &&
      menu.left >= 11 && menu.right <= innerWidth - 11 &&
      menu.top >= 11 && menu.bottom <= innerHeight - 11;
  })).toBe(true);
  await expect(page.locator(".pm-document")).toBeFocused();
  await expect(page.getByRole("button", { name: "Close menu" })).toBeVisible();
}

test("slash menu leaves the query visible and closes without consuming typed text", async ({ page, request }) => {
  const note = await (await request.post("/api/pages", { data: { title: "Slash placement", body: "" } })).json();
  await page.goto(`/#page/${note.id}`);
  await page.locator(".pm-document").click();
  await page.keyboard.type("/");
  const menu = page.locator(".inline-slash");
  await expect(menu).toHaveAttribute("data-placement", "below");
  await expectClearTypingLine(page);
  await page.keyboard.type("h");
  await expect(menu.locator("h2")).toHaveText("Filtered results");
  await expectClearTypingLine(page);
  await page.screenshot({ path: "test-results/slash-menu-compact.png" });
  await page.getByRole("button", { name: "Close menu" }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.locator(".pm-document")).toBeFocused();
  await page.keyboard.type("ello");
  await expect(page.locator(".pm-document")).toHaveText("/hello");
});

test("slash menu flips above a low typing line and scrolls results independently", async ({ page, request }) => {
  await page.setViewportSize({ width: 1000, height: 650 });
  const body = Array.from({ length: 35 }, (_, i) => `Paragraph ${i}`).join("\n\n");
  const note = await (await request.post("/api/pages", { data: { title: "Lower slash", body } })).json();
  await page.goto(`/#page/${note.id}`);
  const paragraph = page.locator(".pm-document > p").last();
  await paragraph.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" /");
  const menu = page.locator(".inline-slash");
  await expect(menu).toHaveAttribute("data-placement", "above");
  await expectClearTypingLine(page);
  const pageScroll = await page.locator("#main").evaluate(el => el.scrollTop);
  for (let i = 0; i < 18; i++) await page.keyboard.press("ArrowDown");
  await expect.poll(() => menu.locator(".insert-grid").evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.locator("#main").evaluate(el => el.scrollTop)).toBe(pageScroll);
  await expectClearTypingLine(page);
  await page.keyboard.type("h2");
  await expectClearTypingLine(page);
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(page.locator(".pm-document h2")).toHaveText("Paragraph 34 ");
});

test("slash menu follows wrapped input, viewport resizing and page scrolling", async ({ page, request }) => {
  await page.setViewportSize({ width: 760, height: 720 });
  const note = await (await request.post("/api/pages", { data: { title: "Wrapped slash", body: "- Nested input" } })).json();
  await page.goto(`/#page/${note.id}`);
  await page.locator(".pm-document li p").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" /");
  await expectClearTypingLine(page);
  await page.keyboard.type("x".repeat(90));
  await expect(page.locator(".inline-slash")).toContainText("No matching blocks");
  await expectClearTypingLine(page);
  await page.setViewportSize({ width: 560, height: 620 });
  await expectClearTypingLine(page);
  await page.locator("#main").evaluate(el => { el.scrollTop += 35; });
  await expectClearTypingLine(page);
  await page.keyboard.press("Escape");
  await expect(page.locator(".inline-slash")).toHaveCount(0);
  await expect(page.locator(".pm-document")).toContainText("/" + "x".repeat(90));
});
