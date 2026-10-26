import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

const tablist = (page: Page) => page.getByRole("tablist", { name: "Workspace tabs", exact: true });
async function setup(page: Page, request: APIRequestContext) {
  const notes = [];
  for (const title of ["Tabs first note", "Tabs second note", "Tabs third note"]) {
    const response = await request.post("/api/pages", { data: { title, body: `${title}\n\nOriginal content\n`, bodyFormat: "markdown", syntax: { version: 1, variant: "obsidian", extensions: {} } } });
    expect(response.status()).toBe(201); notes.push(await response.json());
  }
  await page.goto(`/#page/${notes[0].id}`);
  await expect(tablist(page).getByRole("tab", { name: notes[0].title, exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  return notes;
}
const row = (page: Page, id: string) => page.locator(`#page-tree [data-open="${id}"]`);

test("tabs preserve pending page/source input, per-tab view and names across reload", async ({ page, request }, testInfo) => {
  const [a, b, c] = await setup(page, request);
  await row(page, b.id).click({ modifiers: ["Control"] });
  await row(page, c.id).click({ button: "middle" });
  await expect(tablist(page).getByRole("tab")).toHaveCount(3);
  await expect(page.locator("#page-title")).toHaveValue(a.title);
  await page.locator("#editor .pm-document").fill("Pending input from the first tab");
  await tablist(page).getByRole("tab", { name: b.title, exact: true }).click();
  await expect.poll(async () => (await (await request.get(`/api/pages/${a.id}`)).json()).body).toContain("Pending input from the first tab");
  await page.locator('.editing-modes [data-mode="source"]').click();
  await page.locator("#source-editor").click(); await page.keyboard.press("Control+End");
  await page.keyboard.insertText("\n\nPending source from the second tab");
  await tablist(page).getByRole("tab", { name: a.title, exact: true }).click();
  await expect(page.locator('.editing-modes [data-mode="document"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#editor .pm-document")).toContainText("Pending input from the first tab");
  await expect.poll(async () => (await (await request.get(`/api/pages/${b.id}`)).json()).body).toContain("Pending source from the second tab");
  await tablist(page).getByRole("tab", { name: b.title, exact: true }).click();
  await expect(page.locator('.editing-modes [data-mode="source"]')).toHaveAttribute("aria-pressed", "true");
  await page.locator("#page-title").fill("Renamed second tab");
  await expect(tablist(page).getByRole("tab", { name: "Renamed second tab", exact: true })).toBeVisible();
  await page.keyboard.press("Control+s"); await expect(page.locator("#save-status")).toContainText("Saved locally");
  await page.reload();
  await expect(tablist(page).getByRole("tab")).toHaveCount(3);
  await expect(tablist(page).getByRole("tab", { name: "Renamed second tab", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#source-editor")).toBeVisible();
  await expect(page.locator("#source-editor")).toContainText("Pending source from the second tab");
  await page.screenshot({ path: testInfo.outputPath("notion-style-tabs.png"), fullPage: true });
});

test("closing or leaving a conflicting tab keeps its draft, URL and all tabs intact", async ({ page, request }) => {
  const [a, b] = await setup(page, request);
  await row(page, b.id).click({ modifiers: ["Control"] });
  const changed = await request.put(`/api/pages/${a.id}`, { data: { baseRevision: a.revision, body: "Newer content from another window" } });
  expect(changed.ok()).toBeTruthy();
  await page.locator("#editor .pm-document").fill("Keep the conflicting local draft");
  await tablist(page).getByRole("button", { name: `Close tab: ${a.title}`, exact: true }).click();
  await expect(page.locator("#save-status")).toContainText("Conflict");
  await expect(tablist(page).getByRole("tab")).toHaveCount(2);
  await expect(tablist(page).getByRole("tab", { name: a.title, exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(new RegExp(`#page/${a.id}$`));
  await expect(page.locator("#editor .pm-document")).toContainText("Keep the conflicting local draft");
  expect((await (await request.get(`/api/pages/${a.id}`)).json()).body).toBe("Newer content from another window");
});

test("tab keyboard selection, middle-close, drag order, new home and narrow layout work", async ({ page, request }, testInfo) => {
  const [a, b, c] = await setup(page, request);
  await row(page, b.id).click({ modifiers: ["Control"] });
  await row(page, c.id).click({ modifiers: ["Control"] });
  const first = tablist(page).getByRole("tab", { name: a.title, exact: true });
  await first.focus(); await page.keyboard.press("ArrowRight");
  await expect(tablist(page).getByRole("tab", { name: b.title, exact: true })).toBeFocused();
  await expect(page.locator("#page-title")).toHaveValue(a.title);
  await page.keyboard.press("Enter"); await expect(page.locator("#page-title")).toHaveValue(b.title);
  await tablist(page).getByRole("tab", { name: c.title, exact: true }).click({ button: "middle" });
  await expect(tablist(page).getByRole("tab")).toHaveCount(2);
  await page.locator(".workspace-tab").nth(1).dragTo(page.locator(".workspace-tab").first());
  await expect(tablist(page).getByRole("tab").first()).toHaveAccessibleName(b.title);
  await page.getByRole("button", { name: "New tab", exact: true }).click();
  await expect(tablist(page).getByRole("tab")).toHaveCount(3);
  await expect(tablist(page).getByRole("tab", { name: "Vault", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.setViewportSize({ width: 480, height: 800 });
  await expect(page.locator(".workspace-tab.active")).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(480);
  await expect(page.getByRole("button", { name: "New tab", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Toggle sidebar", exact: true }).click();
  await expect(page.locator("#sidebar")).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("narrow-tabs.png"), fullPage: true });
});

test("page context menu opens a tab and missing destinations leave the current editor intact", async ({ page, request }) => {
  const [a, b] = await setup(page, request);
  await row(page, b.id).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Open in new tab", exact: true }).click();
  await expect(page.locator("#page-title")).toHaveValue(b.title);
  await tablist(page).getByRole("tab", { name: a.title, exact: true }).click();
  const trashed = await request.put(`/api/pages/${b.id}`, { data: { baseRevision: b.revision, trashed: true } });
  expect(trashed.ok()).toBeTruthy();
  await tablist(page).getByRole("tab", { name: b.title, exact: true }).click();
  await expect(page.locator("#page-title")).toHaveValue(a.title);
  await expect(tablist(page).getByRole("tab", { name: a.title, exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(tablist(page).getByRole("tab")).toHaveCount(2);
});

test("database tabs flush pending titles before switching and show the saved name", async ({ page, request }) => {
  const [a] = await setup(page, request);
  const response = await request.post("/api/databases", { data: { title: "Tabbed database" } });
  expect(response.status()).toBe(201); const snapshot = await response.json();
  await page.reload();
  await page.locator(`#page-tree [data-open-database="${snapshot.database.id}"]`).click({ modifiers: ["Control"] });
  await tablist(page).getByRole("tab", { name: "Tabbed database", exact: true }).click();
  await page.getByRole("textbox", { name: "Database title", exact: true }).fill("Saved database tab");
  await tablist(page).getByRole("tab", { name: a.title, exact: true }).click();
  await expect(tablist(page).getByRole("tab", { name: "Saved database tab", exact: true })).toBeVisible();
  await tablist(page).getByRole("tab", { name: "Saved database tab", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Database title", exact: true })).toHaveValue("Saved database tab");
});

test("each tab restores its reading position after switching and browser reload", async ({ page, request }) => {
  const [a, b] = await setup(page, request);
  const updated = await request.put(`/api/pages/${a.id}`, { data: { baseRevision: a.revision, body: Array.from({ length: 90 }, (_, index) => `Paragraph ${index}: a long page for reading position.`).join("\n\n") } });
  expect(updated.ok()).toBeTruthy(); await page.reload();
  await expect(page.locator("#editor .pm-document")).toContainText("Paragraph 89");
  const main = page.locator("#main");
  await main.evaluate(element => { element.scrollTop = 500; });
  await row(page, b.id).click({ modifiers: ["Control"] });
  await tablist(page).getByRole("tab", { name: b.title, exact: true }).click();
  await expect(page.locator("#page-title")).toHaveValue(b.title);
  await tablist(page).getByRole("tab", { name: a.title, exact: true }).click();
  await expect.poll(() => main.evaluate(element => element.scrollTop)).toBe(500);
  await page.reload();
  await expect.poll(() => main.evaluate(element => element.scrollTop)).toBe(500);
});
