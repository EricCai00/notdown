import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

async function setup(page: Page, request: APIRequestContext, variant = "notdown") {
  // The test server shares its temporary vault across cases. Retire prior
  // fixtures so title-search assertions remain independent of execution order.
  const existing = await (await request.get("/api/pages")).json();
  for (const prior of existing.filter((p: any) => ["CS", "Other notebook", "Hidden parent", "01. Computer Science (Obsidian)"].includes(p.title) && !p.trashed))
    expect((await request.put(`/api/pages/${prior.id}`, { data: { trashed: true, baseRevision: prior.revision } })).ok()).toBeTruthy();
  const create = async (title: string, extra = {}) => {
    const response = await request.post("/api/pages", { data: { title, body: "Target body", ...extra } });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const parent = await create("CS"), other = await create("Other notebook");
  const python = await create("Python", { parent: parent.id, icon: "file-text" });
  const duplicate = await create("Python", { parent: other.id });
  const trashed = await create("Hidden parent");
  await create("Python hidden", { parent: trashed.id });
  expect((await request.put(`/api/pages/${trashed.id}`, { data: { trashed: true, baseRevision: trashed.revision } })).ok()).toBeTruthy();
  const note = await create("01. Computer Science (Obsidian)", {
    body: "### 2.6 **工程能力**\n\n1. TAPE源码学习\n",
    bodyFormat: ["notdown", "notion-markdown"].includes(variant) ? "notion-markdown" : "markdown",
    syntax: { version: 1, variant, extensions: {} },
  });
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator("#page-title")).toHaveValue(note.title);
  await page.evaluate(ids => localStorage.setItem("notdown-recent-pages", JSON.stringify(ids)), [note.id, python.id, parent.id]);
  return { note, parent, python, duplicate };
}
async function selectWords(page: Page) {
  await page.locator(".pm-document h3").click();
  await page.keyboard.press("End");
  await page.keyboard.down("Shift");
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowLeft");
  await page.keyboard.up("Shift");
}
const input = (page: Page) => page.getByRole("combobox", { name: "Link address" });

for (const variant of ["notdown", "notion-markdown", "gfm"]) test(`${variant}: page picker preserves heading text and marks, disambiguates pages and supports undo/navigation`, async ({ page, request }) => {
  const { note, python, duplicate } = await setup(page, request, variant);
  await selectWords(page);
  await page.getByRole("toolbar", { name: "Text formatting" }).getByRole("button", { name: "Link", exact: true }).click();
  await expect(input(page)).toBeFocused();
  await expect(page.locator(".pm-link-picker-heading")).toHaveText("Recents");
  await expect(page.locator(".pm-link-picker").getByRole("option")).toHaveCount(3);
  if (variant === "notdown") {
    await page.screenshot({ path: ".run/logs/link-picker-full.png" });
    await page.locator(".pm-link-picker").screenshot({ path: ".run/logs/link-picker-panel.png" });
  }
  await input(page).fill("Python");
  await expect(page.locator(".pm-link-picker").getByRole("option")).toHaveCount(2);
  await expect(page.locator(".pm-link-picker").getByRole("option").filter({ hasText: "CS" })).toBeVisible();
  await expect(page.locator(".pm-link-picker").getByRole("option").filter({ hasText: "Other notebook" })).toBeVisible();
  await input(page).press("ArrowDown");
  await input(page).press("ArrowUp");
  const selected = await page.locator('.pm-link-picker-option[aria-selected="true"]').innerText();
  const target = selected.includes("Other notebook") ? duplicate : python;
  await input(page).press("Enter");
  await expect(page.locator(".pm-link-picker")).toHaveCount(0);
  const link = page.locator(`.pm-document h3 a[href="#page/${target.id}"]`);
  await expect(link).toHaveText("工程能力");
  await expect(page.locator(".pm-document h3 strong")).toHaveText("工程能力");
  await page.keyboard.press("Control+z");
  await expect(page.locator(".pm-document h3 a")).toHaveCount(0);
  await expect(page.locator(".pm-document h3 strong")).toHaveText("工程能力");
  await page.keyboard.press("Control+y");
  await expect(link).toHaveText("工程能力");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain(`#page/${target.id}`);
  await page.reload();
  await expect(link).toHaveText("工程能力");
  await link.click();
  await expect(page).toHaveURL(new RegExp(`#page/${target.id}$`));
});

test("link picker edits and removes existing links, cancels, accepts web URLs and reports no results", async ({ page, request }) => {
  await setup(page, request);
  await selectWords(page);
  await page.keyboard.press("Control+k");
  await input(page).fill("No such page 84923");
  await expect(page.getByText("No pages found", { exact: true })).toBeVisible();
  await input(page).press("Enter");
  await expect(input(page)).toBeVisible();
  await input(page).fill("javascript:alert(1)");
  await expect(page.locator(".pm-link-picker").getByRole("option")).toHaveCount(0);
  await input(page).press("Escape");
  await expect(page.locator(".pm-document h3 a")).toHaveCount(0);
  await page.keyboard.press("Control+k");
  await input(page).fill("example.com/docs");
  await page.locator(".pm-link-picker").getByRole("option", { name: /Link to web page/ }).click();
  await expect(page.locator(".pm-document h3 a")).toHaveAttribute("href", "https://example.com/docs");
  await selectWords(page);
  await page.keyboard.press("Control+k");
  await expect(input(page)).toHaveValue("https://example.com/docs");
  await input(page).fill("Python");
  await page.locator(".pm-link-picker").getByRole("option").filter({ hasText: "Other notebook" }).click();
  await expect(page.locator(".pm-document h3 a")).toHaveAttribute("href", /^#page\//);
  await selectWords(page);
  await page.keyboard.press("Control+k");
  await page.getByRole("button", { name: "Remove link", exact: true }).click();
  await expect(page.locator(".pm-document h3 a")).toHaveCount(0);
  await expect(page.locator(".pm-document h3 strong")).toHaveText("工程能力");
  await page.keyboard.press("Control+k");
  await page.locator("#page-title").click();
  await expect(page.locator(".pm-link-picker")).toHaveCount(0);
});

test("a caret inserts a page title as an ordinary link and the picker fits a narrow viewport", async ({ page, request }) => {
  const { python } = await setup(page, request);
  await page.setViewportSize({ width: 640, height: 720 });
  await page.locator(".pm-document h3").click();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Control+k");
  await input(page).fill("Python");
  const bounds = await page.locator(".pm-link-picker").boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(640);
  await page.locator(".pm-link-picker").getByRole("option").filter({ hasText: "CS" }).click();
  await expect(page.locator(`.pm-document a[href="#page/${python.id}"]`)).toHaveText("Python");
});

test("link picker keeps IME Enter inert and rejects edits after its document changes", async ({ page, request }) => {
  await setup(page, request);
  await selectWords(page);
  await page.keyboard.press("Control+k");
  await input(page).fill("Python");
  await input(page).dispatchEvent("keydown", { key: "Enter", isComposing: true });
  await expect(input(page)).toBeVisible();
  // Keyboard focus can return to the document without an outside pointer click.
  await page.locator(".pm-document").press("ArrowRight");
  await page.keyboard.type(" newer draft");
  await page.locator(".pm-link-picker").getByRole("option").filter({ hasText: "CS" }).click();
  await expect(page.locator(".pm-link-picker output")).toContainText("Content changed");
  await expect(page.locator(".pm-document")).toContainText("newer draft");
  await expect(page.locator(".pm-document a")).toHaveCount(0);
});
