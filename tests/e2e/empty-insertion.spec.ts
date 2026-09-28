import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

async function open(page: Page, request: APIRequestContext, body = "") {
  const response = await request.post("/api/pages", { data: { title: "Empty insertion", body,
    bodyFormat: "notion-markdown", syntax: { version: 1, variant: "notdown", extensions: {} } } });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator(".pm-document")).toBeVisible();
  return note;
}
async function slash(page: Page, id: string) {
  await page.locator(".pm-document > p").last().click();
  await page.keyboard.type("/");
  await page.locator(`[data-insert="${id}"]`).click();
}
async function save(page: Page, request: APIRequestContext, id: string, text: string) {
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${id}`)).json()).body).toContain(text);
}

for (const [id, selector] of [
  ["columns", ".note-column"], ["callout", ".pm-callout-content"],
  ["table", ".pm-table"], ["toggle", ".pm-toggle"],
  ["toggle_heading", ".pm-heading-toggle"], ["alert", ".pm-alert"],
  ["div", ".pm-object-fenced_div"],
  ["synced_block", ".pm-object-synced_block .pm-object-content"],
  ["tabs", ".pm-object-tab:not([hidden]) .pm-object-content"],
]) test(`${id} inserts empty editable content and survives reload`, async ({ page, request }) => {
  const note = await open(page, request);
  await slash(page, id);
  const block = page.locator(selector).first();
  await expect(block).toBeVisible();
  expect(await block.locator("p").allTextContents()).toEqual(expect.arrayContaining([""]));
  expect((await block.locator("p").allTextContents()).every(text => text === "")).toBe(true);
  // The new empty block must be the typing target, without a second click.
  await page.keyboard.type("My own content");
  await expect(block).toContainText("My own content");
  await save(page, request, note.id, "My own content");
  await page.reload();
  await expect(page.locator(selector).first()).toContainText("My own content");
  const body = (await (await request.get(`/api/pages/${note.id}`)).json()).body;
  expect(body).not.toMatch(/Left column content|Right column content|Write a note here|Shared content|First tab content|Toggle list/);
});

for (const [id, selector] of [
  ["bold", "strong"], ["italic", "em"], ["inline", "code"], ["underline", "u"],
  ["strike", "s"], ["subscript", "sub"], ["superscript", "sup"],
  ["highlight", "mark"], ["color", '[data-text-color="blue"]'],
  ["background", '[data-bg-color="yellow"]'], ["small_caps", ".smallcaps"],
]) test(`${id} formats subsequent input without inserting sample words`, async ({ page, request }) => {
  const note = await open(page, request);
  await slash(page, id);
  await expect(page.locator(".pm-document")).toHaveText("");
  await page.keyboard.type("Mine");
  await expect(page.locator(`.pm-document ${selector}`)).toHaveText("Mine");
  await save(page, request, note.id, "Mine");
  await page.reload();
  await expect(page.locator(`.pm-document ${selector}`)).toHaveText("Mine");
  await expect(page.locator(".pm-document")).toHaveText("Mine");
});

test("inline equation starts with an empty input and inserts only the entered formula", async ({ page, request }) => {
  const note = await open(page, request);
  await slash(page, "inline_equation");
  await expect(page.getByLabel("Equation content")).toHaveValue("");
  await page.getByLabel("Equation content").fill("a+b");
  await page.locator("#dialog").getByRole("button", { name: "Insert", exact: true }).click();
  await save(page, request, note.id, "$a+b$");
});

test("empty columns persist without sample content before any typing", async ({ page, request }) => {
  const note = await open(page, request);
  await slash(page, "columns");
  await save(page, request, note.id, "<columns>");
  await page.reload();
  await expect(page.locator(".note-column")).toHaveCount(2);
  expect(await page.locator(".note-column p").allTextContents()).toEqual(["", ""]);
});

test("inline formatting at the cursor keeps surrounding text and supports undo", async ({ page, request }) => {
  const note = await open(page, request, "After");
  await page.locator(".pm-document > p").click();
  await page.keyboard.press("Home");
  await page.keyboard.type("/");
  await page.locator('[data-insert="bold"]').click();
  await page.keyboard.type("Mine");
  await expect(page.locator(".pm-document")).toHaveText("MineAfter");
  await expect(page.locator(".pm-document strong")).toHaveText("Mine");
  await save(page, request, note.id, "**Mine**After");
  await page.keyboard.press("Control+z");
  await expect(page.locator(".pm-document")).not.toContainText("Mine");
});
