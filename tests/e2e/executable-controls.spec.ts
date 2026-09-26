import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

async function open(page: Page, request: APIRequestContext, body: string) {
  const note = await (await request.post("/api/pages", { data: { title: "Notebook controls", body,
    bodyFormat: "markdown", syntax: { version: 1, variant: "quarto", extensions: {} } } })).json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
  await page.goto("/");
  return note;
}

test("Ctrl+Enter captures current chunk input and only runs that chunk", async ({ page, request }) => {
  const calls: any[] = [];
  await page.route("**/api/quarto/notebook", route => {
    const data = route.request().postDataJSON(); calls.push(data);
    return route.fulfill({ json: { outputs: [{ index: data.index, text: "42" }] } });
  });
  await open(page, request, '```{python}\n1\n```\n\n```{python}\n2\n```\n');
  await page.locator(".pm-r-code code").last().click();
  await page.keyboard.press("End"); await page.keyboard.type(" + 40");
  await page.keyboard.press("Control+Enter");
  await expect(page.locator(".pm-r-output-body pre")).toHaveText("42");
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ mode: "current", index: 1 });
  expect(calls[0].source).toContain("2 + 40");
  await expect(page.locator(".pm-r-chunk").first().locator(".pm-r-output")).toBeHidden();
});

test("inline hover, local switch and global switch keep source intact", async ({ page, request }) => {
  let calls = 0;
  await page.route("**/api/quarto/notebook", route => {
    calls++; return route.fulfill({ json: { outputs: [{ index: 0, text: "42" }] } });
  });
  const body = 'Value: `{python} 6 * 7`. Other: `{python} 1 + 1`.\n';
  const note = await open(page, request, body);
  const inline = page.locator(".pm-r-inline").first();
  await inline.locator(".pm-r-inline-code").click();
  await page.keyboard.press("Control+Enter");
  await expect(page.locator(".pm-r-inline-output pre")).toHaveText("42");
  await page.keyboard.press("Escape"); await page.mouse.move(0, 0);
  await inline.hover();
  await expect(page.locator(".pm-r-inline-output pre")).toHaveText("42");
  await expect(page.getByRole("switch", { name: "Show inline result", exact: true })).toBeHidden();
  await inline.locator(".pm-r-inline-prefix").click();
  await page.getByRole("switch", { name: "Show inline result", exact: true }).click();
  await expect(inline.locator(".pm-r-inline-value")).toHaveText("42");
  await expect(inline.locator(".pm-r-inline-prefix")).toBeHidden();
  await expect(inline.locator(".pm-r-inline-code")).toBeHidden();
  await inline.getByRole("button", { name: "Inline result controls" }).click();
  await expect(page.getByRole("switch", { name: "Show inline result", exact: true })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("switch", { name: "Show inline result", exact: true }).click();
  await expect(inline.locator(".pm-r-inline-code")).toBeVisible();
  const all = page.getByRole("switch", { name: "Show all inline results" });
  await all.click();
  await expect(page.locator('.pm-r-inline[data-inline-view="result"]')).toHaveCount(2);
  await expect(page.locator(".pm-r-inline-value").last()).toHaveText("Not run");
  await all.click();
  await expect(page.locator('.pm-r-inline[data-inline-view="code"]')).toHaveCount(2);
  expect(calls).toBe(1);
  await page.keyboard.press("Control+s");
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
});

test("Run all runs chunks before inline in mixed languages and displays results without badges", async ({ page, request }) => {
  const calls: any[] = [];
  await page.route("**/api/quarto/notebook", route => {
    const data = route.request().postDataJSON(); calls.push(data);
    return route.fulfill({ json: { outputs: [{ index: data.index, text: data.mode === "inline" ? String(41 + data.index) : "defined" }] } });
  });
  const body = '`{python} a` and `{julia} b`.\n\n```{python}\na = 41\n```\n\n```{julia}\nb = 42\n```\n';
  const note = await open(page, request, body);
  await page.getByRole("button", { name: "Run all", exact: true }).click();
  await expect(page.locator(".pm-r-inline-value")).toHaveText(["41", "42"]);
  expect(calls.map(({ mode, index }) => [mode, index])).toEqual([["current", 0], ["current", 1], ["inline", 0], ["inline", 1]]);
  expect(new Set(calls.map(call => call.session)).size).toBe(1);
  await expect(page.locator(".pm-r-inline-prefix:visible")).toHaveCount(0);
  await expect(page.locator(".pm-r-inline-popover")).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Show all inline results" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Control+s");
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
  await page.screenshot({ path: ".run/logs/executable-controls-results.png" });
});

test("Run all evaluates real OJS definitions and inline values", async ({ page, request }) => {
  await open(page, request, '`{ojs} answer`\n\n```{ojs}\nanswer = 6 * 7\n```\n\n`{ojs} answer + 1`\n');
  await page.getByRole("button", { name: "Run all", exact: true }).click();
  await expect(page.locator(".pm-r-inline-value")).toHaveText(["42", "43"]);
  await page.getByRole("switch", { name: "Show all inline results" }).click();
  const expression = page.locator(".pm-r-inline-code").last();
  await expression.click(); await page.keyboard.press("End"); await page.keyboard.type(" + 1");
  await page.keyboard.press("Control+Enter");
  await expect(page.locator(".pm-r-inline-output pre")).toHaveText("44");
});

test("notebook controls are conditional and Stop all cancels queued inline execution", async ({ page, request }) => {
  await open(page, request, "Plain text and `ordinary code`.\n");
  await expect(page.getByRole("group", { name: "Notebook controls" })).toBeHidden();
  await open(page, request, '```{python}\n1\n```\n\n`{python} 2`\n');
  let calls = 0, finish!: () => void;
  const pending = new Promise<void>(resolve => finish = resolve);
  await page.route("**/api/quarto/notebook", async route => {
    calls++; await pending;
    await route.fulfill({ json: { outputs: [{ index: 0, text: "1" }] } }).catch(() => {});
  });
  await page.getByRole("button", { name: "Run all", exact: true }).click();
  await expect.poll(() => calls).toBe(1);
  const released = page.waitForResponse(response => response.request().method() === "DELETE" && response.url().includes("/api/quarto/notebook/"));
  await page.getByRole("button", { name: "Stop all", exact: true }).click();
  finish();
  expect((await released).ok()).toBe(true);
  await expect(page.getByRole("button", { name: "Run all", exact: true })).toBeEnabled();
  await expect(page.locator(".pm-r-output")).toHaveAttribute("data-state", "stopped");
  await expect(page.locator(".pm-r-inline-value")).toHaveText("Not run");
  expect(calls).toBe(1);
});

test("Run all captures pending DOM input, preserves errors and keeps later results", async ({ page, request }) => {
  const calls: any[] = [];
  await page.route("**/api/quarto/notebook", route => {
    const data = route.request().postDataJSON(); calls.push(data);
    return route.fulfill({ json: { outputs: [{ index: data.index, ...(data.mode === "inline" && data.index === 0
      ? { error: "Unknown variable missing" } : { text: "42" }) }] } });
  });
  await open(page, request, '```{python}\nx = 1\n```\n\n`{python} missing` and `{python} x`\n');
  await expect(page.locator(".pm-r-code code")).toBeVisible();
  await page.evaluate(() => {
    document.querySelector(".pm-r-code code")!.textContent = "x = 42";
    (document.querySelector(".notebook-controls button") as HTMLButtonElement).click();
  });
  await expect(page.locator(".pm-r-inline-value")).toHaveText(["Error", "42"]);
  expect(calls).toHaveLength(3);
  expect(calls.every(call => call.source.includes("x = 42"))).toBe(true);
  await page.locator(".pm-r-inline-value").first().hover();
  await expect(page.locator(".pm-r-inline-output pre")).toHaveText("Unknown variable missing");
});

test("Run all uses real R, Python, Julia and OJS sessions for inline result views", async ({ page, request }) => {
  test.skip(!process.env.NOTDOWN_TEST_JULIA || !process.env.NOTDOWN_PYTHON, "Enable local Python and IJulia kernels");
  test.setTimeout(90_000);
  const capability = await (await request.get("/api/rmarkdown/capabilities")).json();
  test.skip(!capability.available, capability.help);
  const sessions = new Set<string>();
  page.on("request", req => { if (req.method() === "POST" && req.url().endsWith("/api/quarto/notebook")) sessions.add(req.postDataJSON().session); });
  try {
    await open(page, request, '```{r}\na = 2\n```\n\n```{python}\na = 1\n```\n\n```{julia}\na = 3\n```\n\n```{ojs}\na = 4\n```\n\n`r a` `{python} a` `{julia} a` `{ojs} a`\n');
    await page.getByRole("button", { name: "Run all", exact: true }).click();
    await expect(page.locator(".pm-r-inline-value")).toHaveText(["[1] 2", "1", "3", "4"], { timeout: 60_000 });
    await expect(page.locator(".pm-r-inline-prefix:visible")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Run all", exact: true })).toBeEnabled();
  } finally {
    // Closing a Playwright context need not deliver pagehide/keepalive requests.
    for (const session of sessions) {
      const closed = await request.delete(`/api/quarto/notebook/${session}`, { data: {} });
      expect(closed.ok(), await closed.text()).toBe(true);
    }
  }
});
