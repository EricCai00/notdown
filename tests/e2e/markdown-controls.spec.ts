import { test, expect, type Page } from "@playwright/test";

const controls = (page: Page) => page.locator("#editing-workspace");
async function settings(page: Page) {
  await page.getByRole("button", { name: "Workspace settings", exact: true }).click();
  return page.getByRole("dialog", { name: "Workspace settings", exact: true });
}
async function expectMenuIcon(page: Page) {
  const summary = page.getByLabel("Page options", { exact: true });
  await expect(summary.locator("svg")).toBeVisible();
  await expect(summary.locator("svg")).toHaveAttribute("data-lucide", "ellipsis");
  expect(await summary.locator("svg").boundingBox()).toMatchObject({ width: 18, height: 18 });
}

test("Markdown controls default to visible and hide independently without changing the draft", async ({ page, request }) => {
  const response = await request.post("/api/pages", { data: { title: "Markdown controls", body: "Keep this source\n" } });
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  await expect(controls(page).getByRole("group", { name: "Editing view" })).toBeVisible();
  await expect(controls(page).getByRole("combobox", { name: "Markdown dialect" })).toBeVisible();
  await expect(controls(page).locator(".syntax-options summary")).toBeVisible();
  await page.locator(".pm-document > p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" pending input");

  let dialog = await settings(page);
  const preferences = dialog.locator(".markdown-control-preferences");
  for (const name of ["Show view switcher", "Show dialect selector", "Show extensions button"]) {
    await expect(preferences.getByRole("checkbox", { name })).toBeChecked();
  }
  await preferences.getByRole("checkbox", { name: "Show dialect selector" }).uncheck();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(controls(page).locator(".dialect-label")).toBeHidden();
  await expect(controls(page).locator(".editing-modes")).toBeVisible();
  await expect(controls(page).locator(".syntax-options summary")).toBeVisible();
  await expect(page.locator(".pm-document")).toContainText("Keep this source pending input");

  // An open extensions panel closes when its entry is hidden.
  await controls(page).locator(".syntax-options summary").click();
  dialog = await settings(page);
  await dialog.getByRole("checkbox", { name: "Show extensions button" }).uncheck();
  await dialog.getByRole("checkbox", { name: "Show view switcher" }).uncheck();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(controls(page).locator(".editing-toolbar")).toBeHidden();
  await expect(controls(page).locator(".syntax-options")).not.toHaveAttribute("open");
  await expectMenuIcon(page);
  await page.getByLabel("Page options", { exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Source and page", exact: true }).click();
  await expect(controls(page)).toHaveAttribute("data-mode", "split");
  await expect(page.locator("#source-editor")).toContainText("Keep this source pending input");
  await expect(controls(page).locator(".scroll-toggle")).toBeHidden();
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("pending input");
  const saved = await (await request.get(`/api/pages/${note.id}`)).json();

  await page.reload();
  await expect(controls(page).locator(".editing-toolbar")).toBeHidden();
  dialog = await settings(page);
  await expect(dialog.getByRole("checkbox", { name: "Show dialect selector" })).not.toBeChecked();
  await dialog.getByRole("checkbox", { name: "Show view switcher" }).check();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(controls(page).locator(".editing-modes")).toBeVisible();
  await expect(controls(page).locator(".dialect-label")).toBeHidden();
  await expect(controls(page).locator(".syntax-options")).toBeHidden();
  await page.keyboard.press("Control+e");
  await expect(controls(page)).toHaveAttribute("data-mode", "source");
  const after = await (await request.get(`/api/pages/${note.id}`)).json();
  expect(after.body).toBe(saved.body);
  expect(after.syntax).toEqual(saved.syntax);
  expect(after.revision).toBe(saved.revision);
});

test("Page options keeps its ellipsis and working menu after every view-switch entry", async ({ page, request }) => {
  const response = await request.post("/api/pages", { data: { title: "Page menu icons", body: "# Heading\n\nContent\n" } });
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  await expectMenuIcon(page);
  for (const mode of ["source", "split", "document"]) {
    await controls(page).locator(`[data-mode="${mode}"]`).click();
    await expect(controls(page)).toHaveAttribute("data-mode", mode);
    await expectMenuIcon(page);
  }
  await page.keyboard.press("Control+e");
  await expect(controls(page)).toHaveAttribute("data-mode", "source");
  await expectMenuIcon(page);
  for (const name of ["Source and page", "Outline", "Page"]) {
    await page.getByLabel("Page options", { exact: true }).click();
    await page.getByRole("menuitemradio", { name, exact: true }).click();
    await expectMenuIcon(page);
  }
  await page.getByLabel("Page options", { exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Page history", exact: true })).toBeVisible();
});
