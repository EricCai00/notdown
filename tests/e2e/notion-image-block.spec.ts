import { test, expect } from "@playwright/test";
import { notionImagesRoot, notionImagesSource } from "../unit/notion-import-fixture";
import { stablePageUuid } from "../../src/vault/page-id";

for (const variant of ["notdown", "notion-markdown"]) test(`${variant} imported images keep block identity through caption editing and reload`, async ({ page, request }) => {
  await page.route("https://example.com/*.png", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"><rect width="300" height="100" fill="#89aacc"/></svg>' }));
  const response = await request.post("/api/notion/import/preview", { data: { token: "test-secret-not-saved", pageId: notionImagesRoot, variant, includeChildren: false, downloadAssets: false } });
  expect(response.ok()).toBeTruthy();
  const preview = await response.json();
  expect((await request.post("/api/import/commit", { data: { id: preview.id } })).ok()).toBeTruthy();
  const id = stablePageUuid(`notion-${preview.id.slice(0, 24)}-${notionImagesRoot}`);
  const stored = async () => (await (await request.get(`/api/pages/${id}`)).json()).body;
  expect(await stored()).toBe(notionImagesSource);
  await page.goto(`/#page/${id}`);
  const blocks = page.locator(".pm-document figure.pm-image-block-view");
  await expect(blocks).toHaveCount(3);
  const types = () => page.locator(".pm-document[contenteditable=true]").evaluate(element => {
    const found: string[] = [];
    (element as any).pmViewDesc.node.descendants((node: any) => {
      if (node.type.name.includes("image")) found.push(node.type.name);
    });
    return found;
  });
  await expect.poll(types).toEqual(Array(3).fill("block.image_block"));
  await blocks.first().hover();
  await blocks.first().getByRole("button", { name: "Edit caption", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Image caption", exact: true });
  await dialog.getByLabel("Caption", { exact: true }).fill("Added caption");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await page.keyboard.press("Control+s");
  await expect.poll(stored).toContain('<image source="https://example.com/empty.png">Added caption</image>');
  await page.reload();
  await expect.poll(types).toEqual(Array(3).fill("block.image_block"));
  await expect(blocks.first().locator("figcaption")).toHaveText("Added caption");
  await page.screenshot({ path: `test-results/notion-image-block-${variant}.png` });
  await blocks.first().hover();
  await blocks.first().getByRole("button", { name: "Edit caption", exact: true }).click();
  await dialog.getByLabel("Caption", { exact: true }).fill("");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await page.keyboard.press("Control+s");
  await expect.poll(stored).toContain('<image source="https://example.com/empty.png"></image>');
  await page.reload();
  await expect.poll(types).toEqual(Array(3).fill("block.image_block"));
  await expect(blocks.first().locator("figcaption")).toBeHidden();
});
