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
  await expect(page.locator(".pm-document")).toBeVisible();
  for (const name of ["Run R Markdown", "Insert R chunk", "Insert inline R"])
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  return note;
}

async function run(page: Page) {
  await page.locator(".pm-document > p").first().click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Control+Shift+Enter");
}

async function insertR(page: Page, kind: "R Chunk" | "Inline R") {
  await page.keyboard.type("/");
  await page.locator(`[data-insert="${kind === "R Chunk" ? "executable_chunk" : "executable_inline"}"]`).click();
  await expect(page.getByRole("dialog", { name: "Choose execution language", exact: true })).toHaveCount(0);
}

async function selectInlineExpression(page: Page) {
  const expression = page.locator(".pm-r-inline-code");
  await expression.click();
  await expression.evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  });
}

test("Knit captures pending input, shows an isolated read-only result and returns to unrun source", async ({ page, request }) => {
  let calls = 0, submitted = "";
  await page.route("**/api/rmarkdown/run", async route => {
    calls++; submitted = route.request().postDataJSON().source;
    await route.fulfill({ json: { html: '<p>Result: 42</p><script>parent.document.body.dataset.rInjected="yes"</script>', log: "done" } });
  });
  const note = await open(page, request);
  await expect(page.getByLabel("Markdown dialect")).toHaveValue("rmarkdown");
  await expect(page.locator(".pm-r-chunk-label")).toHaveText("R");
  expect(calls).toBe(0);
  await page.locator('.editing-modes [data-mode="split"]').click();
  const code = page.locator(".pm-r-code code");
  await code.click(); await page.keyboard.press("End"); await page.keyboard.type(" + 0");
  await run(page);
  await expect(page.frameLocator('iframe[title="R Markdown output"]').locator("body")).toContainText("Result: 42");
  expect(submitted).toContain("x <- 41 + 0");
  expect(calls).toBe(1);
  await expect(page.locator('iframe[title="R Markdown output"]')).toHaveAttribute("sandbox", "");
  expect(await page.locator("body").getAttribute("data-r-injected")).toBeNull();
  await expect(page.locator(".editing-panes")).toBeHidden();
  await page.getByRole("button", { name: "Return to editing", exact: true }).click();
  await expect(page.locator(".editing-panes")).toBeVisible();
  await expect(page.locator(".rmarkdown-results")).toBeHidden();
  await code.click(); await page.keyboard.press("End"); await page.keyboard.type(" + 1");
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
  await run(page);
  await expect.poll(() => Boolean(finish)).toBe(true);
  await page.getByRole("button", { name: "Stop R", exact: true }).click();
  finish!();
  await expect(page.locator(".rmarkdown-results [role=status]")).toHaveText("R execution stopped.");
  await expect(page.getByRole("button", { name: "Stop R", exact: true })).toBeHidden();
  await expect(page.locator('iframe[title="R Markdown output"]')).toHaveCount(0);
});

test("real R output shows computation and plot inside the page", async ({ page, request }) => {
  const capabilities = await (await request.get("/api/rmarkdown/capabilities")).json();
  test.skip(!capabilities.available, capabilities.help);
  await open(page, request, '```{r setup, include=FALSE}\nx <- 42\n```\n\nResult: `r x`.\n\n```{r chart, echo=FALSE, fig.width=3, fig.height=3}\nplot(1:3)\n```\n');
  await run(page);
  const frame = page.frameLocator('iframe[title="R Markdown output"]');
  await expect(frame.locator("body")).toContainText("Result: 42", { timeout: 20_000 });
  await expect(frame.locator("img")).toHaveAttribute("src", /^data:image\/png;base64,/);
  await page.locator(".rmarkdown-results").scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".run/logs/rmarkdown-results.png" });
});

test("insert R chunk preserves its header after Page editing and reload", async ({ page, request }) => {
  const note = await open(page, request, "Start\n");
  await page.locator(".pm-document > p").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await insertR(page, "R Chunk");
  await expect(page.locator(".pm-r-code code")).toHaveText("");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("```{r}");
  await page.reload();
  await expect(page.locator(".pm-r-chunk-label")).toHaveText("R");
});

test("R chunk headers and inline expressions are editable with source preservation", async ({ page, request }) => {
  let calls = 0;
  await page.route("**/api/rmarkdown/run", route => { calls++; return route.fulfill({ json: { html: "<p>42</p>", log: "" } }); });
  const note = await open(page, request, '```{r setup, include=FALSE, custom=list(a="}")}\nx <- 41\n```\n\nResult: `r  x + 1  `. Ordinary: `x + 1`.\n');
  const header = page.getByRole("button", { name: "R chunk options", exact: true });
  await expect(header).toBeVisible();
  await expect(page.locator(".pm-r-chunk-header")).not.toContainText("{r");
  await expect(page.locator(".pm-r-chunk .pm-code-token").first()).toBeVisible();
  await header.click();
  const dialog = page.getByRole("dialog", { name: "R chunk options" });
  await dialog.getByLabel("Chunk header", { exact: true }).fill("{python}");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(dialog.locator("output")).toContainText("valid header");
  const changed = '{r setup, echo=FALSE, fig.dim=c(4, 3), custom=list(a="}")}';
  await dialog.getByLabel("Chunk header", { exact: true }).fill(changed);
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".pm-r-code")).toHaveAttribute("data-quarto-chunk", changed);
  const inline = page.locator(".pm-r-inline");
  await expect(inline.locator(".pm-code-number")).toHaveText("1");
  await expect(page.locator(".pm-code-block")).toHaveCount(0);
  await expect(inline).toHaveCount(1);
  await expect(inline).toHaveAttribute("data-r-source", "`r  x + 1  `");
  await selectInlineExpression(page);
  await expect(page.getByRole("dialog", { name: "Inline R result", exact: true })).toHaveCount(0);
  await page.keyboard.type("x + 2");
  await expect(inline).toHaveAttribute("data-r-source", "`r  x + 2`");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("`r  x + 2`");
  const saved = await (await request.get(`/api/pages/${note.id}`)).json();
  expect(saved.body).toContain(changed);
  expect(saved.body).toContain("Ordinary: `x + 1`");
  await page.reload();
  await expect(page.locator(".pm-r-code")).toHaveAttribute("data-quarto-chunk", changed);
  await expect(inline).toHaveAttribute("data-r-source", "`r  x + 2`");
  expect(calls).toBe(0);
  await page.screenshot({ path: ".run/logs/rmarkdown-editor-fixed.png" });
});

test("inline R insertion stays in the paragraph and survives undo and redo", async ({ page, request }) => {
  await open(page, request, "Before after\n");
  const paragraph = page.locator(".pm-document > p");
  await paragraph.click();
  await page.keyboard.press("Home");
  await insertR(page, "Inline R");
  await expect(paragraph.locator(".pm-r-inline")).toHaveCount(1);
  await expect(paragraph).toContainText("Before after");
  await page.keyboard.press("Control+z");
  await expect(page.locator(".pm-r-inline")).toHaveCount(0);
  await page.keyboard.press("Control+y");
  await expect(page.locator(".pm-r-inline")).toHaveCount(1);
});

test("typing inline R creates its own highlighted type immediately", async ({ page, request }) => {
  const note = await open(page, request, "The value is ");
  await page.locator(".pm-document > p").click();
  await page.keyboard.press("End");
  await page.keyboard.type(' `r sqrt(4)`');
  await expect(page.locator(".pm-r-inline")).toHaveCount(1);
  await expect(page.locator(".pm-r-inline .pm-code-number")).toHaveText("4");
  await page.keyboard.type(" after");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("`r sqrt(4)` after");
  await page.reload();
  await expect(page.locator(".pm-r-inline")).toHaveCount(1);
});

test("notebook toolbar places isolated output under its chunk with fold/clear controls", async ({ page, request }) => {
  const calls: any[] = [];
  await page.route("**/api/rmarkdown/notebook", async route => {
    const payload = route.request().postDataJSON(); calls.push(payload);
    await route.fulfill({ json: { outputs: [{ index: payload.index, html: '<pre>[1] 42</pre><script>parent.document.body.dataset.rInjected="yes"</script>' }] } });
  });
  const note = await open(page, request);
  const chunk = page.locator(".pm-r-chunk");
  await expect(chunk.locator(".pm-r-chunk-header")).toHaveText("R");
  await expect(chunk.getByRole("button", { name: "R chunk options", exact: true })).toBeVisible();
  await expect(chunk.getByRole("button", { name: "Run all chunks above", exact: true })).toBeVisible();
  expect(calls).toHaveLength(0);
  await chunk.locator("code").click(); await page.keyboard.press("End"); await page.keyboard.type(" + 1");
  await chunk.getByRole("button", { name: "Run current chunk", exact: true }).click();
  await expect(chunk.frameLocator("iframe").locator("body")).toContainText("[1] 42");
  expect(calls[0].source).toContain("41 + 1");
  expect(calls[0].mode).toBe("current");
  await expect(chunk.locator("iframe")).toHaveAttribute("sandbox", "");
  expect(await page.locator("body").getAttribute("data-r-injected")).toBeNull();
  await chunk.getByRole("button", { name: "Collapse output", exact: true }).click();
  await expect(chunk.locator("iframe")).toBeHidden();
  await chunk.getByRole("button", { name: "Expand output", exact: true }).click();
  await expect(chunk.locator("iframe")).toBeVisible();
  await page.keyboard.press("Control+s");
  const saved = await (await request.get(`/api/pages/${note.id}`)).json();
  expect(saved.body).not.toContain("[1] 42");
  await chunk.getByRole("button", { name: "Clear output", exact: true }).click();
  await expect(chunk.locator(".pm-r-output")).toBeHidden();
});

test("real notebook runs above, shares variables with current chunk and shows inline result in a nearby popup", async ({ page, request }) => {
  const capabilities = await (await request.get("/api/rmarkdown/capabilities")).json();
  test.skip(!capabilities.available, capabilities.help);
  await open(page, request, '```{r setup, include=FALSE}\nx <- 42\nprint(x)\n```\n\n```{r chart}\nplot(1:3, col="steelblue", pch=19)\n```\n\nThe answer is `r x + 1`.\n');
  const chunks = page.locator(".pm-r-chunk");
  await chunks.nth(1).getByRole("button", { name: "Run all chunks above", exact: true }).click();
  await expect(chunks.first().frameLocator("iframe").locator("body")).toContainText("42", { timeout: 20_000 });
  await expect(chunks.nth(1).locator(".pm-r-output")).toBeHidden();
  await chunks.nth(1).locator("code").click();
  await page.keyboard.press("Control+Shift+Enter");
  await expect(chunks.nth(1).frameLocator("iframe").locator("img")).toHaveAttribute("src", /^data:image\/png;base64,/, { timeout: 20_000 });
  await expect.poll(() => chunks.nth(1).frameLocator("iframe").locator("body").evaluate(body => body.scrollHeight <= innerHeight)).toBe(true);
  await page.locator(".pm-r-inline-code").click();
  await page.keyboard.press("Control+Enter");
  const popup = page.getByRole("dialog", { name: "Inline R result", exact: true });
  await expect(popup.locator("pre")).toHaveText("[1] 43", { timeout: 20_000 });
  await expect(page.locator(".pm-r-inline")).toHaveAttribute("data-r-source", "`r x + 1`");
  await page.screenshot({ path: ".run/logs/r-notebook-results.png", fullPage: true });
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await page.locator(".pm-document p").filter({ hasText: "The answer is" }).click();
  await page.keyboard.press("End"); await page.keyboard.type(" Still here.");
  await expect(chunks.first().locator('[role="status"]')).toHaveText("Output");
  await expect(popup).toHaveCount(0);
  await page.getByRole("button", { name: "Inline R controls", exact: true }).click();
  await expect(popup.locator("pre")).toHaveText("[1] 43");
  await popup.getByRole("button", { name: "Clear output", exact: true }).click();
  await expect(popup).toHaveCount(0);
  await chunks.first().getByRole("button", { name: "R chunk options", exact: true }).click();
  await page.getByRole("button", { name: "Restart R and clear output", exact: true }).click();
  await expect(page.locator(".pm-r-output:visible")).toHaveCount(0);
  await page.getByRole("button", { name: "Inline R controls", exact: true }).click();
  await popup.getByRole("button", { name: "Run inline R", exact: true }).click();
  await expect(popup.locator("pre")).toContainText("x", { timeout: 20_000 });
  await expect(popup.locator('[role="status"]')).toHaveText("R error");
});

test("changed notebook source cancels execution and ignores a late result", async ({ page, request }) => {
  let finish: (() => void) | undefined;
  await page.route("**/api/rmarkdown/notebook", async route => {
    await new Promise<void>(resolve => { finish = resolve; });
    await route.fulfill({ json: { outputs: [{ index: 0, html: "<pre>late</pre>" }] } }).catch(() => {});
  });
  await open(page, request);
  const chunk = page.locator(".pm-r-chunk");
  await chunk.getByRole("button", { name: "Run current chunk", exact: true }).click();
  await expect.poll(() => Boolean(finish)).toBe(true);
  await expect(chunk.getByRole("button", { name: "Stop R chunk", exact: true })).toBeVisible();
  await chunk.locator("code").click(); await page.keyboard.press("End"); await page.keyboard.type(" + 1");
  finish!();
  await expect(chunk.locator('[role="status"]')).toContainText("out of date");
  await expect(chunk.locator("iframe")).toHaveCount(0);
});

test("Knit button evaluates every chunk in order, replaces inline R and restores exact editable source", async ({ page, request }) => {
  const capabilities = await (await request.get("/api/rmarkdown/capabilities")).json();
  test.skip(!capabilities.available, capabilities.help);
  const original = '```{r first}\nx <- 40\nx\n```\n\n```{r second}\nx <- x + 2\nx\n```\n\nFinal value: `r x`.\n';
  const note = await open(page, request, original);
  await page.getByRole("button", { name: "Knit", exact: true }).click();
  const frame = page.frameLocator('iframe[title="R Markdown output"]');
  await expect(frame.locator("body")).toContainText("Final value: 42.", { timeout: 20_000 });
  await expect(frame.locator("body")).toContainText("[1] 40");
  await expect(frame.locator("body")).toContainText("[1] 42");
  await expect(frame.locator("body")).not.toContainText("`r x`");
  await expect(page.locator(".pm-document")).toBeHidden();
  await page.screenshot({ path: ".run/logs/r-knit-preview.png", fullPage: true });
  await page.getByRole("button", { name: "Return to editing", exact: true }).click();
  await expect(page.locator(".pm-r-inline-code")).toHaveText("x");
  await expect(page.locator(".pm-r-output:visible")).toHaveCount(0);
  await expect(page.locator('iframe[title="R Markdown output"]')).toHaveCount(0);
  await page.keyboard.press("Control+s");
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(original);
});

test("inline R uses a text caret; only the r badge opens controls and edited expressions run", async ({ page, request }) => {
  const calls: any[] = [];
  await page.route("**/api/rmarkdown/notebook", route => {
    calls.push(route.request().postDataJSON());
    return route.fulfill({ json: { outputs: [{ index: 0, text: "[1] 4" }] } });
  });
  await open(page, request, "Before `r 1 + 2` after.\n");
  const popup = page.getByRole("dialog", { name: "Inline R result", exact: true });
  await selectInlineExpression(page);
  await expect(popup).toHaveCount(0);
  await page.keyboard.insertText("2 + 2");
  await expect(page.locator(".pm-r-inline-code")).toHaveText("2 + 2");
  await page.keyboard.press("Control+z");
  await expect(page.locator(".pm-r-inline-code")).toHaveText("1 + 2");
  await page.keyboard.press("Control+y");
  await expect(page.locator(".pm-r-inline-code")).toHaveText("2 + 2");
  await expect(popup).toHaveCount(0);
  await page.getByRole("button", { name: "Inline R controls", exact: true }).click();
  await expect(popup).toBeVisible();
  expect(calls).toHaveLength(0);
  await popup.getByRole("button", { name: "Run inline R", exact: true }).click();
  await expect(popup.locator("pre")).toHaveText("[1] 4");
  expect(calls[0].source).toContain("`r 2 + 2`");
  await page.locator(".pm-r-inline-code").click();
  await expect(popup).toHaveCount(0);
  await page.keyboard.press("Control+Enter");
  await expect(popup.locator("pre")).toHaveText("[1] 4");
  await expect.poll(() => calls.length).toBe(2);
});

test("a stale backend shows a restart instruction instead of API endpoint not found", async ({ page, request }) => {
  await page.route("**/api/rmarkdown/notebook", route => route.fulfill({ status: 404, json: { error: "API endpoint not found" } }));
  await open(page, request);
  await page.getByRole("button", { name: "Run current chunk", exact: true }).click();
  await expect(page.locator(".pm-r-output-body")).toContainText("Restart the Notdown service");
});
