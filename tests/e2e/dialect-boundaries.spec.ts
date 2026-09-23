import { test, expect } from "@playwright/test";

for (const variant of ["notion-markdown", "notdown", "gfm"] as const) {
  test(`${variant}: typed H6 agrees with source parsing and survives saving`, async ({ page, request }) => {
    const body = "###### Existing\n\nTail";
    const response = await request.post("/api/pages", { data: {
      title: "Heading dialect boundary", body,
      bodyFormat: variant === "gfm" ? "markdown" : "notion-markdown",
      syntax: { version: 1, variant, extensions: {} },
    } });
    expect(response.status()).toBe(201);
    const note = await response.json();
    await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
    await page.goto("/");
    const level = variant === "notion-markdown" ? 4 : 6;
    await expect(page.locator(`.pm-document h${level}`)).toHaveText("Existing");
    await page.locator(".pm-document > p").filter({ hasText: /^Tail$/ }).click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("###### Typed");
    await expect(page.locator(`.pm-document h${level}`)).toHaveText(["Existing", "Typed"]);
    await page.keyboard.press("Control+s");
    const expected = body + "\n\n" + "#".repeat(level) + " Typed";
    await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(expected);
    await page.reload();
    await expect(page.locator(`.pm-document h${level}`)).toHaveText(["Existing", "Typed"]);
  });
}

for (const marker of ["1) ", "``` "]) {
  test(`Original Markdown: typing ${JSON.stringify(marker)} keeps literal text after reload`, async ({ page, request }) => {
    const response = await request.post("/api/pages", { data: {
      title: "Literal input boundary", body: "Tail", bodyFormat: "markdown",
      syntax: { version: 1, variant: "markdown_strict", extensions: {} },
    } });
    expect(response.status()).toBe(201);
    const note = await response.json();
    await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
    await page.goto("/");
    await page.locator(".pm-document > p").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type(marker + "Literal");
    await expect(page.locator(".pm-document > p")).toHaveText(["Tail", marker + "Literal"]);
    await expect(page.locator(".pm-document ol, .pm-document pre")).toHaveCount(0);
    await page.keyboard.press("Control+s");
    await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("Literal");
    await page.reload();
    await expect(page.locator(".pm-document > p")).toHaveText(["Tail", marker + "Literal"]);
    await expect(page.locator(".pm-document ol, .pm-document pre")).toHaveCount(0);
  });
}

for (const variant of ["commonmark", "gfm", "notion-markdown"]) {
  test(`${variant}: local plugin activation persists without rewriting source`, async ({ page, request }) => {
    const body = '<tabs>\n<tab title="First">\nOriginal content\n</tab>\n</tabs>\n\nTail';
    const response = await request.post("/api/pages", { data: {
      title: "Plugin boundary " + variant, body,
      bodyFormat: variant === "notion-markdown" ? variant : "markdown",
      syntax: { version: 1, variant, extensions: { future_option: true } },
    } });
    expect(response.status()).toBe(201);
    const note = await response.json();
    await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
    await page.goto("/");
    await expect(page.locator(".pm-document")).toBeVisible();
    await expect(page.locator(".pm-object-tabs")).toHaveCount(0);
    await page.locator(".syntax-options summary").click();
    const toggle = page.locator('input[data-extension="notion_tabs"]');
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await expect(page.locator(".pm-object-tabs")).toContainText("Original content");
    await page.keyboard.press("Control+s");
    await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).syntax.extensions.notion_tabs).toBe(true);
    expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
    await page.reload();
    await expect(page.locator(".pm-object-tabs")).toContainText("Original content");
    await page.locator(".syntax-options summary").click();
    await toggle.uncheck();
    await expect(page.locator(".pm-object-tabs")).toHaveCount(0);
    await page.keyboard.press("Control+s");
    await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).syntax.extensions.notion_tabs).toBe(false);
    expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
    await page.getByRole("button", { name: "Reset dialect defaults" }).click();
    await expect(toggle).not.toBeChecked();
    await page.keyboard.press("Control+s");
    await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).syntax.extensions).toEqual({ future_option: true });
  });
}
