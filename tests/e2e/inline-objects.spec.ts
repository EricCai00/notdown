import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { expectSource } from "./source-helper";
async function open(page: Page, request: APIRequestContext, body: string, variant = "notdown", extensions = {}) {
  const res = await request.post("/api/pages", { data: { title: "Local objects", body, bodyFormat: ["notdown", "notion-markdown"].includes(variant) ? "notion-markdown" : "markdown", syntax: { version: 1, variant, extensions } } });
  expect(res.status()).toBe(201); const note = await res.json(); await page.goto(`/#page/${note.id}`); await expect(page.locator(".pm-document")).toBeVisible(); return note;
}
async function insert(page: Page, command: string) {
  await page.locator(".pm-document > p").first().click(); await page.keyboard.press("End"); await page.keyboard.type(" /" + command);
  await page.locator(`[data-insert="${command}"]`).click();
}

for (const variant of ["markdown_mmd", "notdown"]) test(`${variant}: deleting the final citation removes its ref, persists, and undoes together`, async ({ page, request }) => {
  const body = 'First [#book]. Again [p. 8][#book]. Other [#other]. Footnote [^note].\n\n`[#book]`\n\n[#book]: Book to remove\n\n[#other]: Other book\n\n[#unused]: Keep unused\n\n[^note]: Keep footnote\n';
  const note = await open(page, request, body, variant);
  const refs = page.locator('.md-mmd-citation[title="Book to remove"]');
  const removeFirst = async () => {
    await refs.first().evaluate(element => {
      (element.closest(".pm-document") as HTMLElement).focus();
      const range = document.createRange(); range.selectNode(element);
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
    await page.keyboard.press("Backspace");
  };
  await expect(refs).toHaveCount(2);
  await removeFirst();
  await expect(refs).toHaveCount(1);
  await expect(page.locator(".md-bibliography")).toContainText("Book to remove");
  await removeFirst();
  await expect(refs).toHaveCount(0);
  await expect(page.locator(".md-bibliography")).not.toContainText("Book to remove");
  await expect(page.locator(".md-bibliography")).toContainText("Other book");
  await expect(page.locator(".md-bibliography")).toContainText("Keep unused");
  await expect(page.locator(".pm-footnote")).toContainText("Keep footnote");
  await page.keyboard.press("Control+z");
  await expect(refs).toHaveCount(1);
  await expect(page.locator(".md-bibliography")).toContainText("Book to remove");
  await page.keyboard.press("Control+Shift+z");
  await expect(refs).toHaveCount(0);
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).not.toContain("[#book]:");
  const saved = (await (await request.get(`/api/pages/${note.id}`)).json()).body;
  expect(saved).toContain("`[#book]`");
  expect(saved).toContain("[#unused]: Keep unused");
  await page.reload();
  await expect(page.locator(".md-bibliography")).not.toContainText("Book to remove");
});

test("deleting a citation's paragraph also removes the now empty bibliography panel", async ({ page, request }) => {
  const note = await open(page, request, "Paragraph [#book]\n\nKeep this paragraph.\n\n[#book]: Book to remove", "markdown_mmd");
  await page.locator(".pm-document > p").first().evaluate(element => {
    (element.closest(".pm-document") as HTMLElement).focus();
    const range = document.createRange(); range.selectNode(element);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.keyboard.press("Backspace");
  await expect(page.locator(".md-bibliography")).toHaveCount(0);
  await expect(page.locator(".pm-document")).toContainText("Keep this paragraph.");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).not.toContain("[#book]");
});

test("MMD citation and footnote lists remain separate, with numbering, locators, inline entries and editable definitions", async ({ page, request }) => {
  const note = await open(page, request, "Body [^note] [#book] [p. 8][#book] [#Jane Doe. Another book.] [#missing]\n\n[^note]: Footnote body\n\n[#book]: **Book title**", "markdown_mmd");
  await expect(page.locator(".pm-footnote-ref")).toHaveCount(1);
  const bibliography = page.getByRole("complementary", { name: "Bibliography" });
  await expect(bibliography.locator("li")).toHaveCount(3);
  await expect(page.locator(".pm-document > p").first()).toContainText("(1) (p. 8, 1) (2) (3)");
  await expect(bibliography.locator("li").first().locator("strong")).toHaveText("Book title");
  await expect(bibliography.locator("li").last()).toContainText("unresolved");
  await bibliography.locator("li").first().getByRole("button", { name: "Edit definition" }).click();
  await page.getByRole("textbox", { name: "Definition source" }).fill("[#book]: Updated bibliography");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(bibliography.locator("li").first()).toContainText("Updated bibliography");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("[#book]: Updated bibliography");
  await page.reload(); await expect(bibliography.locator("li").first()).toContainText("Updated bibliography");
  await page.screenshot({ path: "test-results/mmd-citations-and-footnotes.png" });
});

for (const variant of ["markdown_mmd", "notdown"]) test(`${variant}: hidden citations omit arrows and inline bibliography edits persist and undo`, async ({ page, request }) => {
  const original = "[p. 8][#Alex Roe. *Original book*. 2022.;][]";
  const body = `Visible [#book]. [Not cited][#book] [Not cited][#hidden]\n\nInline ${original}.\n\n[#book]: Named book\n\n[#hidden]: Hidden book\n\n[#unused]: Unused book`;
  const note = await open(page, request, body, variant);
  const entries = page.locator(".md-bibliography li");
  await expect(entries.nth(0).locator(".md-citation-backref")).toHaveCount(1);
  await expect(entries.nth(1).locator(".md-citation-backref")).toHaveCount(0);
  await expect(entries.nth(2).locator(".md-citation-backref")).toHaveCount(1);
  const edit = entries.nth(2).getByRole("button", { name: "Edit definition" });
  await entries.nth(2).hover();
  await edit.click();
  const panel = page.getByRole("dialog", { name: "Citation definition" });
  const input = panel.getByRole("textbox", { name: "Definition source" });
  await expect(input).toHaveValue("Alex Roe. *Original book*. 2022.");
  await input.fill("Invalid ] entry");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel.locator("output")).toContainText("without brackets");
  await input.fill("Alex Roe. **Updated book**. 2026.");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(entries.nth(2).locator("strong")).toHaveText("Updated book");
  await page.keyboard.press("Control+z");
  await expect(entries.nth(2).locator("em")).toHaveText("Original book");
  await page.keyboard.press("Control+Shift+z");
  await expect(entries.nth(2).locator("strong")).toHaveText("Updated book");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body.replace(original, "[p. 8][#Alex Roe. **Updated book**. 2026.;][]"));
  await page.reload();
  await expect(entries.nth(2).locator("strong")).toHaveText("Updated book");
  await expect(entries.nth(1).locator(".md-citation-backref")).toHaveCount(0);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `test-results/${variant}-inline-bibliography.png` });
});

test("bibliography edit buttons hide after pointer exit and cancelling, but remain keyboard accessible", async ({ page, request }) => {
  await open(page, request, "Body [#book]\n\n[#book]: Named book\n\n[#unused]: Unused book", "markdown_mmd");
  for (const row of [page.locator(".md-bibliography li"), page.locator(".md-bibliography > p")]) {
    const edit = row.getByRole("button", { name: "Edit definition" });
    await row.hover();
    await expect(edit).toHaveCSS("opacity", "1");
    await edit.click();
    await page.getByRole("dialog", { name: "Citation definition" }).getByRole("button", { name: "Cancel", exact: true }).click();
    await page.mouse.move(0, 0);
    await expect(edit).toHaveCSS("opacity", "0");
    // Tab back to the triggering button after closing, then open with Enter.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(edit).toBeFocused();
    await expect(edit).toHaveCSS("opacity", "1");
    await page.keyboard.press("Enter");
    await page.getByRole("textbox", { name: "Definition source" }).press("Escape");
    await page.locator(".pm-document > p").first().click();
    await expect(edit).toHaveCSS("opacity", "0");
  }
});

test("MMD reference styling uses plain superscripts, aligned end lists and distinct return targets", async ({ page, request }) => {
  await open(page, request, "这是脚注[^note]，再次引用同一个脚注[^note]。\n\n这是文献引用[#book]，指定页码[p. 12][#book]。\n\n这是行内书目[#Jane Doe. Another Book. 2024.]。\n\n[^note]: 这是脚注内容。\n\n[#book]: John Doe. *Some Big Fancy Book*. Vanity Press, 2006.", "markdown_mmd");
  const refs = page.locator(".pm-footnote-ref a");
  expect(await refs.first().evaluate(el => getComputedStyle(el, "::after").content)).toBe('"1"');
  await expect(page.locator(".pm-footnote-backref")).toHaveCount(2);
  await expect(page.locator(".md-bibliography em")).toHaveText("Some Big Fancy Book");
  const footnote = await page.locator(".pm-footnote > p").boundingBox();
  const bibliography = await page.locator(".md-bibliography li > span").first().boundingBox();
  expect(Math.abs(footnote!.x - bibliography!.x)).toBeLessThan(2);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: "test-results/mmd-reference-style.png" });
  await page.getByRole("combobox", { name: "Markdown dialect" }).selectOption("notdown");
  expect(await refs.first().evaluate(el => getComputedStyle(el, "::after").content)).toBe('"1"');
  await page.getByRole("combobox", { name: "Markdown dialect" }).selectOption("typora");
  expect(await refs.first().evaluate(el => getComputedStyle(el, "::after").content)).toBe('"[1]"');
});

test("citation insertion creates one reusable definition and retains both references in source", async ({ page, request }) => {
  await open(page, request, "Body", "markdown_mmd");
  await insert(page, "citation");
  await page.getByRole("textbox", { name: "Reference key", exact: true }).fill("book");
  await page.getByRole("textbox", { name: "Definition", exact: true }).fill("Jane Doe. A book.");
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await expect(page.locator(".md-bibliography li")).toHaveCount(1);
  await insert(page, "citation");
  await page.getByRole("combobox", { name: "Existing references" }).selectOption("book");
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await expect(page.locator(".md-bibliography li")).toHaveCount(1);
  await expect(page.locator(".md-bibliography a")).toHaveCount(2);
  await page.locator('[data-mode="source"]').click(); await expectSource(page, /\[#book\][\s\S]*\[#book\][\s\S]*\[#book\]: Jane Doe/);
});

test("Notdown inserts URL citations alongside footnotes and preserves both on reopen", async ({ page, request }) => {
  const note = await open(page, request, "Body [^note]\n\n[^note]: Existing footnote");
  await insert(page, "citation");
  await page.getByRole("textbox", { name: "Source URL", exact: true }).fill("https://example.com/source");
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await expect(page.locator(".pm-footnote-ref")).toHaveCount(1);
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("[^https://example.com/source]");
  await page.reload();
  await expect(page.locator(".pm-footnote-ref")).toHaveCount(1);
  await page.locator('[data-mode="source"]').click();
  await expectSource(page, /\[\^https:\/\/example.com\/source\]/);
  await expectSource(page, /\[\^note\]: Existing footnote/);
});

test("Notdown exposes the union, with typed glossary/abbreviation/variable/revision creation", async ({ page, request }) => {
  await open(page, request, "Title: Example\n\nBody");
  for (const [command, key, definition] of [["abbreviation", "ND", "Notdown"], ["glossary", "codec", "Reader and writer"], ["metadata_variable", "title", ""]]) {
    await insert(page, command); await page.getByRole("textbox", { name: command === "metadata_variable" ? "Variable name" : "Reference key", exact: true }).fill(key);
    if (definition) await page.getByRole("textbox", { name: "Definition", exact: true }).fill(definition);
    await page.getByRole("button", { name: "Insert", exact: true }).click();
  }
  await insert(page, "substitution"); await page.getByRole("textbox", { name: "Original text" }).fill("old"); await page.getByRole("textbox", { name: "New text" }).fill("new");
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await page.locator(".pm-critic-new").dblclick(); await page.getByRole("button", { name: "Reject revision" }).click();
  await expect(page.locator(".pm-critic-substitution")).toHaveCount(0);
  await page.locator('[data-mode="source"]').click(); await expectSource(page, /\[>ND\]/); await expectSource(page, /\[\?codec\]/); await expectSource(page, /\[%title\]/); await expectSource(page, /old/);
});

test("unrelated dialects cannot force MMD object menus on", async ({ page, request }) => {
  for (const variant of ["gfm", "typora", "obsidian", "commonmark", "notion-markdown"]) {
    await open(page, request, "Body", variant, { mmd_citations: true, mmd_abbreviations: true, glossary: true, metadata_variables: true, critic_markup: true });
    await page.locator(".pm-document > p").first().click(); await page.keyboard.press("End"); await page.keyboard.type(" /");
    for (const command of ["abbreviation", "glossary", "metadata_variable", "addition", "deletion", "substitution"]) await expect(page.locator(`[data-insert="${command}"]`)).toHaveCount(0);
    if (variant !== "notion-markdown") await expect(page.locator('[data-insert="citation"]')).toHaveCount(0);
    await page.keyboard.press("Escape");
  }
});

test("official Notion image captions use the media label without enabling MMD figures", async ({ page, request }) => {
  await page.route("**/caption-image.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="blue"/></svg>' }));
  await open(page, request, "![Caption](/caption-image.svg)\n\nBody", "notion-markdown");
  await expect(page.locator(".pm-image-caption")).toHaveText("Caption");
  await page.getByRole("img", { name: "Caption", exact: true }).dblclick(); await page.getByRole("textbox", { name: "Caption", exact: true }).fill("Updated caption");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".pm-image-caption")).toHaveText("Updated caption");
  await page.locator('[data-mode="source"]').click(); await expectSource(page, /!\[Updated caption\]\(\/caption-image.svg\)/);
});

test("figure caption edits preserve attributes and table rectangular selections merge with undo", async ({ page, request }) => {
  await open(page, request, '![Caption](image.png "Title"){alt="Alternative" custom="keep"}\n\n| A | B |\n|---|---|\n| C | D |');
  await page.locator(".pm-image-block-view").hover();
  await page.getByRole("button", { name: "Edit caption" }).click(); await page.getByRole("textbox", { name: "Caption", exact: true }).fill("New caption");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click(); await expect(page.locator("figcaption")).toHaveText("New caption");
  const cells = page.locator(".pm-document table td, .pm-document table th"); await cells.first().click();
  await page.getByRole("button", { name: "Table options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Select table", exact: true }).click(); await expect(page.locator(".pm-selected-cell")).toHaveCount(4);
  await page.getByRole("button", { name: "Merge selection", exact: true }).click(); await expect(page.locator(".pm-document [colspan='2'][rowspan='2']")).toHaveCount(1);
  await page.keyboard.press("Control+z"); await expect(cells).toHaveCount(4);
  await page.locator('[data-mode="source"]').click(); await expectSource(page, /!\[New caption\]\(image.png "Title"\)\{alt="Alternative" custom="keep"\}/);
});
