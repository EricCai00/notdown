import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

async function openCitationPage(page: Page, request: APIRequestContext) {
  const body = "Reference [#book]\n\n" + Array.from({ length: 45 }, (_, i) => `Paragraph ${i + 1}. Text to scroll past.`).join("\n\n") + "\n\n[#book]: Jane Doe. Example Book. 2023.";
  const response = await request.post("/api/pages", { data: { title: "Editing panels", body, bodyFormat: "markdown", syntax: { version: 1, variant: "markdown_mmd", extensions: {} } } });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator(".md-bibliography")).toBeVisible();
  return note;
}

for (const mode of ["page", "split"]) {
  test(`citation panel preserves ${mode} scrolling, draft and validation`, async ({ page, request }) => {
    const note = await openCitationPage(page, request);
    if (mode === "split") await page.locator('[data-mode="split"]').click();
    const scroll = page.locator(mode === "split" ? ".page-pane" : "#main");
    const edit = page.getByRole("button", { name: "Edit definition" });
    await edit.scrollIntoViewIfNeeded();
    const before = await scroll.evaluate(el => el.scrollTop);
    await edit.click();
    const panel = page.getByRole("dialog", { name: "Citation definition" });
    await expect(panel).toBeVisible();
    expect(await panel.evaluate(el => el.matches(":modal"))).toBe(false);
    expect(await scroll.evaluate(el => el.scrollTop)).toBeCloseTo(before, 0);
    const input = panel.getByRole("textbox", { name: "Definition source" });
    await input.fill("[#book]: Draft stays while scrolling");
    const rect = await scroll.boundingBox();
    await page.mouse.move(rect!.x + 90, rect!.y + 160);
    await page.mouse.wheel(0, -450);
    await expect.poll(() => scroll.evaluate(el => el.scrollTop)).toBeLessThan(before - 100);
    await expect(input).toHaveValue("[#book]: Draft stays while scrolling");
    await page.screenshot({ path: `test-results/editor-panel-${mode}.png` });
    await input.fill("[#different]: Invalid key");
    await panel.getByRole("button", { name: "Save", exact: true }).click();
    await expect(panel.locator("output")).toContainText("same reference key");
    await input.fill("[#book]: Updated bibliography");
    await panel.getByRole("button", { name: "Save", exact: true }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.locator(".md-bibliography li")).toContainText("Updated bibliography");
    await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("[#book]: Updated bibliography");
    await edit.click();
    await input.fill("[#book]: Cancelled draft");
    const cancelScroll = await scroll.evaluate(el => el.scrollTop);
    await input.press("Escape");
    await expect(panel).toHaveCount(0);
    expect(await scroll.evaluate(el => el.scrollTop)).toBeCloseTo(cancelScroll, 0);
    await expect(page.locator(".md-bibliography li")).toContainText("Updated bibliography");
  });
}

test("citation panel keeps stale drafts recoverable and closes on page navigation", async ({ page, request }) => {
  await openCitationPage(page, request);
  await page.getByRole("button", { name: "Edit definition" }).click();
  const panel = page.getByRole("dialog", { name: "Citation definition" });
  const input = panel.getByRole("textbox", { name: "Definition source" });
  await input.fill("[#book]: Keep this draft");
  const paragraph = page.locator(".pm-document > p").first();
  await paragraph.click();
  await page.keyboard.press("Home");
  await page.keyboard.type("Changed ");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel.locator("output")).toContainText("Content changed");
  await expect(input).toHaveValue("[#book]: Keep this draft");
  await expect(page.locator(".md-bibliography li")).toContainText("Jane Doe");
  const other = await (await request.post("/api/pages", { data: { title: "Other page", body: "Another page" } })).json();
  await page.evaluate(id => { location.hash = `page/${id}`; }, other.id);
  await expect(panel).toHaveCount(0);
});

test("editing panels fit a narrow viewport and close without applying", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await openCitationPage(page, request);
  await page.getByRole("button", { name: "Edit definition" }).click();
  const panel = page.getByRole("dialog", { name: "Citation definition" });
  const input = panel.getByRole("textbox", { name: "Definition source" });
  const bounds = await panel.boundingBox(), field = await input.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(16);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(374);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(624);
  expect(field!.width).toBeGreaterThan(280);
  await input.fill("[#book]: Discarded draft");
  await page.screenshot({ path: "test-results/editor-panel-mobile.png" });
  await panel.getByRole("button", { name: "Close citation definition" }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator(".md-bibliography li")).toContainText("Jane Doe");
});

test("inline equation panels save and cancel without making the page modal", async ({ page, request }) => {
  const response = await request.post("/api/pages", { data: { title: "Inline equation", body: "Formula $x^2$ and text", bodyFormat: "notion-markdown", syntax: { version: 1, variant: "notdown", extensions: {} } } });
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  const equation = page.locator(".pm-inline-math");
  await equation.click();
  const panel = page.getByRole("dialog", { name: "Equation", exact: true });
  const input = panel.getByRole("textbox", { name: "Equation content" });
  expect(await panel.evaluate(el => el.matches(":modal"))).toBe(false);
  await expect(input).toBeFocused();
  const anchor = (await equation.boundingBox())!, popup = (await panel.boundingBox())!;
  expect(Math.abs(popup.x - anchor.x)).toBeLessThan(2);
  expect(Math.abs(popup.y - anchor.y - anchor.height - 5)).toBeLessThan(2);
  expect(popup.height).toBeLessThan(50);
  const button = (await panel.getByRole("button", { name: "Done", exact: true }).boundingBox())!;
  const field = (await input.boundingBox())!;
  expect(button.x).toBeGreaterThan(field.x + field.width);
  expect(Math.abs(button.y + button.height / 2 - field.y - field.height / 2)).toBeLessThan(2);
  await page.screenshot({ path: "test-results/inline-equation-editor.png" });
  await input.fill("y^3");
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(equation.locator("annotation")).toHaveText("y^3");
  await equation.click();
  await input.fill("discard");
  await input.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(equation.locator("annotation")).toHaveText("y^3");
  await equation.click();
  await input.fill("E=mc^2");
  await input.press("Enter");
  await expect(panel).toHaveCount(0);
  await expect(equation.locator("annotation")).toHaveText("E=mc^2");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("$E=mc^2$");
  await page.reload();
  await expect(equation.locator("annotation")).toHaveText("E=mc^2");
});

test("inline equation editor stays anchored while scrolling and fits narrow screens", async ({ page, request }) => {
  await page.setViewportSize({ width: 420, height: 700 });
  const response = await request.post("/api/pages", { data: {
    title: "Inline equation placement", body: "Formula $x^2$ and text\n\n" + "Following paragraph.\n\n".repeat(30),
    bodyFormat: "notion-markdown", syntax: { version: 1, variant: "notdown", extensions: {} },
  } });
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  const equation = page.locator(".pm-inline-math");
  await equation.click();
  const panel = page.getByRole("dialog", { name: "Equation", exact: true });
  const input = panel.getByRole("textbox", { name: "Equation content" });
  const bounds = (await panel.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(8);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(412);
  await page.mouse.move(400, 550);
  await page.mouse.wheel(0, 60);
  await expect.poll(async () => {
    const anchor = (await equation.boundingBox())!, popup = (await panel.boundingBox())!;
    return Math.abs(popup.y - anchor.y - anchor.height - 5);
  }).toBeLessThan(2);
  await input.fill("discarded");
  await page.locator(".pm-document > p").filter({ hasText: "Following paragraph." }).nth(3).click();
  await expect(panel).toHaveCount(0);
  await expect(equation.locator("annotation")).toHaveText("x^2");
});
