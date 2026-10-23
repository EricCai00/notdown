import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

async function open(page: Page, request: APIRequestContext, body = '<bookmark custom="keep"/>\n\nTail') {
  const note = await (await request.post("/api/pages", { data: { title: "Web bookmark", body, syntax: { version: 1, variant: "notdown", extensions: {} } } })).json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
  await page.goto("/"); return note;
}
const metadata = { title: "哔哩哔哩 (゜-゜)つロ 干杯~-bilibili", description: "哔哩哔哩（bilibili.com)是国内知名的视频弹幕网站，这里有及时的动漫新番，活跃的ACG氛围，有创意的Up主。大家可以在这里找到许多欢乐。", icon: "https://i0.hdslb.com/bfs/static/jinkela/long/images/512.png", image: "" };

test("bookmark empty state, URL validation, creation, undo, persistence and responsive card", async ({ page, request }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/bookmarks/resolve", route => route.fulfill({ json: metadata }));
  const note = await open(page, request);
  const block = page.locator(".pm-object-web_bookmark");
  await block.getByRole("button", { name: "Add a web bookmark" }).click();
  const dialog = page.getByRole("dialog", { name: "Web bookmark", exact: true });
  await expect(dialog.getByLabel("Bookmark URL")).toBeFocused();
  await expect(dialog.getByRole("button", { name: "Create bookmark" })).toBeDisabled();
  await dialog.getByLabel("Bookmark URL").fill("javascript:alert(1)");
  await dialog.getByRole("button", { name: "Create bookmark" }).click();
  await expect(dialog).toContainText("Enter a valid");
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
  await block.getByRole("button", { name: "Add a web bookmark" }).click();
  await dialog.getByLabel("Bookmark URL").fill("http://bilibili.com");
  await page.screenshot({ path: "test-results/bookmark-create.png" });
  await dialog.getByLabel("Bookmark URL").press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(block.locator(".pm-bookmark-title")).toHaveText(metadata.title);
  await expect(block.getByRole("link")).toHaveAttribute("target", "_blank");
  await expect(block.getByRole("link")).toHaveAttribute("href", "http://bilibili.com/");
  await page.keyboard.press("Control+z"); await expect(block.getByRole("button", { name: "Add a web bookmark" })).toBeVisible();
  await page.keyboard.press("Control+Shift+z"); await expect(block).toContainText(metadata.title);
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain(`icon="${metadata.icon}"`);
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain('custom="keep"');
  await page.reload(); await expect(block).toContainText(metadata.title);
  await block.screenshot({ path: "test-results/bookmark-card.png" });
  await page.context().route("http://bilibili.com/**", route => route.fulfill({ contentType: "text/html", body: "<title>Bookmark destination</title>" }));
  const [popup] = await Promise.all([page.waitForEvent("popup"), block.locator(".pm-bookmark-card").click()]);
  await expect(popup).toHaveURL("http://bilibili.com/"); await popup.close();
  await block.hover(); await block.getByRole("button", { name: "Edit bookmark link" }).click();
  await dialog.getByLabel("Bookmark URL").fill("https://discard.example");
  await page.locator(".page-title").click(); await expect(dialog).toHaveCount(0);
  await expect(block.getByRole("link")).toHaveAttribute("href", "http://bilibili.com/");
  await page.setViewportSize({ width: 390, height: 844 });
  await block.getByRole("button", { name: "Edit bookmark link" }).click();
  const bounds = await dialog.boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/bookmark-mobile.png" });
  expect(errors).toEqual([]);
});

test("slash inserts an empty bookmark and plain URL paste offers Bookmark", async ({ page, request }) => {
  await page.route("**/api/bookmarks/resolve", route => route.fulfill({ json: { ...metadata, title: "Pasted bookmark", icon: "" } }));
  await open(page, request, "Tail");
  const editor = page.locator(".pm-document");
  await editor.locator("p").first().click(); await page.keyboard.press("Home"); await page.keyboard.press("Enter"); await page.keyboard.press("ArrowUp"); await page.keyboard.type("/bookmark");
  await page.locator('[data-insert="web_bookmark"]').click();
  await expect(page.getByRole("button", { name: "Add a web bookmark" })).toBeVisible();
  await editor.locator("p").last().click();
  await editor.evaluate(el => {
    const data = new DataTransfer(); data.setData("text/plain", "https://example.com/article");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(page.getByRole("menuitem", { name: "Mention", exact: true })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Bookmark", exact: true }).click();
  await expect(editor.locator(".pm-bookmark-title")).toHaveText("Pasted bookmark");
});

test("failed metadata keeps URL; late responses never overwrite replaced or removed bookmarks", async ({ page, request }) => {
  await page.route("**/api/bookmarks/resolve", route => route.fulfill({ status: 502, json: { error: "Unavailable" } }));
  const note = await open(page, request);
  await page.getByRole("button", { name: "Add a web bookmark" }).click();
  await page.getByLabel("Bookmark URL").fill("https://example.com/missing"); await page.getByLabel("Bookmark URL").press("Enter");
  await expect(page.locator(".pm-bookmark-card")).toContainText("example.com");
  await expect(page.locator(".pm-bookmark-status")).toContainText("Link saved");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("https://example.com/missing");
  let finish!: () => void;
  await page.unroute("**/api/bookmarks/resolve");
  await page.route("**/api/bookmarks/resolve", async route => {
    await new Promise<void>(resolve => { finish = resolve; });
    await route.fulfill({ json: { ...metadata, title: "Stale result" } }).catch(() => {});
  });
  await page.locator(".pm-object-web_bookmark").hover();
  await page.getByRole("button", { name: "Refresh bookmark" }).click();
  await expect.poll(() => !!finish).toBe(true);
  const latest = await (await request.get(`/api/pages/${note.id}`)).json();
  await request.put(`/api/pages/${note.id}`, { data: { body: "External replacement", baseRevision: latest.revision } });
  await expect(page.locator(".pm-document")).toContainText("External replacement", { timeout: 10000 });
  finish();
  await expect(page.locator(".pm-object-web_bookmark")).toHaveCount(0);
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe("External replacement");
});

test("cancel during creation discards the response and broken images keep the card usable", async ({ page, request }) => {
  let finish!: () => void;
  await page.route("**/api/bookmarks/resolve", async route => {
    await new Promise<void>(resolve => { finish = resolve; });
    await route.fulfill({ json: metadata }).catch(() => {});
  });
  await open(page, request);
  await page.getByRole("button", { name: "Add a web bookmark" }).click();
  await page.getByLabel("Bookmark URL").fill("https://example.com");
  await page.getByLabel("Bookmark URL").press("Enter");
  await expect.poll(() => !!finish).toBe(true);
  await page.keyboard.press("Escape"); finish();
  await expect(page.getByRole("dialog", { name: "Web bookmark", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add a web bookmark" })).toBeVisible();
  await page.unroute("**/api/bookmarks/resolve");
  await page.route("**/api/bookmarks/resolve", route => route.fulfill({ json: { ...metadata, icon: "https://example.com/missing-icon.png", image: "https://example.com/missing-cover.png" } }));
  await page.route("https://example.com/*.png", route => route.fulfill({ status: 404, body: "" }));
  await page.getByRole("button", { name: "Add a web bookmark" }).click();
  await page.getByLabel("Bookmark URL").fill("https://example.com"); await page.getByLabel("Bookmark URL").press("Enter");
  await expect(page.locator(".pm-bookmark-card")).toContainText(metadata.title);
  await expect(page.locator(".pm-bookmark-image")).toHaveCount(0);
  await expect(page.locator(".pm-bookmark-icon svg")).toHaveCount(1);
});

test("URL-only bookmarks load a visual preview without editing the document; refresh saves it", async ({ page, request }, testInfo) => {
  const preview = { ...metadata, title: "bilibili", icon: "https://example.com/bookmark-icon.svg" };
  await page.route(preview.icon, route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26"><rect width="26" height="26" rx="5" fill="#ed7199"/><path d="M6 10h14v10H6zM9 6l3 4m5-4-3 4" fill="none" stroke="white" stroke-width="2"/></svg>' }));
  await page.route("**/api/bookmarks/resolve", route => route.fulfill({ json: preview }));
  const source = '<bookmark url="https://www.bilibili.com/" caption="Saved caption" custom="keep"/>\n\nTail';
  const note = await open(page, request, source);
  const block = page.locator(".pm-object-web_bookmark");
  await expect(block.locator(".pm-bookmark-title")).toHaveText(preview.title);
  await expect(block.locator(".pm-bookmark-description")).toHaveText(preview.description);
  await expect(block.locator(".pm-bookmark-icon img")).toBeVisible();
  await expect(block.locator(".pm-bookmark-caption")).toHaveText("Saved caption");
  await page.keyboard.press("Control+s");
  const unchanged = await (await request.get(`/api/pages/${note.id}`)).json();
  expect(unchanged.body).toBe(source);
  expect(unchanged.revision).toBe(note.revision);
  await page.reload();
  await expect(block.locator(".pm-bookmark-icon img")).toBeVisible();
  await block.screenshot({ path: testInfo.outputPath("bookmark-notion-desktop.png") });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(block).toBeInViewport();
  const bounds = await block.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await block.screenshot({ path: testInfo.outputPath("bookmark-notion-mobile.png") });

  await block.getByRole("button", { name: "Refresh bookmark" }).click();
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain('title="bilibili"');
  const saved = await (await request.get(`/api/pages/${note.id}`)).json();
  expect(saved.body).toContain('custom="keep"');
  expect(saved.body).toContain('caption="Saved caption"');
  expect(saved.body).toContain(`icon="${preview.icon}"`);
});

test("a delayed automatic preview cannot replace a changed URL or saved metadata", async ({ page, request }) => {
  let finish!: () => void;
  await page.route("**/api/bookmarks/resolve", async route => {
    await new Promise<void>(resolve => { finish = resolve; });
    await route.fulfill({ json: { ...metadata, title: "Stale preview" } }).catch(() => {});
  });
  const note = await open(page, request, '<bookmark url="https://old.example.com/"/>\n\nTail');
  await expect.poll(() => !!finish).toBe(true);
  const replacement = '<bookmark url="https://new.example.com/" title="My saved title" description="My saved description"/>\n\nTail';
  await request.put(`/api/pages/${note.id}`, { data: { body: replacement, baseRevision: note.revision } });
  const block = page.locator(".pm-object-web_bookmark");
  await expect(block.locator(".pm-bookmark-title")).toHaveText("My saved title", { timeout: 10000 });
  finish();
  await expect(block.locator(".pm-bookmark-description")).toHaveText("My saved description");
  await expect(block.getByRole("link")).toHaveAttribute("href", "https://new.example.com/");
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(replacement);
  await page.reload();
  await expect(block.locator(".pm-bookmark-title")).toHaveText("My saved title");
});
