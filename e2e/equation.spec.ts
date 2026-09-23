import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { expectSource } from "./source-helper";

async function open(page: Page, request: APIRequestContext, body = "") {
  const response = await request.post("/api/pages", { data: {
    title: "Math block editing", body, bodyFormat: "notion-markdown",
    syntax: { version: 1, variant: "notion-markdown", extensions: {} },
  } });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
  await page.goto("/");
  await expect(page.locator(".pm-document")).toBeVisible();
  return note;
}

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
