import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

async function open(page: Page, request: APIRequestContext, body: string, variant = "quarto") {
  const response = await request.post("/api/pages", { data: { title: "Quarto notebook", body, bodyFormat: variant === "notdown" ? "notion-markdown" : "markdown", syntax: { version: 1, variant, extensions: {} } } });
  expect(response.ok()).toBeTruthy();
  const note = await response.json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
  await page.goto("/");
  await expect(page.locator(".pm-document")).toBeVisible();
  return note;
}

test("Quarto and Notdown expose language blocks and inline expressions without executing on open", async ({ page, request }) => {
  let calls = 0;
  await page.route("**/api/quarto/notebook", route => { calls++; return route.fulfill({ json: { outputs: [{ index: 0, text: "42" }] } }); });
  const body = '```{python}\n#| echo: false\nx = 41\nx + 1\n```\n\n`{python} x + 1`\n\n```{julia}\nx = 2\n```\n\n```python\ninert()\n```';
  const note = await open(page, request, body, "notdown");
  await expect(page.locator(".pm-r-chunk-label")).toHaveText(["Python", "Julia"]);
  await expect(page.locator(".pm-r-inline-prefix")).toHaveText("py");
  expect(calls).toBe(0);
  await page.locator(".pm-r-chunk").first().getByRole("button", { name: "Run current chunk", exact: true }).click();
  await expect(page.locator(".pm-r-output-body").first()).toHaveText("42");
  await page.getByRole("button", { name: "Inline Python controls", exact: true }).click();
  await page.getByRole("button", { name: "Run inline Python", exact: true }).click();
  await expect(page.locator(".pm-r-inline-output")).toContainText("42");
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
});

test("OJS embeds interactive output under each chunk without a separate panel", async ({ page, request }) => {
  const body = '```{ojs}\nviewof n = Inputs.range([1, 10], {value: 3, step: 1})\n```\n\n```{ojs}\nanswer = n * n\n```\n\n`{ojs} answer + 1`';
  const note = await open(page, request, body);
  const chunks = page.locator(".pm-r-chunk");
  await chunks.nth(1).getByRole("button", { name: "Run current chunk", exact: true }).click();
  const frame = chunks.nth(1).frameLocator('iframe[title="Observable JS chunk result"]');
  await expect(page.locator(".quarto-ojs-panel")).toHaveCount(0);
  await expect(frame.locator("body")).toContainText("n is not defined");
  await chunks.nth(0).getByRole("button", { name: "Run current chunk", exact: true }).click();
  await expect(frame.locator("body")).toContainText("answer = 9");
  await chunks.nth(1).getByRole("button", { name: "Collapse output", exact: true }).click();
  const slider = chunks.first().frameLocator("iframe").locator('input[type="range"]');
  await slider.focus(); await slider.press("End");
  for (let step = 0; step < 3; step++) await slider.press("ArrowLeft");
  await expect(slider).toHaveValue("7");
  await chunks.nth(1).getByRole("button", { name: "Expand output", exact: true }).click();
  await expect(frame.locator("body")).toContainText("answer = 49");
  const iframe = chunks.first().locator('iframe[title="Observable JS chunk result"]');
  await expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
  expect(await iframe.evaluate((element: HTMLIFrameElement) => element.contentDocument === null)).toBe(true);
  await page.getByRole("button", { name: "Inline Observable JS controls", exact: true }).click();
  await page.getByRole("button", { name: "Run inline Observable JS", exact: true }).click();
  await expect(page.locator(".pm-r-inline-output pre")).toHaveText("50");
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
  await page.keyboard.press("Escape");
  await chunks.first().getByRole("button", { name: "Clear output", exact: true }).click();
  await expect(chunks.first().locator("iframe")).toHaveCount(0);
  await expect(frame.locator("body")).toContainText("answer = 49");
  await chunks.first().getByRole("button", { name: "Run current chunk", exact: true }).click();
  await expect(frame.locator("body")).toContainText("answer = 9");
  await chunks.first().locator("code").click(); await page.keyboard.press("End"); await page.keyboard.type(" // edited");
  await expect(chunks.first().locator('[role="status"]')).toContainText("out of date");
  await expect(chunks.nth(1).locator('[role="status"]')).toHaveText("Output");
  await page.screenshot({ path: ".run/logs/quarto-ojs.png" });
});

test("real Python block and inline output use one kernel and never persist results", async ({ page, request }) => {
  test.skip(!process.env.NOTDOWN_PYTHON, "Python kernel is not configured");
  test.setTimeout(60_000);
  const body = '```{python}\nx = 41\nx + 1\n```\n\nValue: `{python} x + 2`';
  const note = await open(page, request, body);
  await page.getByRole("button", { name: "Run current chunk", exact: true }).click();
  await expect(page.frameLocator('iframe[title="Python chunk result"]').locator("body")).toContainText("42", { timeout: 25_000 });
  await page.getByRole("button", { name: "Inline Python controls", exact: true }).click();
  await page.getByRole("button", { name: "Run inline Python", exact: true }).click();
  await expect(page.locator(".pm-r-inline-output")).toContainText("43");
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
});

test("Quarto slash insertion, language editing and typed inline expressions survive save and reload", async ({ page, request }) => {
  const note = await open(page, request, "Start\n");
  await page.locator(".pm-document > p").click();
  await page.keyboard.press("End"); await page.keyboard.press("Enter");
  await page.keyboard.type("/");
  await page.locator('[data-insert="executable_chunk"]').click();
  await expect(page.getByRole("dialog", { name: "Choose execution language", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Chunk language", exact: true }).click();
  await page.getByRole("dialog", { name: "Choose execution language", exact: true }).getByRole("button", { name: "Python", exact: true }).click();
  await expect(page.locator(".pm-r-chunk-label")).toHaveText("Python");
  await page.getByRole("button", { name: "Python chunk options", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Python chunk options", exact: true });
  await dialog.getByLabel("Chunk header", { exact: true }).fill("{julia}");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".pm-r-chunk-label")).toHaveText("Julia");
  await page.locator(".pm-document > p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" `{julia} 1 + 2`");
  await expect(page.locator(".pm-r-inline-prefix")).toHaveText("jl");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("`{julia} 1 + 2`");
  await page.reload();
  await expect(page.locator(".pm-r-chunk-label")).toHaveText("Julia");
  await expect(page.locator(".pm-r-inline-prefix")).toHaveText("jl");
});

test("a Python runtime error preserves prior stdout and shows the traceback", async ({ page, request }) => {
  await page.route("**/api/quarto/notebook", route => route.fulfill({ json: { outputs: [{ index: 0, html: "<pre>before error</pre>", error: "ValueError: useful message" }] } }));
  await open(page, request, '```{python}\nprint("before error")\nraise ValueError("useful message")\n```');
  await page.getByRole("button", { name: "Run current chunk", exact: true }).click();
  await expect(page.frameLocator('iframe[title="Python chunk result"]').locator("body")).toContainText("before error");
  await expect(page.locator(".pm-r-output-body")).toContainText("ValueError: useful message");
});
