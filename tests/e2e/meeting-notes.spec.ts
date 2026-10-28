import { expect, test, type Page, type APIRequestContext } from "@playwright/test";

const empty = '<meeting-notes future="keep">\n\tMeeting <mention-date start="2026-09-27"/>\n\t<notes>\n\t\t\n\t</notes>\n</meeting-notes>';
async function open(page: Page, request: APIRequestContext, body = empty, variant = "notdown") {
  const response = await request.post("/api/pages", { data: { title: "Meeting notes", body, bodyFormat: "notion-markdown", syntax: { version: 1, variant, extensions: {} } } });
  expect(response.status()).toBe(201); const note = await response.json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id); await page.goto("/");
  await expect(page.locator(".pm-object-meeting_notes")).toBeVisible(); return note;
}

for (const variant of ["notdown", "notion-markdown"]) {
  test(`${variant}: page outline excludes the meeting card title and keeps document headings`, async ({ page, request }) => {
    const source = [
      "# Page heading",
      '## Toggle heading {toggle="true"}\n\t### Nested heading',
      "<columns>\n\t<column>\n\t\t#### Column heading\n\t</column>\n\t<column>\n\t\tOther content\n\t</column>\n</columns>",
      empty.replace("\t\t\n", "\t\t#### Notes heading\n"),
      "<table_of_contents/>",
    ].join("\n\n");
    const note = await open(page, request, source, variant);
    const headings = ["Page heading", "Toggle heading", "Nested heading", "Column heading", "Notes heading"];
    const toc = page.locator("#floating-toc");
    const entries = toc.getByRole("button");
    await expect(page.locator(".pm-object-meeting_notes > header h3")).toContainText("Meeting");
    await expect(entries).toHaveText(headings);
    await expect(page.locator(".pm-toc button")).toHaveText(headings);
    await toc.hover();
    await entries.filter({ hasText: /^Column heading$/ }).click();
    await expect(toc.locator('[aria-current="location"]')).toHaveText("Column heading");
    expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(source);

    await page.keyboard.press("Control+e");
    await page.locator("#source-editor").fill(empty);
    await page.keyboard.press("Control+e");
    await expect(page.locator(".pm-object-meeting_notes > header h3")).toBeVisible();
    await expect(toc).toBeHidden();
    await expect(entries).toHaveCount(0);
  });
}

test("meeting card, calendar, language and instruction menus save without losing unknown properties", async ({ page, request }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const note = await open(page, request); const card = page.locator(".pm-object-meeting_notes");
  await expect(card.getByRole("tab", { name: "Notes", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(card.locator(".meeting-content")).toHaveClass(/meeting-empty/);
  await card.evaluate(el => el.style.width = "880px");
  await card.screenshot({ path: "test-results/meeting-empty.png" });
  await card.evaluate(el => el.style.removeProperty("width"));
  await card.locator("header .pm-date-mention").click();
  await page.getByRole("dialog", { name: "Edit date", exact: true }).getByRole("button", { name: "2026-09-28", exact: true }).click();
  await page.getByRole("dialog", { name: "Edit date", exact: true }).getByRole("button", { name: "Done", exact: true }).click();
  await card.getByRole("button", { name: "Meeting settings", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Language/ }).click();
  await page.screenshot({ path: "test-results/meeting-language.png" });
  await page.getByRole("menuitem", { name: "简体中文", exact: true }).click();
  await card.getByRole("button", { name: "Summary instructions", exact: true }).click();
  await page.screenshot({ path: "test-results/meeting-instructions.png" });
  await page.getByRole("menuitem", { name: "Customer Call", exact: true }).click();
  await card.getByRole("button", { name: "Summary instructions", exact: true }).click();
  await page.getByRole("button", { name: "More options for Customer Call", exact: true }).focus();
  await page.getByRole("button", { name: "More options for Customer Call", exact: true }).click();
  await page.getByRole("menuitem", { name: "Set as default", exact: true }).click();
  await card.getByRole("button", { name: "Summary instructions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Add custom instructions", exact: true }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Project review");
  await page.getByRole("textbox", { name: "Instructions", exact: true }).fill("List decisions and risks.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("Project review");
  const saved = (await (await request.get(`/api/pages/${note.id}`)).json()).body;
  expect(saved).toContain('future="keep"'); expect(saved).toContain('start="2026-09-28"'); expect(saved).toContain("meeting-config");
  await page.reload(); await expect(card.getByRole("button", { name: "Summary instructions", exact: true })).toContainText("Project review");
  await card.getByRole("button", { name: "Meeting settings", exact: true }).click(); await expect(page.getByRole("menuitem", { name: /^Language/ })).toContainText("简体中文");
  expect(errors).toEqual([]);
});

test("transcription keeps notes and summary, respects consent and saves its own section", async ({ page, request }) => {
  const note = await open(page, request, empty.replace('\t\t\n', '\t\tOriginal notes\n'));
  const card = page.locator(".pm-object-meeting_notes");
  await page.route("**/api/services/transcribe", async route => { expect(route.request().postDataJSON().path).toMatch(/^assets\//); await route.fulfill({ json: { text: "Transcript from file" } }); });
  await card.getByRole("button", { name: "Start transcribing", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Start transcribing", exact: true });
  await expect(dialog.getByRole("button", { name: "Choose audio or video" })).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  const chooser = page.waitForEvent("filechooser"); await dialog.getByRole("button", { name: "Choose audio or video" }).click();
  await (await chooser).setFiles({ name: "meeting.wav", mimeType: "audio/wav", buffer: Buffer.from("test audio") });
  await expect(card.locator('.pm-meeting-section[data-section="transcript"]')).toContainText("Transcript from file");
  await card.getByRole("tab", { name: "Notes", exact: true }).click();
  await expect(card.locator('.pm-meeting-section[data-section="notes"]')).toBeVisible();
  await expect(card.locator('.pm-meeting-section[data-section="notes"]')).toContainText("Original notes");
  await page.route("**/api/services/generate", async route => { expect(route.request().postDataJSON().context).toContain("Transcript from file"); await route.fulfill({ json: { text: "Decisions and actions" } }); });
  await card.getByRole("button", { name: "Meeting settings", exact: true }).click(); await page.getByRole("menuitem", { name: "Generate summary", exact: true }).click();
  await expect(card.locator('.pm-meeting-section[data-section="summary"]')).toContainText("Decisions and actions");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("Decisions and actions");
  await page.reload(); await expect(card.locator('.pm-meeting-section[data-section="transcript"]')).toContainText("Transcript from file");
  await expect(card.locator('.pm-meeting-section[data-section="notes"]')).toContainText("Original notes");
});

test("a delayed transcript remains recoverable when notes change", async ({ page, request }) => {
  await open(page, request, '<meeting-notes title="Legacy" audio="assets/meeting.wav">\nOriginal notes\n</meeting-notes>');
  let release!: () => void, started!: () => void;
  const wait = new Promise<void>(r => release = r), received = new Promise<void>(r => started = r);
  await page.route("**/api/services/transcribe", async route => { started(); await wait; await route.fulfill({ json: { text: "Late transcript" } }); });
  const card = page.locator(".pm-object-meeting_notes"); await card.getByRole("button", { name: "Start transcribing", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Start transcribing", exact: true }); await dialog.getByRole("checkbox").check(); await dialog.getByRole("button", { name: "Transcribe uploaded file" }).click(); await received;
  await card.locator(".meeting-content p").click(); await page.keyboard.press("End"); await page.keyboard.type(" edited"); release();
  await expect(card.locator("output")).toContainText("Late transcript"); await expect(card.locator(".meeting-content")).toHaveText("Original notes edited");
});

test("official dialect settings stay session-only and menu changes do not rewrite the file", async ({ page, request }) => {
  const note = await open(page, request, empty, "notion-markdown"); const card = page.locator(".pm-object-meeting_notes");
  await card.getByRole("button", { name: "Summary instructions", exact: true }).click(); await page.getByRole("menuitem", { name: "Stand-Up", exact: true }).click();
  await page.keyboard.press("Control+s"); expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(empty);
  await page.setViewportSize({ width: 600, height: 900 }); await page.screenshot({ path: "test-results/meeting-narrow.png" });
  const box = await card.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(600);
});

test("copied tab links reuse saved block anchors and reveal the addressed section", async ({ page, request, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const body = empty.replace('</meeting-notes>', '\t<transcript>\n\t\tSaved transcript\n\t</transcript>\n</meeting-notes>');
  const note = await open(page, request, body), card = page.locator(".pm-object-meeting_notes");
  const tab = card.getByRole("tab", { name: "Transcript", exact: true });
  await tab.click(); await tab.click(); await page.getByRole("menuitem", { name: "Copy link to tab", exact: true }).click();
  await expect(card.locator("output")).toHaveText("Copied");
  const link = await page.evaluate(() => navigator.clipboard.readText()); expect(link).toContain("%5Emeeting-");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("^meeting-");
  await page.goto(link); await expect(card.getByRole("tab", { name: "Transcript", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(card.locator('.pm-meeting-section[data-section="transcript"]')).toBeVisible();
  await card.getByRole("tab", { name: "Transcript", exact: true }).click(); await page.getByRole("menuitem", { name: "Copy link to tab", exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(link);
});
