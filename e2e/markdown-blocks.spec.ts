import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { expectSource } from "./source-helper.js";

const flags = {
  definition_lists: true,
  footnotes: true,
  line_blocks: true,
  fenced_divs: true,
};
const fixture =
  '# Markdown blocks\n\n<h2 class="from-browser">Web results</h2>\n\nTerm\n:   Definition text.\n\nText[^note].\n\n[^note]: Footnote text.\n\n| First line\n|   Indented line\n\n::: {.container}\nContainer text.\n:::\n\nTail';
const mode = (page: Page, name: string) =>
  page.locator(`.editing-modes [data-mode="${name}"]`).click();
async function open(
  page: Page,
  request: APIRequestContext,
  body = fixture,
  extensions: Record<string, boolean> = flags,
) {
  const response = await request.post("/api/pages", {
    data: {
      title: "Markdown block coverage",
      body,
      bodyFormat: "markdown",
      syntax: { version: 1, variant: "commonmark", extensions },
    },
  });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.addInitScript(
    (id) => localStorage.setItem("notdown-page", id),
    note.id,
  );
  await page.goto("/");
  await expect(page.locator(".pm-document")).toBeVisible();
  return note;
}
async function saved(request: APIRequestContext, id: string) {
  return (await (await request.get(`/api/pages/${id}`)).json()).body as string;
}

test("HTML and Markdown containers edit in the page and survive source view, save and reopen", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const note = await open(page, request);
  await mode(page, "split");
  await expect(page.locator(".pm-html-preview h2")).toHaveText("Web results");
  await expect(page.locator(".pm-definition-list dt")).toHaveText("Term");
  await expect(page.locator(".pm-footnote-ref a")).toHaveAttribute(
    "href",
    "#md-note-note",
  );
  await expect(page.locator(".pm-verse-line").nth(1)).toHaveText(
    "  Indented line",
  );
  await expect(page.locator(".pm-fenced-div")).toHaveAttribute(
    "data-div-attributes",
    "{.container}",
  );
  await page.screenshot({
    path: "test-results/markdown-blocks.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Edit HTML", exact: true }).click();
  await page
    .getByLabel("HTML block source", { exact: true })
    .fill('<h2 class="from-browser">Edited HTML</h2>');
  await expect(page.locator(".pm-html-preview h2")).toHaveText("Edited HTML");
  await page.getByLabel("HTML block source", { exact: true }).press("Control+z");
  await expect(page.locator(".pm-html-preview h2")).toHaveText("Web results");
  await page
    .getByLabel("HTML block source", { exact: true })
    .press("Control+Shift+z");
  await expect(page.locator(".pm-html-preview h2")).toHaveText("Edited HTML");
  await page.getByRole("button", { name: "Hide source", exact: true }).click();
  for (const selector of [
    ".pm-definition-list dt",
    ".pm-definition-list dd p",
    ".pm-footnote p",
    ".pm-verse-line:last-child",
    ".pm-fenced-div p",
  ]) {
    await page.locator(selector).click();
    await page.keyboard.press("End");
    await page.keyboard.type(" edited");
  }
  await mode(page, "source");
  await expectSource(page, /<h2 class="from-browser">Edited HTML<\/h2>/);
  await expectSource(page, /Term edited\n:   Definition text\. edited/);
  await expectSource(page, /\[\^note\]: Footnote text\. edited/);
  await expectSource(page, /\|   Indented line edited/);
  await expectSource(page, /::: \{\.container\}\nContainer text\. edited\n:::/);
  await page.keyboard.press("Control+s");
  await expect
    .poll(() => saved(request, note.id))
    .toContain("Container text. edited");
  const written = await saved(request, note.id);
  await page.reload();
  await mode(page, "document");
  await expect(page.locator(".pm-html-preview h2")).toHaveText("Edited HTML");
  await expect(page.locator(".pm-definition-list dt")).toHaveText(
    "Term edited",
  );
  await expect(page.locator(".pm-footnote p")).toContainText(
    "Footnote text. edited",
  );
  await expect(page.locator(".pm-verse-line").nth(1)).toHaveText(
    "  Indented line edited",
  );
  await expect(page.locator(".pm-fenced-div p")).toHaveText(
    "Container text. edited",
  );
  expect(await saved(request, note.id)).toBe(written);
  expect(errors).toEqual([]);
});

test("HTML is enabled by default, sanitized, and all new extension switches preserve source", async ({
  page,
  request,
}) => {
  const html =
    '<div onclick="window.__htmlExecuted=true" data-action="new-page"><h2>Safe HTML</h2><script>window.__htmlExecuted=true</script><a href="javascript:alert(1)">link</a></div>';
  const body = fixture.replace(
    '<h2 class="from-browser">Web results</h2>',
    html,
  );
  const note = await open(page, request, body);
  await expect(page.locator(".pm-html-preview h2")).toHaveText("Safe HTML");
  await expect(
    page.locator(
      '.pm-html-preview [onclick], .pm-html-preview [data-action], .pm-html-preview script, .pm-html-preview [href^="javascript:"]',
    ),
  ).toHaveCount(0);
  await page.locator(".pm-html-preview h2").click();
  expect(
    await page.evaluate(
      () => (window as Window & { __htmlExecuted?: boolean }).__htmlExecuted,
    ),
  ).toBeUndefined();
  await mode(page, "split");
  const pairs = [
    ["raw_html", ".pm-html-block"],
    ["definition_lists", ".pm-definition-list"],
    ["footnotes", ".pm-footnote"],
    ["line_blocks", ".pm-line-block"],
    ["fenced_divs", ".pm-fenced-div"],
  ];
  for (const [flag, selector] of pairs) {
    await page.locator(".syntax-options summary").click();
    await page.locator(`[data-extension="${flag}"]`).uncheck();
    await expect(page.locator(selector)).toHaveCount(0);
    await expectSource(page, body);
    await page.locator(`[data-extension="${flag}"]`).check();
    await expect(page.locator(selector)).toHaveCount(1);
    await page.locator(".syntax-options summary").click();
  }
  await page.keyboard.press("Control+s");
  await expect.poll(() => saved(request, note.id)).toBe(body);
});

test("Slash inserts the five new block types and respects disabled extensions", async ({
  page,
  request,
}) => {
  const note = await open(page, request, "Tail");
  for (const [command, selector] of [
    ["html", ".pm-html-block"],
    ["definitions", ".pm-definition-list"],
    ["footnote", ".pm-footnote"],
    ["lines", ".pm-line-block"],
    ["div", ".pm-fenced-div"],
  ]) {
    await page
      .locator(".pm-document > p")
      .filter({ hasText: /^Tail$/ })
      .click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.type("/");
    await page.locator(`[data-insert="${command}"]`).click();
    await expect(page.locator(selector)).toHaveCount(1);
  }
  await page.locator(".pm-html-block").hover({ position: { x: 2, y: 10 } });
  await page
    .locator(".pm-block-handle")
    .dragTo(page.locator(".pm-document > p").filter({ hasText: /^Tail$/ }), {
      targetPosition: { x: 8, y: 28 },
    });
  await page.keyboard.press("Control+s");
  await expect.poll(() => saved(request, note.id)).toMatch(/Tail[\s\S]*<div>/);
  await page.reload();
  await expect(page.locator(".pm-html-preview h2")).toHaveText("HTML heading");
  await page.locator(".syntax-options summary").click();
  await page.locator('[data-extension="definition_lists"]').uncheck();
  await page.locator(".syntax-options summary").click();
  await page
    .locator(".pm-document > p")
    .filter({ hasText: /^Tail$/ })
    .click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.type("/");
  await expect(page.locator(".inline-slash")).toBeVisible();
  await expect(page.locator('[data-insert="definitions"]')).toHaveCount(0);
  await expect(page.locator('[data-insert="html"]')).toHaveCount(1);
});
