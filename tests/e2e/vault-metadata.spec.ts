import { test, expect } from "@playwright/test";
import { expectSource } from "./source-helper";

for (const [label, header] of [
  ["YAML", "---\ntitle: Document title\nauthor: Alice\n---\n\n"],
  ["Pandoc", "% Document title\n% Alice\n% 2026\n\n"],
]) test(`${label} source is the complete file and removing overrides restores JSON defaults`, async ({ page, request }) => {
  const source = header + "Body";
  const response = await request.post("/api/pages", { data: {
    title: "JSON default", properties: { author: "Bob" }, body: source,
    bodyFormat: "markdown", syntax: { version: 1, variant: "markdown", extensions: {} },
  } });
  expect(response.ok()).toBeTruthy();
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator("#page-title")).toHaveValue("Document title");
  await page.locator('[data-mode="source"]').click();
  await expectSource(page, source);
  expect(await (await request.get(`/api/pages/${note.id}/source`)).text()).toBe(source);
  await page.locator("#page-title").fill("Edited title");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).title).toBe("Edited title");
  await expectSource(page, source.replace("Document title", "Edited title"));
  const editor = page.locator("#source-editor");
  await editor.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText("Body without metadata");
  await page.locator('[data-mode="document"]').click();
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).title).toBe("JSON default");
  await expect(page.locator("#page-title")).toHaveValue("JSON default");
  const saved = await (await request.get(`/api/pages/${note.id}`)).json();
  expect(saved.properties.author).toBe("Bob");
  expect(await (await request.get(`/api/pages/${note.id}/source`)).text()).toBe(saved.body);
  expect(saved.body).toBe("Body without metadata");
});
