import {
  expect,
  test,
  type Page,
  type APIRequestContext,
  type Locator,
} from "@playwright/test";
import { expectSource } from "./source-helper";

const body =
  '<columns future="keep">\n\t<column extra="yes">\n\t\tLeft column\n\t</column>\n\t<column>\n\t\tRight column\n\t</column>\n</columns>\n\nTail';
async function open(page: Page, request: APIRequestContext, source = body) {
  const response = await request.post("/api/pages", {
    data: {
      title: "Column resizing",
      body: source,
      bodyFormat: "notion-markdown",
      syntax: { version: 1, variant: "notdown", extensions: {} },
    },
  });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.addInitScript(
    (id) => localStorage.setItem("notdown-page", id),
    note.id,
  );
  await page.goto("/");
  await expect(
    page.locator(".pm-document .note-columns").first(),
  ).toBeVisible();
  return note;
}
async function widths(columns: Locator) {
  return columns
    .locator(":scope > .pm-columns-content > .note-column")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().width),
    );
}
async function drag(
  page: Page,
  handle: Locator,
  delta: number,
  release = true,
) {
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + delta, box.y + 10, {
    steps: 8,
  });
  if (release) await page.mouse.up();
}

test("external refresh during a drag cancels the stale resize", async ({ page, request }) => {
  const note = await open(page, request);
  const columns = page.locator(".pm-document .note-columns");
  await drag(page, columns.locator(":scope > .pm-column-resizer"), 100, false);
  const remoteBody = body.replace("Left column", "External column");
  const response = await request.put(`/api/pages/${note.id}`, { data: { body: remoteBody, baseRevision: note.revision } });
  expect(response.ok()).toBe(true);
  await expect(columns).toContainText("External column", { timeout: 15000 });
  await page.mouse.up();
  await page.keyboard.press("Control+s");
  const saved = (await (await request.get(`/api/pages/${note.id}`)).json()).body;
  expect(saved).toBe(remoteBody);
  const sizes = await widths(columns);
  expect(Math.abs(sizes[0] - sizes[1])).toBeLessThan(1);
});

test("mouse resizing previews, saves Markdown, survives reload, and is one undo step", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const note = await open(page, request);
  const columns = page.locator(".pm-document .note-columns");
  const handle = columns.locator(":scope > .pm-column-resizer");
  const before = await widths(columns);
  await drag(page, handle, -100, false);
  expect((await widths(columns))[0]).toBeLessThan(before[0] - 80);
  await page.mouse.up();
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/pages/${note.id}`)).json()).body,
    )
    .toContain("width-ratio=");
  const saved = (await (await request.get(`/api/pages/${note.id}`)).json())
    .body;
  expect(saved).toContain('future="keep"');
  expect(saved).toContain('extra="yes"');
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => Math.abs((await widths(columns))[0] - before[0]))
    .toBeLessThan(1);
  await page.keyboard.press("Control+Shift+z");
  await expect
    .poll(async () => (await widths(columns))[0])
    .toBeLessThan(before[0] - 80);
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/pages/${note.id}`)).json()).body,
    )
    .toBe(saved);
  await page.reload();
  await expect
    .poll(async () => (await widths(columns))[0])
    .toBeLessThan(before[0] - 80);
  await page.locator('.editing-modes [data-mode="split"]').click();
  await expectSource(page, saved);
  await page.locator('.editing-modes [data-mode="document"]').click();
  await handle.hover();
  await page.screenshot({
    path: "test-results/columns-resize.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("typing and keyboard resizing preserve separate undo history and save together", async ({
  page,
  request,
}) => {
  const note = await open(page, request);
  const columns = page.locator(".pm-document .note-columns"),
    handle = columns.locator(":scope > .pm-column-resizer");
  await columns.locator("p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" edited");
  const before = await widths(columns);
  await handle.focus();
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(async () => (await widths(columns))[0])
    .toBeLessThan(before[0] - 5);
  await columns.locator("p").first().click();
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => Math.abs((await widths(columns))[0] - before[0]))
    .toBeLessThan(1);
  await expect(columns.locator("p").first()).toHaveText("Left column edited");
  await page.keyboard.press("Control+Shift+z");
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/pages/${note.id}`)).json()).body,
    )
    .toMatch(/width-ratio=.*\n\t\tLeft column edited/);
});

test("Escape cancels preview, extreme drag clamps, and double click resets", async ({
  page,
  request,
}) => {
  const note = await open(page, request);
  const columns = page.locator(".pm-document .note-columns"),
    handle = columns.locator(":scope > .pm-column-resizer");
  const before = await widths(columns);
  await drag(page, handle, 120, false);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(Math.abs((await widths(columns))[0] - before[0])).toBeLessThan(1);
  await page.keyboard.press("Control+s");
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(
    body,
  );
  await drag(page, handle, -1000);
  expect((await widths(columns))[0]).toBeGreaterThanOrEqual(79);
  await handle.dblclick();
  await expect
    .poll(async () =>
      Math.abs((await widths(columns))[0] - (await widths(columns))[1]),
    )
    .toBeLessThan(1);
  await page.setViewportSize({ width: 600, height: 1000 });
  await expect(handle).toBeHidden();
});

test("three columns resize only neighbours and nested columns resize independently", async ({
  page,
  request,
}) => {
  const source =
    '<columns>\n\t<column width-ratio="0.3">\n\t\tOne\n\t</column>\n\t<column width-ratio="0.3">\n\t\tTwo\n\t</column>\n\t<column width-ratio="0.4">\n\t\t<columns>\n\t\t\t<column>\n\t\t\t\tInner left\n\t\t\t</column>\n\t\t\t<column>\n\t\t\t\tInner right\n\t\t\t</column>\n\t\t</columns>\n\t</column>\n</columns>';
  await open(page, request, source);
  const outer = page.locator(".pm-document > .note-columns");
  const before = await widths(outer);
  await drag(page, outer.locator(":scope > .pm-column-resizer").first(), -35);
  const after = await widths(outer);
  expect(after[0]).toBeLessThan(before[0] - 30);
  expect(Math.abs(after[2] - before[2])).toBeLessThan(1);
  const inner = outer.locator(".note-columns");
  const innerBefore = await widths(inner);
  await drag(page, inner.locator(":scope > .pm-column-resizer"), 15);
  expect((await widths(inner))[0]).toBeGreaterThan(innerBefore[0] + 10);
  expect(Math.abs((await widths(outer))[0] - after[0])).toBeLessThan(1);
});
