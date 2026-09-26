import { test, expect, type Page, type Locator } from "@playwright/test";

const body = "Alpha\n\n:   First paragraph.\n\n    Second paragraph.\n\n:   Other definition.\n\n    ```text\n    Code child\n    ```\n\nBeta\n:   Beta body.\n\nGamma\n\n~   Gamma body.\n\nTail";
async function menuFor(page: Page, row: Locator, label: string) {
  await page.mouse.move(0, 0);
  await row.hover({ position: { x: 5, y: 8 } });
  await page.locator(".pm-block-handle.visible").click();
  await expect(page.locator(".pm-block-type")).toHaveText(label);
}
async function bounds(page: Page, row: Locator) {
  await expect(page.locator(".pm-block-highlight")).toHaveCount(1);
  const a = (await row.boundingBox())!, b = (await page.locator(".pm-block-highlight").boundingBox())!;
  for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(a[key] - b[key])).toBeLessThan(1);
}
for (const variant of ["notdown", "markdown"]) test(`${variant}: each term and its body blocks have independent selection and controls`, async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1400 });
  const response = await request.post("/api/pages", { data: {
    title: "Definition item controls", body,
    bodyFormat: variant === "notdown" ? "notion-markdown" : "markdown",
    syntax: { version: 1, variant, extensions: {} },
  } });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  const items = page.locator(".pm-document > .pm-definition-list > .pm-definition-item");
  await expect(items).toHaveCount(3);
  const first = items.first(), term = first.locator(":scope > dt");
  const paragraph = first.locator("dd > p").filter({ hasText: /^Second paragraph\.$/ });
  await menuFor(page, term, "Definition list item");
  await bounds(page, first);
  await expect(items.nth(1)).not.toHaveClass(/pm-block-selected/);
  await page.screenshot({ path: testInfo.outputPath("term-item-selection.png") });
  await page.getByRole("menuitem", { name: "View source", exact: true }).click();
  await expect(page.getByLabel("Block Markdown source")).toContainText("Alpha");
  await expect(page.getByLabel("Block Markdown source")).not.toContainText("Beta");
  await page.getByRole("button", { name: "Close block source" }).click();
  await menuFor(page, term, "Definition list item");
  await page.getByRole("menuitem", { name: "Duplicate block", exact: true }).click();
  await expect(items).toHaveCount(4);
  await expect(items.nth(1)).toHaveText(await first.textContent() || "");
  await page.keyboard.press("Control+z");
  await expect(items).toHaveCount(3);
  await menuFor(page, paragraph, "Paragraph");
  await bounds(page, paragraph);
  await page.screenshot({ path: testInfo.outputPath("definition-child-selection.png") });
  await page.getByRole("menuitem", { name: "Duplicate block", exact: true }).click();
  await expect(first.locator("dd > p").filter({ hasText: "Second paragraph." })).toHaveCount(2);
  await page.keyboard.press("Control+z");
  await expect(paragraph).toHaveCount(1);
  const code = first.locator(".pm-code-block, pre").first();
  await menuFor(page, code, "Code block");
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(first).not.toContainText("Code child");
  await expect(items).toHaveCount(3);
  await page.keyboard.press("Control+z");
  await expect(first).toContainText("Code child");
  await menuFor(page, items.nth(1).locator("dt"), "Definition list item");
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(items).toHaveCount(2);
  await expect(page.locator(".pm-document")).not.toContainText("Beta body.");
  await page.keyboard.press("Control+z");
  await expect(items).toHaveCount(3);
  // Drag the complete Alpha group after Beta, using the term's grip.
  await page.mouse.move(0, 0);
  await term.hover({ position: { x: 5, y: 8 } });
  const beta = items.nth(1).locator("dt");
  await page.locator(".pm-block-handle").dragTo(beta, { targetPosition: { x: 5, y: 18 } });
  await expect(items.locator(":scope > dt")).toHaveText(["Beta", "Alpha", "Gamma"]);
  const alpha = items.nth(1);
  await expect(alpha).toContainText("Code child");
  // Drag a definition child out as a normal page block.
  const child = alpha.locator("dd > p").filter({ hasText: /^Second paragraph\.$/ });
  await page.mouse.move(0, 0);
  await child.hover({ position: { x: 5, y: 8 } });
  await page.locator(".pm-block-handle").dragTo(page.locator(".pm-document > p").filter({ hasText: /^Tail$/ }), { targetPosition: { x: 5, y: 20 } });
  await expect(page.locator(".pm-document > p").last()).toHaveText("Second paragraph.");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toMatch(/Tail\s+Second paragraph\./);
  await page.reload();
  await expect(items.locator(":scope > dt")).toHaveText(["Beta", "Alpha", "Gamma"]);
  await expect(items.nth(1)).toContainText("Code child");
  await expect(page.locator(".pm-document > p").last()).toHaveText("Second paragraph.");
  // The term's plus control inserts between complete groups, preserving both sides.
  await page.mouse.move(0, 0);
  await items.first().locator("dt").hover({ position: { x: 5, y: 8 } });
  await page.getByRole("button", { name: "Add block below", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.keyboard.insertText("Between groups");
  await expect(page.locator(".pm-document > p").filter({ hasText: /^Between groups$/ })).toHaveCount(1);
  await expect(items.locator(":scope > dt")).toHaveText(["Beta", "Alpha", "Gamma"]);
  await menuFor(page, items.last().locator("dt"), "Definition list item");
  await page.getByRole("menuitem", { name: "Heading 1", exact: true }).click();
  await expect(page.locator(".pm-document h1")).toHaveText("Gamma");
  await expect(page.locator(".pm-document")).toContainText("Gamma body.");
  await expect(items.locator(":scope > dt")).toHaveText(["Beta", "Alpha"]);
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("Between groups");
  await page.reload();
  await expect(page.locator(".pm-document h1")).toHaveText("Gamma");
  await expect(page.locator(".pm-document")).toContainText("Gamma body.");
});
