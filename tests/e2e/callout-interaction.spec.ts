import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

async function fixture(page: Page, request: APIRequestContext) {
  const response = await request.post("/api/pages", { data: {
    title: "Callout interaction",
    body: '<callout icon="❗" custom="keep">\n\tFirst paragraph\n\n\tSecond paragraph\n\n\tThird paragraph\n</callout>\n\nTail',
    bodyFormat: "notion-markdown", syntax: { version: 1, variant: "notion-markdown", extensions: {} },
  } });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
  await page.goto("/");
  await expect(page.locator(".pm-callout-content > p")).toHaveCount(3);
  return note;
}

test("callout has an outside whole-block handle and independent handles after its first paragraph", async ({ page, request }) => {
  await fixture(page, request);
  const callout = page.locator(".pm-callout");
  const paragraphs = callout.locator(".pm-callout-content > p");
  const handle = page.locator(".pm-block-handle");
  await paragraphs.first().hover();
  await expect(handle).toHaveAttribute("data-block-pos", "0");
  const outer = (await callout.boundingBox())!, grip = (await handle.boundingBox())!;
  expect(grip.x + grip.width).toBeLessThanOrEqual(outer.x);
  await paragraphs.nth(1).hover();
  await expect(handle).not.toHaveAttribute("data-block-pos", "0");
  expect((await handle.boundingBox())!.x).toBeGreaterThan(outer.x);
  await handle.dragTo(page.locator(".pm-document > p").filter({ hasText: /^Tail$/ }), { targetPosition: { x: 8, y: 25 } });
  await expect(paragraphs).toHaveCount(2);
  await expect(page.locator(".pm-document > p").filter({ hasText: /^Second paragraph$/ })).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(paragraphs).toHaveCount(3);
  await paragraphs.first().hover();
  await handle.dragTo(page.locator(".pm-document > p").filter({ hasText: /^Tail$/ }), { targetPosition: { x: 8, y: 25 } });
  await expect(page.locator(".pm-document > :last-child")).toHaveClass(/pm-callout/);
  await expect(paragraphs).toHaveCount(3);
});

test("callout icon picker searches, cancels, changes, undoes and persists removal", async ({ page, request }) => {
  const note = await fixture(page, request);
  const icon = page.getByRole("button", { name: "Choose callout icon", exact: true });
  await icon.click();
  const dialog = page.getByRole("dialog", { name: "Choose callout icon" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(icon).toHaveText("❗");
  await icon.click();
  await dialog.getByRole("searchbox").fill("check");
  await dialog.getByRole("button", { name: "Check 完成", exact: true }).click();
  await expect(icon).toHaveText("✅");
  await page.keyboard.press("Control+z");
  await expect(icon).toHaveText("❗");
  await page.keyboard.press("Control+Shift+z");
  await expect(icon).toHaveText("✅");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain('icon="✅"');
  await page.reload();
  await expect(icon).toHaveText("✅");
  await icon.click();
  await dialog.getByRole("button", { name: "Remove", exact: true }).click();
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain('icon=""');
  await page.reload();
  await expect(page.locator(".pm-callout")).toHaveAttribute("data-icon", "");
  await page.locator(".pm-callout").hover();
  await icon.click();
  await dialog.getByRole("textbox", { name: "Custom icon" }).fill("🌻");
  await dialog.getByRole("button", { name: "Use icon" }).click();
  await expect(icon).toHaveText("🌻");
  await icon.click();
  await page.screenshot({ path: "test-results/callout-picker.png" });
  await page.keyboard.press("Escape");
  await expect(page.locator(".pm-callout-content > p")).toHaveText(["First paragraph", "Second paragraph", "Third paragraph"]);
});
