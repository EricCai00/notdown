import { test, expect } from "@playwright/test";

for (const mode of ["document", "split"]) test(`${mode}: child page and backlink clicks never insert body blocks`, async ({ page, request }) => {
  const create = async (title: string, body: string, parent?: string) => {
    const response = await request.post("/api/pages", { data: {
      title, body, parent, bodyFormat: "notion-markdown", syntax: { version: 1, variant: "notdown", extensions: {} },
    } });
    expect(response.status()).toBe(201);
    return response.json();
  };
  const parent = await create("Click boundary parent", "Parent body");
  const child = await create("Click boundary child", "Child body", parent.id);
  await create("Click boundary backlink", `<mention-page url="#page/${parent.id}">Parent</mention-page>`);
  await page.goto(`/#page/${parent.id}`);
  await expect(page.locator("#page-title")).toHaveValue(parent.title);
  await page.locator(`.editing-modes [data-mode="${mode}"]`).click();
  const paragraphs = page.locator(".pm-document > p");
  const list = page.locator("#children-links .child-pages");
  const summary = list.locator("summary");
  await expect(paragraphs).toHaveText(["Parent body"]);
  await expect(list).toHaveAttribute("open", "");

  await summary.locator('[data-i18n="Child page"]').click();
  await expect(list).not.toHaveAttribute("open");
  await expect(paragraphs).toHaveText(["Parent body"]);
  await summary.locator("svg").first().click();
  await expect(list).toHaveAttribute("open", "");
  await expect(paragraphs).toHaveText(["Parent body"]);
  const summaryBox = (await summary.boundingBox())!;
  await summary.click({ position: { x: summaryBox.width - 8, y: summaryBox.height / 2 } });
  await expect(list).not.toHaveAttribute("open");
  await expect(paragraphs).toHaveText(["Parent body"]);
  await summary.press("Enter");
  await expect(list).toHaveAttribute("open", "");

  await list.click({ position: { x: 100, y: 2 } });
  await page.locator("#backlinks h3").click();
  await expect(paragraphs).toHaveText(["Parent body"]);
  await page.keyboard.press("Control+s");
  const unchanged = await (await request.get(`/api/pages/${parent.id}`)).json();
  expect(unchanged.body).toBe(parent.body);
  expect(unchanged.revision).toBe(parent.revision);

  // Navigation still collects real pending input without adding an empty block.
  await paragraphs.first().click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" pending child navigation");
  await list.locator(`[data-open="${child.id}"]`).click();
  await expect(page.locator("#page-title")).toHaveValue(child.title);
  const saved = await (await request.get(`/api/pages/${parent.id}`)).json();
  expect(saved.body).toBe("Parent body pending child navigation");
  await page.goBack();
  await expect(page.locator("#page-title")).toHaveValue(parent.title);
  await expect(paragraphs).toHaveText(["Parent body pending child navigation"]);
});
