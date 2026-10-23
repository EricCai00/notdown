import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

const syntax = { version: 1, variant: "notdown", extensions: {} };
async function create(request: APIRequestContext, title: string, body = "") {
  const response = await request.post("/api/pages", { data: { title, body, bodyFormat: "notion-markdown", syntax } });
  expect(response.status()).toBe(201); return response.json();
}
async function action(page: Page, name: string) {
  await page.locator(".pm-object-synced_block").first().hover();
  await page.getByRole("button", { name: "Synced block options", exact: true }).first().click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}
async function copy(page: Page) {
  await page.locator(".pm-object-synced_block").first().hover();
  await page.getByRole("button", { name: "Copy synced block", exact: true }).first().click();
  await expect(page.locator(".pm-synced-status").first()).toContainText("Copied.");
  return page.evaluate(() => navigator.clipboard.readText());
}
async function paste(page: Page, text: string) {
  await page.locator(".pm-document > p").last().click();
  await page.keyboard.press("End");
  await page.locator(".pm-document").evaluate((element, content) => {
    const clipboardData = new DataTransfer(); clipboardData.setData("text/plain", content);
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }));
  }, text);
}

test("copy, cross-page automatic editing, locations and unsync preserve Markdown", async ({ page, context, request }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const source = await create(request, "Shared original", '<synced_block custom="keep">\nShared **content**\n</synced_block>\n\nAfter');
  const destination = await create(request, "Shared copy");
  await page.goto(`/#page/${source.id}`);
  const clipboard = await copy(page);
  expect(clipboard).toContain("synced_block_reference"); expect(clipboard).toContain('auto-sync="true"');
  await page.goto(`/#page/${destination.id}`); await paste(page, clipboard);
  const content = page.locator(".pm-object-synced_block .pm-object-content");
  await expect(content).toHaveText("Shared content");
  await content.locator("p").click(); await page.keyboard.press("End"); await page.keyboard.type(" updated");
  // Navigation flushes the pending publication, even before the edit debounce expires.
  await page.locator(`[data-open="${source.id}"]`).click();
  await expect(content).toContainText("updated");
  await page.locator(`[data-open="${destination.id}"]`).click();
  await expect.poll(async () => (await (await request.get(`/api/pages/${source.id}`)).json()).body).toContain("updated");
  expect((await (await request.get(`/api/pages/${source.id}`)).json()).body).toContain('custom="keep"');
  // A clean reference observes a later edit to the original without a manual refresh.
  const latest = await (await request.get(`/api/pages/${source.id}`)).json();
  await request.put(`/api/pages/${source.id}`, { data: { body: latest.body.replace("updated", "from original"), baseRevision: latest.revision } });
  await expect(content).toContainText("from original", { timeout: 12000 });
  await page.keyboard.press("Control+s");
  await page.locator(".pm-object-synced_block").hover();
  await page.getByRole("button", { name: "Synced block locations", exact: true }).click();
  const locations = page.getByRole("menu", { name: "Synced block locations" });
  await expect(locations).toContainText("Shared original"); await expect(locations).toContainText("Original");
  await expect(locations).toContainText("Shared copy"); await page.keyboard.press("Escape");
  await action(page, "Unsync");
  await expect(page.locator(".pm-object-synced_block")).toHaveCount(0);
  await expect(page.locator(".pm-document")).toContainText("from original");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${destination.id}`)).json()).body).not.toContain("synced_block");
  const saved = await (await request.get(`/api/pages/${destination.id}`)).json();
  expect(saved.body).toContain("**content");
  await page.reload(); await expect(page.locator(".pm-document strong"), saved.body).toContainText("content");
});

test("same-page copies update in both directions and survive reload", async ({ page, context, request }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const source = await create(request, "Same page", '<synced_block>\nShared\n</synced_block>\n\nOutside');
  await page.goto(`/#page/${source.id}`); const clipboard = await copy(page);
  await paste(page, clipboard);
  await expect(page.locator(".pm-object-synced_block")).toHaveCount(2);
  const contents = page.locator(".pm-object-synced_block .pm-object-content");
  await contents.last().locator("p").first().click(); await page.keyboard.press("End"); await page.keyboard.type(" edited");
  await expect(contents.first()).toContainText("Shared edited");
  await expect(contents.last()).toContainText("Shared edited");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${source.id}`)).json()).body.match(/Shared edited/g)?.length).toBe(2);
  await page.reload(); await expect(contents.first()).toContainText("Shared edited"); await expect(contents.last()).toContainText("Shared edited");
  const blocks = page.locator(".pm-object-synced_block");
  for (const index of [1, 0]) {
    await blocks.nth(index).hover();
    await blocks.nth(index).getByRole("button", { name: "Synced block locations", exact: true }).click();
    const locations = page.getByRole("menu", { name: "Synced block locations" });
    await expect(locations.locator("a")).toHaveCount(1);
    await expect(locations.locator("a")).toContainText("Original");
    await expect(locations.locator("a")).toContainText("This page");
    await expect(blocks.nth(index)).toHaveCSS("background-color", "rgb(228, 237, 250)");
    await expect(blocks.nth(1 - index)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await page.keyboard.press("Escape");
    await expect(blocks.nth(index)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  }
});

test("locations show actual page metadata, keep unnamed sources separate and offer working help", async ({ page, context, request }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const parent = await create(request, "Test");
  const body = '<synced_block>\nSynced content\n</synced_block>';
  const response = await request.post("/api/pages", { data: { title: "Blocks", icon: "book-open", parent: parent.id, body, bodyFormat: "notion-markdown", syntax } });
  expect(response.status()).toBe(201);
  const source = await response.json();
  await create(request, "Unrelated unnamed source", body);
  await page.goto(`/#page/${source.id}`);
  const block = page.locator(".pm-object-synced_block");
  const trigger = page.getByRole("button", { name: "Synced block locations", exact: true });
  const locations = page.getByRole("menu", { name: "Synced block locations" });
  await block.hover(); await trigger.click();
  await expect(locations.locator("a")).toHaveCount(1);
  const original = locations.locator(`a[href="#page/${source.id}"]`);
  await expect(original).toHaveAttribute("aria-current", "page");
  await expect(original).toContainText("Test");
  await expect(original).toContainText("Original");
  await expect(original).toContainText("This page");
  await expect(original.locator('[data-page-icon="book-open"]')).toBeVisible();
  expect((await (await request.get(`/api/pages/${source.id}`)).json()).body).toBe(body);
  await page.keyboard.press("End");
  await expect(locations.getByRole("menuitem", { name: "Learn more about Synced blocks", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  const help = page.getByRole("dialog", { name: "Synced blocks", exact: true });
  await expect(help).toContainText("within this vault");
  await expect(help).toContainText("do not sync with Notion");
  await page.keyboard.press("Escape"); await expect(help).toHaveCount(0);
  await expect(trigger).toBeFocused();
  const clipboard = await copy(page);
  const destination = await create(request, "Shared copy", clipboard);
  await page.goto(`/#page/${destination.id}`);
  await block.hover(); await trigger.click();
  await expect(locations.locator("a")).toHaveCount(2);
  await expect(original).toContainText("Original");
  await expect(original).not.toContainText("This page");
  const current = locations.locator('[aria-current="page"]');
  await expect(current).toContainText("Shared copy");
  await expect(current).not.toContainText("Original");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => locations.evaluate(element => {
    const box = element.getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
  })).toBe(true);
  await original.click();
  await expect(page).toHaveURL(new RegExp(`#page/${source.id}$`));
  await expect(locations).toHaveCount(0);
});

test("automatic publication pauses on conflict and preserves both versions", async ({ page, context, request }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const source = await create(request, "Conflict original", '<synced_block>\nOriginal\n</synced_block>');
  await page.goto(`/#page/${source.id}`); const clipboard = await copy(page);
  const ref = await create(request, "Conflict copy", clipboard);
  const latest = await (await request.get(`/api/pages/${source.id}`)).json();
  await request.put(`/api/pages/${source.id}`, { data: { body: latest.body.replace("Original", "Concurrent source"), baseRevision: latest.revision } });
  // Saved local draft with a captured older source revision must be published with that revision.
  const draft = await (await request.get(`/api/pages/${ref.id}`)).json();
  await request.put(`/api/pages/${ref.id}`, { data: { body: draft.body.replace("Original", "Local draft"), baseRevision: draft.revision } });
  await page.goto(`/#page/${ref.id}`);
  await expect(page.locator(".pm-synced-status")).toContainText("Sync paused", { timeout: 12000 });
  await expect(page.locator(".pm-object-content")).toHaveText("Local draft");
  expect((await (await request.get(`/api/pages/${source.id}`)).json()).body).toContain("Concurrent source");
  await expect.poll(async () => (await (await request.get("/api/conflicts")).json()).filter((c: any) => c.pageId === source.id && c.proposed?.body.includes("Local draft")).length).toBe(1);
  await page.waitForTimeout(2300);
  expect((await (await request.get("/api/conflicts")).json()).filter((c: any) => c.pageId === source.id).length).toBe(1);
});

test("official Notion snapshots have no local sync toolbar", async ({ page, request }) => {
  const response = await request.post("/api/pages", { data: { title: "Official snapshot", body: '<synced_block_reference url="https://notion.so/example" notice="No permission">\nSaved content\n</synced_block_reference>', bodyFormat: "notion-markdown", syntax: { version: 1, variant: "notion-markdown", extensions: {} } } });
  const note = await response.json(); await page.goto(`/#page/${note.id}`);
  await expect(page.locator(".pm-object-content")).toHaveText("Saved content");
  await expect(page.locator(".pm-synced-notice")).toHaveText("No permission");
  await page.locator(".pm-object-synced_block").hover();
  await expect(page.getByRole("toolbar", { name: "Synced block", exact: true })).toBeHidden();
});

test("turn into synced block, original protection, unsync and undo", async ({ page, context, request }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const note = await create(request, "Convert block", "First **paragraph**\n\nOutside");
  await page.goto(`/#page/${note.id}`);
  await page.locator(".pm-document > p").first().hover({ position: { x: 4, y: 4 } });
  await page.getByRole("button", { name: "Drag block or click to open menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Synced block", exact: true }).click();
  await expect(page.locator(".pm-object-content strong")).toHaveText("paragraph");
  const clipboard = await copy(page);
  await create(request, "Another copy", clipboard);
  await action(page, "Unsync");
  await expect(page.locator(".pm-synced-status")).toContainText("Unsync the copies first");
  await expect(page.locator(".pm-object-synced_block")).toHaveCount(1);
  const copies = await (await request.get("/api/pages")).json();
  const other = copies.find((p: any) => p.title === "Another copy");
  await page.goto(`/#page/${other.id}`);
  await action(page, "Unsync");
  await expect(page.locator(".pm-object-synced_block")).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(page.locator(".pm-object-synced_block")).toHaveCount(1);
  await expect(page.locator(".pm-object-content strong")).toHaveText("paragraph");
});
