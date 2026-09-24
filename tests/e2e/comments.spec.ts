import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

async function open(page: Page, request: APIRequestContext, body: string) {
  const response = await request.post("/api/pages", { data: {
    title: "Hidden comments", body, bodyFormat: "notion-markdown",
    syntax: { version: 1, variant: "notdown", extensions: {} },
  } });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator(".pm-document")).toBeVisible();
  return async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body as string;
}

async function slash(page: Page, kind: "comment" | "inline_comment") {
  await page.keyboard.type("/comment");
  await page.locator(`[data-insert="${kind}"]`).click();
  await expect(page.getByRole("textbox", { name: "Comment", exact: true })).toBeFocused();
}

test("existing comments occupy no page space and remain intact after adjacent editing", async ({ page, request }) => {
  const source = "First\n\n%%\nBlock secret\n%%\n\nSecond %%Inline secret%% visible {>>Critic secret<<}end\n\nThird";
  const saved = await open(page, request, source);
  const block = page.locator('.pm-syntax-block[data-syntax-kind="comment"]');
  await expect(block).toHaveCount(1);
  await expect(block).toBeHidden();
  await expect(block.getByRole("button", { name: "Edit source", includeHidden: true })).toBeHidden();
  await expect(page.locator(".pm-comment")).toHaveCount(2);
  for (const comment of await page.locator(".pm-comment").all()) await expect(comment).toBeHidden();
  const rows = page.locator(".pm-document > p");
  const first = (await rows.nth(0).boundingBox())!;
  const second = (await rows.nth(1).boundingBox())!;
  const third = (await rows.nth(2).boundingBox())!;
  expect(second.y - first.y - first.height).toBe(third.y - second.y - second.height);
  await rows.last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" edited");
  await expect.poll(saved).toBe(source + " edited");
  await page.reload();
  await expect(block).toBeHidden();
  await expect(rows.last()).toHaveText("Third edited");
});

test("slash block comment opens a dialog, validates boundaries, and supports undo and reload", async ({ page, request }) => {
  const saved = await open(page, request, "Before\n\nAfter");
  await page.locator(".pm-document > p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await slash(page, "comment");
  const input = page.getByRole("textbox", { name: "Comment", exact: true });
  const submit = page.getByRole("button", { name: "Insert comment", exact: true });
  await input.fill("bad %% boundary");
  await submit.click();
  await expect(input).toBeVisible();
  expect(await input.evaluate(el => (el as HTMLTextAreaElement).validity.customError)).toBe(true);
  await input.fill("Private note\nSecond line");
  await submit.click();
  await expect(input).toHaveCount(0);
  const block = page.locator('.pm-syntax-block[data-syntax-kind="comment"]');
  await expect(block).toHaveCount(1);
  await expect(block).toBeHidden();
  await expect.poll(saved).toContain("%%\nPrivate note\nSecond line\n%%");
  await page.keyboard.press("Control+z");
  await expect(block).toHaveCount(0);
  await page.keyboard.press("Control+Shift+z");
  await expect(block).toHaveCount(1);
  await expect.poll(saved).toContain("Private note");
  await page.reload();
  await expect(block).toBeHidden();
  await expect(page.locator(".pm-document")).not.toContainText("bad %% boundary");
});

test("inline comment inserts at the slash position, cancellation adds no comment", async ({ page, request }) => {
  const saved = await open(page, request, "Before after");
  const row = page.locator(".pm-document > p").first();
  await row.click();
  await page.keyboard.press("Home");
  for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowRight");
  await slash(page, "inline_comment");
  await page.getByRole("textbox", { name: "Comment", exact: true }).fill("Discard me");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".pm-comment")).toHaveCount(0);
  await row.click();
  await page.keyboard.press("Home");
  for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowRight");
  await slash(page, "inline_comment");
  await page.getByRole("textbox", { name: "Comment", exact: true }).fill("Private inline");
  await page.getByRole("button", { name: "Insert comment", exact: true }).click();
  await expect(page.locator(".pm-comment")).toHaveCount(1);
  await expect(page.locator(".pm-comment")).toBeHidden();
  await expect(row).toHaveText("Before after");
  await page.keyboard.type("visible ");
  await expect.poll(saved).toBe("Before %%Private inline%%visible after");
  await page.reload();
  await expect(row).toHaveText("Before visible after");
  await expect(page.locator(".pm-comment")).toBeHidden();
});

test("inserting a block comment in an empty page leaves a visible typing position", async ({ page, request }) => {
  const saved = await open(page, request, "");
  await page.locator(".pm-document > p").click();
  await slash(page, "comment");
  await page.getByRole("textbox", { name: "Comment", exact: true }).fill("Keep this comment");
  await page.getByRole("button", { name: "Insert comment", exact: true }).click();
  await page.keyboard.type("Visible text");
  await expect(page.locator(".pm-document > p")).toHaveText("Visible text");
  await expect.poll(saved).toMatch(/%%\nKeep this comment\n%%\s+Visible text/);
});
