import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { expectSource } from "./source-helper.js";
import { readFile } from "node:fs/promises";

async function open(
  page: Page,
  request: APIRequestContext,
  body: string,
  variant = "gfm",
  extensions: Record<string, boolean> = {},
) {
  const response = await request.post("/api/pages", {
    data: {
      title: "Native Markdown workspace",
      body,
      bodyFormat:
        variant === "notion-markdown" ? "notion-markdown" : "markdown",
      syntax: { version: 1, variant, extensions },
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
const mode = (page: Page, name: string) =>
  page.locator(`.editing-modes [data-mode="${name}"]`).click();

for (const newline of ['\n', '\r\n']) {
test(`source paste preserves blank line heights, line numbers and exact Markdown (${newline.length === 1 ? 'LF' : 'CRLF'})`, async ({ page, request }) => {
  const note = await open(page, request, 'initial' + newline + 'line', 'obsidian');
  const body = (await readFile('docs/fixtures/obsidian-comparison.md', 'utf8')).replace(/\r\n|\r|\n/g, newline);
  await mode(page, 'source');
  const source = page.locator('#source-editor');
  await source.click();
  await page.keyboard.press('Control+a');
  await source.evaluate((el, text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, body.replace(/\r\n|\r|\n/g, newline === '\n' ? '\r\n' : '\n'));
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
  await source.click();
  await page.keyboard.press('Control+Home');
  await expect(source.locator('.cm-line').first()).toHaveText('# Notdown × Obsidian 语法对照测试');
  const lines = await source.locator('.cm-line').evaluateAll(lines => lines.slice(0, 12).map(el => ({ text: el.textContent, height: el.getBoundingClientRect().height })));
  expect(lines.some(line => line.text === '')).toBe(true);
  for (const line of lines) expect(line.height).toBeGreaterThanOrEqual(20);
  const numbers = await page.locator('.cm-lineNumbers .cm-gutterElement').evaluateAll(els => els.filter(el => getComputedStyle(el).visibility !== 'hidden').slice(0, 10).map(el => ({ text: el.textContent, top: el.getBoundingClientRect().top })));
  expect(numbers.slice(0, 5).map(n => n.text)).toEqual(['1', '2', '3', '4', '5']);
  for (let i = 1; i < numbers.length; i++) expect(numbers[i].top - numbers[i - 1].top).toBeGreaterThanOrEqual(20);
  await page.reload();
  await mode(page, 'source');
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
});
}

test("source and blocks share updates, undo and saved syntax across all three views without Pandoc", async ({
  page,
  request,
}) => {
  const errors: string[] = [],
    pandoc: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/markdown/**", (route) => {
    pandoc.push(route.request().url());
    return route.abort();
  });
  const note = await open(page, request, "# Original\n\nTail");
  await mode(page, "split");
  await expect(page.locator(".source-pane")).toBeVisible();
  await expect(page.locator(".page-pane")).toBeVisible();
  const source = page.locator("#source-editor");
  await source.fill("# From source\n\nTail");
  // A mode switch must collect the debounced source update immediately.
  await mode(page, "document");
  await expect(page.locator(".pm-document h1")).toHaveText("From source");
  await page.locator(".pm-document h1").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" edited");
  await mode(page, "source");
  await expectSource(page, "# From source edited\n\nTail");
  await source.click();
  await page.keyboard.press("Control+z");
  await expectSource(page, "# From source\n\nTail");
  await page.keyboard.press("Control+Shift+z");
  await expectSource(page, "# From source edited\n\nTail");
  await mode(page, "split");
  await page
    .getByLabel("Markdown dialect", { exact: true })
    .selectOption("commonmark");
  await expectSource(page, "# From source edited\n\nTail");
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/pages/${note.id}`)).json()).syntax
          .variant,
    )
    .toBe("commonmark");
  await page.reload();
  await expect(page.getByLabel("Markdown dialect", { exact: true })).toHaveValue(
    "commonmark",
  );
  await expect(page.locator(".pm-document h1")).toHaveText(
    "From source edited",
  );
  expect(pandoc).toEqual([]);
  expect(errors).toEqual([]);
});

test("extensions change actual block parsing and commands, preserve source, and restore after reload", async ({
  page,
  request,
}) => {
  const body =
    '<callout icon="💡">\n\tA useful thought\n</callout>\n\n```text\n<callout>literal</callout>\n```';
  const note = await open(page, request, body, "commonmark", {
    notion_callouts: true,
    future_flag: true,
  });
  await expect(page.locator(".pm-callout")).toContainText("A useful thought");
  await mode(page, "split");
  await page.locator(".syntax-options summary").click();
  await page.locator('[data-extension="notion_callouts"]').uncheck();
  await expect(page.locator(".pm-callout")).toHaveCount(0);
  await expect(page.locator(".pm-html-block")).toContainText(
    "A useful thought",
  );
  await expectSource(page, body);
  await page.locator('[data-extension="notion_callouts"]').check();
  await expect(page.locator(".pm-callout")).toHaveCount(1);
  await expect(page.locator(".pm-document pre")).toContainText(
    "<callout>literal</callout>",
  );
  await page.locator(".syntax-options summary").click();
  await page.getByLabel("Markdown dialect", { exact: true }).selectOption("gfm");
  await expect(page.locator(".pm-callout")).toHaveCount(0);
  await expectSource(page, body);
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/pages/${note.id}`)).json()).syntax,
    )
    .toEqual({ version: 1, variant: "gfm", extensions: { future_flag: true } });
  await page.reload();
  await expect(page.locator(".pm-html-block")).toContainText(
    "A useful thought",
  );
  await page.locator(".syntax-options summary").click();
  await page.locator('[data-extension="notion_callouts"]').check();
  await page.locator(".syntax-options summary").click();
  await expect(page.locator(".pm-callout")).toHaveCount(1);
  await mode(page, "split");
  await page.screenshot({
    path: "test-results/native-workspace.png",
    fullPage: true,
  });
});

test("source composition and fast replacements keep the latest draft through a mode switch", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const note = await open(page, request, "# Initial");
  await mode(page, "split");
  const source = page.locator("#source-editor");
  await source.fill("# aaaaa");
  await source.fill("# aaaaaa");
  await source.fill("# 最终内容");
  await source.dispatchEvent("compositionstart", { data: "" });
  await source.press("End");
  await page.keyboard.insertText("中文输入");
  await source.dispatchEvent("compositionend", { data: "中文输入" });
  await mode(page, "document");
  await expect(page.locator(".pm-document h1")).toHaveText("最终内容中文输入");
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/pages/${note.id}`)).json()).body,
    )
    .toBe("# 最终内容中文输入");
  await page.reload();
  await expect(page.locator(".pm-document h1")).toHaveText("最终内容中文输入");
  expect(errors).toEqual([]);
});

test("split view scrolls in both directions and can turn synchronization off", async ({
  page,
  request,
}) => {
  const body = Array.from(
    { length: 70 },
    (_, i) =>
      `## Section ${i + 1}\n\n${"Reading content with a longer line. ".repeat(8)}`,
  ).join("\n\n");
  await open(page, request, body);
  await mode(page, "split");
  const source = page.locator(".cm-scroller"),
    preview = page.locator(".page-pane");
  await source.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect
    .poll(() =>
      preview.evaluate((el) => {
        const top = el.getBoundingClientRect().top;
        const last = el.querySelector(".pm-document")!.lastElementChild!.getBoundingClientRect();
        return last.top <= top + 2 && last.bottom > top + 1;
      }),
    )
    .toBe(true);
  await preview.evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect
    .poll(() => source.evaluate((el) => el.scrollTop))
    .toBeLessThan(3);
  await preview.evaluate((el) => {
    el.scrollTop = (el.scrollHeight - el.clientHeight) * 0.45;
  });
  await expect
    .poll(() => source.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(100);
  await page.getByLabel("Sync scrolling", { exact: true }).uncheck();
  const previous = await preview.evaluate((el) => el.scrollTop);
  await source.evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect(source).toHaveJSProperty("scrollTop", 0);
  await expect(preview).toHaveJSProperty("scrollTop", previous);
});
