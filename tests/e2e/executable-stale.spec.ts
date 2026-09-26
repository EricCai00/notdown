import { test, expect } from "@playwright/test";

test("only a changed cell shows a stale result and undo restores its original status", async ({ page, request }) => {
  await page.route("**/api/quarto/notebook", route => route.fulfill({ json: { outputs: [{ index: route.request().postDataJSON().index, text: "2" }] } }));
  const note = await (await request.post("/api/pages", { data: { title: "Individual results", body: 'Text\n\n```{python}\n1 + 1\n```\n\n```{python}\n1 + 1\n```\n\n`{python} 1 + 1`', bodyFormat: "markdown", syntax: { version: 1, variant: "quarto", extensions: {} } } })).json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id); await page.goto("/");
  const chunks = page.locator(".pm-r-chunk");
  for (let index = 0; index < 2; index++) {
    await chunks.nth(index).getByRole("button", { name: "Run current chunk", exact: true }).click();
    await expect(chunks.nth(index).locator('[role="status"]')).toHaveText("Output");
  }
  await page.locator(".pm-document > p").first().click(); await page.keyboard.press("End"); await page.keyboard.type(" updated");
  await expect(chunks.locator('[role="status"]')).toHaveText(["Output", "Output"]);
  await chunks.first().locator("code").click(); await page.keyboard.press("End"); await page.keyboard.type("2");
  await expect(chunks.first().locator('[role="status"]')).toContainText("out of date");
  await expect(chunks.nth(1).locator('[role="status"]')).toHaveText("Output");
  await page.keyboard.press("Control+z");
  await expect(chunks.locator('[role="status"]')).toHaveText(["Output", "Output"]);
});

test("editing unrelated prose does not cancel a running cell or mark its result stale", async ({ page, request }) => {
  let finish: (() => void) | undefined;
  await page.route("**/api/quarto/notebook", async route => {
    await new Promise<void>(resolve => { finish = resolve; });
    await route.fulfill({ json: { outputs: [{ index: 0, text: "42" }] } });
  });
  const note = await (await request.post("/api/pages", { data: { title: "Pending result", body: 'Prose\n\n```{python}\n42\n```', bodyFormat: "markdown", syntax: { version: 1, variant: "quarto", extensions: {} } } })).json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id); await page.goto("/");
  await page.getByRole("button", { name: "Run current chunk", exact: true }).click();
  await expect.poll(() => Boolean(finish)).toBe(true);
  await page.locator(".pm-document > p").first().click(); await page.keyboard.press("End"); await page.keyboard.type(" changed");
  finish!();
  await expect(page.locator(".pm-r-output-body")).toHaveText("42");
  await expect(page.locator('.pm-r-output [role="status"]')).toHaveText("Output");
});
