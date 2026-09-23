import { expectSource } from "./source-helper.js";
import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";

type Note = { id: string; title: string; body: string };
const errors = new WeakMap<Page, string[]>();

test("ending a list then Backspace returns to the last item; row-start Backspace removes the marker", async ({
  page,
  request,
}) => {
  const note = await createNote(request, "List keyboard boundaries");
  const editor = await openNote(page, note);
  await editor.click();
  await page.keyboard.type("- First");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(editor.locator(":scope > p")).toHaveCount(1);
  await page.keyboard.press("Backspace");
  await page.keyboard.type(" tail");
  await expect(row(page, "First tail")).toHaveCount(1);
  await expect(editor.locator("li")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await page.keyboard.type("Second");
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
  await expect(editor.locator(":scope > p")).toHaveText("Second");
  await expect(editor.locator("li")).toHaveCount(1);
  await save(page, request, note, /- First tail\s+Second/);
});

test("plain text supports nested Tab, Shift Tab, subtree dragging and source reload", async ({
  page,
  request,
}) => {
  const note = await createNote(
    request,
    "Text hierarchy",
    "Parent\n\nChild\n\nTail",
  );
  const editor = await openNote(page, note);
  await editor
    .locator("p")
    .filter({ hasText: /^Child$/ })
    .click();
  await page.keyboard.press("End");
  await page.keyboard.press("Tab");
  const group = editor.locator(".pm-nested-block");
  await expect(group.locator(":scope > p")).toHaveText(["Parent", "Child"]);
  await page.keyboard.type(" edited");
  await expect(group.locator("p").last()).toHaveText("Child edited");
  await page.keyboard.press("Shift+Tab");
  await expect(group).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(group).toHaveCount(1);
  await group
    .locator("p")
    .first()
    .hover({ position: { x: 2, y: 10 } });
  const target = editor.locator(":scope > p").filter({ hasText: /^Tail$/ });
  await page
    .locator(".pm-block-handle")
    .dragTo(target, { targetPosition: { x: 8, y: 28 } });
  await expect(editor.locator(":scope > p")).toHaveText("Tail");
  await expect(editor.locator(":scope > :last-child")).toHaveClass(
    /pm-nested-block/,
  );
  await save(
    page,
    request,
    note,
    /Tail\n\n:::nest\nParent\n:::children\nChild edited\n:::endnest/,
  );
  await page.reload();
  await expect(page.locator(".pm-nested-block > p")).toHaveText([
    "Parent",
    "Child edited",
  ]);
  await page
    .locator(".pm-nested-block > p")
    .last()
    .hover({ position: { x: 2, y: 10 } });
  await page
    .locator(".pm-block-handle")
    .dragTo(page.locator(".pm-document > p").filter({ hasText: /^Tail$/ }), {
      targetPosition: { x: 8, y: 28 },
    });
  await expect(page.locator(".pm-document > p")).toHaveText([
    "Tail",
    "Child edited",
    "Parent",
  ]);
  await save(page, request, note, /Tail\s+Child edited\s+Parent/);
});

test("Shift Enter inserts a hard break inside paragraphs and todo rows across save and reload", async ({
  page,
  request,
}) => {
  const note = await createNote(request, "Inline line breaks");
  const editor = await openNote(page, note);
  await editor.click();
  await page.keyboard.type("First line");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("Second line");
  await expect(editor.locator(":scope > p")).toHaveCount(1);
  await expect(editor.locator("p > br")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await page.keyboard.type("- [ ] Task");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("Details");
  await expect(editor.locator("li")).toHaveCount(1);
  await expect(editor.locator("li p > br")).toHaveCount(1);
  await save(
    page,
    request,
    note,
    /First line<br>Second line\n\n- \[ \] Task<br>Details/,
  );
  await page.keyboard.press("Control+e");
  await expectSource(page, await body(request, note.id));
  await page.keyboard.press("Control+e");
  await expect(page.locator(".pm-document li")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".pm-document > p > br")).toHaveCount(1);
  await expect(page.locator(".pm-document li p > br")).toHaveCount(1);
});

test.beforeEach(async ({ page, request }) => {
  const status = await request.get("/api/status");
  expect(status.ok()).toBe(true);
  expect((await status.json()).vaultPath).toMatch(/[\\/]notdown-e2e-[^\\/]+$/);
  errors.set(page, []);
  page.on("pageerror", (error) => errors.get(page)!.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(
    errors.get(page),
    "The editor must not throw browser runtime errors",
  ).toEqual([]);
});

async function createNote(
  request: APIRequestContext,
  title: string,
  body = "",
  bodyFormat: "markdown" | "notion-markdown" = body
    ? "markdown"
    : "notion-markdown",
): Promise<Note> {
  const response = await request.post("/api/pages", {
    data: { title, body, bodyFormat, ...(bodyFormat === "markdown" ? { syntax: { version: 1, variant: "commonmark", extensions: { strikeout: true, pipe_tables: true, task_lists: true, wikilinks_title_after_pipe: true, notion_nesting: true, notion_columns: true, notion_pages: true } } } : {}) },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function openNote(page: Page, note: Note) {
  await page.addInitScript(
    (id) => localStorage.setItem("notdown-page", id),
    note.id,
  );
  await page.goto("/");
  await expect(page.locator("#page-title")).toHaveValue(note.title);
  const editor = page.locator("#editor .pm-document[contenteditable='true']");
  await expect(editor).toBeVisible();
  return editor;
}

async function body(request: APIRequestContext, id: string): Promise<string> {
  const response = await request.get(`/api/pages/${id}`);
  expect(response.ok()).toBe(true);
  return (await response.json()).body;
}

async function save(
  page: Page,
  request: APIRequestContext,
  note: Note,
  expected: RegExp,
) {
  await page.keyboard.press("Control+s");
  await expect.poll(() => body(request, note.id)).toMatch(expected);
}

function row(page: Page, text: string): Locator {
  return page
    .locator(".pm-document li > .pm-item-content > p")
    .filter({ hasText: new RegExp(`^${text}$`) });
}

test("page outline exposes heading hierarchy and follows navigation and reading", async ({
  page,
  request,
}) => {
  const paragraph = "记录关键决定，让想法和行动保持清晰。";
  const sections = [
    "## 使用指南",
    "## 项目进展",
    "### 本周计划",
    "#### 交互细节",
    "## 后续安排",
    "## 归档记录",
  ];
  const note = await createNote(
    request,
    "项目笔记",
    sections
      .map(
        (heading) => `${heading}\n\n${Array(8).fill(paragraph).join("\n\n")}`,
      )
      .join("\n\n"),
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openNote(page, note);
  const toc = page.locator("#floating-toc");
  const entries = toc.getByRole("button");
  const currentEntry = toc.locator('[aria-current="location"]');
  await expect(entries).toHaveCount(sections.length);
  await expect(currentEntry).toHaveText("使用指南");
  await expect(toc.locator(".toc-text").first()).toBeHidden();
  await toc.hover();
  await expect(toc.locator(".toc-text").first()).toBeVisible();
  await expect(toc.locator(".toc-line").first()).toBeHidden();
  const positions = await toc
    .locator(".toc-text")
    .evaluateAll((items) =>
      items.map((item) => item.getBoundingClientRect().left),
    );
  expect(positions[1]).toBe(positions[0]);
  expect(positions[2] - positions[1]).toBe(14);
  expect(positions[3] - positions[2]).toBe(14);
  expect(positions[4]).toBe(positions[0]);
  await entries.filter({ hasText: "项目进展" }).click();
  await expect(currentEntry).toHaveText("项目进展");
  await expect(
    page.getByRole("heading", { name: "项目进展", exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: "test-results/toc-expanded.png" });
  await toc.screenshot({ path: "test-results/toc-hierarchy.png" });

  await page.mouse.move(800, 500);
  await expect(toc.locator(".toc-text").first()).toBeHidden();
  await page.screenshot({ path: "test-results/toc-collapsed.png" });
  await page.mouse.wheel(0, 6000);
  await expect(currentEntry).toHaveText("归档记录");
  await toc.hover();
  await entries.filter({ hasText: "交互细节" }).click();
  await expect(currentEntry).toHaveText("交互细节");
  await expect(
    page.getByRole("heading", { name: "交互细节", exact: true }),
  ).toBeInViewport();
  expect(await body(request, note.id)).toBe(note.body);
});

test("long outlines support keyboard and pinning, and refresh after heading edits", async ({
  page,
  request,
}) => {
  const longTitle =
    "这是一个很长的目录标题，用来检查深层标题省略后仍能查看完整名称与定位";
  const note = await createNote(
    request,
    "长文目录",
    `${Array.from({ length: 36 }, (_, index) => `## 章节 ${index + 1}\n\n### 小节 ${index + 1}\n\n正文内容。`).join("\n\n")}\n\n###### ${longTitle}\n\n最后的记录。`,
  );
  const editor = await openNote(page, note);
  const toc = page.locator("#floating-toc");
  const entries = toc.getByRole("button");
  await expect(entries).toHaveCount(73);
  await toc.focus();
  await page.keyboard.press("Tab");
  await expect(entries.first()).toBeFocused();
  await expect(toc.locator(".toc-text").first()).toBeVisible();
  await entries.last().focus();
  await expect(entries.last()).toBeInViewport();
  await expect(entries.last()).toHaveAttribute("title", longTitle);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: longTitle })).toBeInViewport();
  await expect(entries.last()).toHaveAttribute("aria-current", "location");
  const textMetrics = await entries
    .last()
    .locator(".toc-text")
    .evaluate((text) => ({
      visible: text.clientWidth,
      full: text.scrollWidth,
    }));
  expect(textMetrics.visible).toBeGreaterThan(70);
  expect(textMetrics.full).toBeGreaterThan(textMetrics.visible);

  await page.locator('.sidebar-bottom [data-action="settings"]').click();
  await page.locator("#pin-toc").check();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.mouse.move(750, 500);
  await expect(toc).toHaveClass(/pinned/);
  await expect(toc.locator(".toc-text").last()).toBeVisible();

  await page.keyboard.press("Control+e");
  await expect(toc).toBeHidden();
  await page
    .locator("#source-editor")
    .fill("## 新的章节\n\n### 新的小节\n\n正文");
  await page.keyboard.press("Control+e");
  await expect(entries).toHaveText(["新的章节", "新的小节"]);
  await editor.locator("h3").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" updated");
  await expect(entries.last()).toHaveText("新的小节 updated");
  await page.keyboard.press("Control+e");
  await page.locator("#source-editor").fill("没有标题的正文。");
  await page.keyboard.press("Control+e");
  await expect(toc).toBeHidden();
  await expect(entries).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});

async function dragAfter(
  page: Page,
  source: string,
  target: string,
  fast = false,
) {
  const from = row(page, source);
  const to = row(page, target);
  await from.hover({ position: { x: 2, y: 10 } });
  const handle = page.locator(".pm-block-handle");
  await expect(handle).toBeVisible();
  const bounds = await to.boundingBox();
  expect(bounds).not.toBeNull();
  if (fast) {
    await handle.dragTo(to, {
      targetPosition: { x: 8, y: Math.max(2, bounds!.height - 2) },
    });
    return;
  }
  const handleBounds = await handle.boundingBox();
  expect(handleBounds).not.toBeNull();
  const start = {
    x: handleBounds!.x + handleBounds!.width / 2,
    y: handleBounds!.y + handleBounds!.height / 2,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 8, start.y, { steps: 4 });
  await page.mouse.move(bounds!.x + 8, bounds!.y + bounds!.height - 2, {
    steps: 12,
  });
  await page.mouse.up();
}

test.describe("outline navigation with normal scrolling", () => {
  test.use({ reducedMotion: "no-preference" });

  test("clicking a heading inside folded sections reveals it without changing the note", async ({
    page,
    request,
  }) => {
    const note = await createNote(
      request,
      "折叠章节定位",
      [
        "# 第一章",
        "章节说明。",
        "## 折叠的小节",
        "小节说明。",
        "### 目标标题",
        ...Array(12).fill("目标标题下的正文内容。"),
        "# 第二章",
        ...Array(25).fill("第二章的正文内容。"),
      ].join("\n\n"),
    );
    const editor = await openNote(page, note);
    for (const name of ["折叠的小节", "第一章"]) {
      await editor
        .getByRole("heading", { name, exact: true })
        .hover({ position: { x: 2, y: 10 } });
      await page.locator(".pm-block-handle").click();
      await page
        .getByRole("menuitem", { name: "Collapse heading", exact: true })
        .click();
    }
    const target = editor.getByRole("heading", {
      name: "目标标题",
      exact: true,
    });
    await expect(target).toBeHidden();
    const toc = page.locator("#floating-toc");
    await toc.hover();
    await toc.getByRole("button", { name: "目标标题", exact: true }).click();
    await expect(target).toBeVisible();
    await expect(target).toBeInViewport();
    await expect(toc.locator('[aria-current="location"]')).toHaveText(
      "目标标题",
    );
    expect(await body(request, note.id)).toBe(note.body);
  });

  test("near the page end the clicked heading remains current even when scrolling is clamped", async ({
    page,
    request,
  }) => {
    const note = await createNote(
      request,
      "页尾目录定位",
      [
        "## 开始",
        ...Array(35).fill("正文段落。"),
        "## 附录",
        "### 资料",
        "### 参考",
        "### 结束",
      ].join("\n\n"),
    );
    await openNote(page, note);
    const toc = page.locator("#floating-toc");
    await toc.hover();
    await toc.getByRole("button", { name: "结束", exact: true }).click();
    await expect(toc.locator('[aria-current="location"]')).toHaveText("结束");
    await toc.getByRole("button", { name: "资料", exact: true }).click();
    await expect(toc.locator('[aria-current="location"]')).toHaveText("资料");
    await expect(
      page.getByRole("heading", { name: "资料", exact: true }),
    ).toBeInViewport();
    await page.mouse.move(800, 500);
    await page.mouse.wheel(0, -6000);
    await expect(toc.locator('[aria-current="location"]')).toHaveText("开始");
  });

  test("successive clicks while editing and scrolling land on the last requested heading", async ({
    page,
    request,
  }) => {
    const note = await createNote(
      request,
      "连续目录定位",
      Array.from(
        { length: 18 },
        (_, index) =>
          `## 章节 ${index + 1}\n\n${Array(10).fill("正文内容。").join("\n\n")}`,
      ).join("\n\n"),
    );
    const editor = await openNote(page, note);
    await editor.locator("p").first().click();
    await page.keyboard.press("End");
    await page.keyboard.type(" edited");
    const toc = page.locator("#floating-toc");
    await toc.hover();
    for (const name of ["章节 16", "章节 3", "章节 10"]) {
      await toc.getByRole("button", { name, exact: true }).click();
    }
    await expect
      .poll(async () => {
        const heading = await editor
          .getByRole("heading", { name: "章节 10", exact: true })
          .boundingBox();
        const main = await page.locator("#main").boundingBox();
        return Math.abs(heading!.y - main!.y - 80);
      })
      .toBeLessThan(3);
    await expect(toc.locator('[aria-current="location"]')).toHaveText(
      "章节 10",
    );
    await toc.getByRole("button", { name: "章节 2", exact: true }).click();
    await expect
      .poll(async () => {
        const heading = await editor
          .getByRole("heading", { name: "章节 2", exact: true })
          .boundingBox();
        const main = await page.locator("#main").boundingBox();
        return Math.abs(heading!.y - main!.y - 80);
      })
      .toBeLessThan(3);
    await expect(toc.locator('[aria-current="location"]')).toHaveText("章节 2");
  });
});

test("a bare slash immediately opens autocomplete without moving focus out of the note", async ({
  page,
  request,
}) => {
  const note = await createNote(request, "Slash autocomplete");
  const editor = await openNote(page, note);
  await editor.click();
  await page.keyboard.type("/");
  const menu = page.locator("#dialog.inline-slash");
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-insert="task"]')).toBeVisible();
  await expect(menu.locator('[data-insert="heading2"]')).toBeVisible();
  await expect(editor).toBeFocused();
  await page.screenshot({
    path: "test-results/slash-menu.png",
    fullPage: true,
  });
  await page.keyboard.type("h2");
  await expect(menu.locator("[data-insert]")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  await page.keyboard.type("A real heading");
  await expect(editor.locator("h2")).toHaveText("A real heading");
  await save(page, request, note, /^## A real heading\s*$/);
});

test("Markdown input and Enter create consecutive blocks; Tab and Shift Tab edit their nesting", async ({
  page,
  request,
}) => {
  const note = await createNote(request, "Markdown and list nesting");
  const editor = await openNote(page, note);
  await editor.click();
  await page.keyboard.type("# Markdown title");
  await expect(editor.locator("h1")).toHaveText("Markdown title");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- First");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Second");
  await expect(editor.locator(":scope > ul > li")).toHaveCount(2);
  await page.keyboard.press("Tab");
  await expect(editor.locator(":scope > ul > li")).toHaveCount(1);
  await expect(editor.locator("li li > .pm-item-content > p")).toHaveText(
    "Second",
  );
  await page.keyboard.press("Shift+Tab");
  await expect(editor.locator(":scope > ul > li")).toHaveCount(2);
  await save(page, request, note, /- First\s+[-*] Second/);
  await page.keyboard.press("Control+e");
  await expectSource(page, await body(request, note.id));
  await page.keyboard.press("Control+e");
  await expect(page.locator(".pm-document > ul > li")).toHaveCount(2);
});

test("Markdown task syntax and Enter create separately editable todo rows", async ({
  page,
  request,
}) => {
  const note = await createNote(request, "Task input");
  const editor = await openNote(page, note);
  await editor.click();
  await page.keyboard.type("- [ ] First task");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Second task");
  await expect(editor.locator("li[data-checked]")).toHaveCount(2);
  await expect(
    editor.locator('li[data-checked] input[type="checkbox"]'),
  ).toHaveCount(2);
  await editor
    .locator('li[data-checked] input[type="checkbox"]')
    .first()
    .check();
  await save(page, request, note, /- \[x\] First task\s+- \[ \] Second task/);
});

test("dragging a nested todo moves only that child and retains its own subtree", async ({
  page,
  request,
}) => {
  const note = await createNote(
    request,
    "Move child",
    "- [ ] Parent\n  - [x] Child\n    - Grandchild\n- [ ] Sibling\n- Last\n",
  );
  const editor = await openNote(page, note);
  await dragAfter(page, "Child", "Last");
  await expect(
    editor.locator(":scope > ul > li > .pm-item-content > p"),
  ).toHaveText(["Parent", "Sibling", "Last", "Child"]);
  const child = editor
    .locator(":scope > ul > li")
    .filter({ has: page.locator("p", { hasText: /^Child$/ }) })
    .last();
  await expect(child.locator("ul > li > .pm-item-content > p")).toHaveText(
    "Grandchild",
  );
  await save(page, request, note, /Last\r?\n- \[x\] Child\r?\n  - Grandchild/);
  await page.reload();
  await expect(
    page.locator(".pm-document > ul > li > .pm-item-content > p"),
  ).toHaveText(["Parent", "Sibling", "Last", "Child"]);
});

test("dragging a parent moves its complete subtree in one undoable change", async ({
  page,
  request,
}) => {
  const source =
    "- [ ] Parent\n  - [x] Child\n    - Grandchild\n- [ ] Sibling\n- Last\n";
  const note = await createNote(request, "Move parent", source);
  const editor = await openNote(page, note);
  await dragAfter(page, "Parent", "Last", true);
  await expect(
    editor.locator(":scope > ul > li > .pm-item-content > p"),
  ).toHaveText(["Sibling", "Last", "Parent"]);
  await expect(
    editor.locator(
      ":scope > ul > li:last-child > .pm-item-content > ul > li > .pm-item-content > p",
    ),
  ).toHaveText("Child");
  await expect(
    editor.locator(":scope > ul > li:last-child li li > .pm-item-content > p"),
  ).toHaveText("Grandchild");
  await page.keyboard.press("Control+z");
  await expect(
    editor.locator(":scope > ul > li > .pm-item-content > p"),
  ).toHaveText(["Parent", "Sibling", "Last"]);
  await page.keyboard.press("Control+e");
  await expectSource(page, source);
});

test("page mentions and child pages stay visual when the cursor passes them", async ({
  page,
  request,
}) => {
  const target = await createNote(request, "Linked page", "Target content");
  const note = await createNote(
    request,
    "Visual page references",
    `Before [[${target.id}|Linked page]] after [Example](https://example.com).\n\n::page{id="${target.id}"}\n`,
  );
  const editor = await openNote(page, note);
  await expect(editor.locator(".page-mention")).toContainText("Linked page");
  await expect(editor.locator(".child-page-node")).toContainText("Linked page");
  await editor.locator(".page-mention").hover();
  await editor
    .locator(":scope > p")
    .first()
    .click({ position: { x: 4, y: 10 } });
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  for (let i = 0; i < 15; i++) await page.keyboard.press("ArrowRight");
  await expect(editor.locator(".page-mention")).toBeVisible();
  await expect(editor).not.toContainText("[[");
  await expect(editor).not.toContainText("](https://");
  await expect(editor.locator("textarea")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/page-links.png",
    fullPage: true,
  });
  await page.keyboard.press("Control+e");
  await expectSource(
    page,
    `Before [[${target.id}|Linked page]] after [Example](https://example.com).\n\n::page{id="${target.id}"}\n`,
  );
});

test("the six-dot menu can duplicate and delete a nested block without changing its parent", async ({
  page,
  request,
}) => {
  const source = "- Parent\n  - Child\n    - Grandchild\n- Tail\n";
  const note = await createNote(request, "Nested block menu", source);
  const editor = await openNote(page, note);
  await row(page, "Child").hover({ position: { x: 2, y: 10 } });
  await page.locator(".pm-block-handle").click();
  await page
    .getByRole("menuitem", { name: "Duplicate block", exact: true })
    .click();
  await expect(row(page, "Child")).toHaveCount(2);
  await expect(row(page, "Grandchild")).toHaveCount(2);
  await expect(
    editor.locator(":scope > ul > li > .pm-item-content > p"),
  ).toHaveText(["Parent", "Tail"]);
  await row(page, "Child")
    .last()
    .hover({ position: { x: 2, y: 10 } });
  await page.locator(".pm-block-handle").click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(row(page, "Child")).toHaveCount(1);
  await expect(row(page, "Grandchild")).toHaveCount(1);
  await page.keyboard.press("Control+e");
  await expectSource(page, source);
});

test("converting one list row to numbered leaves its neighbors and children intact", async ({
  page,
  request,
}) => {
  const note = await createNote(
    request,
    "Convert one row",
    "- First\n- Target\n  - Child\n- Last\n",
  );
  const editor = await openNote(page, note);
  await row(page, "Target").hover({ position: { x: 2, y: 10 } });
  await page.locator(".pm-block-handle").click();
  await page
    .getByRole("menuitem", { name: "Numbered list item", exact: true })
    .click();
  await expect(
    editor.locator(":scope > ol > li > .pm-item-content > p"),
  ).toHaveText("Target");
  await expect(
    editor.locator(":scope > ul > li > .pm-item-content > p"),
  ).toHaveText(["First", "Last"]);
  await expect(
    editor.locator(
      ":scope > ol > li > .pm-item-content > ul > li > .pm-item-content > p",
    ),
  ).toHaveText("Child");
  await save(page, request, note, /1\. Target\r?\n\s+- Child/);
});

test("page tail creates one focused empty block and hover exposes both controls", async ({
  page,
  request,
}) => {
  const note = await createNote(
    request,
    "Tail and hover controls",
    "First\n\nLast",
  );
  const editor = await openNote(page, note);
  const last = editor.locator(":scope > p").last();
  await last.hover({ position: { x: 250, y: 12 } });
  await expect(page.locator(".pm-block-handle")).toHaveClass(/visible/);
  await expect(
    page.getByRole("button", { name: "Add block below" }),
  ).toHaveClass(/visible/);
  await page.locator("#page-title").hover();
  await expect(page.locator(".pm-block-handle")).not.toHaveClass(/visible/);
  await expect(page.locator(".pm-block-add")).not.toHaveClass(/visible/);
  let rect = (await last.boundingBox())!;
  await page.mouse.click(rect.x + 100, rect.y + rect.height + 40);
  await expect(editor.locator(":scope > p")).toHaveCount(3);
  await expect(editor.locator("p[data-placeholder]")).toHaveCount(1);
  rect = (await editor.locator(":scope > p").last().boundingBox())!;
  await page.mouse.click(rect.x + 100, rect.y + rect.height + 40);
  await expect(editor.locator(":scope > p")).toHaveCount(3);
  await page.keyboard.type("Tail input");
  await expect(editor.locator(":scope > p").last()).toHaveText("Tail input");
  await editor
    .locator(":scope > p")
    .first()
    .hover({ position: { x: 200, y: 12 } });
  await page.getByRole("button", { name: "Add block below" }).click();
  await page.keyboard.type("Inserted");
  await expect(editor.locator(":scope > p")).toHaveText([
    "First",
    "Inserted",
    "Last",
    "Tail input",
  ]);
  await save(page, request, note, /First\s+Inserted\s+Last\s+Tail input/);
});

for (const side of ["left", "right"] as const) {
  test(`marquee from ${side} moves selected rows using either handle and undoes together`, async ({
    page,
    request,
  }) => {
    const note = await createNote(
      request,
      "Multiple block drag " + side,
      "First\n\nSecond\n\nThird\n\nTail",
    );
    const editor = await openNote(page, note);
    const rows = editor.locator(":scope > p");
    const first = (await rows.nth(0).boundingBox())!;
    const second = (await rows.nth(1).boundingBox())!;
    const x = side === "left" ? first.x - 65 : first.x + first.width + 20;
    await page.mouse.move(x, first.y + 1);
    await page.mouse.down();
    await page.mouse.move(
      first.x + first.width / 2,
      second.y + second.height - 1,
      { steps: 12 },
    );
    await expect(page.locator(".pm-selection-box")).toBeVisible();
    await page.mouse.up();
    await expect(editor.locator(".pm-block-selected")).toHaveText([
      "First",
      "Second",
    ]);
    await rows
      .nth(side === "left" ? 0 : 1)
      .hover({ position: { x: 200, y: 12 } });
    await page
      .locator(".pm-block-handle")
      .dragTo(rows.nth(3), { targetPosition: { x: 8, y: 28 } });
    await expect(rows).toHaveText(["Third", "Tail", "First", "Second"]);
    await page.keyboard.press("Control+z");
    await expect(rows).toHaveText(["First", "Second", "Third", "Tail"]);
  });
}

test("marquee moves todo rows with descendants and plus inserts a sibling todo", async ({
  page,
  request,
}) => {
  const note = await createNote(
    request,
    "Todo group controls",
    "- [x] One\n  - Child\n- [ ] Two\n\nTail",
  );
  const editor = await openNote(page, note);
  const one = row(page, "One"),
    two = row(page, "Two");
  const first = (await one.boundingBox())!,
    second = (await two.boundingBox())!;
  const bounds = (await editor.boundingBox())!;
  await page.mouse.move(bounds.x - 65, first.y + 1);
  await page.mouse.down();
  await page.mouse.move(first.x + 150, second.y + second.height - 1, {
    steps: 12,
  });
  await page.screenshot({ path: "test-results/block-marquee.png" });
  await page.mouse.up();
  await expect(editor.locator(".pm-block-selected")).toHaveCount(2);
  await two.hover({ position: { x: 160, y: 12 } });
  await page
    .locator(".pm-block-handle")
    .dragTo(editor.locator(":scope > p"), { targetPosition: { x: 8, y: 28 } });
  await expect(editor.locator(":scope > :first-child")).toHaveText("Tail");
  await expect(row(page, "Child")).toHaveCount(1);
  await save(page, request, note, /Tail\s+- \[x\] One\s+- Child\s+- \[ \] Two/);
  await two.hover({ position: { x: 160, y: 12 } });
  await page.getByRole("button", { name: "Add block below" }).click();
  await page.keyboard.type("Three");
  await expect(row(page, "Three").locator("xpath=../..")).toHaveAttribute(
    "data-checked",
    "false",
  );
  await save(page, request, note, /- \[ \] Two\s+- \[ \] Three/);
  await page.reload();
  await expect(row(page, "Child")).toHaveCount(1);
  await expect(row(page, "Three")).toHaveCount(1);
});

for (const format of ["markdown", "notion-markdown"] as const) {
  test(`${format} block gutters align across top-level types and follow nested list depth`, async ({ page, request }) => {
    const note = await createNote(request, "Block gutter alignment", [
      "Plain text",
      "## Heading",
      "- [ ] Parent\n\t- [x] Child\n\t\t- Grandchild\n- [ ] Sibling\n- Bullet",
      "1. Numbered",
      "> Quote",
      ...(format === "notion-markdown" ? [
        "<details>\n<summary>Toggle</summary>\n\tToggle child\n</details>",
        '<callout icon="💡">\n\tCallout\n</callout>',
      ] : []),
    ].join("\n\n"), format);
    const editor = await openNote(page, note);
    const handle = page.locator(".pm-block-handle");
    const plus = page.getByRole("button", { name: "Add block below" });
    const controls = async (text: string) => {
      const line = editor.locator("p, h2").filter({ hasText: new RegExp(`^${text}$`) });
      await line.hover({ position: { x: 80, y: 12 } });
      await expect(handle).toHaveClass(/visible/);
      await expect(plus).toHaveClass(/visible/);
      return { grip: (await handle.boundingBox())!, plus: (await plus.boundingBox())! };
    };
    const baseline = await controls("Plain text");
    expect((await editor.boundingBox())!.x - baseline.grip.x - baseline.grip.width).toBeCloseTo(12, 0);
    for (const text of ["Heading", "Parent", "Sibling", "Bullet", "Numbered", "Quote",
      ...(format === "notion-markdown" ? ["Toggle", "Callout"] : [])]) {
      const current = await controls(text);
      expect(Math.abs(current.grip.x - baseline.grip.x), text).toBeLessThan(1);
      expect(Math.abs(current.plus.x - baseline.plus.x), text).toBeLessThan(1);
    }
    const child = await controls("Child");
    const grandchild = await controls("Grandchild");
    expect(child.grip.x - baseline.grip.x).toBeCloseTo(26, 0);
    expect(grandchild.grip.x - child.grip.x).toBeCloseTo(26, 0);
    await controls("Child");
    await page.screenshot({ path: `test-results/block-gutter-${format}.png` });
    await handle.click();
    await expect(row(page, "Child").locator("xpath=../..")).toHaveClass(/pm-block-selected/);
    await page.keyboard.press("Escape");
    expect(await body(request, note.id)).toBe(note.body);
  });
}

test("plus aligns icons and opens searchable insertion; block menu identifies the current type", async ({
  page,
  request,
}) => {
  const note = await createNote(
    request,
    "Plus command menu",
    "## Existing heading\n\nTail",
  );
  const editor = await openNote(page, note);
  await editor.locator("h2").hover({ position: { x: 160, y: 12 } });
  const plus = page.getByRole("button", { name: "Add block below" });
  const plusRect = (await plus.locator("svg").boundingBox())!;
  const gripRect = (await page.locator(".pm-block-handle svg").boundingBox())!;
  expect(
    Math.abs(
      plusRect.y + plusRect.height / 2 - gripRect.y - gripRect.height / 2,
    ),
  ).toBeLessThan(1);
  await page.locator(".pm-block-handle").click();
  await expect(page.locator(".pm-block-menu > :first-child")).toHaveText(
    "Heading 2",
  );
  await page.keyboard.press("Escape");
  await editor.locator("h2").hover({ position: { x: 160, y: 12 } });
  await plus.click();
  await expect(
    page.getByRole("dialog", { name: "Choose block type" }),
  ).toBeVisible();
  await expect(editor).not.toContainText("/");
  await page.keyboard.type("heading");
  await page.getByRole("option", { name: /Heading 3/ }).click();
  await page.keyboard.type("New heading");
  await expect(editor.locator("h3")).toHaveText("New heading");
  await expect(page.locator(".inline-slash")).toHaveCount(0);
  await editor.locator("h3").hover({ position: { x: 160, y: 12 } });
  await plus.click();
  await page.getByRole("dialog", { name: "Choose block type" }).getByRole("option", { name: /^Paragraph / }).click();
  await page.keyboard.type("Plain block");
  await expect(editor.locator(":scope > p")).toHaveText([
    "Plain block",
    "Tail",
  ]);
  await save(
    page,
    request,
    note,
    /Existing heading\s+### New heading\s+Plain block\s+Tail/,
  );
});

for (const key of ["Delete", "Backspace"]) {
  test(`block handle selects its row and ${key} deletes it with menu focus`, async ({ page, request }) => {
    const note = await createNote(request, "Handle keyboard " + key, "First\n\nSecond\n\nTail");
    const editor = await openNote(page, note);
    const rows = editor.locator(":scope > p");
    await rows.nth(2).click(); // The text cursor must not determine which block is deleted.
    await rows.nth(1).hover({ position: { x: 160, y: 12 } });
    await page.locator(".pm-block-handle").click();
    await expect(page.getByRole("menu", { name: "Block actions" })).toBeVisible();
    await expect(editor.locator(".pm-block-selected")).toHaveText(["Second"]);
    await page.keyboard.press(key);
    await expect(rows).toHaveText(["First", "Tail"]);
    await expect(editor.locator(".pm-block-selected")).toHaveCount(0);
    await expect(page.locator(".pm-block-menu")).toHaveCount(0);
    await page.keyboard.press("Control+z");
    await expect(rows).toHaveText(["First", "Second", "Tail"]);
  });

  test(`marquee ${key} deletes whole rows and descendants in one undo`, async ({ page, request }) => {
    const note = await createNote(request, "Selected list deletion " + key, "- [x] One\n  - Child\n- [ ] Two\n\nTail");
    const editor = await openNote(page, note);
    const first = (await row(page, "One").boundingBox())!;
    const second = (await row(page, "Two").boundingBox())!;
    const bounds = (await editor.boundingBox())!;
    await page.mouse.move(bounds.x - 65, first.y + 1);
    await page.mouse.down();
    await page.mouse.move(first.x + 150, second.y + second.height - 1, { steps: 12 });
    await page.mouse.up();
    await expect(editor.locator(".pm-block-selected")).toHaveCount(2);
    await page.keyboard.press(key);
    await expect(editor.locator("li")).toHaveCount(0);
    await expect(editor.locator(":scope > p")).toHaveText(["Tail"]);
    await save(page, request, note, /^\s*Tail\s*$/);
    await page.keyboard.press("Control+z");
    await expect(row(page, "One")).toHaveCount(1);
    await expect(row(page, "Child")).toHaveCount(1);
    await expect(row(page, "Two")).toHaveCount(1);
  });
}

test("Escape clears block selection and external input retains normal deletion", async ({ page, request }) => {
  const note = await createNote(request, "Selection cancellation", "First\n\nSecond\n\nTail");
  const editor = await openNote(page, note);
  const rows = editor.locator(":scope > p");
  await rows.first().hover({ position: { x: 160, y: 12 } });
  await page.locator(".pm-block-handle").click();
  await expect(editor.locator(".pm-block-selected")).toHaveText(["First"]);
  await page.keyboard.press("Escape");
  await expect(editor.locator(".pm-block-selected")).toHaveCount(0);
  await expect(page.locator(".pm-block-menu")).toHaveCount(0);
  const first = (await rows.first().boundingBox())!;
  const second = (await rows.nth(1).boundingBox())!;
  await page.mouse.move(first.x - 65, first.y + 1);
  await page.mouse.down();
  await page.mouse.move(first.x + 150, second.y + second.height - 1, { steps: 12 });
  await page.mouse.up();
  await expect(editor.locator(".pm-block-selected")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(editor.locator(".pm-block-selected")).toHaveCount(0);
  await rows.nth(1).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Backspace");
  await expect(rows).toHaveText(["First", "Secon", "Tail"]);
  await rows.first().hover({ position: { x: 160, y: 12 } });
  await page.locator(".pm-block-handle").click();
  await page.locator("#page-title").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Backspace");
  await expect(page.locator("#page-title")).toHaveValue("Selection cancellatio");
  await expect(rows).toHaveText(["First", "Secon", "Tail"]);
});

test("deleting every selected block keeps an editable document and can be undone", async ({ page, request }) => {
  const note = await createNote(request, "Delete all blocks", "First\n\nSecond");
  const editor = await openNote(page, note);
  const rows = editor.locator(":scope > p");
  const first = (await rows.first().boundingBox())!;
  const last = (await rows.last().boundingBox())!;
  await page.mouse.move(first.x - 65, first.y + 1);
  await page.mouse.down();
  await page.mouse.move(first.x + 150, last.y + last.height - 1, { steps: 12 });
  await page.mouse.up();
  await expect(editor.locator(".pm-block-selected")).toHaveCount(2);
  await page.keyboard.press("Delete");
  await expect(rows).toHaveCount(1);
  await expect(rows).toHaveText([""]);
  await page.keyboard.press("Control+z");
  await expect(rows).toHaveText(["First", "Second"]);
  await rows.first().hover({ position: { x: 160, y: 12 } });
  await page.locator(".pm-block-handle").click();
  await page.keyboard.press("Delete");
  await page.keyboard.type("Still editable");
  await expect(editor).toContainText("Still editable");
});
