import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { expectSource } from "./source-helper.js";
async function open(
  page: Page,
  request: APIRequestContext,
  body: string,
  variant: string,
  extensions: Record<string, boolean> = {},
) {
  const res = await request.post("/api/pages", {
    data: {
      title: "Product syntax " + variant,
      body,
      bodyFormat: variant === "notion-markdown" ? "notion-markdown" : "markdown",
      syntax: { version: 1, variant, extensions },
    },
  });
  expect(res.status()).toBe(201);
  const note = await res.json();
  await page.addInitScript((id) => {
    if (window === window.top) localStorage.setItem("notdown-page", id);
  }, note.id);
  await page.goto("/");
  await expect(page.locator(".pm-document")).toBeVisible();
  if (await page.locator("#page-metadata .page-metadata-section").count()) {
    await page.locator(".page-properties > summary").click();
    await page.locator(".page-metadata-summary").click();
  }
  return note;
}

test("MMD metadata applies restricted text semantics and live normalized variables", async ({ page, request }) => {
  const body = '---\nBase Header Level: 002\nFlag: true\nList: [a, b]\nTitle: **Literal**\n...\n\nValue [%base headerlevel]';
  const note = await open(page, request, body, 'markdown_mmd');
  const metadata = page.locator('.page-metadata-dialog');
  await expect(metadata).toContainText('**Literal**');
  await expect(metadata.locator('strong')).toHaveCount(0);
  await expect(page.locator('.pm-document')).toContainText('Value 002');
  await metadata.getByRole('textbox', { name: 'Metadata source', exact: true }).click();
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText(body.split('\n\n')[0].replace('002', '003'));
  await metadata.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.pm-document')).toContainText('Value 003');
  await page.locator('[data-mode=source]').click();
  await expectSource(page, /Base Header Level: 003/);
  await page.locator('[data-mode=document]').click();
  await expect.poll(async () => (await (await request.get('/api/pages/' + note.id)).json()).body).toContain('Base Header Level: 003');
  await page.reload();
  await expect(page.locator('.pm-document')).toContainText('Value 003');
  expect((await (await request.get('/api/pages/' + note.id)).json()).title).toBe(note.title);
});

test("shared MMD table supports direct cell and caption edits, undo and reopening", async ({ page, request }) => {
  const body = '| A | B | C |\n| --- | --- | --- |\n| Wide || right |\n| ^^ || bottom |\n[Caption][table-id]\n\nTail';
  const note = await open(page, request, body, 'markdown_mmd');
  const table = page.locator('.pm-document table[data-table-encoding=mmd]');
  const cell = table.locator('td[colspan="2"][rowspan="2"]');
  await expect(cell).toHaveText('Wide');
  await cell.locator('p').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' edited');
  await expect(cell).toHaveText('Wide edited');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(cell).toHaveText('Wide');
  await table.locator('caption').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' revised');
  await page.locator('[data-mode=source]').click();
  await expectSource(page, /\[Caption revised\]\[table-id\]/);
  await page.locator('[data-mode=document]').click();
  await expect.poll(async () => (await (await request.get('/api/pages/' + note.id)).json()).body).toContain('[Caption revised][table-id]');
  await page.reload();
  await expect(table.locator('caption')).toHaveText('Caption revised');
  await expect(table.locator('caption')).toHaveAttribute('id', 'tableid');
  await expect(cell).toHaveText('Wide');
  await table.locator('td').last().locator('p').click();
  await page.keyboard.press('Tab');
  await page.keyboard.type('New row');
  await expect(table.locator('tr').last()).toContainText('New row');
  await expect.poll(async () => (await (await request.get('/api/pages/' + note.id)).json()).body).toContain('New row');
  await page.reload();
  await expect(table.locator('tr').last()).toContainText('New row');
});

test("separate list item nodes retain types after mixed nesting, splitting and saving", async ({ page, request }) => {
  const note = await open(page, request, '- Bullet\n- [x] Task\n\n4. Number', 'gfm');
  const root = page.locator('.pm-document');
  await expect(root.locator('li[data-list-item=bullet]')).toHaveCount(1);
  await expect(root.locator('li[data-list-item=numbered]')).toHaveCount(1);
  const task = root.locator('li[data-list-item=task]');
  await task.locator('p').click();
  await page.keyboard.press('Tab');
  await expect(root.locator('li[data-list-item=bullet] li[data-list-item=task]')).toHaveCount(1);
  await page.keyboard.press('Shift+Tab');
  await expect(root.locator('li[data-list-item=bullet] li')).toHaveCount(0);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Next task');
  await expect(task).toHaveCount(2);
  await expect(task.last().locator('input[type=checkbox]')).not.toBeChecked();
  await expect.poll(async () => (await (await request.get('/api/pages/' + note.id)).json()).body).toContain('Next task');
  await page.reload();
  await expect(task).toHaveCount(2);
  await expect(root.locator('li[data-list-item=numbered]')).toHaveCount(1);
});

test("unified Callout persists fold edits and TOC updates share the same editor view", async ({ page, request }) => {
  const body = '{{TOC:2-3}}\n\n# Excluded\n\n## Included\n\n> [!custom]- Details\n> A **note**\n>\n> - Nested\n\nTail';
  const note = await open(page, request, body, "obsidian", { notion_callouts: true, notion_toc: true, toc_directives: true });
  const root = page.locator('.pm-document');
  const callout = root.locator('details.pm-callout');
  await expect(callout).not.toHaveAttribute('open');
  await expect(root.locator('.pm-toc button')).toHaveText('Included');
  await callout.locator('.pm-alert-fold').click();
  await expect(callout).toHaveAttribute('open');
  await expect.poll(async () => (await (await request.get('/api/pages/' + note.id)).json()).body).toContain('[!custom]+ Details');
  const paragraph = callout.locator('p').filter({ hasText: 'A note' });
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' edited');
  // Switching views must collect pending DOM input before serialization.
  await page.locator('[data-mode="source"]').click();
  await expectSource(page, /A \*\*note edited\*\*/);
  await page.locator('[data-mode="document"]').click();
  await expect(callout).toContainText('A note edited');
  await root.locator('h2').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' renamed');
  await expect(root.locator('.pm-toc button')).toHaveText('Included renamed');
  await expect.poll(async () => (await (await request.get('/api/pages/' + note.id)).json()).body).toContain('Included renamed');
  await page.reload();
  await expect(callout).toHaveAttribute('open');
  await expect(callout).toContainText('A note edited');
  await expect(root.locator('.pm-toc button')).toHaveText('Included renamed');
  await root.locator('p').filter({ hasText: /^Tail$/ }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/admonition');
  await expect(page.locator('[data-insert="callout"]')).toHaveCount(1);
  await expect(page.locator('[data-insert="alert"]')).toHaveCount(0);
  await page.locator('[data-insert="callout"]').click();
  await expect(root.locator('.pm-callout')).toHaveCount(2);
  await expect.poll(async () => (await (await request.get('/api/pages/' + note.id)).json()).body).toContain('[!NOTE]');
});
for (const variant of ['gfm', 'typora', 'notion-markdown']) {
  test(`${variant}: table cells use inline breaks and suppress block insertion`, async ({ page, request }) => {
    const note = await open(page, request, '| A | B |\n| --- | --- |\n| first<br>start | |', variant);
    const cell = page.locator('.pm-document td').nth(2);
    await page.locator('.pm-document td').nth(3).click();
    await expect(page.locator('.pm-document td [data-placeholder]')).toHaveCount(0);
    await expect(cell.locator('.pm-html-inline')).toHaveCount(0);
    await cell.locator('p').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    await expect(page.locator('.insert-grid')).not.toBeVisible();
    await page.keyboard.press('Backspace');
    await page.keyboard.type('second');
    await expect(cell.locator('p')).toHaveCount(1);
    await expect(cell.locator('br')).toHaveCount(2);
    await cell.evaluate(el => {
      const data = new DataTransfer();
      data.setData('text/html', '<h2>Heading</h2><ul><li>Item</li></ul>');
      data.setData('text/plain', 'Heading\nItem');
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect(cell).toContainText('Heading');
    await expect(cell).toContainText('Item');
    await expect(cell.locator('h2, ul, li')).toHaveCount(0);
    await expect(cell.locator('p')).toHaveCount(1);
    await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain('second');
    await page.reload();
    await expect(cell).toContainText('second');
    await expect(cell).toContainText('Heading');
    await expect(cell.locator('p')).toHaveCount(1);
  });
}

test("Typora shows extra blank lines and preserves them through editing and dialect changes", async ({ page, request }) => {
  const body = 'first\n\nsecond\n\n\n\nthird\nsoft';
  const note = await open(page, request, body, 'typora');
  const paragraphs = page.locator('.pm-document > p');
  await expect(paragraphs).toHaveCount(4);
  await expect(paragraphs.nth(2)).toHaveText('');
  await paragraphs.nth(2).click();
  await page.keyboard.press('Enter');
  await expect(paragraphs).toHaveCount(5);
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body.replace('second\n\n\n\nthird', 'second\n\n\n\n\n\nthird'));
  await page.keyboard.press('ControlOrMeta+z');
  await expect(paragraphs).toHaveCount(4);
  await paragraphs.nth(2).click();
  await page.keyboard.type('filled');
  await expect(paragraphs.nth(2)).toHaveText('filled');
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body.replace('second\n\n\n\nthird', 'second\n\nfilled\n\nthird'));
  await page.keyboard.press('ControlOrMeta+z');
  await expect(paragraphs.nth(2)).toHaveText('');
  await paragraphs.nth(2).click();
  await page.keyboard.press('Backspace');
  await expect(paragraphs).toHaveCount(3);
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body.replace('second\n\n\n\nthird', 'second\n\nthird'));
  await page.keyboard.press('ControlOrMeta+z');
  await expect(paragraphs).toHaveCount(4);
  await expect(paragraphs.last().locator('br')).toHaveCount(1);
  await page.locator('.pm-document > p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body.replace('first', 'first!'));
  await page.reload();
  await expect(paragraphs).toHaveCount(4);
  await page.getByRole('combobox', { name: 'Markdown dialect', exact: true }).selectOption('commonmark');
  await expect(paragraphs).toHaveCount(3);
  await page.getByRole('combobox', { name: 'Markdown dialect', exact: true }).selectOption('typora');
  await expect(paragraphs).toHaveCount(4);
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await expectSource(page, body.replace('first', 'first!'));
});

test("Obsidian shows soft line breaks and can enable strict line breaks", async ({ page, request }) => {
  const body = 'first\nsecond\n\n- item\n  continuation';
  const note = await open(page, request, body, 'obsidian');
  const breaks = page.locator('.pm-document br:not(.ProseMirror-trailingBreak)');
  await expect(breaks).toHaveCount(2);
  await page.locator('.syntax-options summary').click();
  await page.locator('[data-extension="hard_line_breaks"]').uncheck();
  await expect(breaks).toHaveCount(0);
  await page.locator('[data-extension="hard_line_breaks"]').check();
  await expect(breaks).toHaveCount(2);
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
  await page.reload();
  await expect(breaks).toHaveCount(2);
});

test("Typora footnotes at document end, separate alerts, readable diagrams and unresolved links", async ({ page, request }) => {
  const body = 'Start[^note]\n\n[^note]: Footnote body\n\n> [!NOTE]\n> First alert\n\n> [!TIP]\n> Second alert\n\n```mermaid\nflowchart TD\nA[Start] --> B[Finish]\n```\n\n[undefined reference][missing]\n\ntext[^absent]\n\nEnd of body';
  const note = await open(page, request, body, 'typora', { alerts: true, diagrams: true });
  const root = page.locator('.pm-document');
  const foot = root.locator('.pm-footnote');
  const end = root.getByText('End of body', { exact: true });
  await expect(foot).toBeVisible();
  await expect(end).toBeVisible();
  expect((await foot.boundingBox())!.y).toBeGreaterThan((await end.boundingBox())!.y);
  const alerts = root.locator('.pm-alert');
  const first = (await alerts.nth(0).boundingBox())!;
  const second = (await alerts.nth(1).boundingBox())!;
  expect(second.y - first.y - first.height).toBeGreaterThanOrEqual(10);
  const svg = root.locator('.pm-syntax-preview > svg');
  await expect(svg).toBeVisible();
  expect((await svg.boundingBox())!.width).toBeGreaterThan(100);
  expect((await svg.boundingBox())!.height).toBeGreaterThan(80);
  await expect(root.locator('.pm-unresolved-reference')).toHaveText('undefined reference');
  await expect(root.locator('.pm-unresolved-reference')).not.toHaveAttribute('href');
  await expect(root).toContainText('text[^absent]');
  await foot.locator('p').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' edited');
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain('[^note]: Footnote body edited');
  const saved = (await (await request.get(`/api/pages/${note.id}`)).json()).body;
  expect(saved.indexOf('[^note]:')).toBeLessThan(saved.indexOf('> [!NOTE]'));
  expect(saved).toContain('[undefined reference][missing]');
  await page.reload();
  await expect(foot).toContainText('Footnote body edited');
  expect((await foot.boundingBox())!.y).toBeGreaterThan((await end.boundingBox())!.y);
});

test("Typora screenshot regressions: limited escapes and literal ordered tasks in both parsing and typing", async ({ page, request }) => {
  const body = 'Escapes: \\% \\& \\$ \\~\n\n1. [ ] ordered\n2. [x] completed\n\n- [ ] bullet task\n\n1. type-here';
  const note = await open(page, request, body, "typora");
  const root = page.locator('.pm-document');
  await expect(root.locator('p').first()).toHaveText('Escapes: \\% \\& $ ~');
  await expect(root.locator('ol').first()).toContainText('[ ] ordered');
  await expect(root.locator('ol input[type=checkbox]')).toHaveCount(0);
  await expect(root.locator('ul input[type=checkbox]')).toHaveCount(1);
  await root.locator('ol').last().locator('p').click();
  await page.keyboard.press('Home');
  await page.keyboard.type('[ ] ');
  await expect(root.locator('ol').last()).toContainText('[ ] type-here');
  await expect(root.locator('ol input[type=checkbox]')).toHaveCount(0);
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain('type-here');
  // Source may escape the literal brackets when this item is rewritten.
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).revision).not.toBe(note.revision);
  await page.reload();
  await expect(root.locator('ol').last()).toContainText('[ ] type-here');
  await expect(root.locator('ol input[type=checkbox]')).toHaveCount(0);
});

test("Typora nested task parents toggle and persist; filtered HTML keeps editable source", async ({ page, request }) => {
  const body = '- [ ] unchecked\n- [x] lowercase\n- [X] uppercase\n- [ ] parent\n  - [x] child\n  - [ ] another child\n\n<textarea>PROBE textarea text</textarea>\n\n<style>/* probe */</style>\n\n<script type="application/json">{"probe":1}</script>\n\n<title>PROBE title text</title>';
  const note = await open(page, request, body, "typora");
  const root = page.locator(".pm-document");
  await expect(root.locator('li[data-checked] input[type="checkbox"]')).toHaveCount(6);
  const first = root.locator('li[data-checked] input[type="checkbox"]').first();
  await expect(first).not.toBeChecked();
  await first.check();
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain('- [x] unchecked');
  await expect(root.locator(".pm-html-empty")).toHaveCount(0);
  await expect(root.getByRole('textbox', { name: 'HTML text area preview' })).toHaveValue('PROBE textarea text');
  await expect(root.locator('.pm-html-preview').nth(1)).toBeEmpty();
  await expect(root.locator('.pm-html-preview').nth(2)).toBeEmpty();
  const html = root.locator(".pm-html-block").first();
  await html.hover();
  await html.getByRole("button", { name: "HTML source" }).click();
  await expect(html.getByRole("textbox", { name: "HTML block source" })).toHaveText('<textarea>PROBE textarea text</textarea>');
  await html.getByRole("textbox", { name: "HTML block source" }).fill('<p>Visible content</p>');
  await expect(html.locator(".pm-html-preview")).toHaveText("Visible content");
  await expect(html.locator(".pm-html-empty")).toHaveCount(0);
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain('<p>Visible content</p>');
  await page.reload();
  await expect(root.locator('li[data-checked] input[type="checkbox"]').first()).toBeChecked();
  await expect(root.locator('li[data-checked] input[type="checkbox"]')).toHaveCount(6);
  await expect(root).toContainText("Visible content");
});

test("uploaded fixture images and textarea render; inline HTML hides tags in Typora", async ({ page, request }) => {
  const png = await fs.readFile(new URL('../../docs/fixtures/typora-comparison-image.png', import.meta.url));
  const uploaded = await request.post('/api/assets', { data: { name: 'fixture.png', contentType: 'image/png', data: png.toString('base64') } });
  expect(uploaded.status()).toBe(201);
  const asset = await uploaded.json();
  const body = `![inline](${asset.path})\n\n![reference][image-ref]\n\n[image-ref]: ${asset.path}\n\n<textarea rows="5" cols="33">A &amp; B &lt;b&gt;text&lt;/b&gt;</textarea>\n\n<xmp>PROBE xmp text</xmp>\n\n<noembed>PROBE noembed text</noembed>`;
  await open(page, request, body, 'typora');
  const root = page.locator('.pm-document');
  const images = root.locator('img[alt="inline"], img[alt="reference"]');
  await expect(images).toHaveCount(2);
  for (const img of await images.all())
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth === 240)).toBe(true);
  const textarea = root.getByRole('textbox', { name: 'HTML text area preview' });
  await expect(textarea).toHaveValue('A & B <b>text</b>');
  await expect(textarea).toHaveAttribute('rows', '5');
  await expect(textarea).toHaveAttribute('cols', '33');
  await expect(textarea).toHaveAttribute('readonly', '');
  await expect(root.locator('.pm-html-inline').nth(0)).toHaveText('PROBE xmp text');
  await expect(root.locator('.pm-html-inline').nth(1)).toHaveText('PROBE noembed text');
});

test("Typora comparison links are visible and open with a left click; parentheses stay prose", async ({ page, request }) => {
  await open(page, request, '<https://example.com/angle>\n\n<address@example.com>\n\n[ordinary](https://example.com/ordinary)\n\n[reference][ref]\n\n[ref]: https://example.com/ref\n\nhttps://example.com/bare\n\n1) first\n2) second\n\nfirst line\nsecond line\n\nType here', "typora");
  const root = page.locator(".pm-document");
  await expect(root.locator("a")).toHaveCount(5);
  await expect(root.locator(".pm-opaque")).toHaveCount(0);
  await expect(root.locator("ol")).toHaveCount(0);
  await expect(root.getByRole("link", { name: "ordinary", exact: true })).toHaveCSS("text-decoration-line", "underline");
  await expect(root.locator("p").filter({ hasText: "first line" }).locator("br")).toHaveCount(1);
  await page.evaluate(() => {
    (window as any).__openedLinks = [];
    window.open = ((...args: any[]) => { (window as any).__openedLinks.push(args); return null; }) as typeof window.open;
  });
  const opened: string[][] = [];
  for (const link of await root.locator("a").all()) {
    const href = await link.getAttribute("href");
    await expect(link).toHaveAttribute("title", `${href} · Click to open link`);
    await link.click();
    opened.push([href!, "_blank", "noopener,noreferrer"]);
    expect(await page.evaluate(() => (window as any).__openedLinks)).toEqual(opened);
  }
  const tail = root.locator("p").filter({ hasText: "Type here" });
  await tail.click();
  await page.keyboard.press("Home");
  await page.keyboard.type("1) ");
  await expect(root.locator("ol")).toHaveCount(0);
});

test("Typora renders diagrams, alerts, attributes, anchors and isolated iframe; source edits and undo remain live", async ({
  page,
  request,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://example.com/embed", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Embedded content</h1>",
    }),
  );
  const body =
    '# Target\n\n[toc]\n\n[Jump](#target)\n\n> [!NOTE]\n> Useful **alert**\n\n==Marked== H~2~O X^2^ :smile:\n\n```mermaid\nflowchart LR\nA[Start] --> B[Finish]\n```\n\n```sequence\nAlice->Bob: Hello\n```\n\n```flow\ns=>start: Start\ne=>end: End\ns->e\n```\n\n<iframe src="https://example.com/embed" title="Demo"></iframe>\n\nTail';
  const note = await open(page, request, body, "typora", { alerts: true, diagrams: true, highlight: true, subscript: true, superscript: true });
  await expect(page.locator(".pm-alert")).toContainText("Useful alert");
  await expect(page.locator(".pm-document mark")).toHaveText("Marked");
  await expect(page.locator("[data-syntax-kind=diagram] svg")).toHaveCount(3, {
    timeout: 25000,
  });
  await expect(
    page.locator("[data-syntax-kind=diagram]").first(),
  ).toContainText("Start");
  await expect(
    page.frameLocator("iframe[title=Demo]").locator("h1"),
  ).toHaveText("Embedded content");
  await expect(page.locator("iframe[title=Demo]")).toHaveAttribute(
    "sandbox",
    /allow-scripts/,
  );
  await expect(page.locator("iframe[title=Demo]")).not.toHaveAttribute(
    "sandbox",
    /allow-same-origin/,
  );
  await expect(page.locator(".pm-toc button")).toHaveText("Target");
  await page.getByRole("link", { name: "Jump", exact: true }).click();
  await expect(page.locator(".pm-document h1")).toBeInViewport();
  const diagram = page.locator("[data-syntax-kind=diagram]").first();
  await diagram.getByRole("button", { name: "Edit source" }).click();
  const input = diagram.locator("textarea");
  await input.fill("```mermaid\nflowchart LR\nA[Changed] --> B[Finish]\n```");
  await expect(diagram).toContainText("Changed");
  await input.press("Control+z");
  await expect(diagram).toContainText("Start");
  await input.press("Control+Shift+z");
  await expect(diagram).toContainText("Changed");
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () =>
        (await (await request.get("/api/pages/" + note.id)).json()).body,
    )
    .toContain("A[Changed]");
  await page.reload();
  await expect(page.getByLabel("Markdown dialect", { exact: true })).toHaveValue(
    "typora",
  );
  await expect(
    page.locator("[data-syntax-kind=diagram]").first(),
  ).toContainText("Changed");
  expect(errors).toEqual([]);
});
test("PHP Extra and MultiMarkdown attributes and rich source blocks survive editing", async ({
  page,
  request,
}) => {
  const body =
    '## Heading {#custom .main lang=fr}\n\n[Go](#custom)\n\n<div markdown="1">\nThis is *true* Markdown.\n</div>\n\n~~~ {.html #code-id}\n<b>example</b>\n~~~\n\nTail';
  const note = await open(page, request, body, "markdown_phpextra", {
    fenced_code_attributes: true,
  });
  await expect(page.locator("[data-md-id=custom]")).toHaveAttribute(
    "lang",
    "fr",
  );
  await expect(page.locator("[data-md-id=code-id]")).toBeVisible();
  await expect(page.locator("[data-syntax-kind=html-markdown] em")).toHaveText(
    "true",
  );
  await page.locator(".pm-document h2").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" edited");
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () =>
        (await (await request.get("/api/pages/" + note.id)).json()).body,
    )
    .toContain('{#custom .main lang="fr"}');
  await page.reload();
  await expect(page.locator("[data-md-id=custom]")).toContainText(
    "Heading edited",
  );
});
test("Obsidian comments stay hidden and Markdown file links navigate to pages", async ({
  page,
  request,
}) => {
  const res = await request.post("/api/pages", {
    data: { title: "linked note", body: "Destination" },
  });
  const target = await res.json();
  const body =
    "# Obsidian\n\nBefore %%secret%% after\n\n%%\nblock secret\n%%\n\n[[linked note]]\n\n[File link](linked%20note.md)";
  await open(page, request, body, "obsidian");
  await expect(page.locator(".pm-document")).toContainText("Before");
  await expect(page.locator(".pm-comment")).toBeHidden();
  await expect(page.locator(".pm-document")).not.toContainText("block secret");
  await page.getByRole("link", { name: "File link", exact: true }).click();
  await expect(page.locator(".pm-document")).toContainText("Destination");
});
test("MMD metadata variables, bibliography, complex tables and file dependencies render and refresh", async ({
  page,
  request,
}) => {
  test.setTimeout(45000);
  const status = await (await request.get("/api/status")).json();
  expect(path.basename(status.vaultPath)).toMatch(/^notdown-e2e-/);
  await fs.writeFile(
    path.join(status.vaultPath, "fragment.txt"),
    "## Included\n\nInitial file",
  );
  await fs.writeFile(
    path.join(status.vaultPath, "refs.bib"),
    "@book{doe, author={John Doe}, title={The Book}, year=2006}",
  );
  const body =
    "foo: first\nbibliography: refs.bib\n\n# Heading\n\n{{TOC}}\n\nValue [%foo].\n\n{~~old~>new~~} [#doe]\n\n{{fragment.*}}\n\nInline {{fragment.txt}} end.\n\n| Group ||\n| A | B |\n| --- | --- |\n| Joined ||\n[Caption]\n\nTail";
  const note = await open(page, request, body, "markdown_mmd");
  await expect(page.locator(".page-metadata-dialog")).toContainText(
    "first",
  );
  await expect(page.locator(".pm-document")).toContainText("Value first.");
  await expect(page.locator(".md-bibliography")).toContainText("The Book");
  await expect(page.locator("[data-syntax-kind=transclusion]")).toContainText(
    "Initial file",
  );
  await fs.writeFile(
    path.join(status.vaultPath, "fragment.txt"),
    "## Included\n\nUpdated file",
  );
  await expect(page.locator("[data-syntax-kind=transclusion]")).toContainText(
    "Updated file",
    { timeout: 12000 },
  );
  await expect(page.locator(".md-inline-transclusion")).toContainText(
    "Updated file",
    { timeout: 12000 },
  );
  await expect(
    page.locator('table[data-table-encoding=mmd] td[colspan="2"]'),
  ).toContainText("Joined");
  await expect(page.locator("table[data-table-encoding=mmd] caption")).toHaveText(
    "Caption",
  );
  const metadata = page.locator(".page-metadata-dialog");
  await metadata.getByRole("textbox", { name: "Metadata source", exact: true }).click();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText("foo: second\nbibliography: refs.bib");
  await metadata.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".pm-document")).toContainText("Value second.");
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () =>
        (await (await request.get("/api/pages/" + note.id)).json()).body,
    )
    .toContain("foo: second");
  await page.screenshot({
    path: "test-results/product-syntax.png",
    fullPage: true,
  });
});

test("product Slash blocks drag and extension changes preserve source across modes", async ({
  page,
  request,
}) => {
  const note = await open(page, request, "Tail", "typora", { alerts: true, diagrams: true });
  for (const [command, selector] of [
    ["callout", ".pm-alert"],
    ["diagram", "[data-syntax-kind=diagram]"],
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
  await page
    .locator("[data-syntax-kind=diagram]")
    .hover({ position: { x: 2, y: 10 } });
  await page
    .locator(".pm-block-handle")
    .dragTo(page.locator(".pm-document > p").filter({ hasText: /^Tail$/ }), {
      targetPosition: { x: 8, y: 28 },
    });
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () =>
        (await (await request.get("/api/pages/" + note.id)).json()).body,
    )
    .toMatch(/Tail[\s\S]*```mermaid/);
  const saved = (await (await request.get("/api/pages/" + note.id)).json())
    .body;
  await page.locator(".syntax-options summary").click();
  await page.locator("[data-extension=diagrams]").uncheck();
  await expect(page.locator("[data-syntax-kind=diagram]")).toHaveCount(0);
  await expect(page.locator(".pm-document pre")).toBeVisible();
  await page.locator(".syntax-options summary").click();
  for (const mode of ["split", "source", "document"]) {
    await page.locator(`[data-mode=${mode}]`).click();
  }
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () =>
        (await (await request.get("/api/pages/" + note.id)).json()).body,
    )
    .toBe(saved);
  await page.reload();
  await expect(page.getByLabel("Markdown dialect", { exact: true })).toHaveValue(
    "typora",
  );
  await page.locator(".syntax-options summary").click();
  await page.locator("[data-extension=diagrams]").check();
  await expect(page.locator("[data-syntax-kind=diagram] svg")).toHaveCount(1);
});

test("definition source edits refresh inline references without changing their syntax", async ({
  page,
  request,
}) => {
  await open(
    page,
    request,
    "[>MMD] [#doe]\n\n[>MMD]: First abbreviation\n\n[#doe]: First citation",
    "markdown_mmd",
  );
  const definitions = page.locator("[data-syntax-kind=definition]");
  await definitions.first().getByRole("button", { name: "Edit source" }).click();
  await definitions
    .first()
    .locator("textarea")
    .fill("[>MMD]: Updated abbreviation");
  await expect(
    page.locator(".pm-syntax-inline").filter({ hasText: /^MMD$/ }),
  ).toHaveAttribute("title", "Updated abbreviation");
  await page.locator(".md-bibliography").getByRole("button", { name: "Edit definition" }).click();
  await page.getByRole("textbox", { name: "Definition source" }).fill("[#doe]: Updated citation");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.locator(".pm-syntax-inline").filter({ hasText: /^\(1\)$/ }),
  ).toHaveAttribute("title", "Updated citation");
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expectSource(page, /\[>MMD\] \[#doe\]/);
});
