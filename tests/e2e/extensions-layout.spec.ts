import { test, expect } from "@playwright/test";

test("Extensions follows its button across view, sidebar, and wrapping changes", async ({ page, request }) => {
  const response = await request.post("/api/pages", { data: {
    title: "Extensions layout", body: "Unchanged source",
    bodyFormat: "markdown", syntax: { version: 1, variant: "gfm", extensions: {} },
  } });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  const summary = page.locator(".syntax-options summary");
  const panel = page.locator(".syntax-options-panel");
  const search = panel.getByRole("searchbox", { name: "Search extensions" });
  const expectAnchored = async () => {
    await expect(panel).toBeVisible();
    await expect.poll(() => panel.evaluate(element => {
      const box = element.getBoundingClientRect();
      const anchor = element.parentElement!.querySelector("summary")!.getBoundingClientRect();
      const right = Math.max(box.width + 8, Math.min(anchor.right, document.documentElement.clientWidth - 8));
      return Math.max(Math.abs(box.top - anchor.bottom - 4), Math.abs(box.right - right));
    })).toBeLessThan(1);
    const box = (await panel.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(7);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width - 7);
    await expect(search).toHaveValue("footnotes");
  };
  await summary.click();
  await search.fill("footnotes");
  await expectAnchored();
  for (const mode of ["split", "source", "document"]) {
    await page.locator(`.editing-modes [data-mode="${mode}"]`).click();
    await expectAnchored();
  }
  const handle = page.getByRole("separator", { name: "Resize sidebar" });
  await handle.focus();
  await page.keyboard.press("End");
  await expect(page.locator("#sidebar")).toHaveCSS("width", "480px");
  await expectAnchored();
  await page.getByRole("button", { name: "Toggle sidebar", exact: true }).click();
  await expect(page.locator("#sidebar")).toBeHidden();
  await expectAnchored();
  for (const width of [620, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expectAnchored();
    if (width === 390) {
      const modes = (await page.locator(".editing-modes").boundingBox())!;
      expect((await summary.boundingBox())!.y).toBeGreaterThan(modes.y + modes.height);
    }
  }
  await summary.click();
  await expect(panel).toBeHidden();
  await page.setViewportSize({ width: 390, height: 1000 });
  await summary.click();
  await expectAnchored();
  const saved = await (await request.get(`/api/pages/${note.id}`)).json();
  expect(saved.body).toBe(note.body);
  expect(saved.syntax).toEqual(note.syntax);
});
