import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { openBlockProperties } from "./block-properties-helper";
async function syncAction(page: Page, name: string) {
  await page.locator(".pm-object-synced_block").hover();
  await page.getByRole("button", { name: "Synced block options", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}
async function open(page: Page, request: APIRequestContext, body: string, variant = "markdown") {
  const response = await request.post("/api/pages", { data: { title: "Local object editing", body, bodyFormat: ["notion-markdown", "notdown"].includes(variant) ? "notion-markdown" : "markdown", syntax: { version: 1, variant, extensions: { metadata_values: true, notion_tabs: true, notion_bookmark: true, notion_link_preview: true, notion_breadcrumb: true, notion_button: true, notion_meeting_notes: true, notion_ai_block: true, notion_html_document: true } } } });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.goto(`/#page/${note.id}`); return note;
}

test("abbreviation properties update its definition and survive undo and reopening", async ({ page, request }) => {
  const note = await open(page, request, 'An HTML document.\n\n*[HTML]: Hyper Text Markup Language', 'markdown_phpextra');
  await page.locator('.pm-document abbr').dblclick();
  await page.getByRole('dialog').getByLabel('Expansion').fill('Updated expansion');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.pm-document abbr')).toHaveAttribute('title', 'Updated expansion');
  await page.keyboard.press('Control+z');
  await expect(page.locator('.pm-document abbr')).toHaveAttribute('title', 'Hyper Text Markup Language');
  await page.keyboard.press('Control+Shift+z'); await page.keyboard.press('Control+s');
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain('*[HTML]: Updated expansion');
  await page.reload(); await expect(page.locator('.pm-document abbr')).toHaveAttribute('title', 'Updated expansion');
});

test("live synced refresh stops before replacing local edits", async ({ page, request }) => {
  const source = await (await request.post('/api/pages', { data: { title: 'Live source', body: '<synced_block id="live">\nFirst source\n</synced_block>', bodyFormat: 'notion-markdown', syntax: { version: 1, variant: 'notdown', extensions: {} } } })).json();
  await open(page, request, `<synced_block_reference url="#page/${source.id}#block=live">\nSnapshot\n</synced_block_reference>`, 'notdown');
  await syncAction(page, 'Refresh from source');
  const content = page.locator('.pm-object-synced_block .pm-object-content'); await expect(content).toHaveText('First source');
  await syncAction(page, 'Toggle live refresh');
  const properties = await openBlockProperties(page, page.locator('.pm-object-synced_block'));
  await properties.getByLabel('Source reference', { exact: true }).fill('#page/unsaved-target');
  const updated = await (await request.put(`/api/pages/${source.id}`, { data: { body: '<synced_block id="live">\nSecond source\n</synced_block>', baseRevision: source.revision } })).json();
  await expect(content).toHaveText('Second source', { timeout: 10000 });
  await expect(properties.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await expect(properties.getByLabel('Source reference', { exact: true })).toHaveValue('#page/unsaved-target');
  await properties.getByRole('button', { name: 'Cancel', exact: true }).click();
  await content.locator('p').click(); await page.keyboard.press('End'); await page.keyboard.type(' local edit');
  await request.put(`/api/pages/${source.id}`, { data: { body: '<synced_block id="live">\nThird source\n</synced_block>', baseRevision: updated.revision } });
  await page.clock.install(); await page.clock.fastForward(5000);
  await expect(content).toHaveText('Second source local edit');
});

test("date reminders appear locally and are acknowledged across reloads", async ({ page, request }) => {
  await open(page, request, '<mention-date start="2020-01-01" reminder="2020-01-01T09:00:00Z">Review item</mention-date>', 'notdown');
  await expect(page.locator('.toast')).toContainText('Reminder');
  await page.reload(); await expect(page.locator('.pm-date-mention')).toContainText('January 1, 2020');
  await expect(page.locator('.pm-date-mention')).toHaveAttribute('title', /Review item/);
  await expect(page.locator('.toast').filter({ hasText: 'Reminder' })).toHaveCount(0);
});
test("table controls retain spans, caption and undo through saving", async ({ page, request }) => {
  const note = await open(page, request, "| A | B |\n|---|---|\n| C | D |");
  await page.locator(".pm-table th, .pm-table td").first().click();
  await page.getByRole("button", { name: "Merge right", exact: true }).click();
  await expect(page.locator(".pm-table [colspan='2']")).toContainText("A");
  await page.getByRole("button", { name: "Split cell", exact: true }).click();
  await expect(page.locator(".pm-table [colspan='2']")).toHaveCount(0);
  await page.getByRole("button", { name: "Add caption", exact: true }).click();
  await expect(page.locator(".pm-table caption")).toHaveText("Table caption");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("Table: Table caption");
  await page.reload(); await expect(page.locator(".pm-table caption")).toHaveText("Table caption");
});
test("definition items move independently and metadata fields preserve other values", async ({ page, request }) => {
  const note = await open(page, request, "% Title\n% Author\n% 2026\n\nFirst\n:   First definition\n\nSecond\n:   Second definition");
  const metadata = page.locator('.page-metadata-summary');
  await page.locator(".page-properties > summary").click();
  await page.getByRole("button", { name: "Pandoc title block details" }).click();
  await page.locator(".page-metadata-dialog").getByRole("button", { name: "Edit fields" }).click();
  const properties = page.locator(".pm-block-properties-dialog");
  await properties.getByLabel("Metadata author", { exact: true }).fill("Changed author");
  await properties.getByRole("button", { name: "Save", exact: true }).click();
  await page.keyboard.press("Control+z"); await expect(metadata).not.toContainText("Changed author");
  await page.keyboard.press("Control+Shift+z"); await expect(metadata).toContainText("Changed author");
  await page.locator(".pm-definition-list dt").last().click();
  await page.getByRole("button", { name: "Move definition up", exact: true }).click();
  await expect(page.locator(".pm-definition-list dt")).toHaveText(["Second", "First"]);
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("% Changed author");
  await page.reload(); await expect(page.locator(".pm-definition-list dt")).toHaveText(["Second", "First"]);
});
test("synced block publishes with its captured source revision and preserves concurrent source edits", async ({ page, request }) => {
  const source = await (await request.post("/api/pages", { data: { title: "Sync source", body: '<synced_block id="shared">\nSource text\n</synced_block>', bodyFormat: "notion-markdown", syntax: { version: 1, variant: "notdown", extensions: {} } } })).json();
  await open(page, request, `<synced_block_reference url="#page/${source.id}#block=shared">\nOld snapshot\n</synced_block_reference>`, "notdown");
  await syncAction(page, "Refresh from source");
  const content = page.locator(".pm-object-synced_block .pm-object-content");
  await expect(content).toHaveText("Source text");
  await content.locator("p").click(); await page.keyboard.press("End"); await page.keyboard.type(" edited");
  await syncAction(page, "Publish to source");
  await expect.poll(async () => (await (await request.get(`/api/pages/${source.id}`)).json()).body).toContain("Source text edited");
  const latest = await (await request.get(`/api/pages/${source.id}`)).json();
  await request.put(`/api/pages/${source.id}`, { data: { body: '<synced_block id="shared">\nConcurrent source\n</synced_block>', baseRevision: latest.revision } });
  await content.locator("p").click(); await page.keyboard.press("End"); await page.keyboard.type(" local draft");
  await syncAction(page, "Publish to source");
  await expect(page.locator(".pm-object-synced_block output")).not.toContainText("Published");
  await expect.poll(async () => (await (await request.get("/api/conflicts")).json()).some((c: any) => c.pageId === source.id && c.proposed?.body.includes("local draft"))).toBe(true);
  expect((await (await request.get(`/api/pages/${source.id}`)).json()).body).toContain("Concurrent source");
  await expect(content).toContainText("local draft");
});
