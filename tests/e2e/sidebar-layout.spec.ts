import { test, expect, type Page } from "@playwright/test";

const sidebar = (page: Page) => page.locator("#sidebar");
const handle = (page: Page) => page.getByRole("separator", { name: "Resize sidebar" });
const toggle = (page: Page) => page.getByRole("button", { name: "Toggle sidebar", exact: true });
async function width(page: Page) {
  return sidebar(page).evaluate((element) => element.getBoundingClientRect().width);
}
async function dragTo(page: Page, x: number, finish = true) {
  const box = (await handle(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, 300);
  await page.mouse.down();
  await page.mouse.move(x, 300, { steps: 5 });
  if (finish) await page.mouse.up();
}

test("sidebar resizes, remembers width, clamps and cancels safely", async ({ page }) => {
  await page.goto("/");
  await expect(handle(page)).toBeVisible();
  await dragTo(page, 350);
  await expect.poll(() => width(page)).toBe(350);
  await page.reload();
  await expect.poll(() => width(page)).toBe(350);
  await dragTo(page, 430, false);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect.poll(() => width(page)).toBe(350);
  await expect(page.locator("body")).not.toHaveClass(/sidebar-resizing/);
  await dragTo(page, 50);
  await expect.poll(() => width(page)).toBe(200);
  await dragTo(page, 900);
  await expect.poll(() => width(page)).toBe(480);
  await page.setViewportSize({ width: 800, height: 900 });
  await expect.poll(() => width(page)).toBe(400);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect.poll(() => width(page)).toBe(480);
  await handle(page).dblclick();
  await expect.poll(() => width(page)).toBe(240);
  await handle(page).focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => width(page)).toBe(250);
  await page.keyboard.press("Home");
  await expect.poll(() => width(page)).toBe(200);
  await page.keyboard.press("End");
  await expect.poll(() => width(page)).toBe(480);
});

test("desktop collapse expands editor space, preserves input and restores saved layout", async ({ page, request }) => {
  const note = await (await request.post("/api/pages", { data: { title: "Sidebar layout draft", body: "Original body" } })).json();
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator("#page-title")).toHaveValue(note.title);
  const editor = page.locator(".pm-document");
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" pending layout edit");
  const originalEditor = await editor.elementHandle();
  await dragTo(page, 350);
  await toggle(page).click();
  await expect(sidebar(page)).toBeHidden();
  await expect(handle(page)).toBeHidden();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  expect(await page.locator(".main-shell").evaluate((element) => element.getBoundingClientRect().x)).toBe(0);
  expect(await originalEditor!.evaluate((element) => element.isConnected)).toBe(true);
  await expect(editor).toContainText("pending layout edit");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("pending layout edit");
  await page.reload();
  await expect(toggle(page)).toBeVisible();
  await expect(sidebar(page)).toBeHidden();
  await toggle(page).click();
  await expect(sidebar(page)).toBeVisible();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => width(page)).toBe(350);
});

test("mobile drawer opens and closes independently of desktop collapse", async ({ page }) => {
  await page.goto("/");
  await expect(toggle(page)).toBeVisible();
  await toggle(page).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  await expect(sidebar(page)).toHaveAttribute("inert", "");
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => sidebar(page).evaluate((element) => element.getBoundingClientRect().x)).toBe(0);
  await expect.poll(() => width(page)).toBe(240);
  await expect(handle(page)).toBeHidden();
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  await expect.poll(() => sidebar(page).evaluate((element) => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(sidebar(page)).toBeHidden();
  await toggle(page).click();
  await expect(sidebar(page)).toBeVisible();
});
