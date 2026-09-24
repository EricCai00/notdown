import { test, expect } from "@playwright/test";

test("Footnotes use decimal markers, align multiple paragraphs and return to each reference", async ({ page, request }) => {
  const body = 'First[^long].\n\nSecond[^short].\n\nRepeat[^long].\n\n[^short]: Short note.\n\n[^long]: Long note.\n\n    Another paragraph.\n\n    ```js\n    const answer = 42;\n    ```\n\n    Last paragraph.';
  const note = await (await request.post("/api/pages", { data: {
    title: "Footnote return links", body, bodyFormat: "notion-markdown",
    syntax: { version: 1, variant: "notdown", extensions: {} },
  } })).json();
  await page.goto(`/#page/${note.id}`);
  const first = page.locator('.pm-footnotes [data-footnote-label="long"]');
  await expect(first).toBeVisible();
  expect(await first.evaluate(el => getComputedStyle(el, "::before").content)).toBe('"1."');
  const paragraphs = first.locator(":scope > p");
  await expect(paragraphs).toHaveCount(3);
  await expect(first.locator("pre")).toContainText("const answer = 42;");
  const edges = await first.locator(":scope > p, :scope > pre").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().left));
  expect(Math.max(...edges) - Math.min(...edges)).toBeLessThan(2);
  await expect(paragraphs.last().getByRole("button")).toHaveCount(2);
  await first.getByRole("button", { name: "Return to footnote 1 reference 2", exact: true }).click();
  await expect(page.locator(".pm-document")).toBeFocused();
  expect(await page.evaluate(() => { const node = window.getSelection()?.anchorNode; return (node instanceof Element ? node : node?.parentElement)?.closest("p")?.textContent; })).toBe("Repeat[long].");
  await first.getByRole("button", { name: "Return to footnote 1 reference 1", exact: true }).focus();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => { const node = window.getSelection()?.anchorNode; return (node instanceof Element ? node : node?.parentElement)?.closest("p")?.textContent; })).toBe("First[long].");
  await page.keyboard.press("Control+s");
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
  await page.reload();
  await expect(first.getByRole("button", { name: /^Return to footnote/ })).toHaveCount(2);
  await page.screenshot({ path: "test-results/notdown-footnotes-backlinks.png" });
});

test("Footnotes share one footer in reference order, stay editable, and expose no block controls", async ({ page, request }) => {
  const body = '[^a]: Alpha note.\n\nBody [^b] then [^a] and again [^b].\n\n<callout icon="💡">\n\t[^b]: Beta note.\n\n\tCallout body.\n</callout>\n\nTail\n\n[^unused]: Unreferenced note.';
  const note = await (await request.post("/api/pages", { data: {
    title: "Footnotes footer", body, bodyFormat: "notion-markdown",
    syntax: { version: 1, variant: "notdown", extensions: {} },
  } })).json();
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/#page/${note.id}`);
  const footer = page.locator(".pm-document > .pm-footnotes");
  await expect(footer).toHaveCount(1);
  const notes = footer.locator(":scope > .pm-footnote");
  expect(await notes.evaluateAll(nodes => nodes.map(node => node.getAttribute("data-footnote-label")))).toEqual(["b", "a", "unused"]);
  expect(await page.locator(".pm-footnote-ref").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-footnote-number")))).toEqual(["1", "2", "1"]);
  await expect(footer).toHaveCSS("border-top-width", "1px");
  for (const note of await notes.all()) await expect(note).toHaveCSS("border-top-width", "0px");
  await notes.first().locator("p").hover();
  await expect(page.locator(".pm-block-handle.visible, .pm-block-add.visible")).toHaveCount(0);
  await page.keyboard.press("Control+s");
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
  await notes.first().locator("p").click();
  await page.keyboard.press("End"); await page.keyboard.type(" Edited");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("[^b]: Beta note. Edited");
  await page.reload();
  await expect(footer.locator('[data-footnote-label="b"]')).toContainText("Beta note. Edited");
  await footer.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/notdown-footnotes-footer.png" });
  expect(errors).toEqual([]);
});

test("Footnote inserts inline without splitting prose, appends its definition and survives undo and reload", async ({ page, request }) => {
  const note = await (await request.post("/api/pages", { data: {
    title: "Inline footnotes", body: "Before after\n\nTail\n\n[^note]: Existing note.", bodyFormat: "notion-markdown",
    syntax: { version: 1, variant: "notdown", extensions: {} },
  } })).json();
  await page.goto(`/#page/${note.id}`);
  await page.locator(".pm-document > p").first().click();
  await page.keyboard.press("Home");
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.type(" /footnote");
  const menu = page.locator(".inline-slash");
  await expect(menu.locator('[data-insert="footnote"] svg')).toHaveAttribute("data-lucide", "footnote");
  await menu.locator('[data-insert="footnote"]').click();
  await page.getByRole("textbox", { name: "Footnote text" }).fill("Footnote text.");
  await page.getByRole("button", { name: "Insert reference", exact: true }).click();
  await expect(page.locator(".pm-document > p").first()).toHaveText("Before [note2] after");
  await expect(page.locator(".pm-footnotes > .pm-footnote").first()).toHaveAttribute("data-footnote-label", "note2");
  await page.keyboard.press("Control+z");
  await expect(page.locator('.pm-footnote-ref')).toHaveCount(0);
  await expect(page.locator('.pm-footnote[data-footnote-label="note2"]')).toHaveCount(0);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator('.pm-footnote-ref')).toHaveText("[note2]");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("Before [^note2] after");
  await page.reload();
  await expect(page.locator(".pm-document > p").first()).toHaveText("Before [note2] after");
  await expect(page.locator('.pm-footnote[data-footnote-label="note2"]')).toContainText("Footnote text.");
});

test("Notdown slash groups have real icons and Markdown insertion survives save/reload", async ({ page, request }) => {
  const note = await (await request.post("/api/pages", { data: {
    title: "Notdown union menu", body: "", bodyFormat: "notion-markdown",
    syntax: { version: 1, variant: "notdown", extensions: {} },
  } })).json();
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/#page/${note.id}`);
  await page.locator(".pm-document").click(); await page.keyboard.type("/");
  const menu = page.locator(".inline-slash");
  await expect(menu).toBeVisible();
  await expect(menu.locator(".insert-group-heading")).toHaveText([
    "Notion basic", "Notion advanced", "Notion media", "Notion embeds", "Notion inline", "Notion style", "Markdown blocks", "Markdown inline",
  ]);
  const options = menu.getByRole("option");
  expect(await options.count()).toBeGreaterThan(50);
  expect(await options.locator("svg").count()).toBe(await options.count());
  await expect(menu.locator("[data-lucide]:not(svg)")).toHaveCount(0);
  await page.screenshot({ path: "test-results/notdown-union-menu.png" });
  await page.keyboard.type("definitions");
  await expect(options).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(page.locator(".pm-document dl")).toHaveCount(1);
  await page.locator(".pm-document dd p").click();
  await page.keyboard.press("End"); await page.keyboard.type(" Persisted");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("Persisted");
  await page.reload();
  await expect(page.locator(".pm-document dl")).toContainText("Persisted");
  expect(errors).toEqual([]);
});

test("Notdown slash keyboard selection crosses group boundaries and style snippets stay editable", async ({ page, request }) => {
  const note = await (await request.post("/api/pages", { data: {
    title: "Notdown union styles", body: "Tail", bodyFormat: "notion-markdown",
    syntax: { version: 1, variant: "notdown", extensions: {} },
  } })).json();
  await page.goto(`/#page/${note.id}`);
  await page.locator(".pm-document > p").click(); await page.keyboard.press("End");
  await page.keyboard.type(" /");
  const menu = page.locator(".inline-slash");
  await expect(menu).toBeVisible();
  const ids = await menu.getByRole("option").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-insert")));
  const boundary = ids.indexOf("columns");
  for (let i = 0; i < boundary; i++) await page.keyboard.press("ArrowDown");
  await expect(menu.locator('[aria-selected="true"]')).toHaveAttribute("data-insert", "columns");
  await page.keyboard.type("subscript");
  await expect(menu.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page.locator(".pm-document sub")).toHaveText("subscript");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("~subscript~");
  await page.reload();
  await expect(page.locator(".pm-document sub")).toHaveText("subscript");
});
