import { expect, test, type Page } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

const switcher = (page: Page) => page.locator("#page-view-switcher");
async function selectView(page: Page, view: string) {
  await switcher(page).locator("summary").click();
  await switcher(page).locator(`[data-view="${view}"]`).click();
  await expect(switcher(page)).not.toHaveAttribute("open");
}

test("top bar switches all page views with editor controls hidden and preserves pending input", async ({ page, request }, info) => {
  const response = await request.post("/api/pages", { data: { title: "Research notebook", body: "# Experiments\n\nOriginal paragraph" } });
  expect(response.ok()).toBeTruthy(); const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator(".editing-toolbar")).toBeHidden();
  await expect(switcher(page).locator(".page-view-current")).toHaveText("Page");
  await page.locator("#editor .pm-document > p").last().click();
  await page.keyboard.press("End"); await page.keyboard.type(" with pending changes");
  await selectView(page, "source");
  await expect(switcher(page).locator(".page-view-current")).toHaveText("Source");
  await expect(page.locator("#source-editor")).toContainText("with pending changes");
  await page.locator("#source-editor").click();
  await page.keyboard.press("Control+End"); await page.keyboard.insertText("\n\nAdded in source");
  await selectView(page, "split");
  await expect(page.locator("#editing-workspace")).toHaveAttribute("data-mode", "split");
  await expect(switcher(page).locator(".page-view-current")).toHaveText("Split");
  await expect(page.locator("#editor .pm-document")).toContainText("Added in source");
  await selectView(page, "outline");
  await expect(switcher(page).locator(".page-view-current")).toHaveText("Outline");
  await expect(page.locator(".outline-view")).toContainText("Experiments");
  await selectView(page, "mindmap");
  await expect(switcher(page).locator(".page-view-current")).toHaveText("Mind map");
  await page.locator('[data-map-preset="expanded"]').click();
  await expect(page.locator(".mindmap-scene")).toContainText("Added in source");
  await page.screenshot({ path: info.outputPath("topbar-mindmap.png") });
  await switcher(page).locator("summary").click();
  await expect(switcher(page).getByRole("menuitemradio")).toHaveCount(5);
  await expect(switcher(page).locator('[aria-checked="true"]')).toHaveAttribute("data-view", "mindmap");
  await page.screenshot({ path: info.outputPath("topbar-view-menu.png") });
  await page.screenshot({ path: info.outputPath("topbar-view-menu-detail.png"), clip: { x: page.viewportSize()!.width - 540, y: 0, width: 540, height: 450 } });
  // Selecting the current view preserves the mounted map and its expansion.
  await switcher(page).locator('[data-view="mindmap"]').click();
  await expect(page.locator(".mindmap-scene")).toContainText("Added in source");
  await expect(switcher(page).locator("summary")).toBeFocused();
  await selectView(page, "document");
  await page.keyboard.press("Control+e");
  await expect(switcher(page).locator(".page-view-current")).toHaveText("Source");
  await page.keyboard.press("Control+e");
  await expect(switcher(page).locator(".page-view-current")).toHaveText("Page");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("Added in source");
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("Original paragraph with pending changes");
});

test("view menu supports keyboard, exclusive menus, Chinese and narrow screens without saving", async ({ page, request }, info) => {
  await page.addInitScript(() => localStorage.setItem("notdown-ui-language", "zh-CN"));
  const note = await (await request.post("/api/pages", { data: { title: "页面视图与布局", body: "# Heading\n\nKeep this body" } })).json();
  await page.goto(`/#page/${note.id}`);
  const menu = switcher(page), trigger = menu.locator("summary");
  await expect(trigger).toHaveAccessibleName("切换视图");
  await trigger.focus(); await page.keyboard.press("Enter");
  await expect(menu.getByRole("menuitemradio")).toHaveText([/页面.*使用块编辑正文/, /大纲.*浏览标题/, /思维导图.*查看页面/, /Markdown 源码.*直接编辑/, /源码与页面.*并排查看/]);
  await page.keyboard.press("ArrowDown");
  await expect(menu.locator('[data-view="document"]')).toBeFocused();
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await expect(menu.locator(".page-view-current")).toHaveText("大纲");
  await expect(trigger).toBeFocused();
  await trigger.press("Space"); await page.keyboard.press("Escape");
  await expect(menu).not.toHaveAttribute("open"); await expect(trigger).toBeFocused();
  await trigger.click(); await page.locator("#source-file-options > summary").click();
  await expect(menu).not.toHaveAttribute("open");
  await trigger.click(); await expect(page.locator("#source-file-options")).not.toHaveAttribute("open");
  await page.locator("#page-title").click(); await expect(menu).not.toHaveAttribute("open");
  await selectView(page, "split"); await expect(menu.locator(".page-view-current")).toHaveText("分屏");
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  const bounds = (await menu.locator('[role="menu"]').boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(menu.locator(".page-view-current")).toBeHidden();
  await page.screenshot({ path: info.outputPath("topbar-view-menu-mobile-zh.png") });
  await menu.locator('[data-view="document"]').click();
  const saved = await (await request.get(`/api/pages/${note.id}`)).json();
  expect(saved.body).toBe(note.body); expect(saved.revision).toBe(note.revision);
});

test("page view button hides on vault and collections and remains available on Wiki Home", async ({ page, request }) => {
  const wiki = await (await request.post("/api/databases", { data: { title: "View switcher wiki", kind: "wiki" } })).json();
  await page.goto(`/#page/${wiki.hostPage.id}`);
  await expect(switcher(page)).toBeVisible();
  await selectView(page, "source");
  await expect(switcher(page).locator(".page-view-current")).toHaveText("Source");
  await page.goto("/#vault/gallery");
  await expect(switcher(page)).toBeHidden();
  const database = await (await request.post("/api/databases", { data: { title: "Collection" } })).json();
  await page.goto(`/#database/${database.database.id}`);
  await expect(page.locator(".database-workspace")).toBeVisible();
  await expect(switcher(page)).toBeHidden();
  await page.goto(`/#page/${wiki.hostPage.id}`);
  await expect(switcher(page)).toBeVisible();
});
