import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { expectSource } from "./source-helper";

async function open(page: Page, request: APIRequestContext, body: string, variant = "notdown") {
  const result = await request.post("/api/pages", { data: {
    title: "Footnote editing", body, bodyFormat: variant === "notdown" ? "notion-markdown" : "markdown",
    syntax: { version: 1, variant, extensions: {} },
  } });
  expect(result.status()).toBe(201);
  const note = await result.json();
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator(".pm-document")).toBeVisible();
  return note;
}

async function insertMenu(page: Page) {
  await page.locator(".pm-document > p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" /footnote");
  await expect(page.locator('.inline-slash [data-insert]')).toHaveCount(1);
  await expect(page.locator('[data-insert="inline_note"]')).toHaveCount(0);
  await page.locator('[data-insert="footnote"]').click();
}

for (const variant of ["notdown", "markdown"]) test(`${variant}: inline footnotes render as numbered references and save inline syntax after editing`, async ({ page, request }) => {
  const body = "Before^[Inline **formatted** note\nwith a [link](https://example.com)]. Regular [^a] again [^a]. Last^[Second note]\n\n[^a]: Regular definition.";
  const note = await open(page, request, body, variant);
  await page.locator('.editing-modes [data-mode="split"]').click();
  const editor = page.locator(".pm-document"), refs = editor.locator(".pm-footnote-ref");
  const notes = editor.locator(".pm-footnotes > .pm-footnote");
  await expect(refs).toHaveCount(4);
  expect(await refs.evaluateAll(nodes => nodes.map(node => node.getAttribute("data-footnote-number")))).toEqual(["1", "2", "2", "3"]);
  await expect(notes).toHaveCount(3);
  await expect(editor.locator(":scope > p").first()).not.toContainText("formatted");
  await expect(editor.locator(".pm-inline-note")).toHaveCount(0);
  await expect(notes.first().locator("strong")).toHaveText("formatted");
  await expect(notes.first().locator('a[href="https://example.com"]')).toHaveText("link");
  await refs.first().hover();
  await expect(page.getByRole("tooltip")).toContainText("Inline formatted note");
  await refs.first().locator("a").click();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.anchorNode?.parentElement?.closest(".pm-footnote")?.getAttribute("data-inline-note"))).toBe("true");
  await page.keyboard.press("End");
  await page.keyboard.type(" edited");
  await expect(notes.first()).toContainText("edited");
  await page.keyboard.press("Enter");
  await expect(notes.first().locator("p")).toHaveCount(1);
  await notes.first().getByRole("button", { name: "Return to footnote 1 reference 1", exact: true }).click();
  await refs.first().hover();
  await expect(page.getByRole("tooltip")).toContainText("edited");
  await expectSource(page, /Before\^\[Inline \*\*formatted\*\* note[\s\S]*edited/);
  await expectSource(page, /\[\^inline-note/, true);
  await page.screenshot({ path: `test-results/inline-footnotes-${variant}.png` });
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("edited");
  await page.reload();
  await expect(refs).toHaveCount(4);
  await expect(notes.first()).toContainText("edited");
  // The last inline reference owns its definition; deleting it removes both.
  await editor.locator(":scope > p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Backspace");
  await expect(refs).toHaveCount(3);
  await expect(notes).toHaveCount(2);
  await page.keyboard.press("Control+z");
  await expect(refs).toHaveCount(4);
  await expect(notes.last()).toContainText("Second note");
});

for (const mode of ["document", "split"]) for (const bibliography of [false, true]) test(`${mode}: tail clicks reuse one empty block before footnotes${bibliography ? " and bibliography" : ""}`, async ({ page, request }) => {
  const body = "Text [^a]." + (bibliography ? " [#book]" : "") + "\n\n[^a]: Footnote content." +
    (bibliography ? "\n\n[#book]: Jane Doe. Example book." : "");
  const note = await open(page, request, body, bibliography ? "markdown_mmd" : "notdown");
  await page.locator(`.editing-modes [data-mode="${mode}"]`).click();
  const editor = page.locator(".pm-document");
  await expect(editor.locator(".pm-footnote")).toBeVisible();
  const paragraphs = editor.locator(":scope > p");
  const count = await paragraphs.count();
  const footer = bibliography ? page.locator(".md-bibliography") : editor.locator(".pm-footnotes");
  await expect(footer).toBeVisible();
  for (let i = 0; i < 4; i++) {
    const last = (await footer.boundingBox())!;
    await page.mouse.click(last.x + 100, last.y + last.height + 40);
    await expect(paragraphs).toHaveCount(count + 1);
    await expect(paragraphs.last()).toHaveText("");
  }
  await page.keyboard.type("New tail");
  await expect(paragraphs.last()).toHaveText("New tail");
  // Once the previous tail has content, a later click may create the next block.
  for (let i = 0; i < 3; i++) {
    const last = (await footer.boundingBox())!;
    await page.mouse.click(last.x + 100, last.y + last.height + 40);
    await expect(paragraphs).toHaveCount(count + 2);
  }
  await page.keyboard.type("Next tail");
  await expect(paragraphs.last()).toHaveText("Next tail");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("Next tail");
  const saved = (await (await request.get(`/api/pages/${note.id}`)).json()).body;
  expect(saved).toContain("[^a]: Footnote content.");
  if (bibliography) expect(saved).toContain("[#book]: Jane Doe. Example book.");
});

for (const variant of ["notdown", "markdown_mmd"]) test(`${variant}: repeated footnote links navigate to their definition without entering page-link routing`, async ({ page, request }) => {
  const body = "First [^a] again [^a].\n\n" + Array.from({ length: 25 }, (_, i) => `Paragraph ${i}`).join("\n\n") + "\n\n[^a]: Footnote destination.";
  const note = await open(page, request, body, variant);
  const refs = page.locator(".pm-footnote-ref a"), definition = page.locator('.pm-footnote[data-footnote-label="a"]');
  for (let i = 0; i < 2; i++) {
    await refs.nth(i).click();
    await expect(definition).toBeInViewport();
    await expect(page.locator('.toast').filter({ hasText: "Linked location not found" })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.getSelection()?.anchorNode?.parentElement?.closest(".pm-footnote")?.getAttribute("data-footnote-label"))).toBe("a");
    await definition.getByRole("button", { name: `Return to footnote 1 reference ${i + 1}`, exact: true }).click();
    await expect(refs.nth(i)).toBeInViewport();
  }
  await page.keyboard.press("Control+s");
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
});

test("footnote preview follows editable text; last reference deletion cleans up and undo restores both", async ({ page, request }) => {
  const note = await open(page, request, "First [^a]\n\nSecond [^a]\n\n[^a]: Original text.\n\n[^legacy]: Keep unused.");
  const refs = page.locator(".pm-footnote-ref");
  await refs.first().hover();
  await expect(page.getByRole("tooltip")).toHaveText("Original text.");
  await page.locator('.pm-footnote[data-footnote-label="a"] p').click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Edited.");
  await refs.first().hover();
  await expect(page.getByRole("tooltip")).toHaveText("Original text. Edited.");
  await page.screenshot({ path: "test-results/footnote-preview.png" });
  for (let i = 0; i < 2; i++) {
    await page.locator(".pm-document > p").nth(i).click();
    await page.keyboard.press("End");
    await page.keyboard.press("Backspace");
    await expect(refs).toHaveCount(1 - i);
    await expect(page.locator('.pm-footnote[data-footnote-label="a"]')).toHaveCount(i ? 0 : 1);
  }
  await expect(page.locator('.pm-footnote[data-footnote-label="legacy"]')).toHaveCount(1);
  await page.keyboard.press("Control+z");
  await expect(refs).toHaveCount(1);
  await expect(page.locator('.pm-footnote[data-footnote-label="a"]')).toContainText("Edited.");
  await page.keyboard.press("Control+Shift+z");
  await expect(refs).toHaveCount(0);
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).not.toContain("[^a]:");
  await page.reload();
  await expect(page.locator('.pm-footnote')).toHaveCount(1);
  await expect(page.locator('.pm-footnote')).toContainText("Keep unused.");
});

test("insert creates text or reuses an existing definition; cancellation adds no note", async ({ page, request }) => {
  await open(page, request, "Body\n\n[^old]: Existing **formatted** note.");
  await insertMenu(page);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".pm-footnote-ref")).toHaveCount(0);
  await insertMenu(page);
  await page.getByRole("textbox", { name: "Footnote text" }).fill("New note text.\nSecond paragraph.");
  await page.screenshot({ path: "test-results/footnote-insert.png" });
  await page.getByRole("button", { name: "Insert reference", exact: true }).click();
  await expect(page.locator('.pm-footnote[data-footnote-label="note"] p')).toHaveCount(2);
  await insertMenu(page);
  await page.getByRole("combobox", { name: "Footnote", exact: true }).selectOption("old");
  await page.getByRole("button", { name: "Insert reference", exact: true }).click();
  await expect(page.locator(".pm-footnote-ref")).toHaveCount(2);
  await expect(page.locator(".pm-footnote")).toHaveCount(2);
  await page.locator('.editing-modes [data-mode="source"]').click();
  await expectSource(page, /\[\^old\]: Existing \*\*formatted\*\* note\./);
  await expectSource(page, /\[\^note\]: New note text\./);
});

test("footer menu limits blocks while keeping paragraphs and lists editable", async ({ page, request }) => {
  await open(page, request, "Body [^a]\n\n[^a]: Paragraph.");
  const note = page.locator(".pm-footnote");
  await note.locator("p").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/");
  const menu = page.locator(".inline-slash");
  await expect(menu.locator('[data-insert="code"]')).toBeVisible();
  await expect(menu.locator('[data-insert="child"]')).toHaveCount(0);
  await expect(menu.locator('[data-insert="footnote"]')).toHaveCount(0);
  await expect(menu.locator('[data-insert="columns"]')).toHaveCount(0);
  await menu.locator('[data-insert="list"]').click();
  await expect(note.locator("ul")).toHaveCount(1);
  await page.locator('.editing-modes [data-mode="source"]').click();
  await expectSource(page, /\[\^a\]: Paragraph\.[\s\S]*\n    - /);
});
