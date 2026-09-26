import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

async function create(request: APIRequestContext, title: string, body = "", variant = "notdown") {
  const response = await request.post("/api/pages", { data: { title, body, syntax: { version: 1, variant, extensions: {} } } });
  expect(response.status()).toBe(201);
  return response.json();
}
async function open(page: Page, id: string) {
  await page.goto(`/#page/${id}`);
  await expect(page.locator(".pm-document")).toBeVisible();
  await page.locator(".pm-document > p").last().click();
  await page.keyboard.press("End");
}
async function saved(request: APIRequestContext, id: string) { return (await (await request.get(`/api/pages/${id}`)).json()).body; }

test("quote, list and strike aliases work and preserve conflicting Notdown inputs", async ({ page, request }) => {
  const note = await create(request, "Typing aliases", "", "gfm");
  await open(page, note.id);
  await page.keyboard.type('| ');
  await expect(page.locator(".pm-document blockquote")).toHaveCount(1);
  await page.keyboard.press("Backspace");
  await expect(page.locator(".pm-document")).toHaveText("| ");
  await page.keyboard.press("Control+a"); await page.keyboard.type('" Quote');
  await expect(page.locator(".pm-document blockquote")).toHaveText("Quote");
  const list = await create(request, "Typing numbered aliases", "", "gfm");
  await open(page, list.id);
  await page.keyboard.type("a. First ~removed~");
  await expect(page.locator(".pm-document ol li")).toHaveCount(1);
  await expect(page.locator(".pm-document s")).toHaveText("removed");
  await page.keyboard.press("Control+s");
  await expect.poll(() => saved(request, list.id)).toContain("~~removed~~");
  await page.reload();
  await expect(page.locator(".pm-document s")).toHaveText("removed");

  const conflicts = await create(request, "Conflict boundaries");
  await open(page, conflicts.id);
  await page.keyboard.type("| ~sub~ $$x$$");
  await expect(page.locator(".pm-document blockquote, .pm-document s, .pm-document .inline-math")).toHaveCount(0);
  await expect(page.locator(".pm-document .pm-line-block")).toHaveText("sub $$x$$");
  await expect(page.locator(".pm-document .pm-line-block sub")).toHaveText("sub");
});

for (const variant of ["notdown", "notion-markdown"]) test(`${variant}: toggle heading input, undo, collapse and reload`, async ({ page, request }) => {
  const note = await create(request, "Toggle heading shortcut", "", variant);
  await open(page, note.id);
  await page.keyboard.type("## > ");
  const toggle = page.locator(".pm-document .pm-heading-toggle");
  await expect(toggle.locator("h2")).toBeVisible();
  await expect(page.locator(".pm-document blockquote")).toHaveCount(0);
  await page.keyboard.press("Backspace");
  await expect(toggle).toHaveCount(0);
  await expect(page.locator(".pm-document h2")).toHaveText("> ");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(" Heading");
  await expect(toggle.locator("h2")).toHaveText("Heading");
  await page.keyboard.press("Control+s");
  await expect.poll(() => saved(request, note.id)).toMatch(/## Heading \{[^}\n]*toggle="true"/);
  await page.reload();
  await expect(toggle.locator("h2")).toHaveText("Heading");
  await toggle.locator("h2").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Child content");
  await expect(toggle.locator("p")).toHaveText("Child content");
  await toggle.getByRole("button", { name: "Collapse content" }).click();
  await expect(toggle.locator("p")).toBeHidden();
  await toggle.getByRole("button", { name: "Expand content" }).click();
  await page.keyboard.press("Control+s");
  await expect.poll(() => saved(request, note.id)).toMatch(/## Heading \{[^}\n]*toggle="true"/);
  await page.reload();
  await expect(toggle.locator("h2")).toHaveText("Heading");
  await expect(toggle.locator("p")).toHaveText("Child content");
});

test("toggle heading input reuses nested children and undo restores the ordinary container", async ({ page, request }) => {
  const note = await create(request, "Nested toggle shortcut", "Parent\n\tChild");
  await page.goto(`/#page/${note.id}`);
  await page.locator(".pm-nested-block > p").first().click();
  await page.keyboard.press("Home");
  await page.keyboard.type("## > ");
  const toggle = page.locator(".pm-document .pm-heading-toggle");
  await expect(toggle.locator("h2")).toHaveText("Parent");
  await expect(toggle.locator("p")).toHaveText("Child");
  await page.keyboard.press("Backspace");
  await expect(toggle).toHaveCount(0);
  await expect(page.locator(".pm-nested-block > h2")).toHaveText("> Parent");
  await expect(page.locator(".pm-nested-block > p")).toHaveText("Child");
});

for (const variant of ["notdown", "notion-markdown", "commonmark"]) test(`${variant}: Wiki and @ completion select stable pages, undo, save and reload`, async ({ page, request }) => {
  const target = await create(request, `补全目标 ${variant}`);
  const note = await create(request, `Completion source ${variant}`, "", variant);
  await open(page, note.id);
  await page.keyboard.type("[[");
  await page.keyboard.insertText(target.title);
  const menu = page.locator(".pm-page-input");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(".pm-document a")).toContainText(target.title);
  await page.keyboard.press("Control+z");
  await expect(page.locator(".pm-document")).toHaveText(`[[${target.title}`);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText(`@${target.title}`);
  await expect(page.locator(`.pm-mention-menu [data-page-id="${target.id}"]`)).toBeVisible();
  await page.locator(`.pm-mention-menu [data-page-id="${target.id}"]`).click();
  await page.keyboard.type(" tail");
  await page.keyboard.press("Control+s");
  await expect.poll(() => saved(request, note.id)).toContain(target.id);
  const source = await saved(request, note.id);
  if (variant === "notion-markdown") { expect(source).toContain("<mention-page"); expect(source).not.toContain("[["); }
  if (variant === "commonmark") expect(source).toContain("](#page/");
  await page.reload();
  await expect(page.locator(".pm-document a")).toContainText(target.title);
  await expect(page.locator(".pm-document")).toContainText(" tail");
});

test("plus completes existing pages and creates a named child or a top-level page", async ({ page, request }) => {
  const target = await create(request, "Plus existing destination");
  const note = await create(request, "Plus source");
  await open(page, note.id);
  await page.keyboard.type("+Plus existing destination");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator(`.pm-document [data-page-target="${target.id}"]`)).toBeVisible();
  for (const [name, parent] of [["New completion child", note.id], ["New completion root", ""]]) {
    await page.keyboard.type(` +${name}`);
    await page.getByLabel("New page parent").selectOption(parent);
    await page.locator(".pm-page-input").getByRole("option", { name: `Create “${name}”`, exact: true }).click();
    await expect(page.locator(".pm-document a").filter({ hasText: name })).toBeVisible();
    const link = page.locator(".pm-document a").filter({ hasText: name });
    const id = await link.getAttribute("data-page-target");
    const created = await (await request.get(`/api/pages/${id}`)).json();
    expect(created.title).toBe(name); expect(created.parent).toBe(parent || null);
  }
  await expect(page).toHaveURL(new RegExp(note.id));
  await page.keyboard.press("Control+s");
  await page.reload();
  await expect(page.locator(".pm-document a")).toHaveCount(3);
});

test("failed or stale asynchronous creation never replaces newer input", async ({ page, request }) => {
  const note = await create(request, "Pending completion source");
  await open(page, note.id);
  await page.route("**/api/pages", async route => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Creation failed for test" }) });
  });
  await page.keyboard.type("+Failed new page"); await page.keyboard.press("Enter");
  await expect(page.getByText("Creation failed for test", { exact: true })).toBeVisible();
  await expect(page.locator(".pm-document")).toHaveText("+Failed new page");
  await page.unroute("**/api/pages");
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  let started = false;
  await page.route("**/api/pages", async route => {
    if (route.request().method() !== "POST") return route.continue();
    started = true; await gate; await route.continue();
  });
  await page.keyboard.press("Enter");
  await expect.poll(() => started).toBe(true);
  await page.keyboard.type(" edited");
  release();
  await expect(page.locator('.pm-page-input[aria-busy="false"]')).toBeVisible();
  await expect(page.locator(".pm-document")).toHaveText("+Failed new page edited");
  await expect(page.locator(".pm-document a")).toHaveCount(0);
});

test("escape, composition and code keep literal input while plus-space keeps bullet input", async ({ page, request }) => {
  const note = await create(request, "Completion protected contexts");
  await open(page, note.id);
  await page.keyboard.type("[[");
  await expect(page.locator(".pm-page-input")).toBeVisible();
  await page.keyboard.press("Escape"); await page.keyboard.type("literal");
  await expect(page.locator(".pm-page-input")).toHaveCount(0);
  await page.keyboard.press("Control+a"); await page.keyboard.type("+ ");
  await expect(page.locator(".pm-document ul")).toHaveCount(1);
  const code = await create(request, "Completion in code", "```\ncode\n```");
  await page.goto(`/#page/${code.id}`); await page.locator(".pm-document pre code").click();
  await page.keyboard.type(" [[literal @today +literal");
  await expect(page.locator(".pm-page-input, .pm-mention-menu")).toHaveCount(0);
});

test("composition, selection and switching to source close page suggestions without losing input", async ({ page, request }) => {
  const note = await create(request, "Completion composition");
  await open(page, note.id);
  const editor = page.locator(".pm-document"), menu = page.locator(".pm-page-input");
  await page.keyboard.type("[[");
  await expect(menu).toBeVisible();
  await editor.dispatchEvent("compositionstart", { data: "" });
  await expect(menu).toHaveCount(0);
  await page.keyboard.insertText("中文");
  await expect(menu).toHaveCount(0);
  await editor.dispatchEvent("compositionend", { data: "中文" });
  await expect(menu).toBeVisible();
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(menu).toHaveCount(0);
  await page.keyboard.press("ArrowRight"); await page.keyboard.type(" page");
  await expect(menu).toBeVisible();
  await page.locator('.editing-modes [data-mode="source"]').click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Markdown source" })).toContainText("\\[\\[中文 page");
  await page.locator('.editing-modes [data-mode="document"]').click();
  await expect(editor).toHaveText("[[中文 page");
});
