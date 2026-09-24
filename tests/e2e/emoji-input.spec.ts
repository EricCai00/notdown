import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

async function open(page: Page, request: APIRequestContext, variant = "notdown", extensions = {}, body = "") {
  const status = await (await request.get("/api/status")).json();
  expect(status.vaultPath).toMatch(/[\\/]notdown-e2e-[^\\/]+$/);
  const response = await request.post("/api/pages", { data: { title: "Emoji completion", body, syntax: { version: 1, variant, extensions } } });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
  await page.goto("/");
  const editor = page.locator("#editor .pm-document[contenteditable='true']");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Control+End");
  return { editor, id: note.id, menu: page.getByRole("listbox", { name: "Emoji suggestions" }) };
}

test("space-colon-letter opens a filtered grid; keyboard completion, undo and persistence", async ({ page, request }) => {
  const { editor, id, menu } = await open(page, request);
  await page.keyboard.type("Hello :");
  await expect(menu).toHaveCount(0);
  await page.keyboard.type("s");
  await expect(menu).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("emoji-suggestions.png") });
  await expect(editor).toBeFocused();
  await page.keyboard.type("mile");
  await expect(menu.getByRole("option", { name: ":smile:", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(menu.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await expect(editor).toHaveText("Hello 😄");
  await expect(menu).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(editor).toHaveText("Hello :smile");
  await page.keyboard.press("Control+Shift+z");
  await expect(editor).toHaveText("Hello 😄");
  await page.keyboard.type(" :rocket");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Tab");
  await expect(editor).toHaveText("Hello 😄 🚀");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${id}`)).json()).body).toContain("Hello 😄 🚀");
  await page.reload();
  await expect(editor).toHaveText("Hello 😄 🚀");
});

test("mouse selection preserves formatting; Escape and outside clicks dismiss", async ({ page, request }) => {
  const { editor, menu } = await open(page, request, "typora");
  await page.keyboard.type("Hello ");
  await page.keyboard.press("Control+b");
  await page.keyboard.type(":smile");
  await menu.getByRole("option", { name: ":smile:", exact: true }).click();
  await expect(editor.locator("strong")).toHaveText("😄");
  await expect(editor).toBeFocused();
  await page.keyboard.type(" :sm");
  await page.keyboard.press("Escape");
  await page.keyboard.type("ile");
  await expect(menu).toHaveCount(0);
  await page.keyboard.type(" :rocket");
  await expect(menu).toBeVisible();
  await page.locator(".syntax-options summary").click();
  await expect(menu).toHaveCount(0);
});

for (const [variant, extensions] of [["notdown", { emoji: false }], ["notion-markdown", { emoji: true }], ["commonmark", {}]] as const) {
  test(`${variant} with ${JSON.stringify(extensions)} does not offer shortcode completion`, async ({ page, request }) => {
    const { editor, menu } = await open(page, request, variant, extensions);
    await page.keyboard.type("Hello :smile");
    await expect(menu).toHaveCount(0);
    await expect(editor).toHaveText("Hello :smile");
  });
}

test("boundaries, no matches, backspace and live extension changes", async ({ page, request }) => {
  const { editor, menu } = await open(page, request);
  await page.keyboard.type("Text:sm \\:sm `code :sm` :zzzznotanemoji ");
  await expect(menu).toHaveCount(0);
  await page.keyboard.type(":s");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Backspace");
  await expect(menu).toHaveCount(0);
  await page.keyboard.type("smile");
  await expect(menu).toBeVisible();
  await page.locator(".syntax-options summary").click();
  const panel = page.locator(".syntax-options-panel");
  await panel.getByRole("searchbox", { name: "Search extensions" }).fill("emoji");
  await panel.locator('input[data-extension="emoji"]').uncheck();
  await page.locator(".syntax-options summary").click();
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" :smile");
  await expect(menu).toHaveCount(0);
});

test("code blocks never open the menu", async ({ page, request }) => {
  const { menu } = await open(page, request, "typora", {}, "```text\ncode\n```\n");
  await page.locator("#editor .pm-code-block code").click();
  await page.keyboard.type(" :smile");
  await expect(menu).toHaveCount(0);
});

test("selection and switching to source close suggestions without consuming pending input", async ({ page, request }) => {
  const { editor, menu } = await open(page, request, "typora");
  await page.keyboard.type("Hello :sm");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(menu).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.type("ile");
  await expect(menu).toBeVisible();
  await page.locator('.editing-modes [data-mode="source"]').click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Markdown source" })).toContainText("Hello :smile");
  await page.locator('.editing-modes [data-mode="document"]').click();
  await expect(editor).toHaveText("Hello :smile");
});
