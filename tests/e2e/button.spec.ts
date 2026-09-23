import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { escapeXml } from "../../src/document/notion-syntax";

async function open(page: Page, request: APIRequestContext, body: string) {
  const note = await (await request.post("/api/pages", { data: { title: "Button workflow", body, bodyFormat: "notion-markdown", syntax: { version: 1, variant: "notdown", extensions: { notion_button: true } } } })).json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
  await page.goto("/"); await expect(page.locator(".pm-document")).toBeVisible(); return note;
}
const encoded = (actions: unknown[]) => `<button label="Run workflow" icon="📝" actions="${escapeXml(JSON.stringify(actions))}" custom="keep"/>`;

test("clicking the visible legacy button executes it directly and keyboard activation works", async ({ page, request }) => {
  await open(page, request, '<button label="Insert a note" action="insert-text" target="New note"/>\n\nTail');
  const block = page.locator(".pm-object-button"), run = block.getByRole("button", { name: "Insert a note", exact: true });
  await expect(block.getByRole("button")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Run button" })).toHaveCount(0);
  await expect(run).toHaveCSS("min-height", "32px");
  await run.click(); await expect(page.locator(".pm-document > p")).toHaveText(["New note", "Tail"]);
  await run.press("Enter"); await expect(page.locator(".pm-document > p")).toHaveText(["New note", "New note", "Tail"]);
  await page.locator(".pm-document > p").last().click(); await page.keyboard.press("Control+z");
  await expect(page.locator(".pm-document > p")).toHaveText(["New note", "Tail"]);
});

test("slash creates a configurable button; settings, templates, style and icon survive saving", async ({ page, request }) => {
  const note = await open(page, request, "");
  await page.locator(".pm-document").click(); await page.keyboard.type("/button");
  await page.locator('[data-insert="button"]').click();
  const form = page.getByRole("form", { name: "Button settings" });
  await expect(form).toBeVisible();
  await form.getByLabel("Button name").fill("New meeting");
  await form.getByLabel("Style", { exact: true }).selectOption("blue");
  await form.getByRole("button", { name: "Button icon", exact: true }).click();
  await page.getByRole("dialog", { name: "Choose button icon" }).getByLabel("Custom icon").fill("📝");
  await page.getByRole("button", { name: "Use icon" }).click();
  await form.getByRole("button", { name: "Add another step" }).click();
  await form.getByLabel("Blocks (Markdown)").fill("## Meeting agenda\n\n- [ ] Discuss progress\n- [ ] Next steps");
  await expect(form.locator(".pm-button-template-preview h2")).toHaveText("Meeting agenda");
  await page.screenshot({ path: "test-results/button-settings.png", fullPage: true });
  await form.getByRole("button", { name: "Done", exact: true }).click();
  const run = page.locator(".pm-object-button .pm-action-button");
  await expect(run).toHaveAttribute("data-variant", "blue");
  await expect(run).toContainText("📝");
  await run.click(); await expect(page.locator(".pm-document > h2")).toHaveText("Meeting agenda");
  await expect(page.locator('.pm-document input[type="checkbox"]')).toHaveCount(2);
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("actions=");
  await page.reload(); await expect(run).toContainText("New meeting");
  await page.locator(".pm-object-button").hover(); await page.getByRole("button", { name: "Configure button" }).click();
  await expect(form.getByLabel("Blocks (Markdown)")).toHaveValue("## Meeting agenda\n\n- [ ] Discuss progress\n- [ ] Next steps");
  await form.getByLabel("Button name").fill("Discard this draft"); await page.keyboard.press("Escape");
  await expect(form).toHaveCount(0); await expect(run).toContainText("New meeting");
  await page.screenshot({ path: "test-results/button-finished.png", fullPage: true });
});

test("multiple actions are ordered, cancellation is atomic, one undo restores the whole run", async ({ page, request }) => {
  await open(page, request, encoded([
    { type: "insert-blocks", position: "below", content: "First inserted" },
    { type: "confirmation", message: "Insert both paragraphs?" },
    { type: "insert-blocks", position: "below", content: "Second inserted" },
  ]) + "\n\nTail");
  const run = page.getByRole("button", { name: "Run workflow", exact: true });
  await run.click(); await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".pm-document > p")).toHaveText(["Tail"]);
  await run.click(); await expect(run).toBeDisabled();
  await page.getByRole("dialog").getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".pm-document > p")).toHaveText(["First inserted", "Second inserted", "Tail"]);
  await page.locator(".pm-document > p").last().click(); await page.keyboard.press("Control+z");
  await expect(page.locator(".pm-document > p")).toHaveText(["Tail"]);
});

test("action controls validate, duplicate, reorder and delete steps; unknown fields are preserved", async ({ page, request }) => {
  const note = await open(page, request, encoded([{ type: "insert-blocks", position: "below", content: "First", future: { keep: true } }]) + "\n\nTail");
  await page.locator(".pm-object-button").hover(); await page.getByRole("button", { name: "Configure button" }).click();
  const form = page.getByRole("form", { name: "Button settings" });
  await form.getByRole("button", { name: "Duplicate step 1", exact: true }).click();
  await form.getByLabel("Blocks (Markdown)").nth(1).fill("Second");
  await form.getByRole("button", { name: "Move step 2 up" }).click();
  await expect(form.getByLabel("Blocks (Markdown)").first()).toHaveValue("Second");
  await form.getByRole("button", { name: "Delete step 2" }).click();
  await form.getByRole("button", { name: "Add another step" }).click();
  await form.getByLabel("Action 2", { exact: true }).selectOption("open-url");
  await form.getByLabel("Page link or URL").fill("javascript:alert(1)");
  await expect(form.getByRole("button", { name: "Done", exact: true })).toBeDisabled();
  await form.getByLabel("Page link or URL").fill("https://example.com");
  await form.getByRole("button", { name: "Done", exact: true }).click();
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("future");
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain('custom="keep"');
});

test("local page action opens the chosen page after saving document changes", async ({ page, request }) => {
  const target = await (await request.post("/api/pages", { data: { title: "Button destination", body: "Destination body" } })).json();
  const note = await open(page, request, encoded([{ type: "insert-blocks", content: "Saved before navigation", position: "end" }, { type: "open-url", target: "#page/" + target.id }]));
  await page.getByRole("button", { name: "Run workflow", exact: true }).click();
  await expect(page.locator(".pm-document")).toContainText("Destination body");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("Saved before navigation");
});

test("malformed or unsupported actions cannot execute the legacy fallback", async ({ page, request }) => {
  await open(page, request, '<button label="Broken" action="insert-text" target="Must not insert" actions="{"/>');
  await page.getByRole("button", { name: "Broken", exact: true }).click();
  await expect(page.locator(".pm-object-button > output")).toContainText("invalid JSON");
  await expect(page.locator(".pm-document > p")).toHaveCount(0);
});

test("rapid short insertions remain separate undo steps, including while the button has focus", async ({ page, request }) => {
  await open(page, request, '<button label="Add X" action="insert-text" target="x"/>');
  const run = page.getByRole("button", { name: "Add X", exact: true });
  await run.click(); await run.click();
  await expect(page.locator(".pm-document > p")).toHaveText(["x", "x"]);
  await run.press("Control+z");
  await expect(page.locator(".pm-document > p")).toHaveText(["x"]);
});

test("external changes during confirmation cannot be overwritten by the waiting workflow", async ({ page, request }) => {
  const source = encoded([{ type: "confirmation", message: "Proceed?" }, { type: "insert-blocks", content: "Stale insertion" }]);
  const note = await open(page, request, source + "\n\nBefore");
  await page.getByRole("button", { name: "Run workflow", exact: true }).click();
  await request.put(`/api/pages/${note.id}`, { data: { body: source + "\n\nExternal update", baseRevision: note.revision } });
  await expect(page.locator(".pm-document > p")).toHaveText(["External update"], { timeout: 10000 });
  // The app replaces the editor on an external revision; destroying the old
  // ButtonView closes its dialog and cancels the pending workflow.
  await expect(page.getByRole("dialog", { name: "Confirm button action" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run workflow", exact: true })).toBeEnabled();
  await expect(page.locator(".pm-document > p")).toHaveText(["External update"]);
  await page.keyboard.press("Control+s");
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(source + "\n\nExternal update");
});

test("settings fit a narrow viewport and malformed templates leave all content untouched", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, request, encoded([{ type: "insert-blocks", content: "Valid paragraph" }]) + "\n\nTail");
  await page.locator(".pm-object-button").hover(); await page.getByRole("button", { name: "Configure button" }).click();
  const form = page.getByRole("form", { name: "Button settings" });
  await form.getByLabel("Blocks (Markdown)").fill("```js\nUnclosed");
  await form.getByRole("button", { name: "Done", exact: true }).click();
  await expect(form.locator(":scope > output")).toContainText("boundary");
  await expect(page.locator(".pm-document > p")).toHaveText(["Tail"]);
  const box = await form.boundingBox(); expect(box!.x + box!.width).toBeLessThanOrEqual(391);
  await page.screenshot({ path: "test-results/button-mobile.png", fullPage: true });
});
