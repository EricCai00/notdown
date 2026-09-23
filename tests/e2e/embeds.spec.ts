import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { openBlockProperties } from "./block-properties-helper";

async function open(page: Page, request: APIRequestContext, body = "", variant = "notdown") {
  const note = await (await request.post("/api/pages", { data: { title: "Embed creation", body, syntax: { version: 1, variant, extensions: {} } } })).json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
  await page.goto("/"); return note;
}
test("slash HTML embed accepts code, cancels drafts, undoes and persists sandboxed HTML", async ({ page, request }) => {
  const note = await open(page, request);
  const editor = page.locator(".pm-document");
  await editor.click(); await page.keyboard.type("/html"); await page.locator('[data-insert="html_embed"]').click();
  await page.getByRole("button", { name: "Create or upload HTML" }).click();
  const dialog = page.getByRole("dialog", { name: "HTML embed", exact: true });
  await expect(dialog.getByLabel("HTML code")).toBeFocused();
  await expect(dialog.getByRole("button", { name: "Embed HTML" })).toBeDisabled();
  await expect(dialog).not.toContainText("Create with AI");
  const html = '<!doctype html>\n<h1>Hello embed</h1><script>document.body.textContent="Executed"</script>';
  await dialog.getByLabel("HTML code").fill(html);
  await dialog.screenshot({ path: "test-results/html-embed-create.png" });
  await dialog.getByRole("button", { name: "Embed HTML" }).click();
  const frame = page.locator(".pm-html-embed");
  await expect(frame).toHaveAttribute("srcdoc", html); await expect(frame).toHaveAttribute("sandbox", "");
  await expect(page.frameLocator(".pm-html-embed").getByRole("heading")).toHaveText("Hello embed");
  await page.keyboard.press("Control+z"); await expect(page.getByRole("button", { name: "Create or upload HTML" })).toBeVisible();
  await page.keyboard.press("Control+Shift+z"); await expect(frame).toHaveAttribute("srcdoc", html);
  await page.getByRole("button", { name: "Edit HTML", exact: true }).click();
  await dialog.getByLabel("HTML code").fill("Discard me"); await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0); await expect(frame).toHaveAttribute("srcdoc", html);
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("&lt;h1&gt;Hello embed");
  await page.reload(); await expect(frame).toHaveAttribute("srcdoc", html);
  const properties = await openBlockProperties(page, page.locator(".pm-object-html_embed"));
  await expect(properties.getByLabel("HTML document", { exact: true })).toHaveValue(html);
  await properties.getByRole("button", { name: "Cancel", exact: true }).click();
});
test("HTML upload and drop populate editable code; pending drafts cannot replace external content", async ({ page, request }) => {
  const note = await open(page, request, '<html-embed custom="keep"/>\n\nTail');
  await page.getByRole("button", { name: "Create or upload HTML" }).click();
  const dialog = page.getByRole("dialog", { name: "HTML embed", exact: true });
  await dialog.getByLabel("HTML file").setInputFiles({ name: "hello.html", mimeType: "text/html", buffer: Buffer.from("<h2>Uploaded</h2>") });
  await expect(dialog.getByLabel("HTML code")).toHaveValue("<h2>Uploaded</h2>");
  await dialog.locator(".pm-embed-upload").evaluate(el => {
    const data = new DataTransfer(); data.items.add(new File(["<h2>Dropped</h2>"], "drop.html", { type: "text/html" }));
    el.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  });
  await expect(dialog.getByLabel("HTML code")).toHaveValue("<h2>Dropped</h2>");
  await dialog.getByRole("button", { name: "Embed HTML" }).click(); await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("Dropped");
  const saved = await (await request.get(`/api/pages/${note.id}`)).json(); expect(saved.body).toContain('custom="keep"');
  await page.getByRole("button", { name: "Edit HTML", exact: true }).click(); await dialog.getByLabel("HTML code").fill("Stale draft");
  await request.put(`/api/pages/${note.id}`, { data: { body: "External replacement", baseRevision: saved.revision } });
  await expect(editor(page)).toContainText("External replacement", { timeout: 10000 });
  await expect(dialog).toHaveCount(0);
});
function editor(page: Page) { return page.locator(".pm-document"); }
test("slash web embed validates URL, persists edits and fits narrow screens", async ({ page, request }) => {
  await page.route("https://example.com/**", route => route.fulfill({ contentType: "text/html", body: "<h1>Remote page</h1>" }));
  const note = await open(page, request);
  await editor(page).click(); await page.keyboard.type("/web"); await page.locator('[data-insert="embed"]').click();
  await page.getByRole("button", { name: /^Embed anything/ }).click();
  const dialog = page.getByRole("dialog", { name: "Web embed", exact: true });
  await expect(dialog.getByLabel("Embed URL")).toBeFocused();
  await dialog.getByLabel("Embed URL").fill("javascript:alert(1)"); await dialog.getByRole("button", { name: "Embed link" }).click();
  await expect(dialog).toContainText("Enter a valid");
  await dialog.getByLabel("Embed URL").fill("https://example.com/embed?a=1&b=2");
  await dialog.screenshot({ path: "test-results/web-embed-create.png" });
  await dialog.getByLabel("Embed URL").press("Enter");
  const frame = page.locator(".pm-web-embed-frame"); await expect(frame).toHaveAttribute("src", "https://example.com/embed?a=1&b=2");
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts allow-forms allow-presentation");
  await page.keyboard.press("Control+z"); await expect(page.getByRole("button", { name: /^Embed anything/ })).toBeVisible();
  await page.keyboard.press("Control+Shift+z"); await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("<web-embed");
  await page.reload(); await expect(frame).toHaveAttribute("src", "https://example.com/embed?a=1&b=2");
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole("button", { name: "Edit embed link" }).click();
  const bounds = await dialog.boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await dialog.getByLabel("Embed URL").fill("https://example.com/changed"); await dialog.getByLabel("Embed URL").press("Enter");
  await expect(frame).toHaveAttribute("src", "https://example.com/changed");
});
test("Typora iframe keeps its encoding and unknown attributes when edited", async ({ page, request }) => {
  await page.route("https://example.com/**", route => route.fulfill({ contentType: "text/html", body: "Remote" }));
  const note = await open(page, request, '<iframe src="https://example.com/old" height="200" data-custom="keep"></iframe>\n\nTail', "typora");
  await page.getByRole("button", { name: "Edit embed link" }).click();
  await page.getByLabel("Embed URL").fill("https://example.com/new"); await page.getByLabel("Embed URL").press("Enter"); await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain('src="https://example.com/new"');
  const saved = await (await request.get(`/api/pages/${note.id}`)).json(); expect(saved.body).toContain('data-custom="keep"'); expect(saved.body).toContain('<iframe'); expect(saved.body).toContain('Tail');
});
