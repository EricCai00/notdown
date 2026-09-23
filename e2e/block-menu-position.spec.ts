import { test, expect } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`block menu leaves the selected block clear at viewport width ${width}`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const response = await request.post("/api/pages", { data: {
      title: "Block menu placement",
      body: 'Before\n\n<callout icon="❗">\n\tKeep this content visible\n\n\tSecond line\n</callout>\n\nAfter',
      bodyFormat: "notion-markdown",
    } });
    expect(response.ok()).toBeTruthy();
    const note = await response.json();
    await page.goto(`/#page/${note.id}`);
    const block = page.locator(".pm-callout");
    await block.locator("p").first().hover();
    const handle = page.locator(".pm-block-handle");
    const bounds = (await block.boundingBox())!;
    const grip = (await handle.boundingBox())!;
    expect(bounds.x - grip.x - grip.width).toBeCloseTo(12, 0);
    await handle.click();
    const menu = page.getByRole("menu", { name: "Block actions" });
    await expect(menu).toBeVisible();
    const popup = (await menu.boundingBox())!;
    expect(popup.x).toBeGreaterThanOrEqual(8);
    expect(popup.y).toBeGreaterThanOrEqual(8);
    expect(popup.x + popup.width).toBeLessThanOrEqual(width - 8);
    expect(popup.y + popup.height).toBeLessThanOrEqual(892);
    if (width === 1440) {
      expect(popup.x + popup.width).toBeCloseTo(grip.x - 8, 0);
    } else {
      expect(popup.y + popup.height <= bounds.y - 8 || popup.y >= bounds.y + bounds.height + 8).toBeTruthy();
    }
    await page.screenshot({ path: `test-results/block-menu-${width}.png` });
    // Walk across the gap into the menu, then use a lower action even when
    // the narrow-screen fallback has to scroll the menu.
    await page.mouse.move(popup.x + popup.width / 2, popup.y + 20, { steps: 24 });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await expect(block).toHaveCount(0);
    await page.keyboard.press("Control+z");
    await expect(block).toHaveCount(1);
  });
}
