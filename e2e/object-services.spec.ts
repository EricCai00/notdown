import { test, expect } from "@playwright/test";
import { objectSamples } from "../src/object-model";
import { openBlockProperties } from "./block-properties-helper";

test("settings configure compatible services; generated and transcribed content saves and undoes", async ({ page, request }) => {
  const response = await request.post("/api/pages", { data: { title: "Configured service objects", body: objectSamples.ai_block + "\n\n" + objectSamples.meeting_notes, bodyFormat: "notion-markdown", syntax: { version: 1, variant: "notdown", extensions: { notion_tabs: true, notion_bookmark: true, notion_link_preview: true, notion_breadcrumb: true, notion_button: true, notion_meeting_notes: true, notion_ai_block: true, notion_html_document: true, local_figure: true } } } });
  const note = await response.json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
  await page.goto("/");
  await page.getByLabel("Page options").click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("API endpoint")).toHaveValue("https://api.openai.com/v1");
  await page.getByLabel("API endpoint").fill("http://127.0.0.1:9999/v1");
  await page.getByLabel("Text model", { exact: true }).fill("test-text-model");
  await page.getByLabel("Transcription model").fill("test-audio-model");
  await page.getByLabel("API key", { exact: true }).fill("fake-browser-test-key");
  await page.getByRole("button", { name: "Save service settings" }).click();
  await expect(page.locator(".settings-section form output")).toHaveText("Service settings saved.");
  const settings = await (await request.get("/api/services/settings")).json();
  expect(settings).toMatchObject({ model: "test-text-model", transcriptionModel: "test-audio-model", hasKey: true });
  expect(JSON.stringify(settings)).not.toContain("fake-browser-test-key");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const ai = page.locator(".pm-object-ai_block"), meeting = page.locator(".pm-object-meeting_notes");
  await page.route("**/api/services/generate", async route => {
    expect(route.request().postDataJSON().prompt).toContain("Summarize");
    await route.fulfill({ json: { text: "Generated paragraph\nSecond line" } });
  });
  await ai.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(ai.locator(".pm-object-content")).toContainText("Generated paragraph");
  await ai.locator(".pm-object-content p").first().click();
  await page.keyboard.press("Control+z");
  await expect(ai.locator(".pm-object-content")).toContainText("Write text to summarize here.");
  await ai.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(ai.locator(".pm-object-content")).toContainText("Generated paragraph");
  const meetingProperties = await openBlockProperties(page, meeting);
  await meetingProperties.getByLabel("Audio attachment").fill("assets/interview.wav");
  await meetingProperties.getByRole("button", { name: "Save", exact: true }).click();
  await page.route("**/api/services/transcribe", async route => {
    expect(route.request().postDataJSON().path).toBe("assets/interview.wav");
    await route.fulfill({ json: { text: "Saved transcript" } });
  });
  await meeting.getByRole("button", { name: "Transcribe", exact: true }).click();
  await expect(meeting.locator(".pm-object-content")).toHaveText("Saved transcript");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("Saved transcript");
  await page.reload();
  await expect(ai.locator(".pm-object-content")).toContainText("Generated paragraph");
  await expect(meeting.locator(".pm-object-content")).toHaveText("Saved transcript");
  await page.screenshot({ path: "test-results/service-objects.png", fullPage: true });
});

test("a delayed service response does not overwrite concurrent edits", async ({ page, request }) => {
  const note = await (await request.post("/api/pages", { data: { title: "Delayed service", body: objectSamples.ai_block, bodyFormat: "notion-markdown", syntax: { version: 1, variant: "notdown", extensions: { notion_tabs: true, notion_bookmark: true, notion_link_preview: true, notion_breadcrumb: true, notion_button: true, notion_meeting_notes: true, notion_ai_block: true, notion_html_document: true, local_figure: true } } } })).json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
  await page.goto("/");
  let release!: () => void, received!: () => void;
  const wait = new Promise<void>(r => release = r), started = new Promise<void>(r => received = r);
  await page.route("**/api/services/generate", async route => { received(); await wait; await route.fulfill({ json: { text: "Delayed result" } }); });
  const ai = page.locator(".pm-object-ai_block");
  await ai.getByRole("button", { name: "Generate", exact: true }).click();
  await started;
  await ai.locator(".pm-object-content p").click(); await page.keyboard.press("End"); await page.keyboard.type(" New edit");
  release();
  await expect(ai.locator("output")).toContainText("Delayed result");
  await expect(ai.locator(".pm-object-content")).toContainText("New edit");
  await expect(ai.locator(".pm-object-content")).not.toContainText("Delayed result");
});

test("tabs switch, edit and reorder; properties survive saving and reopening", async ({ page, request }) => {
  const note = await (await request.post("/api/pages", { data: { title: "Editable tabs", body: objectSamples.tabs, bodyFormat: "notion-markdown", syntax: { version: 1, variant: "notdown", extensions: { notion_tabs: true, notion_bookmark: true, notion_link_preview: true, notion_breadcrumb: true, notion_button: true, notion_meeting_notes: true, notion_ai_block: true, notion_html_document: true, local_figure: true } } } })).json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id); await page.goto("/");
  await expect(page.getByRole("tab", { name: "First", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Second", exact: true }).click();
  const active = page.locator(".pm-object-tab:visible");
  await active.locator(".pm-object-content p").click(); await page.keyboard.press("End"); await page.keyboard.type(" edited");
  await page.getByRole("tab", { name: "Second", exact: true }).click();
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  await page.getByRole("dialog", { name: "Rename tab" }).getByLabel("Tab title").fill("Renamed");
  await page.getByRole("dialog", { name: "Rename tab" }).getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("tab", { name: "Renamed", exact: true }).click();
  await page.getByRole("menuitem", { name: "Move tab left", exact: true }).click();
  await expect(page.getByRole("tab").first()).toHaveText("Renamed");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("Second tab content edited");
  await page.reload();
  await expect(page.getByRole("tab").first()).toHaveText("Renamed");
  await expect(page.locator(".pm-object-tab:visible .pm-object-content")).toContainText("Second tab content edited");
});
