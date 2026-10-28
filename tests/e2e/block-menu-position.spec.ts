import { test, expect } from "@playwright/test";

for (const format of ["markdown", "notion-markdown"] as const) {
  test(`${format} divider controls center on the rule and remain reachable`, async ({ page, request }, testInfo) => {
    const body = [
      "---", "Before", "---",
      format === "markdown" ? "> Quote\n>\n> ---\n>\n> Quote tail"
        : '<callout icon="💡">\n\tCallout\n\n\t---\n\n\tCallout tail\n</callout>',
      "After", "---",
    ].join("\n\n");
    const response = await request.post("/api/pages", { data: {
      title: "Divider control placement", body, bodyFormat: format,
    } });
    expect(response.ok()).toBeTruthy();
    const note = await response.json();
    await page.goto(`/#page/${note.id}`);
    const rules = page.locator(".pm-document hr");
    await expect(rules).toHaveCount(4);
    const handle = page.locator(".pm-block-handle");
    const plus = page.getByRole("button", { name: "Add block below" });
    for (const rule of await rules.all()) {
      await rule.scrollIntoViewIfNeeded();
      const line = (await rule.boundingBox())!;
      const center = line.y + line.height / 2;
      for (const offset of [0, -8, 8]) {
        // Approach afresh so a previous hover cannot keep a stale handle alive.
        await page.mouse.move(line.x + line.width + 80, center);
        await page.mouse.move(line.x + 80, center + offset);
        await expect(handle).toHaveClass(/visible/);
        await expect(plus).toHaveClass(/visible/);
        for (const control of [handle, plus]) {
          const bounds = (await control.boundingBox())!;
          expect(Math.abs(bounds.y + bounds.height / 2 - center)).toBeLessThan(1);
        }
      }
      const grip = (await handle.boundingBox())!;
      expect(line.x - grip.x - grip.width).toBeCloseTo(12, 0);
      await page.mouse.move(grip.x + grip.width / 2, center, { steps: 16 });
      await expect(handle).toHaveClass(/visible/);
      await handle.click();
      await expect(page.locator(".pm-block-menu > :first-child")).toHaveText("Divider");
      await page.keyboard.press("Escape");
    }
    await rules.last().hover();
    await page.screenshot({ path: testInfo.outputPath("divider-controls.png") });
    expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
  });
}

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
