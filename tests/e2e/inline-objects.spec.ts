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

test("MMD citation and footnote lists remain separate, with numbering, locators, inline entries and editable definitions", async ({ page, request }) => {
  const note = await open(page, request, "Body [^note] [#book] [p. 8][#book] [#Jane Doe. Another book.] [#missing]\n\n[^note]: Footnote body\n\n[#book]: **Book title**", "markdown_mmd");
  await expect(page.locator(".pm-footnote-ref")).toHaveCount(1);
  const bibliography = page.getByRole("complementary", { name: "Bibliography" });
  await expect(bibliography.locator("li")).toHaveCount(3);
  await expect(page.locator(".pm-document > p").first()).toContainText("(1) (p. 8, 1) (2) (3)");
  await expect(bibliography.locator("li").first().locator("strong")).toHaveText("Book title");
  await expect(bibliography.locator("li").last()).toContainText("unresolved");
  await bibliography.getByRole("button", { name: "Edit definition" }).click();
  await page.getByRole("textbox", { name: "Definition source" }).fill("[#book]: Updated bibliography");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(bibliography.locator("li").first()).toContainText("Updated bibliography");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("[#book]: Updated bibliography");
  await page.reload(); await expect(bibliography.locator("li").first()).toContainText("Updated bibliography");
  await page.screenshot({ path: "test-results/mmd-citations-and-footnotes.png" });
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
  await page.locator("mark.pm-critic").dblclick(); await page.getByRole("button", { name: "Reject revision" }).click();
  await expect(page.locator("mark.pm-critic")).toHaveCount(0);
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
  await page.getByRole("button", { name: "Edit caption" }).click(); await page.getByRole("textbox", { name: "Caption", exact: true }).fill("New caption");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click(); await expect(page.locator("figcaption")).toHaveText("New caption");
  const cells = page.locator(".pm-document table td, .pm-document table th"); await cells.first().click();
  await page.getByRole("button", { name: "Select table", exact: true }).click(); await expect(page.locator(".pm-selected-cell")).toHaveCount(4);
  await page.getByRole("button", { name: "Merge selection", exact: true }).click(); await expect(page.locator(".pm-document [colspan='2'][rowspan='2']")).toHaveCount(1);
  await page.keyboard.press("Control+z"); await expect(cells).toHaveCount(4);
  await page.locator('[data-mode="source"]').click(); await expectSource(page, /!\[New caption\]\(image.png "Title"\)\{alt="Alternative" custom="keep"\}/);
});
