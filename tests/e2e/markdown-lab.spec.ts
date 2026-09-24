import { expect, test, type Page } from "@playwright/test";

async function openLab(page: Page, pandoc = true) {
  if (pandoc) {
    const response = await page.request.get("/api/markdown/capabilities");
    test.skip(!(await response.json()).available, "Pandoc is not installed");
  }
  await page.goto("/markdown-lab.html");
}
async function replaceSource(page: Page, text: string) {
  const source = page.getByRole("textbox", {
    name: "Markdown source",
    exact: true,
  });
  await source.click();
  await source.press("ControlOrMeta+a");
  await page.keyboard.insertText(text);
}
async function ready(page: Page) {
  await expect(page.locator("#render-status")).toHaveAttribute(
    "data-state",
    "ready",
  );
}
async function storedSource(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem("notdown-markdown-lab-v1")!)
        .source as string,
  );
}

test('new official parsers render locally and keep raw HTML separate from inert preview',async({page})=>{
 const c=await (await page.request.get('/api/markdown/capabilities')).json();
 await openLab(page,false);
 for(const [variant,source,selector,text]of [
  ['commonmark-js','# CommonMark\n\n<script>window.labExecuted=true</script>','#preview h1','CommonMark'],
  ['cmark-gfm','~Single tilde~','#preview del','Single tilde'],
  ['php-markdown-extra','*[HTML]: Hypertext\n\nHTML','#preview abbr','HTML'],
 ]){
  if(!c.renderers?.[variant]?.available){await expect(page.locator(`#variant option[value="${variant}"]`)).toBeDisabled();continue;}
  await page.locator('#variant').selectOption(variant);
  await replaceSource(page,source);await ready(page);
  await expect(page.locator(selector)).toHaveText(text);
  await expect(page.locator('#configure')).toBeDisabled();
  if(variant==='commonmark-js'){
   await expect(page.locator('#preview script')).toHaveCount(0);
   await page.getByRole('button',{name:'HTML',exact:true}).click();
   await expect(page.locator('#html-output')).toContainText('<script>');
   await page.getByRole('button',{name:'Page',exact:true}).click();
  }
  expect(await storedSource(page)).toBe(source);
 }
 expect(await page.evaluate(()=>(window as any).labExecuted)).toBeUndefined();
});

test("all Pandoc Markdown dialects are selectable with independent working extensions", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openLab(page);
  await ready(page);
  await expect(page.locator("#variant option")).toHaveCount(15);
  await expect(page.locator('#variant option[value="commonmark_x"]')).toHaveText("CommonMark X");
  await expect(page.locator('#variant option[value="markdown_mmd"]')).toHaveText("MultiMarkdown");
  await expect(page.locator('#variant option[value="pandoc-cli"]')).toHaveCount(0);
  await expect(
    page.locator('#variant option[value="markdown_github"]'),
  ).toHaveText("Legacy GitHub Markdown");
  const source = "intro\n## Heading\n";
  await replaceSource(page, source);
  for (const variant of [
    "markdown_mmd",
    "markdown_phpextra",
    "markdown_strict",
    "markdown_github",
  ]) {
    await page.locator("#variant").selectOption(variant);
    await ready(page);
    await expect(page.locator("#mapping")).toHaveText("Sync by estimated block position");
    await page.getByRole("button", { name: /Extensions and plugins/ }).click();
    await page
      .getByRole("searchbox", { name: "Search syntax extensions" })
      .fill("blank_before_header");
    const toggle = page.locator('[data-extension="blank_before_header"]');
    await expect(toggle).toBeVisible();
    if (variant === "markdown_github")
      await expect(page.locator("#extension-note")).toContainText("deprecated");
    await toggle.check();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await ready(page);
    await expect(page.locator("#preview h2")).toHaveCount(0);
    await page.getByRole("button", { name: /Extensions and plugins/ }).click();
    await toggle.uncheck();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await ready(page);
    await expect(page.locator("#preview h2")).toHaveText("Heading");
    expect(await storedSource(page)).toBe(source);
  }
  await page.reload();
  await ready(page);
  await expect(page.locator("#variant")).toHaveValue("markdown_github");
  await expect(page.locator("#preview h2")).toHaveText("Heading");
});

test("direct CLI renderers show their HTML output and sanitize the page preview", async ({ page }) => {
  const capabilities = await (await page.request.get("/api/markdown/capabilities")).json();
  test.skip(!capabilities.renderers?.["multimarkdown-cli"]?.available, "libMultiMarkdown CLI is not installed");
  await openLab(page, false);
  await page.locator("#variant").selectOption("multimarkdown-cli");
  await replaceSource(page, '# CLI **output**\n\n<script>window.labExecuted = true</script>\n');
  await ready(page);
  await expect(page.locator("#preview h1")).toHaveText("CLI output");
  await expect(page.locator("#preview script")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Extensions and plugins/ })).toBeDisabled();
  await expect(page.locator("#mapping")).toHaveText("Sync by document progress");
  if (!capabilities.renderers?.["markdown-pl"]?.available) {
    await expect(page.locator('#variant option[value="markdown-pl"]')).toBeDisabled();
    await expect(page.locator('#variant option[value="markdown-pl"]')).toContainText("Unavailable locally");
  }
  await page.getByRole("button", { name: "HTML", exact: true }).click();
  await expect(page.locator("#html-output")).toContainText("<h1");
  await expect(page.locator("#html-output")).toContainText("<script>");
  await expect(page.locator("#preview")).toBeHidden();
  expect(await storedSource(page)).toContain("# CLI **output**");
  await page.getByRole("button", { name: "Page", exact: true }).click();
  await expect(page.locator("#preview h1")).toHaveText("CLI output");
  if (capabilities.renderers?.["markdown-pl"]?.available) {
    await page.locator("#variant").selectOption("markdown-pl");
    await ready(page);
    await expect(page.locator("#preview h1")).toHaveText("CLI output");
    await expect(page.locator("#mapping")).toHaveText("Sync by document progress");
    await page.getByRole("button", { name: "HTML", exact: true }).click();
    await expect(page.locator("#html-output")).toContainText("<strong>output</strong>");
    await expect(page.locator("#html-output")).not.toContainText("lab-source-block");
  }
  expect(await page.evaluate(() => (window as any).labExecuted)).toBeUndefined();
});

test("old direct Pandoc session keeps its source under the Pandoc Markdown variant", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("notdown-markdown-lab-v1", JSON.stringify({
    source: "# Saved Pandoc draft\n",
    variant: "pandoc-cli",
    overrides: {},
    plugins: [],
    filename: "saved.md",
    sync: true,
  })));
  await openLab(page);
  await ready(page);
  await expect(page.locator("#variant")).toHaveValue("markdown");
  await expect(page.getByRole("textbox", { name: "Markdown source", exact: true })).toContainText("Saved Pandoc draft");
  await expect(page.locator("#preview h1")).toHaveText("Saved Pandoc draft");
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("notdown-markdown-lab-v1")!).variant)).toBe("markdown");
});

test("live source highlighting, actual Pandoc output, extensions and tab-local recovery", async ({
  page,
}) => {
  await openLab(page);
  await ready(page);
  await expect(page.locator("#preview h1")).toHaveText("Let your words grow");
  await expect(page.locator(".cm-line span").first()).toBeVisible();
  await replaceSource(page, "# 实时标题\n\n~~被删除的文字~~\n\n公式 $x^2$。\n");
  await ready(page);
  await expect(page.locator("#preview h1")).toHaveText("实时标题");
  await expect(page.locator("#preview del")).toHaveText("被删除的文字");
  await expect(page.locator("#preview .katex")).toBeVisible();
  const before = await storedSource(page);
  await page.getByRole("button", { name: /Extensions and plugins/ }).click();
  await page.locator('[data-extension="strikeout"]').uncheck();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await ready(page);
  await expect(page.locator("#preview del")).toHaveCount(0);
  await expect(page.locator("#preview")).toContainText("~~被删除的文字~~");
  expect(await storedSource(page)).toBe(before);
  await page.reload();
  await ready(page);
  await expect(page.locator("#preview h1")).toHaveText("实时标题");
  await expect(page.locator("#preview del")).toHaveCount(0);
});

test("Notion dialect renders columns and standard links without a custom bookmark plugin", async ({
  page,
}) => {
  await openLab(page, false);
  await page.locator("#examples summary").click();
  await page.getByRole("button", { name: "Notion blocks and columns" }).click();
  await ready(page);
  await expect(page.locator("#variant")).toHaveValue("notion-markdown");
  await expect(page.locator("#preview .note-columns")).toBeVisible();
  await expect(page.locator("#preview .pm-callout")).toBeVisible();
  await expect(page.locator("#preview .lab-bookmark")).toHaveCount(0);
  const source = await storedSource(page);
  await page.getByRole("button", { name: /Extensions and plugins/ }).click();
  await expect(page.locator('[data-plugin="bookmark"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await ready(page);
  await expect(page.locator("#preview .lab-bookmark")).toHaveCount(0);
  await expect(page.locator('#preview a[href="https://pandoc.org"]')).toBeVisible();
  expect(await storedSource(page)).toBe(source);
  await page.screenshot({
    path: "test-results/markdown-lab-notion.png",
    fullPage: true,
  });
});

test("bidirectional scroll follows block anchors and can be disabled", async ({
  page,
}) => {
  await openLab(page);
  await ready(page);
  const source = Array.from(
    { length: 35 },
    (_, i) =>
      `## Section ${i}\n\nParagraph ${i}. **A little emphasis.**\n\n> A taller quote.\n> With another line.\n\n`,
  ).join("");
  await replaceSource(page, source);
  await ready(page);
  await page.locator(".cm-scroller").evaluate((node) => {
    node.scrollTop = 1400;
  });
  await expect
    .poll(() =>
      page.locator("#preview-scroll").evaluate((node) => node.scrollTop),
    )
    .toBeGreaterThan(700);
  // At a source heading, the corresponding page heading should align closely.
  const alignment = await page.evaluate(() => {
    const scroller = document.querySelector(".cm-scroller")!;
    const sourceHeading = [
      ...document.querySelectorAll<HTMLElement>(".cm-line"),
    ].find(
      (node) =>
        /^## Section/.test(node.textContent || "") &&
        node.getBoundingClientRect().top >
          scroller.getBoundingClientRect().top + 20,
    );
    if (!sourceHeading) return 9999;
    const title = sourceHeading.textContent!.replace(/^## /, "");
    const heading = [
      ...document.querySelectorAll<HTMLElement>("#preview h2"),
    ].find((node) => node.textContent === title)!;
    const preview = document.querySelector("#preview-scroll")!;
    return Math.abs(
      heading.getBoundingClientRect().top -
        preview.getBoundingClientRect().top -
        (sourceHeading.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top),
    );
  });
  expect(alignment).toBeLessThan(100);
  await page.locator("#preview-scroll").evaluate((node) => {
    node.scrollTop = 4200;
  });
  await expect
    .poll(() => page.locator(".cm-scroller").evaluate((node) => node.scrollTop))
    .toBeGreaterThan(2000);
  await page.getByRole("button", { name: "Sync scrolling", exact: true }).click();
  const fixed = await page
    .locator(".cm-scroller")
    .evaluate((node) => node.scrollTop);
  await page.locator("#preview-scroll").evaluate((node) => {
    node.scrollTop = 0;
  });
  await page.waitForTimeout(120);
  expect(
    await page.locator(".cm-scroller").evaluate((node) => node.scrollTop),
  ).toBeCloseTo(fixed, 0);
});

test("newer source wins over delayed preview and IME input is rendered after composition", async ({
  page,
}) => {
  await openLab(page);
  await ready(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/markdown/preview", async (route) => {
    const body = route.request().postDataJSON();
    if (body.source.includes("OLD_RESPONSE")) {
      await gate;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          html: "<h1>OLD_RESPONSE</h1>",
          engine: "delayed",
          blocks: 1,
          mapping: "source",
          warnings: [],
        }),
      });
    } else await route.continue();
  });
  const pending = page.waitForRequest(
    (req) =>
      req.url().endsWith("/api/markdown/preview") &&
      req.postData()?.includes("OLD_RESPONSE") === true,
  );
  await replaceSource(page, "# OLD_RESPONSE");
  await pending;
  await replaceSource(page, "# 最新中文内容");
  await ready(page);
  release();
  await expect(page.locator("#preview h1")).toHaveText("最新中文内容");
  const source = page.getByRole("textbox", {
    name: "Markdown source",
    exact: true,
  });
  await source.dispatchEvent("compositionstart", { data: "" });
  await source.press("End");
  await page.keyboard.insertText("输入完成");
  await source.dispatchEvent("compositionend", { data: "输入完成" });
  await ready(page);
  await expect(page.locator("#preview h1")).toContainText("输入完成");
});

test("raw HTML is inert and render failures retain recoverable source", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openLab(page);
  await ready(page);
  await replaceSource(
    page,
    '# Safe\n\n<script>window.labExecuted = true</script>\n\n<img src="missing" onerror="window.labExecuted=true">\n\n<style>body{display:none}</style>\n\n<a href="javascript:alert(1)">bad</a>\n\n<div id="engine" data-source-line="-1">Document anchor</div>\n\n[Jump](#engine)\n',
  );
  await ready(page);
  await expect(
    page.locator(
      "#preview script, #preview style, #preview [onerror], #preview a[href^='javascript:']",
    ),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as any).labExecuted),
  ).toBeUndefined();
  await expect(page.locator(".lab-footer #engine")).toContainText("pandoc");
  await expect(
    page.locator("#preview a").filter({ hasText: "Jump" }),
  ).toHaveAttribute("href", "#lab-content-engine");
  expect(errors).toEqual([]);
  await page.route("**/api/markdown/preview", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Pandoc unavailable" }),
    }),
  );
  await replaceSource(page, "# Keep this unsaved source");
  await expect(page.locator("#render-status")).toHaveAttribute(
    "data-state",
    "error",
  );
  await expect(page.locator("#preview-error")).toContainText(
    "Pandoc unavailable",
  );
  expect(await storedSource(page)).toBe("# Keep this unsaved source");
  await expect(page.locator("#preview h1")).toHaveText("Safe");
  await page.unroute("**/api/markdown/preview");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await ready(page);
  await expect(page.locator("#preview h1")).toHaveText(
    "Keep this unsaved source",
  );
  expect(errors).toEqual([]);
});

test("file import/download leaves vault unchanged and layout works on small screens", async ({
  page,
}) => {
  await openLab(page);
  await ready(page);
  const before = await (await page.request.get("/api/pages")).json();
  await page.screenshot({
    path: "test-results/markdown-lab-desktop.png",
    fullPage: true,
  });
  const source = "# Imported source\n\n**Markdown** stays yours.\n";
  await page.locator("#file-input").setInputFiles({
    name: "example.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(source),
  });
  await ready(page);
  await expect(page.locator("#preview h1")).toHaveText("Imported source");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Markdown" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("example.md");
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString()).toBe(source);
  expect(await (await page.request.get("/api/pages")).json()).toEqual(before);
  await page.setViewportSize({ width: 600, height: 820 });
  await expect(page.locator(".source-pane")).toBeVisible();
  await expect(page.locator(".preview-pane")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/markdown-lab-narrow.png",
    fullPage: true,
  });
});
