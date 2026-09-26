import { test, expect } from "@playwright/test";

test("editing the last of several inline expressions executes its current text and keeps OJS variables", async ({ page, request }) => {
  const body = 'Earlier `{ojs} 1`.\n\n```{ojs}\na = 4\na\n```\n\n```{ojs}\na\n```\n\n`r a`\n\n`{python} a`\n\n`{julia} 1`\n\n`{ojs} 1`\n';
  const note = await (await request.post("/api/pages", { data: { title: "Inline execution", body, bodyFormat: "notion-markdown", syntax: { version: 1, variant: "notdown", extensions: {} } } })).json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
  await page.goto("/");
  const chunks = page.locator(".pm-r-chunk");
  await chunks.first().getByRole("button", { name: "Run current chunk", exact: true }).click();
  await expect(chunks.first().frameLocator("iframe").locator("body")).toContainText("a = 4");
  const expression = page.locator(".pm-r-inline-code").last();
  await expression.click();
  await page.keyboard.press("Home"); await page.keyboard.press("Shift+End");
  await page.keyboard.type("a");
  await expect(expression).toHaveText("a");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("`{ojs} a`");
  await page.getByRole("button", { name: "Inline Observable JS controls", exact: true }).last().click();
  await page.getByRole("button", { name: "Run inline Observable JS", exact: true }).click();
  await expect(page.locator(".pm-r-inline-output pre")).toHaveText("4");
  // Pending native DOM input must be captured even when Run is clicked in the same task.
  await page.evaluate(() => {
    document.querySelectorAll(".pm-r-inline-code").item(4).textContent = "a + 1";
    (document.querySelector('[aria-label="Run inline Observable JS"]') as HTMLElement).click();
  });
  await expect(page.locator(".pm-r-inline-output pre")).toHaveText("5");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("`{ojs} a + 1`");
  await page.screenshot({ path: ".run/logs/executable-inline-current-result.png" });
});

test("OJS cell identities survive insertion before a previously executed definition", async ({ page, request }) => {
  const body = 'Start\n\n```{ojs}\na = 4\n```\n\n`{ojs} a`\n';
  const note = await (await request.post("/api/pages", { data: { title: "OJS identity", body, bodyFormat: "markdown", syntax: { version: 1, variant: "quarto", extensions: {} } } })).json();
  await page.addInitScript(id => { localStorage.setItem("notdown-page", id); localStorage.setItem("notdown-executable-language", "ojs"); }, note.id);
  await page.goto("/");
  await page.getByRole("button", { name: "Run current chunk", exact: true }).click();
  await expect(page.locator(".pm-r-chunk").frameLocator("iframe").locator("body")).toContainText("a = 4");
  await page.locator(".pm-document > p").first().click();
  await page.keyboard.press("End"); await page.keyboard.press("Enter"); await page.keyboard.type("/");
  await page.locator('[data-insert="executable_chunk"]').click();
  await expect(page.getByRole("dialog", { name: "Choose execution language", exact: true })).toHaveCount(0);
  await page.keyboard.type("b = 7");
  await expect(page.locator(".pm-r-code code").first()).toHaveText("b = 7");
  await page.getByRole("button", { name: "Run current chunk", exact: true }).first().click();
  await expect(page.locator(".pm-r-chunk").first().frameLocator("iframe").locator("body")).toContainText("b = 7");
  await page.getByRole("button", { name: "Inline Observable JS controls", exact: true }).click();
  await page.getByRole("button", { name: "Run inline Observable JS", exact: true }).click();
  await expect(page.locator(".pm-r-inline-output pre")).toHaveText("4");
});

test("edited inline expressions read the matching R, Python, Julia and OJS sessions", async ({ page, request }) => {
  test.skip(!process.env.NOTDOWN_TEST_JULIA || !process.env.NOTDOWN_PYTHON, "Enable the installed Python and IJulia kernels");
  test.setTimeout(90_000);
  const capability = await (await request.get("/api/rmarkdown/capabilities")).json();
  test.skip(!capability.available, capability.help);
  const body = '```{r}\na = 2\na\n```\n\n```{python}\na = 1\na\n```\n\n```{julia}\na = 3\na\n```\n\n```{ojs}\na = 4\na\n```\n\n`r 1`\n\n`{python} 1`\n\n`{julia} 1`\n\n`{ojs} 1`\n';
  const note = await (await request.post("/api/pages", { data: { title: "Four runtime values", body, bodyFormat: "notion-markdown", syntax: { version: 1, variant: "notdown", extensions: {} } } })).json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
  await page.goto("/");
  for (let index = 0; index < 4; index++) {
    const chunk = page.locator(".pm-r-chunk").nth(index);
    await chunk.getByRole("button", { name: "Run current chunk", exact: true }).click();
    await expect(chunk.locator('.pm-r-output[data-state="done"]')).toBeVisible({ timeout: 30_000 });
  }
  for (const [index, label, expected] of [[0, "R", "[1] 2"], [1, "Python", "1"], [2, "Julia", "3"], [3, "Observable JS", "4"]] as const) {
    const expression = page.locator(".pm-r-inline-code").nth(index);
    await expression.click();
    await expression.evaluate(element => {
      const range = document.createRange(); range.selectNodeContents(element);
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    });
    await page.keyboard.insertText("a");
    await expect(expression).toHaveText("a");
    await page.getByRole("button", { name: `Inline ${label} controls`, exact: true }).click();
    await page.getByRole("button", { name: `Run inline ${label}`, exact: true }).click();
    await expect(page.getByRole("dialog", { name: `Inline ${label} result`, exact: true }).locator("pre")).toHaveText(expected, { timeout: 20_000 });
    await page.keyboard.press("Escape");
  }
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain('`r a`\n\n`{python} a`\n\n`{julia} a`\n\n`{ojs} a`');
});
