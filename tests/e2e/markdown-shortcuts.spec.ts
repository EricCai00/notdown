import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

async function open(page: Page, request: APIRequestContext, body: string, variant = "notdown") {
  const response = await request.post("/api/pages", { data: {
    title: "Typing shortcuts", body, bodyFormat: "notion-markdown",
    syntax: { version: 1, variant, extensions: {} },
  } });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator(".pm-document")).toBeVisible();
  return async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body as string;
}

test("nested divider, line, quote and highlight typing survives reload", async ({ page, request }) => {
  const saved = await open(page, request, "Parent\n\tTarget\n\nSibling");
  await page.locator(".pm-document p").filter({ hasText: /^Target$/ }).click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("---");
  await expect(page.locator(".pm-nested-block hr")).toHaveCount(1);
  await page.keyboard.type("| Verse");
  await expect(page.locator(".pm-line-block")).toHaveText("Verse");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type('" Quoted ==bright==');
  await expect(page.locator(".pm-document blockquote mark")).toHaveText("bright");
  await expect.poll(saved).toContain("==bright==");
  await page.reload();
  await expect(page.locator(".pm-nested-block hr")).toHaveCount(1);
  await expect(page.locator(".pm-line-block")).toHaveText("Verse");
  await expect(page.locator(".pm-document blockquote mark")).toHaveText("bright");
});

test("percent comment input switches to block, validates, cancels and restores source on undo", async ({ page, request }) => {
  const saved = await open(page, request, "Parent\n\tTarget\n\nSibling");
  const target = page.locator(".pm-document p").filter({ hasText: /^Target$/ });
  await target.click();
  await page.keyboard.press("End");
  await page.keyboard.type("%%");
  const input = page.getByRole("textbox", { name: "Comment", exact: true });
  await expect(input).toBeFocused();
  await input.fill("inline secret");
  await page.keyboard.press("Control+Enter");
  await expect.poll(saved).toContain("Target%%inline secret%%");
  await page.keyboard.type(" visible");
  await expect.poll(saved).toContain("Target%%inline secret%% visible");
  await expect(page.locator(".pm-comment")).toBeHidden();
  await page.keyboard.press("Enter");
  await page.keyboard.type("%%");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Block comment", exact: true })).toBeVisible();
  await page.screenshot({ path: ".run/logs/comment-input-panel.png" });
  await input.fill("bad %% delimiter");
  await page.getByRole("button", { name: "Insert comment", exact: true }).click();
  expect(await input.evaluate(el => (el as HTMLTextAreaElement).validity.customError)).toBe(true);
  await input.fill("block secret\nsecond line");
  await page.keyboard.press("Control+Enter");
  await expect.poll(saved).toContain("block secret");
  await page.keyboard.press("Control+z");
  await expect(page.locator('.pm-syntax-block[data-syntax-kind="comment"]')).toHaveCount(0);
  await expect(page.locator(".pm-document")).toContainText("%%");
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator('.pm-syntax-block[data-syntax-kind="comment"]')).toBeHidden();
  await page.keyboard.type("After");
  await expect.poll(saved).toContain("After");
  await page.reload();
  await expect(page.locator(".pm-comment")).toBeHidden();
  await expect(page.locator('.pm-syntax-block[data-syntax-kind="comment"]')).toBeHidden();
  await page.locator(".pm-document p").filter({ hasText: /^After$/ }).click();
  await page.keyboard.press("End");
  await page.keyboard.type("%%");
  await expect(input).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(page.locator(".pm-document")).toContainText("After%%");
  await expect.poll(saved).toMatch(/After(?:%%|&#37;&#37;)/);
  await page.reload();
  await expect(page.locator(".pm-document")).toContainText("After%%");
});

test("escaped and unsupported comment/highlight input stays literal", async ({ page, request }) => {
  for (const variant of ["notion-markdown", "notdown"]) {
    await open(page, request, "Text", variant);
    await page.locator(".pm-document > p").click();
    await page.keyboard.press("End");
    await page.keyboard.type(variant === "notdown" ? " \\%% \\==literal==" : " %% ==literal==");
    await expect(page.getByRole("textbox", { name: "Comment", exact: true })).toHaveCount(0);
    await expect(page.locator(".pm-document mark")).toHaveCount(0);
  }
});
