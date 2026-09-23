import { test, expect, type Page } from "@playwright/test";

type Range = { first: number; last: number };

// Read the first visible source line and page block independently of the
// scroll implementation. Blank source separators belong to the next block.
async function topBlocks(page: Page, ranges: Range[]) {
  return page.evaluate((ranges) => {
    const source = document.querySelector<HTMLElement>(".cm-scroller")!;
    const preview = document.querySelector<HTMLElement>(".page-pane")!;
    const sourceTop = source.getBoundingClientRect().top;
    const line = [...source.querySelectorAll<HTMLElement>(".cm-line")]
      .find(el => el.getBoundingClientRect().bottom > sourceTop + 0.5);
    const number = [...source.querySelectorAll<HTMLElement>(".cm-lineNumbers .cm-gutterElement")]
      .find(el => line && Math.abs(el.getBoundingClientRect().top - line.getBoundingClientRect().top) < 2);
    const lineNumber = Number(number?.textContent);
    const sourceIndex = lineNumber > 0 ? ranges.findIndex(range => range.last >= lineNumber) : -1;
    const pageTop = preview.getBoundingClientRect().top;
    const pageIndex = [...preview.querySelector(".pm-document")!.children]
      .findIndex(el => el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().bottom > pageTop + 0.5);
    const last = preview.querySelector(".pm-document")!.lastElementChild!;
    return {
      sourceIndex, pageIndex, lineNumber, sourceTop: source.scrollTop, pageTop: preview.scrollTop,
      tail: { top: last.getBoundingClientRect().top - pageTop, height: last.getBoundingClientRect().height,
        padding: getComputedStyle(preview.querySelector(".pm-document")!).paddingBottom,
        margin: getComputedStyle(last).marginBottom, viewport: preview.clientHeight },
    };
  }, ranges);
}

async function aligned(page: Page, ranges: Range[]) {
  await expect.poll(async () => {
    const top = await topBlocks(page, ranges);
    return top.sourceIndex >= 0 && top.sourceIndex === top.pageIndex;
  }, { message: "the first source line and first visible page block must belong to the same block" }).toBe(true)
    .catch(async error => { throw new Error(`${error.message}\n${JSON.stringify(await topBlocks(page, ranges))}`); });
}

for (const [variant, newline] of [["gfm", "\n"], ["gfm", "\r\n"], ["notdown", "\n"]] as const) {
  const name = `${variant}-${newline.length === 1 ? "LF" : "CRLF"}`;
  test(`split keeps the top block aligned through long jumps, resize and the document end (${name})`, async ({ page, request }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const blocks = Array.from({ length: 25 }, (_, index) => [
      `## Section ${index}`,
      `Paragraph ${index} ` + "[short label](https://example.com/a/very/long/path/that/wraps/in/source) ".repeat(12 + index % 4),
      `\`\`\`text\n${Array.from({ length: 3 + index % 8 }, (_, line) => `code ${index} line ${line}`).join("\n")}\n\`\`\``,
      variant === "notdown"
        ? `<callout icon="💡">\n\tCallout ${index}\n\t${"Wrapped content ".repeat(16)}\n</callout>`
        : `> Quote ${index}\n>\n> ${"Wrapped content ".repeat(16)}`,
      `- List ${index} first\n- List ${index} second with ${"wrapping ".repeat(12)}`,
      `| Column ${index} | Value |\n| --- | --- |\n| A | ${"table ".repeat(8)} |`,
    ]).flat();
    blocks.push(variant === "notdown" ? "---" : "Final block");
    const body = blocks.join("\n\n").replace(/\n/g, newline);
    const config = { version: 1 as const, variant: variant as "gfm" | "notdown", extensions: {} };
    const ranges: Range[] = [];
    let first = 1;
    for (const block of blocks) {
      const last = first + block.split("\n").length - 1;
      ranges.push({ first, last });
      first = last + 2;
    }
    const response = await request.post("/api/pages", { data: { title: `Split scroll ${variant}`, body, syntax: config } });
    expect(response.status()).toBe(201);
    const note = await response.json();
    await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
    await page.goto("/");
    await page.locator('[data-mode="split"]').click();
    await expect(page.locator(".pm-document > *")).toHaveCount(blocks.length);
    await aligned(page, ranges);
    for (const pane of [".cm-scroller", ".page-pane"]) {
      for (const fraction of [0.12, 0.7, 0.32, 0.96, 1, 0.04, 0]) {
        await test.step(`${pane} scroll to ${fraction}`, async () => {
          await page.locator(pane).evaluate((el, fraction) => {
            el.scrollTop = (el.scrollHeight - el.clientHeight) * fraction;
            return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          }, fraction);
          await aligned(page, ranges);
        });
      }
    }
    await page.locator(".page-pane").evaluate(el => { el.scrollTop = el.scrollHeight * 0.45; });
    await aligned(page, ranges);
    await page.setViewportSize({ width: 1100, height: 820 });
    await aligned(page, ranges);
    await page.setViewportSize({ width: 1600, height: 1050 });
    await aligned(page, ranges);
    await page.getByLabel("Sync scrolling", { exact: true }).uncheck();
    await page.locator(".cm-scroller").evaluate(el => { el.scrollTop = 0; });
    await expect.poll(async () => {
      const top = await topBlocks(page, ranges);
      return top.sourceIndex !== top.pageIndex;
    }).toBe(true);
    await page.getByLabel("Sync scrolling", { exact: true }).check();
    await aligned(page, ranges);
    await expect.poll(async () => (await topBlocks(page, ranges)).pageIndex).toBe(0);
    expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);

    // Rebuild the source map after an edit, then lead from the editable page.
    const firstParagraph = page.locator(".pm-document > p").first();
    await firstParagraph.click({ position: { x: 10, y: 10 } });
    await page.keyboard.press("Home");
    await page.keyboard.type("Edited ");
    await page.locator(".page-pane").evaluate(el => {
      el.scrollTop = (el.scrollHeight - el.clientHeight) * 0.61;
      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await aligned(page, ranges);
    await page.screenshot({ path: `test-results/split-scroll-${name}.png` });
    expect(errors).toEqual([]);
    await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body)
      .toContain("Edited Paragraph 0");
  });
}
