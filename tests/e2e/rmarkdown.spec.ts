import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

async function open(page: Page, request: APIRequestContext, body = '```{r}\nx <- 41\n```\n\nResult: `r x + 1`.\n') {
  const response = await request.post("/api/pages", { data: {
    title: "R Markdown execution", body, bodyFormat: "markdown",
    syntax: { version: 1, variant: "rmarkdown", extensions: {} },
  } });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Run R Markdown", exact: true })).toBeVisible();
  return note;
}

test("R Markdown edits capture pending input and run only on click; output is isolated and never saved", async ({ page, request }) => {
  let calls = 0, submitted = "";
  await page.route("**/api/rmarkdown/run", async route => {
    calls++; submitted = route.request().postDataJSON().source;
    await route.fulfill({ json: { html: '<p>Result: 42</p><script>parent.document.body.dataset.rInjected="yes"</script>', log: "done" } });
  });
  const note = await open(page, request);
  await expect(page.getByLabel("Markdown dialect")).toHaveValue("rmarkdown");
  await expect(page.locator(".pm-code-language")).toHaveText("R");
  expect(calls).toBe(0);
  await page.locator('.editing-modes [data-mode="split"]').click();
  const code = page.locator(".pm-code-pre code");
  await code.click(); await page.keyboard.press("End"); await page.keyboard.type(" + 0");
  await page.getByRole("button", { name: "Run R Markdown", exact: true }).click();
  await expect(page.frameLocator('iframe[title="R Markdown output"]').locator("body")).toContainText("Result: 42");
  expect(submitted).toContain("x <- 41 + 0");
  expect(calls).toBe(1);
  await expect(page.locator('iframe[title="R Markdown output"]')).toHaveAttribute("sandbox", "");
  expect(await page.locator("body").getAttribute("data-r-injected")).toBeNull();
  await code.click(); await page.keyboard.press("End"); await page.keyboard.type(" + 1");
  await expect(page.locator(".rmarkdown-results [role=status]")).toContainText("Source changed");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("41 + 0 + 1");
  const saved = await (await request.get(`/api/pages/${note.id}`)).json();
  expect(saved.body).not.toContain("Result: 42");
  expect(saved.body).toContain("`r x + 1`");
  await page.reload();
  expect(calls).toBe(1);
  await expect(page.locator(".rmarkdown-results")).toBeHidden();
});

test("stopping R ignores late output and permits another run", async ({ page, request }) => {
  let finish: (() => void) | undefined;
  await page.route("**/api/rmarkdown/run", async route => {
    await new Promise<void>(resolve => { finish = resolve; });
    await route.fulfill({ json: { html: "<p>late output</p>", log: "" } }).catch(() => {});
  });
  await open(page, request);
  await page.getByRole("button", { name: "Run R Markdown", exact: true }).click();
  await expect.poll(() => Boolean(finish)).toBe(true);
  await page.getByRole("button", { name: "Stop R", exact: true }).click();
  finish!();
  await expect(page.locator(".rmarkdown-results [role=status]")).toHaveText("R execution stopped.");
  await expect(page.getByRole("button", { name: "Run R Markdown", exact: true })).toBeEnabled();
  await expect(page.locator('iframe[title="R Markdown output"]')).toHaveCount(0);
});

test("real R output shows computation and plot inside the page", async ({ page, request }) => {
  const capabilities = await (await request.get("/api/rmarkdown/capabilities")).json();
  test.skip(!capabilities.available, capabilities.help);
  await open(page, request, '```{r setup, include=FALSE}\nx <- 42\n```\n\nResult: `r x`.\n\n```{r chart, echo=FALSE, fig.width=3, fig.height=3}\nplot(1:3)\n```\n');
  await page.getByRole("button", { name: "Run R Markdown", exact: true }).click();
  const frame = page.frameLocator('iframe[title="R Markdown output"]');
  await expect(frame.locator("body")).toContainText("Result: 42", { timeout: 20_000 });
  await expect(frame.locator("img")).toHaveAttribute("src", /^data:image\/png;base64,/);
  await page.locator(".rmarkdown-results").scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".run/logs/rmarkdown-results.png" });
});

test("insert R chunk preserves its header after Page editing and reload", async ({ page, request }) => {
  const note = await open(page, request, "Start\n");
  await page.locator(".pm-document > p").click();
  await page.getByRole("button", { name: "Insert R chunk", exact: true }).click();
  await expect(page.locator(".pm-code-pre code")).toContainText("summary(cars)");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("```{r}");
  await page.reload();
  await expect(page.locator(".pm-code-language")).toHaveText("R");
});
