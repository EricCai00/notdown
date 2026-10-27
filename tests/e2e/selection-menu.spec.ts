import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";

async function open(
  page: Page,
  request: APIRequestContext,
  body = "Selected words remain here.",
  variant = "notion-markdown",
  extensions: Record<string, boolean> = {},
) {
  const response = await request.post("/api/pages", {
    data: {
      title: "Selection menu",
      body,
      bodyFormat:
        ["notion-markdown", "notdown"].includes(variant) ? "notion-markdown" : "markdown",
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
async function select(page: Page, selector = ".pm-document > p", length = 14) {
  await page.locator(selector).first().click();
  await page.keyboard.press("Home");
  await page.keyboard.down("Shift");
  for (let n = 0; n < length; n++) await page.keyboard.press("ArrowRight");
  await page.keyboard.up("Shift");
}
const toolbar = (page: Page) =>
  page.getByRole("toolbar", { name: "Text formatting" });

test("Notdown text and background colors coexist, clear independently and survive undo and reload", async ({ page, request }) => {
  const note = await open(page, request, '<span color="yellow_bg" class="example" custom="keep">Selected words</span> remain here.', "notdown");
  const choose = async (name: string) => {
    await select(page);
    await toolbar(page).getByRole("button", { name: "Text and background color" }).click();
    await toolbar(page).getByRole("button", { name, exact: true }).last().click();
  };
  await choose("Red text");
  const both = page.locator('.pm-document [data-text-color="red"][data-bg-color="yellow"]');
  await expect(both).toHaveText("Selected words");
  await expect(both).toHaveCSS("color", "rgb(212, 76, 71)");
  await expect(both).toHaveCSS("background-color", "rgb(251, 243, 219)");
  await saved(page, request, note.id, 'color="yellow_bg"');
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).not.toContain('bg_color=');
  await saved(page, request, note.id, 'custom="keep"');
  await page.reload();
  await expect(both).toHaveText("Selected words");
  await choose("Default text");
  await expect(page.locator('.pm-document [data-text-color=""][data-bg-color="yellow"]')).toHaveText("Selected words");
  await page.keyboard.press("Control+z");
  await expect(both).toHaveText("Selected words");
  await choose("Default background");
  await expect(page.locator('.pm-document [data-text-color="red"]')).toHaveText("Selected words");
  await expect(page.locator('.pm-document [data-bg-color]')).toHaveCount(0);
  await choose("Blue background");
  await expect(page.locator('.pm-document [data-text-color="red"][data-bg-color="blue"]')).toHaveText("Selected words");
  await select(page);
  await toolbar(page).getByRole("button", { name: "Clear formatting" }).click();
  await saved(page, request, note.id, 'custom="keep"');
  await page.reload();
  await expect(page.locator('.pm-document [data-bg-color], .pm-document [data-text-color="red"]')).toHaveCount(0);
  const body = (await (await request.get(`/api/pages/${note.id}`)).json()).body;
  expect(body).not.toContain('bg_color=');
  expect(body).not.toContain('color=');
  expect(body).toContain('class="example"');
});

for (const variant of ["notdown", "notion-markdown"] as const) test(`${variant} v2 nested text/background colors stay independent in the color menu and after reload`, async ({ page, request }, testInfo) => {
  const body = '<span color="yellow_bg"><span color="red">Selected words</span></span> remain here.';
  const response = await request.post("/api/pages", { data: { title: "V2 combined colors", body, syntax: { version: 1, variant, notionVersion: "v2", extensions: {} } } });
  const note = await response.json(); await page.goto(`/#page/${note.id}`);
  const both = page.locator('.pm-document [data-text-color="red"][data-bg-color="yellow"]');
  await expect(both).toHaveText("Selected words");
  await expect(both).toHaveCSS("color", "rgb(212, 76, 71)");
  await expect(both).toHaveCSS("background-color", "rgb(251, 243, 219)");
  const choose = async (name: string) => {
    await select(page);
    await toolbar(page).getByRole("button", { name: "Text and background color" }).click();
    await toolbar(page).getByRole("button", { name, exact: true }).last().click();
  };
  await choose("Blue text");
  await expect(page.locator('.pm-document [data-text-color="blue"][data-bg-color="yellow"]')).toHaveText("Selected words");
  await choose("Green background");
  const edited = page.locator('.pm-document [data-text-color="blue"][data-bg-color="green"]');
  await expect(edited).toHaveText("Selected words");
  await saved(page, request, note.id, 'color="green_bg"');
  const stored = (await (await request.get(`/api/pages/${note.id}`)).json()).body;
  expect(stored).toContain('color="blue"'); expect(stored).not.toContain("bg_color=");
  await page.reload(); await expect(edited).toHaveText("Selected words");
  await page.screenshot({ path: testInfo.outputPath("v2-combined-colors.png") });
  await choose("Default text");
  await expect(page.locator('.pm-document [data-text-color=""][data-bg-color="green"]')).toHaveText("Selected words");
  await page.keyboard.press("Control+z"); await expect(edited).toHaveText("Selected words");
  await choose("Default background");
  await expect(page.locator('.pm-document [data-text-color="blue"]')).toHaveText("Selected words");
  await expect(page.locator('.pm-document [data-bg-color]')).toHaveCount(0);
  await saved(page, request, note.id, 'color="blue"');
  await page.reload();
  await expect(page.locator('.pm-document [data-text-color="blue"]')).toHaveText("Selected words");
});

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
    .toContain(expected);
}

test("selection formatting, colors, recent colors and undo survive save/reload", async ({
  page,
  request,
}) => {
  const note = await open(page, request);
  await expect(toolbar(page)).toBeHidden();
  await select(page);
  await expect(toolbar(page)).toBeVisible();
  await toolbar(page)
    .getByRole("button", { name: "Bold", exact: true })
    .click();
  await expect(page.locator(".pm-document strong")).toHaveText(
    "Selected words",
  );
  await toolbar(page)
    .getByRole("button", { name: "Text and background color" })
    .click();
  await toolbar(page)
    .getByRole("button", { name: "Blue text", exact: true })
    .click();
  await expect(
    page.locator('.pm-document [data-text-color="blue"]'),
  ).toHaveText("Selected words");
  await page.keyboard.press("Control+z");
  await expect(page.locator(".pm-document [data-text-color]")).toHaveCount(0);
  await expect(page.locator(".pm-document strong")).toHaveText(
    "Selected words",
  );
  await page.keyboard.press("Control+y");
  await expect(
    page.locator('.pm-document [data-text-color="blue"]'),
  ).toHaveText("Selected words");
  // Shared source/document history restores content and places a caret.
  await select(page);
  await toolbar(page)
    .getByRole("button", { name: "Text and background color" })
    .click();
  await expect(toolbar(page).getByText("Recently used")).toBeVisible();
  await toolbar(page)
    .getByRole("button", { name: "Yellow background", exact: true })
    .click();
  await saved(page, request, note.id, '<span color="yellow_bg">');
  await page.reload();
  await expect(
    page.locator('.pm-document [data-text-color="yellow_bg"]'),
  ).toHaveText("Selected words");
  await expect(page.locator(".pm-document strong")).toHaveText(
    "Selected words",
  );
  await select(page);
  await toolbar(page).getByRole("button", { name: "Clear formatting" }).click();
  await expect(
    page.locator(".pm-document strong, .pm-document [data-text-color]"),
  ).toHaveCount(0);
  await saved(page, request, note.id, "Selected words remain here.");
});

test("block conversion and ordinary links retain selected text; keyboard dismisses menu", async ({
  page,
  request,
}) => {
  const note = await open(page, request);
  await select(page);
  await toolbar(page).getByRole("button", { name: "Turn into" }).click();
  await toolbar(page)
    .getByRole("button", { name: "Heading 4", exact: true })
    .click();
  await expect(page.locator(".pm-document h4")).toHaveText(
    "Selected words remain here.",
  );
  await toolbar(page)
    .getByRole("button", { name: "Link", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Link address" })
    .fill("https://example.com");
  await page.getByRole("combobox", { name: "Link address" }).press("Enter");
  await expect(
    page.locator('.pm-document a[href="https://example.com"]'),
  ).toHaveText("Selected words");
  await saved(page, request, note.id, "[Selected words](https://example.com)");
  await select(page, ".pm-document h4");
  await page.keyboard.press("Control+Shift+m");
  await expect(
    toolbar(page).getByRole("button", { name: "Turn into" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    toolbar(page).getByRole("group", { name: "Block types" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    toolbar(page).getByRole("group", { name: "Block types" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(toolbar(page)).toBeHidden();
  await page.keyboard.press("ArrowRight");
  await expect(toolbar(page)).toBeHidden();
});

test("dialect and extensions filter unsupported formats; code and table respect context", async ({
  page,
  request,
}) => {
  await open(
    page,
    request,
    "Selected words remain here.\n\n```\ncode words\n```\n\n| Head |\n| --- |\n| Cell words |",
    "gfm",
    { notion_colors: false, strikeout: false },
  );
  await select(page);
  await expect(toolbar(page)).toBeVisible();
  for (const name of [
    "Text and background color",
    "Underline",
    "Strikethrough",
  ])
    await expect(
      toolbar(page).getByRole("button", { name, exact: true }),
    ).toHaveCount(0);
  await toolbar(page)
    .getByRole("button", { name: "Bold", exact: true })
    .click();
  await expect(page.locator(".pm-document strong")).toHaveText(
    "Selected words",
  );
  await select(page, ".pm-document pre", 4);
  await expect(toolbar(page)).toBeHidden();
  await select(page, ".pm-document td", 4);
  await expect(toolbar(page)).toBeVisible();
  await expect(
    toolbar(page).getByRole("button", { name: "Turn into" }),
  ).toHaveCount(0);
});

test("enabled color extension preserves unknown span attributes and stays within a small viewport", async ({
  page,
  request,
}) => {
  const note = await open(
    page,
    request,
    '<span color="red" custom="keep">Selected words</span> remain here.',
    "commonmark",
    { notion_colors: true },
  );
  await page.setViewportSize({ width: 640, height: 560 });
  await select(page);
  await toolbar(page)
    .getByRole("button", { name: "Text and background color" })
    .click();
  const bounds = await toolbar(page).boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(640);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(560);
  await page.screenshot({ path: "test-results/selection-colors.png" });
  await toolbar(page)
    .getByRole("button", { name: "Green text", exact: true })
    .click();
  await saved(page, request, note.id, 'custom="keep"');
  await saved(page, request, note.id, 'color="green"');
  await page.locator('.editing-modes [data-mode="source"]').click();
  await expect(toolbar(page)).toBeHidden();
});

test("mouse drag and cross-paragraph selection format text without offering block conversion", async ({
  page,
  request,
}) => {
  await open(page, request, "First paragraph\n\nSecond paragraph");
  const first = await page.locator(".pm-document > p").first().boundingBox();
  const second = await page.locator(".pm-document > p").last().boundingBox();
  await page.mouse.move(first!.x + 3, first!.y + first!.height / 2);
  await page.mouse.down();
  await page.mouse.move(second!.x + 100, second!.y + second!.height / 2, {
    steps: 12,
  });
  await expect(toolbar(page)).toBeHidden();
  await page.mouse.up();
  await expect(toolbar(page)).toBeVisible();
  await expect(
    toolbar(page).getByRole("button", { name: "Turn into" }),
  ).toHaveCount(0);
  await toolbar(page)
    .getByRole("button", { name: "Italic", exact: true })
    .click();
  await expect(page.locator(".pm-document p em")).toHaveCount(2);
});

test("inline equation uses the selected text and saves with the current codec", async ({
  page,
  request,
}) => {
  const note = await open(page, request, "x^2 plus text");
  await select(page, ".pm-document > p", 3);
  await toolbar(page)
    .getByRole("button", { name: "Inline equation", exact: true })
    .click();
  await expect(page.locator(".pm-inline-math .katex")).toHaveCount(1);
  await saved(page, request, note.id, "$x^2$ plus text");
  await page.reload();
  await expect(page.locator(".pm-inline-math .katex")).toHaveCount(1);
});

test("clear formatting removes duplicated underline source attributes while preserving unknown fields", async ({
  page,
  request,
}) => {
  const note = await open(
    page,
    request,
    '<span color="red" underline="true" custom="keep">Selected words</span>',
  );
  await select(page);
  await toolbar(page).getByRole("button", { name: "Clear formatting" }).click();
  await saved(page, request, note.id, 'custom="keep"');
  await page.reload();
  await expect(page.locator(".pm-document u")).toHaveCount(0);
  await expect(
    page.locator('.pm-document [data-text-color="red"]'),
  ).toHaveCount(0);
  await expect(page.locator(".pm-document")).toHaveText("Selected words");
});
