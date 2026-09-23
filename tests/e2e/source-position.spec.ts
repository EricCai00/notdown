import { test, expect, type Page, type APIRequestContext, type Locator } from "@playwright/test";

async function open(page: Page, request: APIRequestContext, body: string, variant = "gfm") {
  const response = await request.post("/api/pages", { data: {
    title: "Source position", body,
    syntax: { version: 1, variant, extensions: {} },
  } });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
  await page.goto("/");
  await expect(page.locator(".pm-document")).toBeVisible();
  return note;
}

async function scrollToReadingBlock(block: Locator) {
  await block.evaluate(element => {
    const main = document.querySelector<HTMLElement>("#main")!;
    main.scrollTo({
      top: main.scrollTop + element.getBoundingClientRect().top - main.getBoundingClientRect().top - 6,
      behavior: "instant",
    });
  });
}

async function expectVisibleSourceLine(page: Page, text: string) {
  const line = page.locator(".cm-activeLine");
  await expect(line).toHaveText(text);
  await expect.poll(() => line.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const scroller = element.closest(".cm-scroller")!.getBoundingClientRect();
    const main = document.querySelector("#main")!.getBoundingClientRect();
    return rect.top >= Math.max(scroller.top, main.top) && rect.bottom <= Math.min(scroller.bottom, main.bottom);
  })).toBe(true);
}

async function expectSourceLineNumber(page: Page, expected: number) {
  await expect.poll(() => page.locator('.source-pane .cm-editor').evaluate(editor => {
    const active = editor.querySelector('.cm-activeLine')!.getBoundingClientRect();
    const gutter = Array.from(editor.querySelectorAll('.cm-lineNumbers .cm-gutterElement'))
      .find(element => Math.abs(element.getBoundingClientRect().top - active.top) < 2);
    return Number(gutter?.textContent);
  })).toBe(expected);
}

for (const variant of ["gfm", "notdown"]) {
for (const newline of ["\n", "\r\n"]) {
  test(`Ctrl+E follows reading position past a stale caret and duplicate paragraphs (${variant}, ${newline.length === 1 ? "LF" : "CRLF"})`, async ({ page, request }) => {
    const paragraphs = Array.from({ length: 100 }, () => "Repeated paragraph.");
    const body = paragraphs.join(newline + newline);
    const note = await open(page, request, body, variant);
    const blocks = page.locator(".pm-document > p");
    await blocks.first().click();
    await scrollToReadingBlock(blocks.nth(68));
    const previous = await page.locator("#main").evaluate(element => element.scrollTop);
    await page.keyboard.press("Control+e");
    await expect(page.locator("#source-editor")).toBeFocused();
    await expectVisibleSourceLine(page, "Repeated paragraph.");
    await expectSourceLineNumber(page, 137);
    // Re-entering Page preserves the reading position, even with a stale caret.
    await page.keyboard.press("Control+e");
    await expect.poll(() => page.locator("#main").evaluate(element => element.scrollTop)).toBeCloseTo(previous, 0);
    await page.keyboard.press("Control+e");
    await expectVisibleSourceLine(page, "Repeated paragraph.");
    await page.keyboard.insertText("Located here: ");
    paragraphs[68] = "Located here: Repeated paragraph.";
    await page.keyboard.press("Control+s");
    await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body)
      .toBe(paragraphs.join(newline + newline));
  });
}
}

test("Ctrl+E follows the visible editing paragraph and collects pending DOM input", async ({ page, request }) => {
  const paragraphs = Array.from({ length: 85 }, (_, index) => `Paragraph ${index + 1}.`);
  const note = await open(page, request, paragraphs.join("\n\n"));
  // Grow an earlier block first so cached file offsets no longer match the source.
  await page.locator(".pm-document > p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" Earlier edit changed offsets.");
  paragraphs[0] += " Earlier edit changed offsets.";
  const target = page.locator(".pm-document > p").nth(60);
  await target.click();
  await page.keyboard.press("End");
  await target.evaluate(element => {
    const text = element.firstChild!;
    text.textContent += " Pending input.";
    const selection = window.getSelection()!;
    selection.collapse(text, text.textContent!.length);
    // Dispatch in the same task, before the DOM observer's microtask.
    element.dispatchEvent(new KeyboardEvent("keydown", { key: "e", ctrlKey: true, bubbles: true, cancelable: true }));
  });
  paragraphs[60] += " Pending input.";
  await expectVisibleSourceLine(page, paragraphs[60]);
  await page.keyboard.insertText("At the current block: ");
  paragraphs[60] = "At the current block: " + paragraphs[60];
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body)
    .toBe(paragraphs.join("\n\n"));
});

test("reading inside a long code block opens nearby source lines without changing the document", async ({ page, request }) => {
  const body = "# Start\n\n```text\n" + Array.from({ length: 150 }, (_, index) => `Code line ${index + 1}`).join("\n") + "\n```\n\nTail";
  const note = await open(page, request, body);
  await page.locator(".pm-document pre").evaluate(element => {
    const main = document.querySelector<HTMLElement>("#main")!;
    const rect = element.getBoundingClientRect();
    main.scrollTo({ top: main.scrollTop + rect.top + rect.height * 0.65 - main.getBoundingClientRect().top, behavior: "instant" });
  });
  await page.keyboard.press("Control+e");
  await expect(page.locator(".cm-activeLine")).toHaveText(/Code line (9\d|10\d)/);
  await expectVisibleSourceLine(page, (await page.locator(".cm-activeLine").textContent())!);
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
});

test("Ctrl+E from the page side of Split follows its visible caret with sync scrolling disabled", async ({ page, request }) => {
  const body = Array.from({ length: 90 }, (_, index) => `Split paragraph ${index + 1}.`).join("\n\n");
  await open(page, request, body);
  await page.locator('[data-mode="split"]').click();
  await page.getByLabel("Sync scrolling").uncheck();
  await page.locator(".pm-document > p").nth(64).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Control+e");
  await expectVisibleSourceLine(page, "Split paragraph 65.");
});

test("Ctrl+E keeps the current source position when leaving Split from its source pane", async ({ page, request }) => {
  const body = Array.from({ length: 90 }, (_, index) => `Source paragraph ${index + 1}.`).join("\n\n");
  await open(page, request, body);
  await page.locator('[data-mode="split"]').click();
  await page.getByLabel("Sync scrolling").uncheck();
  await page.locator("#source-editor").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Control+e");
  await expectVisibleSourceLine(page, "Source paragraph 90.");
});

test("reading position follows displayed order when an early footnote definition is rendered at the end", async ({ page, request }) => {
  await open(page, request, "[^note]: Footnote definition.\n\nFirst reading paragraph.[^note]\n\nNext paragraph.", "notdown");
  await expect(page.locator(".pm-footnote")).toHaveCount(1);
  const paragraph = page.locator(".pm-document > p").first();
  const footnote = await page.locator(".pm-footnote").boundingBox();
  expect((await paragraph.boundingBox())!.y).toBeLessThan(footnote!.y);
  await page.keyboard.press("Control+e");
  await expectVisibleSourceLine(page, "First reading paragraph.[^note]");
  await expectSourceLineNumber(page, 3);
  await page.keyboard.press('Control+e');
  await page.locator('.pm-footnote p').click();
  await page.keyboard.press('Control+e');
  await expectVisibleSourceLine(page, '[^note]: Footnote definition.');
  await expectSourceLineNumber(page, 1);
});

test("a footnote elsewhere in a long page does not disable Ctrl+E line mapping", async ({ page, request }) => {
  const body = Array.from({ length: 90 }, (_, i) => `Paragraph ${i + 1}.`).join('\n\n') + '\n\n[^note]: Definition.';
  await open(page, request, body, 'notdown');
  await scrollToReadingBlock(page.locator('.pm-document > p').nth(60));
  await page.keyboard.press('Control+e');
  await expectVisibleSourceLine(page, 'Paragraph 61.');
  await expectSourceLineNumber(page, 121);
});
