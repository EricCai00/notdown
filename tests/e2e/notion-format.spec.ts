import { expectSource } from "./source-helper.js";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

async function open(
  page: Page,
  request: APIRequestContext,
  body: string,
  bodyFormat = "notion-markdown",
) {
  const response = await request.post("/api/pages", {
    data: { title: "Enhanced Markdown validation", body, bodyFormat },
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
test("Notion editing preserves source blank lines and separates new blocks across save and reload", async ({
  page,
  request,
}) => {
  const body = "# Spacing\n\n\nFirst\n\n```text\ninside\n\ncode\n```\n\nTail\n";
  const note = await open(page, request, body);
  await page.locator('.editing-modes [data-mode="split"]').click();
  await page.locator(".pm-document h1").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" edited");
  await expectSource(page, body.replace("# Spacing", "# Spacing edited"));
  await page
    .locator(".pm-document > p")
    .filter({ hasText: /^Tail$/ })
    .click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("New block");
  const expected = body
    .replace("# Spacing", "# Spacing edited")
    .replace("Tail\n", "Tail\n\nNew block\n");
  await expectSource(page, expected);
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/pages/${note.id}`)).json()).body,
    )
    .toBe(expected);
  await page.reload();
  await page.locator('.editing-modes [data-mode="split"]').click();
  await expectSource(page, expected);
  await expect(page.locator(".pm-document > p")).toHaveText([
    "First",
    "Tail",
    "New block",
  ]);
  await expect(page.locator(".pm-document pre code")).toHaveText(
    "inside\n\ncode",
  );
});

test("official tags render editable columns, callouts, toggles, tables, colors, mentions and math", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const body =
    '# Page heading\n<callout icon="💡" color="blue_bg">\n\tA **useful** thought\n</callout>\n<details>\n<summary>Toggle title</summary>\n\tHidden child\n</details>\n<columns>\n\t<column>\n\t\tLeft column\n\t</column>\n\t<column>\n\t\tRight column\n\t</column>\n</columns>\n<table header-row="true">\n\t<tr>\n\t\t<td>Name</td>\n\t\t<td>Value</td>\n\t</tr>\n\t<tr>\n\t\t<td>Alpha</td>\n\t\t<td>Beta</td>\n\t</tr>\n</table>\n<span underline="true">Underlined</span> and $x^2$\n<mention-date start="2026-09-12"/>\n<table_of_contents/>\n<unknown url="https://example.com" alt="bookmark"/>';
  const coloredBody = body
    .replace(
      '<table header-row="true">',
      '<table header-row="true">\n\t<colgroup>\n\t\t<col color="yellow_bg"/>\n\t\t<col width="240"/>\n\t</colgroup>',
    )
    .replace("<td>Name</td>", '<td color="red_bg">Name</td>')
    .replace("<tr>\n\t\t<td>Alpha", '<tr color="green_bg">\n\t\t<td>Alpha')
    .replace("<td>Beta</td>", '<td color="blue">Beta</td>');
  const note = await open(page, request, coloredBody);
  const editor = page.locator(".pm-document");
  await expect(editor.locator(".pm-callout strong")).toHaveText("useful");
  await expect(editor.locator(".pm-callout")).toHaveCSS(
    "background-color",
    "rgb(231, 243, 248)",
  );
  await expect(editor.locator(".note-column")).toHaveCount(2);
  await expect(editor.locator(".pm-table td")).toHaveCount(4);
  await expect(editor.locator("td").nth(0)).toHaveCSS(
    "background-color",
    "rgb(253, 235, 236)",
  );
  await expect(editor.locator("td").nth(2)).toHaveCSS(
    "background-color",
    "rgb(237, 243, 236)",
  );
  await expect(editor.locator("td").nth(3)).toHaveCSS(
    "color",
    "rgb(51, 126, 169)",
  );
  await expect(editor.locator("u")).toHaveText("Underlined");
  await expect(editor.locator(".pm-inline-math .katex")).toHaveCount(1);
  await expect(editor.locator(".pm-toc button")).toHaveText("Page heading");
  await editor.getByRole("button", { name: "Collapse content", exact: true }).click();
  await expect(editor.getByText("Hidden child", { exact: true })).toBeHidden();
  await editor.getByRole("button", { name: "Expand content", exact: true }).click();
  await expect(editor.getByText("Hidden child", { exact: true })).toBeVisible();
  // Click the text itself, avoiding the wide empty column hit area in Chrome.
  await editor
    .locator(".note-column p")
    .first()
    .click({ position: { x: 24, y: 10 } });
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("second line");
  const cell = editor.locator("td p").last();
  await cell.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" edited");
  await page.keyboard.press("Tab");
  await page.keyboard.type("New row");
  await expect(editor.locator("tr")).toHaveCount(3);
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/pages/${note.id}`)).json()).body,
    )
    .toContain("Left column<br>second line");
  await page.keyboard.press("Control+e");
  await expectSource(page, /<columns>[\s\S]*<td>New row<\/td>/);
  await expectSource(page, /:::nest|:::columns|::page/, true);
  await page.keyboard.press("Control+e");
  await expect(
    editor.locator(".note-column p").first().locator("br"),
  ).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".pm-table tr")).toHaveCount(3);
  await expect(page.locator(".pm-table td").nth(2)).toHaveCSS(
    "background-color",
    "rgb(237, 243, 236)",
  );
  await expect(page.locator(".pm-table td").nth(4)).toHaveCSS(
    "background-color",
    "rgb(251, 243, 219)",
  );
  await expect(page.locator(".pm-unknown")).toHaveText("bookmark");
  await page.screenshot({
    path: "test-results/notion-format.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("legacy paragraphs keep source and enable nesting explicitly across reload", async ({
  page,
  request,
}) => {
  const note = await open(
    page,
    request,
    "one\ncontinued\n\n:::nest\nParent\n:::children\nChild\n:::endnest\n\nTail",
    "markdown",
  );
  await page.keyboard.press("Control+e");
  await expectSource(
    page,
    "one\ncontinued\n\n:::nest\nParent\n:::children\nChild\n:::endnest\n\nTail",
  );
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/pages/${note.id}`)).json()).bodyFormat,
    )
    .toBe("markdown");
  await page.keyboard.press("Control+e");
  await expect(page.locator(".pm-document > p").first()).toHaveText(
    "one continued",
  );
  await expect(page.locator(".pm-nested-block")).toHaveCount(0);
  await page.locator(".syntax-options summary").click();
  await page.locator('[data-extension="notion_nesting"]').check();
  await page.locator(".syntax-options summary").click();
  await page.keyboard.press("Control+s");
  // The first read may precede the asynchronous save and still have no syntax override.
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).syntax?.extensions?.notion_nesting).toBe(true);
  await expect(page.locator(".pm-nested-block > p")).toHaveText([
    "Parent",
    "Child",
  ]);
  await page.reload();
  await expect(page.locator(".pm-nested-block > p")).toHaveText([
    "Parent",
    "Child",
  ]);
});

test("slash inserts an official callout block without exposing tag source", async ({
  page,
  request,
}) => {
  const note = await open(page, request, "");
  const editor = page.locator(".pm-document");
  await editor.click();
  await page.keyboard.type("/callout");
  // Page-parent options can also contain “Callout”; target the slash command.
  await expect(page.getByRole("listbox", { name: "Block types" }).getByRole("option", { name: /Callout/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(editor.locator(".pm-callout")).toHaveCount(1);
  await expect(editor).not.toContainText("<callout");
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/pages/${note.id}`)).json()).body,
    )
    .toMatch(
      /<callout icon="💡" color="gray_bg">|<callout color="gray_bg" icon="💡">/,
    );
});
