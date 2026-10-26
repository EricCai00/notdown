import { test, expect, type Page } from "@playwright/test";

const sidebar = (page: Page) => page.locator("#sidebar");
const handle = (page: Page) => page.getByRole("separator", { name: "Resize sidebar" });
const toggle = (page: Page) => page.getByRole("button", { name: "Toggle sidebar", exact: true });

test("short page lists keep Import and Trash together with the bottom settings and leave a gap", async ({ page, request }) => {
  const vault = await (await request.post("/api/vaults/open", { data: { mode: "create", name: `Sidebar footer ${Date.now()}` } })).json();
  const note = await (await request.post(`${vault.url}api/pages`, { data: { title: "Footer placement", body: "Short page list" } })).json();
  await page.goto(`${vault.url}#page/${note.id}`);
  await expect(page.locator("#page-title")).toHaveValue(note.title);
  const footer = sidebar(page).locator(".sidebar-bottom");
  await expect(footer.getByRole("button", { name: "Import", exact: true })).toBeVisible();
  await expect(footer.getByRole("button", { name: "Trash", exact: true })).toBeVisible();
  await expect(footer.getByRole("button", { name: "Workspace settings" })).toBeInViewport();
  const treeBox = (await page.locator("#page-tree").boundingBox())!;
  const importBox = (await footer.getByRole("button", { name: "Import", exact: true }).boundingBox())!;
  const importIconBox = (await footer.getByRole("button", { name: "Import", exact: true }).locator("svg").boundingBox())!;
  const footerBox = (await footer.boundingBox())!;
  const sidebarBox = (await sidebar(page).boundingBox())!;
  expect(importBox.y - treeBox.y - treeBox.height).toBeGreaterThan(100);
  expect(importIconBox.x - importBox.x).toBeLessThanOrEqual(12);
  expect(sidebarBox.y + sidebarBox.height - footerBox.y - footerBox.height).toBeLessThanOrEqual(10);
  expect(await sidebar(page).evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
  await page.screenshot({ path: ".run/logs/sidebar-footer-short-list.png" });
});

test("long favorites and page trees share the whole sidebar scroll without moving the document", async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  const note = await (await request.post("/api/pages", { data: { title: "Unified sidebar scroll", body: Array.from({ length: 60 }, (_, index) => `Document paragraph ${index}`).join("\n\n") } })).json();
  for (let index = 0; index < 28; index++) {
    await request.post("/api/pages", { data: { title: `Sidebar scroll page ${index}`, favorite: index < 12 } });
  }
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator("#page-title")).toHaveValue(note.title);
  await expect(page.locator("#app")).not.toHaveAttribute("inert", "");
  await expect(page.locator(".sidebar-pages")).toHaveCount(0);
  await expect(page.locator("#favorite-pages")).toHaveCSS("overflow-y", "visible");
  await expect(page.locator("#page-tree")).toHaveCSS("overflow-y", "visible");
  const documentScroll = await page.locator("#main").evaluate(element => element.scrollTop);
  await page.locator(".workspace-switch").hover();
  await page.mouse.wheel(0, 500);
  await expect.poll(() => sidebar(page).evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.locator("#main").evaluate(element => element.scrollTop)).toBe(documentScroll);
  await sidebar(page).evaluate(element => element.scrollTop = element.scrollHeight);
  await expect(sidebar(page).getByRole("button", { name: "Workspace settings" })).toBeInViewport();
  await expect(sidebar(page).getByRole("button", { name: "Import", exact: true })).toBeInViewport();
  await expect(sidebar(page).getByRole("button", { name: "Trash", exact: true })).toBeInViewport();
  const treeBottom = await page.locator("#page-tree").evaluate(element => element.getBoundingClientRect().bottom);
  const importTop = await sidebar(page).getByRole("button", { name: "Import", exact: true }).evaluate(element => element.getBoundingClientRect().top);
  expect(importTop - treeBottom).toBeGreaterThanOrEqual(24);
  await page.screenshot({ path: ".run/logs/sidebar-unified-scroll.png" });
});

test("parent arrows replace icons without shifting titles and keep keyboard expansion usable", async ({ page, request }) => {
  const create = async (title: string, parent: string | null = null, icon = "📁") =>
    (await request.post("/api/pages", { data: { title, parent, icon, body: "Sidebar content" } })).json();
  const parent = await create("Compact parent");
  const child = await create("Compact child", parent.id, "folder");
  const leaf = await create("Compact leaf", child.id);
  await page.goto(`/#page/${leaf.id}`);
  const row = (id: string) => page.locator(`#page-tree [data-page-row="${id}"]`);
  const parentRow = row(parent.id), childRow = row(child.id), leafRow = row(leaf.id);
  const arrow = parentRow.locator(".tree-toggle");
  const icon = parentRow.locator(".page-link-icon");
  const titleX = (id: string) => row(id).locator(".tree-page > span:last-child").evaluate(el => el.getBoundingClientRect().x);
  await expect(leafRow).toBeVisible();
  await page.mouse.move(900, 100);
  await expect(arrow).toHaveCSS("opacity", "0");
  await expect(icon).toHaveCSS("opacity", "1");
  await expect(leafRow.locator(".tree-toggle")).toHaveCount(0);
  const originalX = await titleX(parent.id);
  expect(await titleX(child.id) - originalX).toBe(10);
  expect(await titleX(leaf.id) - await titleX(child.id)).toBe(10);

  await parentRow.hover();
  await expect(arrow).toHaveCSS("opacity", "1");
  await expect(icon).toHaveCSS("opacity", "0");
  expect(await titleX(parent.id)).toBe(originalX);
  const arrowBox = (await arrow.boundingBox())!, iconBox = (await icon.boundingBox())!;
  expect(arrowBox.x + arrowBox.width / 2).toBeCloseTo(iconBox.x + iconBox.width / 2);
  await arrow.click();
  await expect(childRow).toHaveCount(0);
  await expect(page.locator("#page-title")).toHaveValue(leaf.title);
  await expect(arrow).toHaveAttribute("aria-expanded", "false");
  await expect(arrow).toBeFocused();
  await page.mouse.move(900, 100);
  await expect(arrow).toHaveCSS("opacity", "0");
  await expect(icon).toHaveCSS("opacity", "1");
  expect(await titleX(parent.id)).toBe(originalX);
  await parentRow.hover();
  await expect(arrow).toHaveCSS("opacity", "1");
  await arrow.click();
  await expect(childRow).toBeVisible();
  await page.mouse.move(900, 100);
  await expect(arrow).toHaveCSS("opacity", "0");
  await expect(icon).toHaveCSS("opacity", "1");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(arrow).toBeFocused();
  await expect(arrow).toHaveCSS("opacity", "1");
  await expect(icon).toHaveCSS("opacity", "0");
  await page.keyboard.press("Space");
  await expect(childRow).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(childRow).toBeVisible();
  await expect(arrow).toBeFocused();
  await expect(arrow).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Space");
  await expect(childRow).toHaveCount(0);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(parentRow.locator(".tree-page")).toBeFocused();
  await expect(arrow).toHaveCSS("opacity", "1");
  await page.keyboard.press("Enter");
  await expect(page.locator("#page-title")).toHaveValue(parent.title);

  await page.locator("#page-title").focus();
  await childRow.hover();
  await expect(childRow.locator(".page-link-icon")).toHaveCSS("opacity", "0");
  await leafRow.hover();
  await expect(leafRow.locator(".page-link-icon")).toHaveCSS("opacity", "1");
  await page.mouse.move(900, 100);
  await expect(icon).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "test-results/sidebar-compact-idle.png" });
  await parentRow.hover();
  await page.screenshot({ path: "test-results/sidebar-compact-hover.png" });
});

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
