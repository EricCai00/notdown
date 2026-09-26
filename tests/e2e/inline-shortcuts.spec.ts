import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

async function open(page: Page, request: APIRequestContext, body = "Start ", variant = "notdown", extensions = {}) {
  const response = await request.post("/api/pages", { data: {
    title: "Inline typing", body, bodyFormat: "notion-markdown", syntax: { version: 1, variant, extensions },
  } });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  const paragraph = page.locator(".pm-document > p").first();
  await paragraph.click(); await page.keyboard.press("End");
  return async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body as string;
}

test("closed superscript, subscript, emoji and CriticMarkup persist with reversible input", async ({ page, request }) => {
  const saved = await open(page, request);
  await page.keyboard.type("H~2~O x^2^ :smile: {++new++} {--old--} {==bright==} {~~before~>after~~}");
  const doc = page.locator(".pm-document");
  await expect(doc.locator("sub")).toHaveText("2");
  await expect(doc.locator("sup")).toHaveText("2");
  await expect(doc).toContainText("😄");
  await expect(doc.locator("ins.pm-critic")).toHaveText("new");
  await expect(doc.locator("del.pm-critic")).toHaveText("old");
  await expect(doc.locator("mark.pm-critic")).toHaveText("bright");
  await expect(doc.locator(".pm-critic-substitution .pm-critic-old")).toHaveText("before");
  await expect(doc.locator(".pm-critic-substitution .pm-critic-new")).toHaveText("after");
  await page.keyboard.press("Backspace");
  await expect(doc.locator(".pm-critic-substitution")).toHaveCount(0);
  await expect(doc).toContainText("{~~before~>after~~}");
  await page.keyboard.press("Backspace"); await page.keyboard.type("} tail");
  await expect.poll(saved).toContain("{~~before~>after~~} tail");
  await page.reload();
  await expect(doc.locator(".pm-critic-substitution .pm-critic-new")).toHaveText("after");
  await expect(doc.locator("mark.pm-critic")).toHaveText("bright");
});

test("typed inline footnote leaves the cursor in prose and saves inline syntax", async ({ page, request }) => {
  const saved = await open(page, request);
  await page.keyboard.type("^[note **body**]");
  await expect(page.locator(".pm-footnote-ref")).toHaveCount(1);
  await expect(page.locator(".pm-footnotes .pm-footnote")).toContainText("note body");
  await page.keyboard.press("Backspace");
  await expect(page.locator(".pm-footnote-ref")).toHaveCount(0);
  await expect(page.locator(".pm-document > p").first()).toContainText("^[note body]");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("]");
  await expect(page.locator(".pm-footnote-ref")).toHaveCount(1);
  await page.keyboard.type(" after");
  await expect(page.locator(".pm-document > p").first()).toContainText("after");
  await expect.poll(saved).toContain("^[note **body**] after");
  await page.reload();
  await expect(page.locator(".pm-footnotes .pm-footnote strong")).toHaveText("body");
  await expect(page.locator(".pm-document > p").first()).toContainText("after");
});

test("typed autolinks, inline HTML and defined inline references survive reload", async ({ page, request }) => {
  const saved = await open(page, request, "Start\n\n[>HTML]: Hypertext Markup Language\n\n[#doe]: Jane Doe. A book.");
  await page.keyboard.type(" <https://example.com> <me@example.com> [>HTML] [#doe] [@other] done");
  const doc = page.locator(".pm-document");
  await expect(doc.locator('a[href="https://example.com"]')).toHaveText("https://example.com");
  await expect(doc.locator('a[href="mailto:me@example.com"]')).toHaveText("me@example.com");
  await expect(doc.locator('[title="Hypertext Markup Language"]')).toHaveCount(1);
  await expect(doc.locator(".md-mmd-citation")).toHaveCount(1);
  await expect.poll(saved).toContain("[>HTML]");
  await page.keyboard.press("Enter");
  await page.keyboard.type("HTML: <kbd>Enter</kbd> after");
  await expect(doc.locator(".pm-html-inline kbd")).toHaveText("Enter");
  await expect.poll(saved).toContain("<kbd>Enter</kbd> after");
  await page.reload();
  await expect(doc.locator(".pm-html-inline kbd")).toHaveText("Enter");
  await expect(doc.locator(".md-mmd-citation")).toHaveCount(1);
});

test("CriticMarkup comments remain hidden and continuation stays after the comment", async ({ page, request }) => {
  const saved = await open(page, request);
  await page.keyboard.type("{>>secret<<}");
  await expect(page.locator(".pm-comment")).toBeHidden();
  await page.keyboard.type(" visible");
  await expect.poll(saved).toContain("{>>secret<<} visible");
  await page.reload();
  await expect(page.locator(".pm-comment")).toBeHidden();
  await expect(page.locator(".pm-document > p")).toHaveText(/Start\s*visible/, { useInnerText: true });
});

test("disabled extensions and escaped syntax stay literal while typing", async ({ page, request }) => {
  await open(page, request, "Start ", "notion-markdown", { strikeout: false });
  await page.keyboard.type("^2^ ~2~ {++new++} :smile: ^[note]");
  const doc = page.locator(".pm-document");
  await expect(doc).toContainText("^2^ ~2~ {++new++} :smile: ^[note]");
  await expect(doc.locator("sub, sup, .pm-critic")).toHaveCount(0);
});

test("both highlight syntaxes share appearance and formatting behavior while retaining source", async ({ page, request }) => {
  const saved = await open(page, request);
  await page.keyboard.type("==same== {==same==} {++revision++}");
  const marks = page.locator(".pm-document mark");
  await expect(marks).toHaveCount(2);
  const appearance = () => marks.evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element);
    return [style.backgroundColor, style.color, style.textDecoration, style.padding, style.fontWeight];
  }));
  let styles = await appearance();
  expect(styles[0]).toEqual(styles[1]);
  await marks.last().dblclick();
  await expect(page.getByRole("heading", { name: "Revision properties" })).toHaveCount(0);
  await expect.poll(saved).toContain("==same== {==same==}");
  await page.reload();
  await expect(marks).toHaveCount(2);
  styles = await appearance();
  expect(styles[0]).toEqual(styles[1]);
  await page.locator(".pm-document > p").first().click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.getByRole("toolbar", { name: "Text formatting" }).getByRole("button", { name: "Clear formatting" }).click();
  await expect(marks).toHaveCount(0);
  await expect(page.locator(".pm-document ins.pm-critic")).toHaveText("revision");
  await expect.poll(saved).not.toContain("==");
});
