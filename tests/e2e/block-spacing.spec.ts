import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

const button = '<button label="Add a note" action="insert-text" target="New note"/>';
const breadcrumb = '<breadcrumb/>';
const inner = `First inner paragraph\n\n${breadcrumb}\n\n${button}\n\nLast inner paragraph`;
const syntax = { version: 1, variant: "notdown", extensions: { notion_button: true, notion_breadcrumb: true, notion_tabs: true } };
async function open(page: Page, request: APIRequestContext, body: string) {
  const note = await (await request.post("/api/pages", { data: { title: "Block spacing", body, bodyFormat: "notion-markdown", syntax } })).json();
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator("#page-title")).toHaveValue("Block spacing");
  await expect(page.locator(".pm-document")).toBeVisible();
  return note;
}
async function gaps(page: Page, selector: string) {
  return page.locator(selector).evaluateAll(nodes => nodes.slice(1).map((node, i) => node.getBoundingClientRect().top - nodes[i].getBoundingClientRect().bottom));
}

test("compact blocks have equal spacing in either order, including marquee selection and narrow screens", async ({ page, request }) => {
  const body = `A paragraph\n\n/\n\n${breadcrumb}\n\n${button}\n\nFirst note\n\nSecond note\n\n${button}\n\n${breadcrumb}\n\nLast note`;
  const note = await open(page, request, body);
  const selector = ".pm-document > *";
  expect(await gaps(page, selector)).toEqual(Array(8).fill(4));
  const first = (await page.locator(selector).first().boundingBox())!;
  const last = (await page.locator(selector).last().boundingBox())!;
  await page.mouse.move(first.x - 18, first.y + 1);
  await page.mouse.down(); await page.mouse.move(last.x + 80, last.y + last.height - 1, { steps: 12 }); await page.mouse.up();
  await expect(page.locator(".pm-document > .pm-block-selected")).toHaveCount(9);
  expect(await gaps(page, selector)).toEqual(Array(8).fill(4));
  await page.screenshot({ path: "test-results/block-spacing-selected.png" });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await gaps(page, selector)).toEqual(Array(8).fill(4));
  await page.keyboard.press("Control+s");
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body);
});

test("headings and surfaces keep symmetric spacing while lists and table cells remain compact", async ({ page, request }) => {
  await open(page, request, `Paragraph\n\n${button}\n\n## Heading\n\nAfter heading\n\n<callout>\nA callout\n</callout>\n\nAfter callout\n\n${["```text", "Code", "```"].join("\n")}\n\nAfter code\n\n| A | B |\n| --- | --- |\n| C | D |\n\nAfter table\n\n- First item\n- Second item\n\nAfter list`);
  expect(await gaps(page, ".pm-document > *")).toEqual([4, 16, 4, 12, 12, 12, 12, 28, 28, 4, 4]);
  expect(await gaps(page, ".pm-document > ul > li")).toEqual([0]);
  await expect(page.locator(".pm-table td p").first()).toHaveCSS("margin-top", "0px");
  await page.locator(".pm-document").screenshot({ path: "test-results/block-spacing-surfaces.png" });
});

test("Callout, Tabs and columns use the same inner spacing without extra edge margins", async ({ page, request }) => {
  const body = `<callout>\n${inner}\n</callout>\n\n<tabs>\n<tab title="First">\n${inner}\n</tab>\n<tab title="Second">\nHidden text\n</tab>\n</tabs>\n\n<columns>\n<column>\n${inner}\n</column>\n<column>\nOther column\n</column>\n</columns>`;
  await open(page, request, body);
  for (const selector of [".pm-callout-content", ".pm-object-tab:not([hidden]) > .pm-object-content", ".note-column:first-child"]) {
    expect(await gaps(page, selector + " > *")).toEqual([4, 4, 4]);
    await expect(page.locator(selector + " > :first-child")).toHaveCSS("margin-top", "0px");
    await expect(page.locator(selector + " > :last-child")).toHaveCSS("margin-bottom", "0px");
  }
  await page.locator(".pm-document").screenshot({ path: "test-results/block-spacing-nested.png" });
});
