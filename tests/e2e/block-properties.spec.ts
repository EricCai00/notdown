import { test, expect } from "@playwright/test";
import { openBlockProperties } from "./block-properties-helper";
import { objectSamples } from "../../src/document/object-model";

test("block properties open from the handle, cancel drafts, save once, undo and reopen", async ({ page, request }) => {
  const note = await (await request.post("/api/pages", { data: { title: "Block property dialog", body: objectSamples.web_bookmark + "\n\nTail", bodyFormat: "notion-markdown", syntax: { version: 1, variant: "notdown", extensions: { notion_tabs: true, notion_bookmark: true, notion_link_preview: true, notion_breadcrumb: true, notion_button: true, notion_meeting_notes: true, notion_ai_block: true, notion_html_document: true, local_figure: true } } } })).json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
  await page.goto("/");
  const block = page.locator(".pm-object-web_bookmark");
  await expect(block.locator("details, summary, input, textarea")).toHaveCount(0);
  let dialog = await openBlockProperties(page, block);
  await expect(dialog.getByLabel("URL", { exact: true })).toBeFocused();
  await dialog.getByLabel("Title", { exact: true }).fill("Cancelled title");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(block).toContainText("Example");
  dialog = await openBlockProperties(page, block);
  await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue("Example");
  await dialog.getByLabel("Title", { exact: true }).fill("Updated title");
  await dialog.getByLabel("Caption", { exact: true }).fill("Updated caption");
  await page.screenshot({ path: "test-results/block-properties-dialog.png" });
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(block).toContainText("Updated title");
  await expect(block).toContainText("Updated caption");
  await page.keyboard.press("Control+z");
  await expect(block).toContainText("Example");
  await expect(block).not.toContainText("Updated caption");
  await page.keyboard.press("Control+Shift+z");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain('title="Updated title"');
  await page.reload();
  dialog = await openBlockProperties(page, block);
  await expect(dialog.getByLabel("Caption", { exact: true })).toHaveValue("Updated caption");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  dialog = await openBlockProperties(page, block);
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
});

test("external changes cannot be overwritten by an open property draft", async ({ page, request }) => {
  const note = await (await request.post("/api/pages", { data: { title: "External property changes", body: objectSamples.web_bookmark + "\n\nTail", bodyFormat: "notion-markdown", syntax: { version: 1, variant: "notdown", extensions: { notion_tabs: true, notion_bookmark: true, notion_link_preview: true, notion_breadcrumb: true, notion_button: true, notion_meeting_notes: true, notion_ai_block: true, notion_html_document: true, local_figure: true } } } })).json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
  await page.goto("/");
  const dialog = await openBlockProperties(page, page.locator(".pm-object-web_bookmark"));
  await dialog.getByLabel("Title", { exact: true }).fill("Local draft");
  const current = await (await request.get(`/api/pages/${note.id}`)).json();
  await request.put(`/api/pages/${note.id}`, { data: { body: "External replacement", baseRevision: current.revision } });
  await expect(page.locator(".pm-document")).toContainText("External replacement", { timeout: 10000 });
  // A full external refresh replaces the editor and disposes its dialog.
  await expect(dialog).toHaveCount(0);
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe("External replacement");
});
