import { expect, test, type Page, type APIRequestContext } from "@playwright/test";

async function open(page: Page, request: APIRequestContext, body = "") {
  const response = await request.post("/api/pages", { data: {
    title: "Code input preferences", body, bodyFormat: "notion-markdown",
    syntax: { version: 1, variant: "notdown", extensions: {} },
  } });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator(".pm-document")).toBeVisible();
  return note;
}

async function mode(page: Page, value: "notion" | "markdown") {
  await page.getByRole("button", { name: "Workspace settings", exact: true }).click();
  await page.getByLabel("Code block input", { exact: true }).selectOption(value);
  await page.locator('#dialog').getByRole("button", { name: "Done", exact: true }).click();
}

test("settings persist Markdown input, completion keeps focus and language is reused by space and slash insertion", async ({ page, request }) => {
  const note = await open(page, request);
  await mode(page, "markdown");
  const editor = page.locator(".pm-document"), blocks = editor.locator(".pm-code-block");
  await editor.click();
  await page.keyboard.type("```py");
  await expect(blocks).toHaveCount(0);
  const suggestions = page.getByRole("listbox", { name: "Code language suggestions" });
  await expect(suggestions.getByRole("option", { name: "Python", exact: true })).toBeVisible();
  await expect(editor).toBeFocused();
  await page.screenshot({ path: "test-results/code-input-suggestions.png" });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Tab");
  await expect(editor.locator(":scope > p")).toHaveText("```python");
  await page.keyboard.press("Enter");
  await expect(blocks).toHaveCount(1);
  await expect(blocks.first().getByRole("button", { name: "Code language", exact: true })).toHaveText("Python");
  await expect(editor).toBeFocused();
  await page.keyboard.type("print(1)");
  await page.keyboard.press("Control+Enter");
  await page.keyboard.type("``` ");
  await expect(blocks).toHaveCount(2);
  await expect(blocks.last().getByRole("button", { name: "Code language", exact: true })).toHaveText("Python");
  await page.keyboard.press("Control+Enter");
  await page.keyboard.type("/code");
  await page.locator('[data-insert="code"]').click();
  await expect(blocks).toHaveCount(3);
  await expect(blocks.last().getByRole("button", { name: "Code language", exact: true })).toHaveText("Python");
  await page.keyboard.type("print(3)");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("print(3)");
  await page.reload();
  await page.getByRole("button", { name: "Workspace settings", exact: true }).click();
  await expect(page.getByLabel("Code block input", { exact: true })).toHaveValue("markdown");
  await page.screenshot({ path: "test-results/code-input-settings.png" });
  await page.locator('#dialog').getByRole("button", { name: "Done", exact: true }).click();
  await blocks.last().locator("code").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Control+Enter");
  await page.keyboard.type("```");
  await page.keyboard.press("Enter");
  await expect(blocks).toHaveCount(4);
  await expect(blocks.last().getByRole("button", { name: "Code language", exact: true })).toHaveText("Python");
});

test("toolbar language is remembered in Notion mode and Plain Text resets the default", async ({ page, request }) => {
  await open(page, request, "```javascript\nconst x = 1;\n```\n\nTail");
  const editor = page.locator(".pm-document"), blocks = editor.locator(".pm-code-block");
  await blocks.first().hover();
  await blocks.first().getByRole("button", { name: "Code language", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search for a language" }).fill("python");
  await page.getByRole("button", { name: "Python", exact: true }).click();
  await editor.locator(":scope > p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("```");
  await expect(blocks).toHaveCount(2);
  await expect(blocks.last().getByRole("button", { name: "Code language", exact: true })).toHaveText("Python");
  await blocks.last().hover();
  await blocks.last().getByRole("button", { name: "Code language", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search for a language" }).fill("plain");
  await page.getByRole("button", { name: "Plain Text", exact: true }).click();
  await page.keyboard.press("Control+Enter");
  await page.keyboard.type("```");
  await expect(blocks).toHaveCount(3);
  await expect(blocks.last().getByRole("button", { name: "Code language", exact: true })).toHaveText("Plain Text");
  await expect(blocks.first().getByRole("button", { name: "Code language", exact: true })).toHaveText("Python");
});

test("Markdown input supports mouse completion, unknown languages, dismissal, undo and switching back to Notion", async ({ page, request }) => {
  await open(page, request);
  await mode(page, "markdown");
  const editor = page.locator(".pm-document"), blocks = editor.locator(".pm-code-block");
  await editor.click();
  await page.keyboard.type("```c+");
  await page.getByRole("option", { name: "C++", exact: true }).click();
  await expect(editor.locator(":scope > p")).toHaveText("```c++");
  await expect(editor).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(blocks.first().getByRole("button", { name: "Code language", exact: true })).toHaveText("C++");
  await page.keyboard.press("Control+z");
  await expect(editor.locator(":scope > p")).toHaveText("```c++");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+Enter");
  await page.keyboard.type("```my-custom-lang");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox", { name: "Code language suggestions" })).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(blocks.last().getByRole("button", { name: "Code language", exact: true })).toHaveText("my-custom-lang");
  await mode(page, "notion");
  await blocks.last().locator("pre").click();
  await page.keyboard.press("Control+Enter");
  await page.keyboard.type("```");
  await expect(blocks).toHaveCount(3);
  await expect(blocks.last().getByRole("button", { name: "Code language", exact: true })).toHaveText("my-custom-lang");
});
