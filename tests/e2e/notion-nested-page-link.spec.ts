import { test, expect } from "@playwright/test";
import { nestedPageLinksRoot } from "../unit/notion-block-import-fixture";

test("imported v2 list page links render, survive edits and navigate without changing ownership", async ({ page, request }, testInfo) => {
  const response = await request.post("/api/notion/import/preview", { data: {
    token: "test-token-example", pageId: nestedPageLinksRoot, variant: "notdown", includeChildren: true,
    downloadAssets: false, useDesktopCache: false,
  } });
  expect(response.ok(), await response.text()).toBeTruthy();
  const preview = await response.json(), parent = preview.documents[0];
  const childId = /<page-link[^>]*url="#page\/([^"]+)"/.exec(parent.source)![1];
  expect((await request.post("/api/import/commit", { data: { id: preview.id } })).ok()).toBeTruthy();
  await page.goto(`/#page/${parent.id}`);
  const doc = page.locator(".pm-document[contenteditable=true]");
  const owned = doc.locator(`[data-pm-node-type="block.child_page"][data-page-id="${childId}"]`);
  const linked = doc.locator(`[data-pm-node-type="block.link_to_page"][data-page-id="${childId}"]`);
  await expect(owned).toBeVisible();
  await expect(linked).toBeVisible();
  await expect(linked).toHaveAttribute("data-page-relation", "reference");
  await expect(linked.locator(".page-link-reference-arrow")).toBeVisible();
  await expect(linked.locator("xpath=ancestor::li").first()).toContainText("Keep the nested idea");
  await expect(doc).not.toContainText("<page-link");
  expect((await (await request.get(`/api/pages/${parent.id}`)).json()).body).toBe(parent.source);
  await page.reload();
  await expect(linked).toBeVisible();
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await page.getByRole("group", { name: "Editing view", exact: true }).getByRole("button", { name: "Page", exact: true }).click();
  await expect(linked).toBeVisible();
  await doc.locator("p").filter({ hasText: /^Tail$/ }).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" edited");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${parent.id}`)).json()).body).toContain("Tail edited");
  expect((await (await request.get(`/api/pages/${parent.id}`)).json()).body).toContain(`<page-link future="keep" url="#page/${childId}">Same title</page-link>`);
  await page.reload();
  await expect(linked).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("nested-page-link.png") });
  await linked.click();
  await expect(page).toHaveURL(new RegExp(`#page/${childId}$`));
  expect((await (await request.get(`/api/pages/${childId}`)).json()).parent).toBe(parent.id);
});
