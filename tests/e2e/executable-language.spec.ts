import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

async function open(page: Page, request: APIRequestContext, body: string, variant = "notdown") {
  const response = await request.post("/api/pages", { data: { title: "Unified execution", body, bodyFormat: variant === "notdown" ? "notion-markdown" : "markdown", syntax: { version: 1, variant, extensions: {} } } });
  expect(response.ok()).toBeTruthy();
  const note = await response.json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
  await page.goto("/");
  await expect(page.locator(".pm-document")).toBeVisible();
  return note;
}
const chooser = (page: Page) => page.getByRole("dialog", { name: "Choose execution language", exact: true });

test("empty chunks remember language without opening a picker; clicking opens keyboard choices", async ({ page, request }) => {
  const note = await open(page, request, "Start\n");
  await page.evaluate(() => localStorage.setItem("notdown-executable-language", "python"));
  const insertChunk = async () => {
    await page.locator(".pm-document > p").first().click();
    await page.keyboard.press("End"); await page.keyboard.press("Enter");
    await page.keyboard.type("/");
    await page.locator('[data-insert="executable_chunk"]').click();
  };
  await insertChunk();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator(".pm-r-chunk-label")).toHaveText("Python");
  await expect(page.locator(".pm-r-code code")).toHaveText("");
  await expect(chooser(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Chunk language", exact: true }).click();
  await expect(chooser(page).getByRole("button", { name: "Python", exact: true })).toBeFocused();
  const anchor = await page.getByRole("button", { name: "Chunk language", exact: true }).boundingBox();
  const menu = await chooser(page).boundingBox();
  expect(Math.abs(menu!.x - anchor!.x)).toBeLessThan(2);
  expect(Math.abs(menu!.y - anchor!.y - anchor!.height - 4)).toBeLessThan(2);
  await page.keyboard.press("ArrowDown");
  await expect(chooser(page).getByRole("button", { name: "Julia", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(chooser(page).getByRole("button", { name: "Python", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await expect(chooser(page)).toHaveCount(0);
  await expect(page.locator(".pm-r-chunk-label")).toHaveText("Julia");
  const program = '#| echo: false\nx = "//| leave intact"';
  await page.keyboard.insertText(program);
  await expect(page.locator(".pm-r-code code")).toHaveText(program);
  await page.getByRole("button", { name: "Chunk language", exact: true }).click();
  await chooser(page).getByRole("button", { name: "Observable JS", exact: true }).click();
  await expect(page.locator(".pm-r-code code")).toHaveText(program);
  await insertChunk();
  await expect(page.locator(".pm-r-chunk-label")).toHaveText(["Observable JS", "Observable JS"]);
  await expect(chooser(page)).toHaveCount(0);
  await expect(page.locator(".pm-r-code code").first()).toHaveText("");
  await page.screenshot({ path: ".run/logs/chunk-dropdown.png" });
  await page.keyboard.press("Escape");
  await expect(chooser(page)).toHaveCount(0);
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain(program);
  await page.reload();
  await insertChunk();
  await expect(chooser(page)).toHaveCount(0);
  await expect(page.locator(".pm-r-chunk")).toHaveCount(3);
});

test("chunk and inline language names have no arrow but still open their pickers", async ({ page, request }) => {
  await open(page, request, '```{python}\nprint(42)\n```\n\n`{python} 42`');
  for (const selector of [".pm-r-chunk-label", ".pm-r-inline-prefix"]) {
    expect(await page.locator(selector).evaluate(element => getComputedStyle(element, "::after").content)).toBe("none");
    await page.locator(selector).click();
    await expect(page.getByRole("group", { name: "Execution language" })).toBeVisible();
    await page.keyboard.press("Escape");
  }
});

for (const variant of ["notdown", "quarto"]) test(`${variant}: one chunk entry, language choices, undo and reload`, async ({ page, request }) => {
  let executions = 0;
  await page.route("**/api/quarto/notebook", route => { executions++; return route.fulfill({ json: { outputs: [] } }); });
  const note = await open(page, request, "Start\n", variant);
  await page.locator(".pm-document > p").click();
  await page.keyboard.press("End"); await page.keyboard.press("Enter");
  await page.keyboard.type("/");
  await expect(page.locator('[data-insert="r_chunk"], [data-insert^="quarto_"]')).toHaveCount(0);
  await page.locator('[data-insert="executable_chunk"]').click();
  await expect(chooser(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Chunk language", exact: true }).click();
  await expect(chooser(page).getByRole("group", { name: "Execution language" }).getByRole("button")).toHaveText(["R", "Python", "Julia", "Observable JS"]);
  if (variant === "notdown") await page.screenshot({ path: ".run/logs/unified-insertion.png" });
  await chooser(page).getByRole("button", { name: "Python", exact: true }).click();
  await expect(page.locator(".pm-r-chunk-label")).toHaveText("Python");
  await page.getByRole("button", { name: "Chunk language", exact: true }).click();
  await chooser(page).getByRole("button", { name: "Julia", exact: true }).click();
  await expect(page.locator(".pm-r-chunk-label")).toHaveText("Julia");
  await expect(page.locator(".pm-r-code code")).toHaveText("");
  await page.keyboard.press("Control+z");
  await expect(page.locator(".pm-r-chunk-label")).toHaveText("Python");
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".pm-r-chunk-label")).toHaveText("Julia");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("```{julia}\n\n```");
  await page.reload();
  await expect(page.locator(".pm-r-chunk-label")).toHaveText("Julia");
  expect(executions).toBe(0);
});

test("inline insertion remembers the language without a popup and its name switches it later", async ({ page, request }) => {
  const note = await open(page, request, "Before after.\n");
  await page.evaluate(() => localStorage.setItem("notdown-executable-language", "julia"));
  const paragraph = page.locator(".pm-document > p");
  await paragraph.click();
  await paragraph.evaluate(element => {
    const range = document.createRange(); range.setStart(element.firstChild!, 7); range.collapse(true);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await expect.poll(() => paragraph.evaluate(element => document.getSelection()?.anchorNode === element.firstChild && document.getSelection()?.anchorOffset)).toBe(7);
  await page.keyboard.type("/");
  await page.locator('[data-insert="executable_inline"]').click();
  await expect(chooser(page)).toHaveCount(0);
  await expect(page.locator(".pm-r-inline-popover")).toHaveCount(0);
  await expect(page.locator(".pm-r-inline-prefix")).toHaveText("jl");
  await page.getByRole("button", { name: "Inline Julia controls", exact: true }).click();
  await page.screenshot({ path: ".run/logs/unified-inline.png" });
  await page.getByRole("dialog", { name: "Inline Julia result", exact: true }).getByRole("button", { name: "R", exact: true }).click();
  await expect(page.locator(".pm-r-inline-prefix")).toHaveText("r");
  await expect(page.locator(".pm-r-inline-code")).toHaveText("1 + 1");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("Before `r 1 + 1`after.");
  await page.reload();
  await expect(page.locator(".pm-r-inline-prefix")).toHaveText("r");
  await page.getByRole("button", { name: "Inline R controls", exact: true }).click();
  await page.getByRole("dialog", { name: "Inline R result", exact: true }).getByRole("button", { name: "Observable JS", exact: true }).click();
  await expect(page.locator(".pm-r-inline-prefix")).toHaveText("ojs");
});

test("language switching keeps R code unchanged and undo restores the original header", async ({ page, request }) => {
  const source = '```{r legacy, custom=list(x="}")}\n#| echo: false\nx <- 41\n```\n';
  const note = await open(page, request, source);
  await page.getByRole("button", { name: "Chunk language", exact: true }).click();
  await chooser(page).getByRole("button", { name: "Observable JS", exact: true }).click();
  await expect(page.locator(".pm-r-code code")).toHaveText('#| echo: false\nx <- 41');
  await page.keyboard.press("Control+z");
  await expect(page.locator(".pm-r-chunk-label")).toHaveText("R · legacy");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(source);
});

test("R Markdown uses the unified picker with only its supported R language", async ({ page, request }) => {
  await open(page, request, '```{r}\n1 + 1\n```\n\n`r 1 + 1`', "rmarkdown");
  await page.getByRole("button", { name: "Chunk language", exact: true }).click();
  await expect(chooser(page).getByRole("group", { name: "Execution language" }).getByRole("button")).toHaveText(["R"]);
  await chooser(page).getByRole("button", { name: "R", exact: true }).click();
  await page.getByRole("button", { name: "Inline R controls", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Inline R result", exact: true }).getByRole("group", { name: "Execution language" }).getByRole("button")).toHaveText(["R"]);
});
