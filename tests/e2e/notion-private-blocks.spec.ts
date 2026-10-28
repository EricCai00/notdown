import { test, expect } from "@playwright/test";
import { privateRoot } from "../unit/notion-private-blocks-fixture.js";

test("cached Notion AI prompt and output import as an editable block without generating", async ({ page, request }) => {
  let generationRequests = 0;
  await page.route("**/api/services/generate", route => { generationRequests++; return route.abort(); });
  const previewResponse = await request.post("/api/notion/import/preview", { data: { token: "private-block-test-token", pageId: privateRoot, useDesktopCache: true, variant: "notdown", includeChildren: false, downloadAssets: false } });
  expect(previewResponse.ok()).toBeTruthy();
  const preview = await previewResponse.json();
  expect(preview.documents[0].source).toContain('<ai-block prompt="hi"');
  expect((await request.post("/api/import/commit", { data: { id: preview.id } })).ok()).toBeTruthy();
  await page.goto(`/#page/${preview.documents[0].id}`);
  const ai = page.locator(".pm-object-ai_block");
  await expect(ai.locator(".pm-object-content")).toHaveText("Hi!");
  await ai.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(ai.getByRole("textbox", { name: "AI prompt", exact: true })).toHaveText("hi");
  await page.reload();
  await expect(ai.locator(".pm-object-content")).toHaveText("Hi!");
  expect(generationRequests).toBe(0);
  const official = await (await request.post("/api/notion/import/preview", { data: { token: "private-block-test-token", pageId: privateRoot, useDesktopCache: true, variant: "notion-markdown", includeChildren: false, downloadAssets: false } })).json();
  expect(official.documents[0].source).not.toContain("<ai-block");
  expect(official.documents[0].source).toContain("<unknown");
});
