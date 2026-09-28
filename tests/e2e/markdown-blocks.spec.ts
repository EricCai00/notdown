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

test("empty line-block rows stay empty after editing, source switch and reload", async ({ page, request }) => {
  const body = "| First line\n| \n| \n| Last line\n\nTail";
  const note = await open(page, request, body);
  const rows = page.locator(".pm-line-block > .pm-verse-line");
  await expect(rows).toHaveCount(4);
  await rows.first().click();
  await page.keyboard.press("Home");
  await page.keyboard.insertText("EDIT ");
  const expected = body.replace("First line", "EDIT First line");
  await mode(page, "source");
  await expectSource(page, expected);
  await expect.poll(() => saved(request, note.id)).toBe(expected);
  await mode(page, "document");
  await page.reload();
  await expect(rows).toHaveText(["EDIT First line", "", "", "Last line"]);
});

test("HTML source floats without a toolbar row and opens a highlighted, numbered pane", async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const raw = '<section class="sample">\n  <h2>HTML preview</h2>\n  <p>Second line</p>\n</section>';
  const note = await open(page, request, raw + '\n\nTail');
  const block = page.locator('.pm-html-block');
  const button = block.getByRole('button', { name: 'HTML source', exact: true });
  const pane = block.locator('.pm-html-source');
  await page.mouse.move(0, 0);
  await expect(button).toHaveCSS('opacity', '0');
  await expect(pane).toBeHidden();
  const before = await block.boundingBox();
  const preview = await block.locator('.pm-html-preview').boundingBox();
  expect(preview!.y).toBe(before!.y);
  await block.hover();
  await expect(button).toHaveCSS('opacity', '1');
  await expect(button).toHaveCSS('position', 'absolute');
  expect(await block.boundingBox()).toEqual(before);
  const control = await button.boundingBox();
  expect(control!.x + control!.width).toBe(before!.x + before!.width);
  expect(control!.y).toBe(before!.y);
  // Click the SVG itself to exercise nested node-view event handling.
  await button.locator('svg').click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(pane).toBeVisible();
  await expect(pane.locator('.cm-lineNumbers .cm-gutterElement')).toContainText(['1', '2', '3', '4']);
  const input = block.getByRole('textbox', { name: 'HTML block source' });
  await expect(input).toBeFocused();
  await expect(input.locator('.cm-line')).toHaveText(raw.split('\n'));
  const tag = input.locator('.cm-line span').filter({ hasText: /^section$/ }).first();
  await expect(tag).toBeVisible();
  expect(await tag.evaluate(el => getComputedStyle(el).color)).not.toBe(await input.evaluate(el => getComputedStyle(el).color));
  await page.screenshot({ path: 'test-results/html-source-pane.png' });
  await input.press('Control+End');
  await input.press('Enter');
  await page.keyboard.insertText('<p>Added from source</p>');
  await expect(block.locator('.pm-html-preview')).toContainText('Added from source');
  await input.press('Escape');
  await expect(pane).toBeHidden();
  await expect(button).toBeFocused();
  await button.press('Enter');
  await expect(input).toBeFocused();
  await expect(input.locator('.cm-line').last()).toHaveText('<p>Added from source</p>');
  await mode(page, 'source');
  await expectSource(page, raw + '\n<p>Added from source</p>\n\nTail');
  await expect.poll(() => saved(request, note.id)).toBe(raw + '\n<p>Added from source</p>\n\nTail');
  expect(errors).toEqual([]);
});

test("raw HTML uses the HTML block editor and other formats remain unsupported through save and reopen", async ({ page, request }) => {
  const raw = '````{=html}\n<h2>*Raw HTML*</h2>\n````';
  const unsupported = '```{=latex}\n\\text{Preserved}\n```';
  const source = raw + '\n\n' + unsupported + '\n\nBefore `<b>raw inline</b>`{=html} and `\\alpha`{=latex}.\n\nTail';
  const note = await open(page, request, source, { raw_attribute: true, raw_html: false });
  await expect(page.locator('.pm-html-preview h2')).toHaveText('*Raw HTML*');
  await expect(page.locator('.pm-html-inline b')).toHaveText('raw inline');
  await expect(page.locator('.opaque-block[aria-label="Unsupported"]')).toHaveText(unsupported);
  await expect(page.locator('.pm-unsupported-inline')).toHaveText('`\\alpha`{=latex}');
  await page.locator('.pm-html-block').hover();
  await page.getByRole('button', { name: 'HTML source', exact: true }).click();
  const input = page.getByLabel('HTML block source', { exact: true });
  await expect(input.locator('.cm-line')).toHaveText(raw.split('\n'));
  const edited = raw.replace('*Raw HTML*', '*Edited*');
  await input.fill(edited);
  await expect(page.locator('.pm-html-preview h2')).toHaveText('*Edited*');
  await input.press('Control+z');
  await expect(page.locator('.pm-html-preview h2')).toHaveText('*Raw HTML*');
  await page.getByLabel('HTML block source', { exact: true }).press('Control+Shift+z');
  await expect(page.locator('.pm-html-preview h2')).toHaveText('*Edited*');
  await mode(page, 'source');
  await expectSource(page, source.replace(raw, edited));
  await expect.poll(() => saved(request, note.id)).toBe(source.replace(raw, edited));
  await mode(page, 'document');
  await page.reload();
  await expect(page.locator('.pm-html-preview h2')).toHaveText('*Edited*');
  await expect(page.locator('.opaque-block[aria-label="Unsupported"]')).toHaveText(unsupported);
  await page.locator('.pm-html-block').hover();
  await page.getByRole('button', { name: 'HTML source', exact: true }).click();
  await page.getByLabel('HTML block source', { exact: true }).fill(edited.replace('{=html}', '{=latex}'));
  await expect(page.locator('.opaque-block[aria-label="Unsupported"]')).toHaveCount(2);
  await page.locator('.pm-syntax-block').first().getByRole('button', { name: 'Edit source', exact: true }).click();
  await page.getByLabel('Extension block source', { exact: true }).first().fill(edited);
  await expect(page.locator('.pm-html-preview h2')).toHaveText('*Edited*');
});

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
  await page.locator('.pm-html-block').hover();
  await page.getByRole("button", { name: "HTML source", exact: true }).click();
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
  await page.getByRole("button", { name: "HTML source", exact: true }).click();
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
    if (command === "definitions") {
      await expect(page.getByLabel("Term", { exact: true })).toHaveValue("");
      await page.getByLabel("Term", { exact: true }).fill("My term");
      await page.getByLabel("Definition", { exact: true }).fill("My definition");
      await page.locator("#dialog").getByRole("button", { name: "Insert", exact: true }).click();
    }
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
  await expect(page.locator(".pm-html-preview")).toHaveText("");
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
