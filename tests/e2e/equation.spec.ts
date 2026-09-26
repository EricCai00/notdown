import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { expectSource } from "./source-helper";

async function open(page: Page, request: APIRequestContext, body = "", variant = "notion-markdown") {
  const response = await request.post("/api/pages", { data: {
    title: "Math block editing", body, bodyFormat: "notion-markdown",
    syntax: { version: 1, variant, extensions: {} },
  } });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
  await page.goto("/");
  await expect(page.locator(".pm-document")).toBeVisible();
  return note;
}

for (const variant of ["notdown", "notion-markdown"]) {
  test(`typed inline math renders, reverts and persists in ${variant}`, async ({ page, request }) => {
    const note = await open(page, request, "", variant);
    const editor = page.locator(".pm-document");
    const math = editor.locator(".pm-inline-math");
    await editor.click();
    await page.keyboard.type("Before $x^2");
    await expect(math).toHaveCount(0);
    await page.keyboard.type("$");
    await expect(math.locator(".katex")).toHaveCount(1);
    await expect(math.locator("annotation")).toHaveText("x^2");
    await page.keyboard.press("Backspace");
    await expect(math).toHaveCount(0);
    await expect(editor.locator(":scope > p")).toHaveText("Before $x^2$");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("$ after");
    await expect(math.locator("annotation")).toHaveText("x^2");
    await page.keyboard.press("Control+s");
    await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body)
      .toBe("Before $x^2$ after");
    await page.keyboard.press("Control+e");
    await expectSource(page, /Before \$x\^2\$ after/);
    await page.keyboard.press("Control+e");
    await expect(math.locator("annotation")).toHaveText("x^2");
    await page.reload();
    await expect(math.locator("annotation")).toHaveText("x^2");
  });

  test(`standalone dollars and Enter open a math block in ${variant}`, async ({ page, request }) => {
    const note = await open(page, request, "", variant);
    const editor = page.locator(".pm-document");
    await editor.click();
    await page.keyboard.type("$$");
    await expect(editor.locator(".pm-equation")).toHaveCount(0);
    await page.keyboard.press("Enter");
    const input = page.getByRole("textbox", { name: "Equation content" });
    await expect(editor.locator(".pm-equation")).toHaveCount(1);
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("");
    await input.press("Escape");
    await page.keyboard.press("Control+z");
    await expect(editor.locator(".pm-equation")).toHaveCount(0);
    await expect(editor.locator(":scope > p")).toHaveText("$$");
    // Shared source history restores the paragraph; place the caret after $$.
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await expect(input).toBeFocused();
    await page.keyboard.type("x^2+y^2");
    await input.press("Enter");
    await expect(editor.locator(".pm-equation annotation")).toHaveText("x^2+y^2");
    await page.keyboard.press("Control+s");
    await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body)
      .toContain("$$\nx^2+y^2\n$$");
    await page.reload();
    await expect(editor.locator(".pm-equation annotation")).toHaveText("x^2+y^2");
  });
}

test("Shift Enter after dollars keeps a text line break", async ({ page, request }) => {
  await open(page, request);
  const editor = page.locator(".pm-document");
  await editor.click();
  await page.keyboard.type("$$");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("literal");
  await expect(editor.locator(".pm-equation")).toHaveCount(0);
  await expect(editor.locator(":scope > p")).toHaveText("$$literal");
  await expect(editor.locator(":scope > p > br")).toHaveCount(1);
});

test("inserting math opens an anchored editor, previews live and persists through Done and reload", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const note = await open(page, request);
  await page.locator(".pm-document").click();
  await page.keyboard.type("/equation");
  await page.locator('[data-insert="equation"]').click();
  const block = page.locator(".pm-equation"), panel = page.getByRole("dialog", { name: "Edit equation" });
  const input = panel.getByRole("textbox", { name: "Equation content" });
  await expect(panel).toBeVisible();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
  await expect(block).toContainText("Add a TeX equation");
  const rect = (await block.boundingBox())!, popup = (await panel.boundingBox())!;
  expect(Math.abs(popup.x - rect.x)).toBeLessThan(2);
  expect(Math.abs(popup.y - rect.y - rect.height)).toBeLessThan(2);
  await page.screenshot({ path: "test-results/math-empty.png" });
  await input.fill("y=x^2");
  await expect(block.locator(".katex")).toHaveCount(1);
  await expect(block.locator("annotation")).toHaveText("y=x^2");
  await page.screenshot({ path: "test-results/math-editing.png" });
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("$$\ny=x^2\n$$");
  await page.reload();
  await expect(block.locator("annotation")).toHaveText("y=x^2");
  await expect(panel).toHaveCount(0);
  await block.click();
  await expect(input).toHaveValue("y=x^2");
  await input.fill("x^3");
  await input.press("Enter");
  await expect(panel).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(block.locator("annotation")).toHaveText("y=x^2");
  expect(errors).toEqual([]);
});

test("multiline formulas, invalid TeX, outside dismissal and switching source retain input", async ({ page, request }) => {
  await open(page, request, "$$\nx\n$$\n\nTail");
  const block = page.locator(".pm-equation"), panel = page.getByRole("dialog", { name: "Edit equation" });
  const input = page.getByRole("textbox", { name: "Equation content" });
  await block.click();
  await input.fill("\\begin{cases}x & x > 0 \\\\");
  await input.press("End");
  await input.press("Shift+Enter");
  await input.pressSequentially("-x & x < 0\\end{cases}");
  await expect(input).toHaveValue(/\n/);
  await expect(block.locator(".katex-error")).toHaveCount(0);
  await page.locator(".pm-document > p").filter({ hasText: /^Tail$/ }).click({ position: { x: 600, y: 10 } });
  await expect(panel).toHaveCount(0);
  await block.click();
  await input.fill("\\notARealCommand{");
  await expect(block.locator(".katex-error")).toHaveCount(1);
  await input.fill("z^4");
  await input.press("Escape");
  await block.click();
  await expect(input).toHaveValue("z^4");
  await input.fill("z^5");
  await input.press("Control+e");
  await expectSource(page, /z\^5/);
  await expect(panel).toHaveCount(0);
});

test("empty existing blocks do not auto-open; narrow screens keep the popover reachable", async ({ page, request }) => {
  await page.setViewportSize({ width: 420, height: 700 });
  await open(page, request, "$$\n\n$$\n\nTail");
  const panel = page.getByRole("dialog", { name: "Edit equation" });
  await expect(panel).toHaveCount(0);
  await page.locator(".pm-equation").focus();
  await page.keyboard.press("Enter");
  await expect(panel).toBeVisible();
  const rect = (await panel.boundingBox())!;
  expect(rect.x).toBeGreaterThanOrEqual(8);
  expect(rect.x + rect.width).toBeLessThanOrEqual(412);
  expect(rect.y + rect.height).toBeLessThanOrEqual(692);
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  await expect(panel).toHaveCount(0);
});
