import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { expectSource } from "./source-helper";

async function open(page: Page, request: APIRequestContext, body: string) {
  const response = await request.post("/api/pages", { data: {
    title: "Source highlighting and folding", body,
    syntax: { version: 1, variant: "gfm", extensions: {} },
  } });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
  await page.goto("/");
  await page.locator('[data-mode="source"]').click();
  await expect(page.locator("#source-editor")).toBeVisible();
  return note;
}

async function foldLine(page: Page, text: string) {
  const line = page.locator("#source-editor .cm-line").filter({ hasText: text }).first();
  const top = await line.evaluate(element => element.getBoundingClientRect().top);
  const markers = page.locator('.source-mount .cm-foldGutter [title="Fold line"]');
  const index = await markers.evaluateAll((elements, y) => elements.findIndex(element =>
    Math.abs(element.closest('.cm-gutterElement')!.getBoundingClientRect().top - y) < 8), top);
  expect(index, `Fold marker for ${text}`).toBeGreaterThanOrEqual(0);
  await markers.nth(index).click();
}

test("Source and Lab share Markdown and fenced code highlighting", async ({ page, request }) => {
  const body = '# Heading\n\n**bold** *italic* [link](https://example.com) `inline`\n\n```typescript\nconst answer: number = 42;\n```';
  await open(page, request, body);
  const heading = page.locator('#source-editor .cm-line').first().locator('span').last();
  await expect(heading).toHaveCSS("color", "rgb(121, 82, 165)");
  await expect(heading).toHaveCSS("font-weight", "600");
  const bold = page.locator('#source-editor span').filter({ hasText: /^bold$/ });
  await expect(bold).toHaveCSS("font-weight", "700");
  const keyword = page.locator('#source-editor span').filter({ hasText: /^const$/ });
  await expect(keyword).toHaveCount(1);
  const color = await keyword.evaluate(element => getComputedStyle(element).color);
  expect(color).not.toBe(await page.locator('#source-editor').evaluate(element => getComputedStyle(element).color));
  await page.evaluate(source => sessionStorage.setItem("notdown-markdown-lab-v1", JSON.stringify({
    source, variant: "gfm", overrides: {}, plugins: [], filename: "Highlight.md", sync: false,
  })), body);
  await page.goto("/markdown-lab.html");
  await expect(page.locator('.cm-line').first().locator('span').last()).toHaveCSS("color", "rgb(121, 82, 165)");
  await expect(page.locator('.cm-content span').filter({ hasText: /^const$/ })).toHaveCSS("color", color);
});

test("heading folds include subsections, stop at peers, and save complete CRLF source", async ({ page, request }) => {
  const body = '# First\r\n\r\nHidden body\r\n\r\n## Child\r\n\r\nChild body\r\n\r\n# Second\r\n\r\nVisible tail';
  const note = await open(page, request, body);
  await foldLine(page, '# First');
  await expect(page.locator('#source-editor')).not.toContainText('Hidden body');
  await expect(page.locator('#source-editor')).not.toContainText('Child body');
  await expect(page.locator('#source-editor')).toContainText('# Second');
  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
  await page.locator('[data-mode="split"]').click();
  await expect(page.locator('.source-mount .cm-foldPlaceholder')).toHaveCount(1);
  await expect(page.locator('.pm-document')).toContainText('Child body');
  await page.locator('.source-mount .cm-foldPlaceholder').click();
  await expectSource(page, body);
});

test("multiline blocks fold independently, including heading-looking text inside fences", async ({ page, request }) => {
  const body = '```text\n# Not a heading\ncode content\n```\n\n> Quote first\n> Quote second\n\n- Parent\n  - Nested\n\n| A | B |\n| --- | --- |\n| cell | value |\n\nTail';
  await open(page, request, body);
  await foldLine(page, '```text');
  await expect(page.locator('#source-editor')).not.toContainText('Not a heading');
  await foldLine(page, '> Quote first');
  await expect(page.locator('#source-editor')).not.toContainText('Quote second');
  await foldLine(page, '- Parent');
  await expect(page.locator('#source-editor')).not.toContainText('Nested');
  await foldLine(page, '| A | B |');
  await expect(page.locator('#source-editor')).not.toContainText('cell');
  await expect(page.locator('#source-editor')).toContainText('Tail');
  await expect(page.locator('.source-mount .cm-foldPlaceholder')).toHaveCount(4);
  await page.locator('#source-editor').click();
  await page.keyboard.press('Control+Alt+]');
  await expectSource(page, body);
});

test("folding does not enter shared undo history or lose pending source edits", async ({ page, request }) => {
  const body = '# First\n\nHidden body\n\n# Last\n\nTail';
  const note = await open(page, request, body);
  await foldLine(page, '# First');
  await page.locator('#source-editor').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText(' edited');
  await page.locator('[data-mode="document"]').click();
  await expect(page.locator('.pm-document')).toContainText('Tail edited');
  await page.locator('[data-mode="source"]').click();
  await page.locator('#source-editor').click();
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Alt+]');
  await expectSource(page, body);
  await page.keyboard.press('Control+y');
  await expectSource(page, body + ' edited');
  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body + ' edited');
});

test("Setext headings fold from the keyboard and page navigation reveals folded source", async ({ page, request }) => {
  const body = 'First\n=====\n\nHidden paragraph\n\nSecond\n======\n\nTail';
  await open(page, request, body);
  await page.locator('#source-editor').click();
  await page.keyboard.press('Control+Home');
  // Physical keys send shifted braces, matching an actual keyboard's key events.
  await page.keyboard.press('Control+Shift+BracketLeft');
  await expect(page.locator('.source-mount .cm-foldPlaceholder')).toHaveCount(1);
  await expect(page.locator('#source-editor')).not.toContainText('Hidden paragraph');
  await expect(page.locator('#source-editor')).toContainText('Second');
  await page.keyboard.press('Control+Shift+BracketRight');
  await expectSource(page, body);
  await page.keyboard.press('Control+Alt+[');
  await expect(page.locator('.source-mount .cm-foldPlaceholder')).toHaveCount(2);
  await page.locator('[data-mode="document"]').click();
  await page.locator('.pm-document p').filter({ hasText: 'Hidden paragraph' }).click();
  await page.keyboard.press('Control+e');
  await expect(page.locator('#source-editor .cm-activeLine')).toHaveText('Hidden paragraph');
});
