import {
  test,
  expect,
  type Page,
  type APIRequestContext,
  type Locator,
} from "@playwright/test";

async function open(
  page: Page,
  request: APIRequestContext,
  body: string,
  variant = "commonmark",
) {
  const status = await (await request.get("/api/status")).json();
  expect(status.vaultPath).toMatch(/[\\/]notdown-e2e-[^\\/]+$/);
  const response = await request.post("/api/pages", {
    data: {
      title: "Inline formatting navigation",
      body,
      syntax: { version: 1, variant, extensions: {} },
    },
  });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.addInitScript(
    (id) => localStorage.setItem("notdown-page", id),
    note.id,
  );
  await page.goto("/");
  const editor = page.locator("#editor .pm-document[contenteditable='true']");
  await expect(editor).toBeVisible();
  return { editor, id: note.id };
}

// Set a real browser caret within the existing text; all navigation and typing
// after this setup go through keyboard events and ProseMirror's DOM observer.
async function caret(code: Locator, edge: "start" | "end" = "end") {
  await code.evaluate((element, edge) => {
    (element.closest("[contenteditable=true]") as HTMLElement).focus();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes: Node[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const text = edge === "start" ? nodes[0] : nodes.at(-1)!;
    window
      .getSelection()!
      .setBaseAndExtent(
        text,
        edge === "start" ? 0 : text.textContent!.length,
        text,
        edge === "start" ? 0 : text.textContent!.length,
      );
  }, edge);
  await expect(code.locator(".pm-inline-code-active")).toHaveCount(1);
}

async function saved(
  page: Page,
  request: APIRequestContext,
  id: string,
  expected: string,
) {
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () => (await (await request.get(`/api/pages/${id}`)).json()).body,
    )
    .toBe(expected);
}

async function insideEnd(page: Page, span: Locator) {
  await span.evaluate((element) => {
    (element.closest("[contenteditable=true]") as HTMLElement).focus();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let text: Node = walker.nextNode()!;
    while (walker.nextNode()) text = walker.currentNode;
    const offset = text.textContent!.length - 1;
    window.getSelection()!.setBaseAndExtent(text, offset, text, offset);
  });
  await page.keyboard.press("ArrowRight");
}

async function edges(span: Locator) {
  return span.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes: Node[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const edge = (node: Node, offset: number) => {
      const range = document.createRange();
      range.setStart(node, offset);
      range.collapse(true);
      return range.getBoundingClientRect().x;
    };
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      start: edge(nodes[0], 0),
      end: edge(nodes.at(-1)!, nodes.at(-1)!.textContent!.length),
    };
  });
}

const visibleCaret = (page: Page) =>
  page.locator(".pm-inline-boundary-caret:not([hidden])");
async function caretAt(page: Page, x: number) {
  await expect(visibleCaret(page)).toHaveCount(1);
  await expect
    .poll(async () => Math.abs((await visibleCaret(page).boundingBox())!.x - x))
    .toBeLessThan(1.5);
}

for (const [label, source, selector] of [
  ["color", '<span color="red">xy</span>', '[data-text-color="red"]'],
  [
    "background",
    '<span color="yellow_bg">xy</span>',
    '[data-text-color="yellow_bg"]',
  ],
  ["bold", "**xy**", "strong"],
  ["italic", "*xy*", "em"],
  ["strike", "~~xy~~", "s"],
  ["underline", '<span underline="true">xy</span>', "u"],
  ["link", "[xy](https://example.com)", 'a[href="https://example.com"]'],
]) {
  for (const tail of ["b", ""]) {
    test(`${label} exits to plain input ${tail ? "mid-line" : "at line end"} and reenters`, async ({
      page,
      request,
    }) => {
      const { editor, id } = await open(
        page,
        request,
        "a" + source + tail,
        "notdown",
      );
      const span = editor.locator(selector);
      await expect(span).toHaveText("xy");
      await insideEnd(page, span);
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.type("X");
      await expect(span).toHaveText("xyX");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.type("Z");
      await expect(span).toHaveText("xyX");
      await saved(
        page,
        request,
        id,
        "a" + source.replace("xy", "xyX") + "Z" + tail,
      );
      await page.reload();
      await expect(span).toHaveText("xyX");
      await insideEnd(page, span);
      for (let index = 0; index < 4; index++)
        await page.keyboard.press("ArrowLeft");
      await page.keyboard.type("Q");
      await expect(span).toHaveText("xyX");
      await saved(
        page,
        request,
        id,
        "aQ" + source.replace("xy", "xyX") + "Z" + tail,
      );
    });
  }
}

for (const tail of ["b", ""]) {
  test(`padded code caret moves across both padding edges (${tail ? "mid-line" : "line end"})`, async ({
    page,
    request,
  }) => {
    const { editor, id } = await open(page, request, "a`xy`" + tail);
    const code = editor.locator("code");
    await insideEnd(page, code);
    const box = await edges(code);
    expect(box.right - box.end).toBeGreaterThan(3);
    await caretAt(page, box.end);
    await page.keyboard.press("ArrowRight");
    await caretAt(page, box.right);
    await page.screenshot({
      path: `test-results/inline-caret-right-${tail || "end"}.png`,
    });
    await page.keyboard.press("ArrowLeft");
    await caretAt(page, box.end);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await caretAt(page, box.start);
    await page.keyboard.press("ArrowLeft");
    await caretAt(page, box.left);
    await page.screenshot({
      path: `test-results/inline-caret-left-${tail || "end"}.png`,
    });
    await page.keyboard.type("Z");
    await saved(page, request, id, "aZ`xy`" + tail);
  });
}

test("padding on any style uses the same caret geometry; unpadded colors keep the native caret", async ({
  page,
  request,
}) => {
  const { editor, id } = await open(
    page,
    request,
    'a<span color="red">xy</span>b',
    "notdown",
  );
  const span = editor.locator('[data-text-color="red"]');
  await insideEnd(page, span);
  await expect(visibleCaret(page)).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(visibleCaret(page)).toHaveCount(0);
  await page.keyboard.press("ArrowLeft");
  await page.addStyleTag({
    content: '.pm-document [data-text-color="red"] { padding: 0 9px; }',
  });
  await page.setViewportSize({ width: 1000, height: 850 });
  const box = await edges(span);
  await caretAt(page, box.end);
  await page.keyboard.press("ArrowRight");
  await caretAt(page, box.right);
  await page.keyboard.type("Z");
  await saved(page, request, id, 'a<span color="red">xy</span>Zb');
});

test("nested color exits preserve continuing bold, and adjacent colors have a plain slot", async ({
  page,
  request,
}) => {
  const { editor, id } = await open(
    page,
    request,
    '**a<span color="red">xy</span>b** <span color="red">red</span><span color="blue">blue</span>',
    "notdown",
  );
  await insideEnd(page, editor.locator('[data-text-color="red"]').first());
  await page.keyboard.press("ArrowRight");
  await page.keyboard.type("Z");
  await expect(editor.locator("strong").last()).toContainText("Zb");
  await expect(editor.locator('[data-text-color="red"]').first()).toHaveText(
    "xy",
  );
  await insideEnd(page, editor.locator('[data-text-color="red"]').last());
  await page.keyboard.press("ArrowRight");
  await page.keyboard.type("plain");
  await expect(editor.locator('[data-text-color="red"]').last()).toHaveText(
    "red",
  );
  await expect(editor.locator('[data-text-color="blue"]')).toHaveText("blue");
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () => (await (await request.get(`/api/pages/${id}`)).json()).body,
    )
    .toContain(
      '<span color="red">red</span>plain<span color="blue">blue</span>',
    );
});

test("boundary caret follows scrolling and resizing and hides for selection, blur and IME", async ({
  page,
  request,
}) => {
  const { editor } = await open(
    page,
    request,
    Array(20).fill("Paragraph").join("\n\n") + "\n\na`xy`b",
  );
  const code = editor.locator("code");
  await code.scrollIntoViewIfNeeded();
  await insideEnd(page, code);
  await page.keyboard.press("ArrowRight");
  await caretAt(page, (await edges(code)).right);
  const beforeScroll = (await visibleCaret(page).boundingBox())!;
  const beforeCode = (await code.boundingBox())!;
  await page.locator("#main").evaluate((el) => {
    el.scrollTop -= 70;
  });
  await caretAt(page, (await edges(code)).right);
  const expectedTop =
    beforeScroll.y + (await code.boundingBox())!.y - beforeCode.y;
  await expect
    .poll(async () =>
      Math.abs((await visibleCaret(page).boundingBox())!.y - expectedTop),
    )
    .toBeLessThan(1.5);
  await expect
    .poll(async () => (await visibleCaret(page).boundingBox())!.y)
    .toBeGreaterThan(0);
  await page.setViewportSize({ width: 800, height: 900 });
  await caretAt(page, (await edges(code)).right);
  await editor.dispatchEvent("compositionstart");
  await expect(visibleCaret(page)).toHaveCount(0);
  await editor.dispatchEvent("compositionend", { data: "" });
  await expect(visibleCaret(page)).toHaveCount(1);
  await page.keyboard.press("Shift+ArrowRight");
  await expect(visibleCaret(page)).toHaveCount(0);
  await insideEnd(page, code);
  await page.locator("#page-title").focus();
  await expect(visibleCaret(page)).toHaveCount(0);
});

test("native attributed spans keep unknown attributes when exiting on either side", async ({
  page,
  request,
}) => {
  const { editor, id } = await open(
    page,
    request,
    'a[xy]{.tag data-future="keep"}b',
    "markdown",
  );
  const span = editor.locator("[data-native-span]");
  await expect(span).toHaveText("xy");
  await insideEnd(page, span);
  await page.keyboard.type("X");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.type("Z");
  await expect(span).toHaveText("xyX");
  await saved(page, request, id, 'a[xyX]{.tag data-future="keep"}Zb');
});

test("real IME composition preserves inside input, then commits plain text outside padded code", async ({
  page,
  request,
}) => {
  const { editor, id } = await open(page, request, "a`xy`b");
  const code = editor.locator("code");
  const cdp = await page.context().newCDPSession(page);
  const compose = async () => {
    await cdp.send("Input.imeSetComposition", {
      text: "中",
      selectionStart: 1,
      selectionEnd: 1,
    });
    await expect(visibleCaret(page)).toHaveCount(0);
    await cdp.send("Input.imeSetComposition", {
      text: "中文",
      selectionStart: 2,
      selectionEnd: 2,
    });
    await cdp.send("Input.insertText", { text: "中文" });
  };
  await insideEnd(page, code);
  await compose();
  await expect(code).toHaveText("xy中文");
  await page.keyboard.press("ArrowRight");
  await compose();
  await expect(code).toHaveText("xy中文");
  await saved(page, request, id, "a`xy中文`中文b");
  await cdp.detach();
});

for (const variant of ["commonmark", "notdown", "notion-markdown"]) {
  for (const tail of ["bbb", ""]) {
    test(`${variant}: right arrow exits inline code ${tail ? "before plain text" : "at line end"}`, async ({
      page,
      request,
    }) => {
      const { editor, id } = await open(
        page,
        request,
        "aaa`code`" + tail,
        variant,
      );
      const code = editor.locator("code");
      await caret(code);
      await expect(code).toHaveCSS("outline-style", "none");
      await page.keyboard.type("X");
      await expect(code).toHaveText("codeX");
      await page.keyboard.press("ArrowRight");
      await expect(editor.locator(".pm-inline-code-active")).toHaveCount(0);
      await expect(code).toHaveCSS("outline-style", "none");
      await expect(editor.locator("p")).toHaveText("aaacodeX" + tail);
      await page.keyboard.insertText("中文");
      await expect(code).toHaveText("codeX");
      await saved(page, request, id, "aaa`codeX`中文" + tail);
      await page.reload();
      await expect(editor.locator("code")).toHaveText("codeX");
      await expect(editor.locator("p")).toHaveText("aaacodeX中文" + tail);
    });
  }
}

test("left reenters; a second right arrow advances normally instead of skipping a character", async ({
  page,
  request,
}) => {
  const { editor, id } = await open(page, request, "aaa`code`bbb");
  const code = editor.locator("code");
  await caret(code);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await expect(code.locator(".pm-inline-code-active")).toHaveCount(1);
  await page.keyboard.type("X");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.type("Z");
  await saved(page, request, id, "aaa`codeX`bZbb");
});

test("code at the end of a paragraph exits before navigating to the next paragraph", async ({
  page,
  request,
}) => {
  const { editor, id } = await open(page, request, "`code`\n\nNext");
  await caret(editor.locator("code"));
  await page.keyboard.press("ArrowRight");
  await page.keyboard.type("plain");
  await saved(page, request, id, "`code`plain\n\nNext");
});

test("closing backticks automatically leave plain input, including after view switches", async ({
  page,
  request,
}) => {
  const { editor, id } = await open(page, request, "");
  await editor.click();
  await page.keyboard.type("`code`plain");
  await expect(editor.locator("code")).toHaveText("code");
  await saved(page, request, id, "`code`plain");
  await page.keyboard.press("Control+e");
  await page.keyboard.press("Control+e");
  await expect(editor).toBeVisible();
  await caret(editor.locator("code"));
  await page.keyboard.press("ArrowRight");
  await page.keyboard.type("Z");
  await saved(page, request, id, "`code`Zplain");
});

test("left boundary and a single emoji code run keep inside/outside states", async ({
  page,
  request,
}) => {
  const { editor, id } = await open(page, request, "a`😀`b");
  await caret(editor.locator("code"));
  await page.keyboard.press("ArrowLeft");
  await expect(editor.locator(".pm-inline-code-active")).toHaveCount(1);
  await page.keyboard.press("ArrowLeft");
  await expect(editor.locator(".pm-inline-code-active")).toHaveCount(0);
  await page.keyboard.type("Z");
  await saved(page, request, id, "aZ`😀`b");
});

test("Shift arrows still select text and Ctrl arrows retain word navigation", async ({
  page,
  request,
}) => {
  const { editor, id } = await open(page, request, "a`code`word tail");
  await caret(editor.locator("code"));
  await page.keyboard.press("Shift+ArrowRight");
  expect(await page.evaluate(() => window.getSelection()!.toString())).toBe(
    "w",
  );
  await caret(editor.locator("code"));
  await page.keyboard.press("Control+ArrowRight");
  await page.keyboard.type("Z");
  await expect(editor.locator("code")).toHaveText("code");
  const text = await editor.locator("p").textContent();
  expect(text).toMatch(/^acodeword ?Z/);
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () => (await (await request.get(`/api/pages/${id}`)).json()).body,
    )
    .toMatch(/^a`code`word ?Z/);
});
