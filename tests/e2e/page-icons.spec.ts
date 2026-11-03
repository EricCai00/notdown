import { test, expect } from "@playwright/test";

test("child page rows align mixed icons, titles and arrows across emoji styles and window widths", async ({ page, request }) => {
  const parent = await (await request.post("/api/pages", { data: { title: "Child icon alignment", body: "" } })).json();
  const upload = await request.post("/api/assets", { data: {
    name: "child-icon.svg", contentType: "image/svg+xml",
    data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16"><rect width="24" height="16" fill="#2383e2"/></svg>').toString("base64"),
  } });
  expect(upload.status()).toBe(201);
  const asset = await upload.json();
  const children = [];
  for (const [title, icon] of [["Blocks", "🧱"], ["New database", "table-2"], ["New page", ""], ["Note apps", "📝"], ["Image " + "long title ".repeat(30), asset.path]]) {
    const response = await request.post("/api/pages", { data: { title, icon, parent: parent.id, body: "" } });
    expect(response.status()).toBe(201);
    children.push(await response.json());
  }
  await page.goto(`/#page/${parent.id}`);
  const list = page.locator("#children-links");
  await expect(list.locator(".child-card")).toHaveCount(5);
  await expect(list.locator("details")).toHaveAttribute("open", "");
  for (const style of ["system", "noto", "openmoji"]) {
    await page.evaluate(style => document.documentElement.dataset.emojiStyle = style, style);
    for (const width of [1440, 600]) {
      await page.setViewportSize({ width, height: 1000 });
      await list.scrollIntoViewIfNeeded();
      await page.evaluate(() => document.fonts.ready);
      const bounds = await list.locator(".child-card").evaluateAll(rows => rows.map(row => {
        const icon = row.querySelector(".page-link-icon")!.getBoundingClientRect();
        const title = row.querySelector("span:not(.page-link-icon)")!;
        const text = title.getBoundingClientRect(), arrow = row.lastElementChild!.getBoundingClientRect();
        return { titleX: text.left, iconX: (icon.left + icon.right) / 2, iconRight: icon.right,
          textRight: text.right, arrowX: arrow.left, arrowRight: arrow.right, rowRight: row.getBoundingClientRect().right,
          textWidth: title.clientWidth, textScrollWidth: title.scrollWidth };
      }));
      for (const row of bounds) {
        expect(row.titleX).toBeCloseTo(bounds[0].titleX, 0);
        expect(row.iconX).toBeCloseTo(bounds[0].iconX, 0);
        expect(row.arrowX).toBeCloseTo(bounds[0].arrowX, 0);
        expect(row.iconRight).toBeLessThan(row.titleX);
        expect(row.textRight).toBeLessThan(row.arrowX);
        expect(row.arrowRight).toBeLessThanOrEqual(row.rowRight);
      }
      expect(bounds.some(row => row.textScrollWidth > row.textWidth)).toBe(true);
      await list.screenshot({ path: `test-results/child-icon-alignment-${style}-${width}.png` });
    }
  }
  await list.locator("summary").click();
  await expect(list.locator(".child-card").first()).toBeHidden();
  await list.locator("summary").click();
  await list.locator(`[data-open="${children[0].id}"]`).click();
  await expect(page.locator("#page-title")).toHaveValue(children[0].title);
});

test("search keeps emoji, Lucide, image and default icons beside their titles", async ({ page, request }) => {
  const upload = await request.post("/api/assets", { data: {
    name: "search-icon.svg", contentType: "image/svg+xml",
    data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#2383e2"/></svg>').toString("base64"),
  } });
  expect(upload.status()).toBe(201);
  const asset = await upload.json();
  const notes = [];
  for (const [label, icon] of [["Emoji 🧪", "🧪"], ["Lucide", "book-open"], ["Image", asset.path], ["Default", ""]]) {
    const response = await request.post("/api/pages", { data: { title: `Spacing ${label}`, icon, body: "Spacing search snippet" } });
    expect(response.status()).toBe(201);
    notes.push(await response.json());
  }
  await page.goto("/#vault/gallery");
  await expect(page.locator("#library-results")).toBeVisible();
  await page.evaluate(ids => localStorage.setItem("notdown-recent-pages", JSON.stringify(ids)), notes.map(note => note.id));
  await page.keyboard.press("Control+p");
  const search = page.getByRole("combobox", { name: "Search vault" });
  await expect(search).toBeVisible();
  for (const width of [1440, 600]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const query of ["", "Spacing"]) {
      await search.fill(query);
      await page.evaluate(() => document.fonts.ready);
      const titleOffsets = [];
      for (const note of notes) {
        const row = page.locator(`#search-results [data-open="${note.id}"]`);
        await expect(row).toBeVisible();
        const bounds = await row.evaluate(button => {
          const icon = button.querySelector(".page-link-icon")!.getBoundingClientRect();
          const title = button.querySelector("strong")!.getBoundingClientRect();
          const arrow = button.lastElementChild!.getBoundingClientRect();
          return { iconWidth: icon.width, gap: title.left - icon.right, titleOffset: title.left - button.getBoundingClientRect().left,
            textRight: title.right, arrowLeft: arrow.left, arrowRight: arrow.right, rowRight: button.getBoundingClientRect().right };
        });
        expect(bounds.iconWidth).toBeCloseTo(20, 0);
        expect(bounds.gap).toBeCloseTo(12, 0);
        expect(bounds.textRight).toBeLessThanOrEqual(bounds.arrowLeft);
        expect(bounds.arrowRight).toBeLessThanOrEqual(bounds.rowRight);
        titleOffsets.push(bounds.titleOffset);
      }
      expect(Math.max(...titleOffsets) - Math.min(...titleOffsets)).toBeLessThanOrEqual(1);
      await page.getByRole("dialog", { name: "Search vault", exact: true }).screenshot({ path: `test-results/search-icon-spacing-${width}-${query ? "matches" : "recent"}.png` });
    }
  }
  const nextId = await page.locator("#search-results [role=option]").nth(1).getAttribute("data-open");
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(page).toHaveURL(new RegExp(`#page/${nextId}$`));
});

for (const style of ["system", "noto", "openmoji"]) test(`bare Notion emoji uses emoji presentation on every page icon surface (${style})`, async ({ page, request }) => {
  await page.addInitScript(style => localStorage.setItem("notdown-emoji-style", style), style);
  const note = await (await request.post("/api/pages", { data: { title: "Genomics", icon: "⚗", body: "Imported page icon" } })).json();
  await page.goto(`/#page/${note.id}`);
  const emblem = page.getByRole("button", { name: "Change page icon", exact: true });
  for (const host of [emblem, page.locator(`#page-tree .tree-page[data-open="${note.id}"]`), page.locator('#breadcrumb [aria-current="page"]'), page.locator('#workspace-tabs [role="tab"][aria-selected="true"]')]) {
    await expect(host.locator(".emoji")).toHaveText("⚗️");
  }
  await page.evaluate(() => document.fonts.ready);
  await emblem.screenshot({ path: `test-results/page-icon-alembic-${style}.png` });
  // Display qualification must not rewrite the imported metadata, including after a save.
  await page.locator("#page-title").fill("Genomics icon checked");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).title).toBe("Genomics icon checked");
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).icon).toBe("⚗");
  await page.reload();
  await expect(emblem.locator(".emoji")).toHaveText("⚗️");
});

for (const style of ["system", "noto", "openmoji"]) test(`page icon hover contains the ${style} glyph and stays clear of Add cover`, async ({ page, request }) => {
  await page.addInitScript(style => localStorage.setItem("notdown-emoji-style", style), style);
  const note = await (await request.post("/api/pages", { data: { title: "Obsidian", icon: "✅", body: "Icon spacing" } })).json();
  await page.goto(`/#page/${note.id}`);
  const emblem = page.getByRole("button", { name: "Change page icon", exact: true });
  for (const width of [1440, 600]) {
    await page.setViewportSize({ width, height: 1000 });
    await emblem.hover();
    await page.evaluate(() => document.fonts.ready);
    const bounds = await emblem.evaluate(button => {
      const range = document.createRange();
      range.selectNodeContents(button.querySelector(".emoji")!);
      const glyph = range.getBoundingClientRect();
      const box = button.getBoundingClientRect();
      const action = document.querySelector(".page-decoration-actions")!.getBoundingClientRect();
      const title = document.querySelector("#page-title")!.getBoundingClientRect();
      return { top: glyph.top - box.top, bottom: box.bottom - glyph.bottom,
        left: glyph.left - box.left, right: box.right - glyph.right, gap: action.top - box.bottom,
        titleGap: title.top - box.bottom, actionBottom: action.bottom, titleY: title.y };
    });
    for (const side of [bounds.top, bounds.bottom, bounds.left, bounds.right]) expect(side).toBeGreaterThanOrEqual(2);
    expect(bounds.gap).toBeGreaterThanOrEqual(0);
    expect(bounds.titleGap).toBeGreaterThanOrEqual(32);
    expect(bounds.titleGap).toBeLessThanOrEqual(34);
    expect(bounds.actionBottom).toBeLessThanOrEqual(bounds.titleY);
    await page.screenshot({ path: `test-results/page-icon-hover-${style}-${width}.png` });
    await page.getByRole("button", { name: "Add cover", exact: true }).hover();
    await page.screenshot({ path: `test-results/page-icon-cover-gap-${style}-${width}.png` });
    await page.mouse.move(0, 0);
    expect((await page.locator("#page-title").boundingBox())!.y).toBe(bounds.titleY);
  }
});

test("Notion reference keeps the icon, action row and title vertically aligned", async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem("notdown-emoji-style", "noto"));
  const note = await (await request.post("/api/pages", { data: {
    title: "同步数据", icon: "💾", body: "## 移动硬盘\n\n- [x] 新增文件\n- [x] 其他资料",
  } })).json();
  await page.goto(`/#page/${note.id}`);
  const title = page.locator("#page-title");
  await expect(title).toHaveValue("同步数据");
  await page.evaluate(() => document.fonts.ready);
  const header = page.locator(".page-header");
  const box = (await header.boundingBox())!;
  const clip = { x: box.x - 20, y: box.y, width: 450, height: box.height + 8 };
  await page.mouse.move(0, 0);
  await page.screenshot({ path: "test-results/page-header-notion-idle.png", clip });
  const titleY = (await title.boundingBox())!.y;
  await title.hover();
  await expect(page.locator(".page-decoration-actions")).toHaveCSS("opacity", "1");
  expect((await title.boundingBox())!.y).toBe(titleY);
  await page.screenshot({ path: "test-results/page-header-notion-hover.png", clip });
});

test("page icons offer Lucide and Emoji, persist changes and preserve pending body input", async ({ page, request }) => {
  const body = "Keep this body";
  const note = await (await request.post("/api/pages", { data: { title: "Full page icon catalog", icon: "file-text", body } })).json();
  await page.goto(`/#page/${note.id}`);
  await page.evaluate(() => localStorage.setItem("notdown-callout-recent-icons", JSON.stringify(["💡"])));
  const paragraph = page.locator(".pm-document > p").filter({ hasText: body });
  await paragraph.click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" with pending input");
  await page.locator("#page-title").hover();
  await page.getByRole("button", { name: "Add icon", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose page icon" });
  await expect(picker.getByRole("button", { name: "Emoji", exact: true })).toHaveAttribute("aria-pressed", "true");
  await picker.getByRole("button", { name: "Lucide", exact: true }).click();
  await expect(picker.getByRole("combobox", { name: "Emoji style" })).toBeHidden();
  await expect(picker.locator(".pm-callout-icon-grid svg")).toHaveCount(160);
  await picker.locator(".pm-callout-icon-results").evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(picker.locator(".pm-callout-icon-grid svg")).toHaveCount(320);
  await picker.getByRole("searchbox").fill("no-such-icon-xyz");
  await expect(picker).toContainText("No matching icons");
  await picker.getByRole("searchbox").fill("telescope");
  await expect(picker.getByRole("button", { name: "telescope", exact: true }).locator("svg")).toBeVisible();
  await page.screenshot({ path: "test-results/page-icons-lucide-picker.png" });
  await picker.getByRole("button", { name: "telescope", exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("notdown-callout-recent-icons")!))).toEqual(["💡"]);

  const emblem = page.getByRole("button", { name: "Change page icon", exact: true });
  const sidebar = page.locator(`#page-tree .tree-page[data-open="${note.id}"]`);
  for (const host of [emblem, sidebar, page.locator('#breadcrumb [aria-current="page"]')]) {
    await expect(host.locator('svg[data-page-icon="telescope"]')).toBeVisible();
  }
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).icon).toBe("telescope");
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("with pending input");
  await page.reload();
  await expect(emblem.locator('svg[data-page-icon="telescope"]')).toBeVisible();
  await expect(sidebar.locator('svg[data-page-icon="telescope"]')).toBeVisible();
  await emblem.click();
  await expect(picker.getByRole("button", { name: "Lucide", exact: true })).toHaveAttribute("aria-pressed", "true");
  await picker.getByRole("searchbox").fill("link-2");
  await picker.getByRole("button", { name: "link-2", exact: true }).click();
  await expect(emblem.locator('svg[data-page-icon="link-2"]')).toBeVisible();
  await expect(sidebar.locator('svg[data-page-icon="link-2"]')).toBeVisible();
  await emblem.click();
  await picker.getByRole("button", { name: "Emoji", exact: true }).click();
  await expect(picker.getByRole("combobox", { name: "Emoji style" })).toBeVisible();
  await picker.getByRole("searchbox").fill("rocket");
  await picker.getByRole("button", { name: "rocket", exact: true }).click();
  await expect(emblem).toHaveText("🚀");
  await expect(sidebar.locator(".emoji")).toHaveText("🚀");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).icon).toBe("🚀");
  await emblem.click();
  await picker.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(sidebar.locator('svg[data-page-icon="file-text"]')).toBeVisible();
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).icon).toBe("");
});

test("stored folder and full-library icons render in hierarchy and page links", async ({ page, request }) => {
  const parent = await (await request.post("/api/pages", { data: { title: "Folder parent", icon: "folder", body: "Parent" } })).json();
  const target = await (await request.post("/api/pages", { data: { title: "Numbered icon target", icon: "grid-2x2", body: "Target" } })).json();
  const note = await (await request.post("/api/pages", { data: {
    title: "Icon references", icon: "database-zap", parent: parent.id,
    bodyFormat: "markdown", syntax: { version: 1, variant: "commonmark", extensions: { wikilinks_title_after_pipe: true, notion_pages: true } },
    body: `See [[${target.id}|Target]].\n\n<page url="${target.id}">Target</page>\n`,
  } })).json();
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator('#breadcrumb svg[data-page-icon="folder"]')).toBeVisible();
  await expect(page.locator(`#page-tree .tree-page[data-open="${parent.id}"] svg[data-page-icon="folder"]`)).toBeVisible();
  await expect(page.locator('#breadcrumb svg[data-page-icon="database-zap"]')).toBeVisible();
  await expect(page.locator('.pm-document a[data-page-id] svg[data-page-icon="grid-2x2"]')).toHaveCount(2);
  await page.screenshot({ path: "test-results/page-icons-surfaces.png" });
});
