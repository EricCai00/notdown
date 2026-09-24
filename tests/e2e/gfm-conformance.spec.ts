import { test, expect } from "@playwright/test";
import { expectSource } from "./source-helper";

test("GFM extensions remain editable and persist across source switches and reload", async ({ page, request }) => {
  const body = [
    "~single~ ~~double~~ ~~~literal~~~",
    "abcwww.example.com www.example.com mailto:foo@bar.baz xmpp:foo@bar.baz/txt/bin",
    "- [ ] todo\n- [x] done",
    "| Heading | Right |\n| :--- | ---: |\n| `a\\|b` | first<br>second |",
    "<script>window.gfmUnexpected = true</script>",
    "Tail",
  ].join("\n\n");
  const response = await request.post("/api/pages", { data: {
    title: "GFM conformance", body, bodyFormat: "markdown",
    syntax: { version: 1, variant: "gfm", extensions: {} },
  } });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  const editor = page.locator(".pm-document");
  await expect(editor.locator("s")).toHaveText(["single", "double"]);
  await expect(editor).toContainText("~~~literal~~~");
  await expect(editor.locator('a[href="http://www.example.com"]')).toHaveText("www.example.com");
  await expect(editor.locator('a[href="mailto:foo@bar.baz"]')).toHaveText("mailto:foo@bar.baz");
  await expect(editor.locator('a[href="xmpp:foo@bar.baz/txt"]')).toHaveText("xmpp:foo@bar.baz/txt");
  await expect(editor.locator('li[data-checked="true"]')).toContainText("done");
  await expect(editor.locator("th")).toHaveCount(2);
  await expect(editor.locator(".pm-html-preview")).toHaveText("<script>window.gfmUnexpected = true</script>");
  expect(await page.evaluate(() => (window as unknown as { gfmUnexpected?: boolean }).gfmUnexpected)).toBeUndefined();
  await editor.locator("th p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" edited");
  await editor.locator(":scope > p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" saved");
  await page.locator('[data-mode="source"]').click();
  await expectSource(page, /Heading edited/);
  await expectSource(page, /first<br>second/);
  await page.locator('[data-mode="document"]').click();
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("Tail saved");
  await page.reload();
  await expect(editor.locator("th").first()).toHaveText("Heading edited");
  await expect(editor.locator("td code")).toHaveText("a|b");
  await expect(editor.locator("td").last().locator("br")).toHaveCount(1);
  await expect(editor.locator("s")).toHaveText(["single", "double"]);
  await expect(editor.locator(".pm-html-preview")).toHaveText("<script>window.gfmUnexpected = true</script>");
});

test("GFM HTML containers keep Markdown inside their fold and retain source edits", async ({ page, request }) => {
  const body = '<details>\n<summary>More</summary>\n\n# Inside\n\n**body**\n\n</details>\n\nTail';
  const response = await request.post("/api/pages", { data: {
    title: "GFM HTML container", body, bodyFormat: "markdown",
    syntax: { version: 1, variant: "gfm", extensions: {} },
  } });
  expect(response.status()).toBe(201);
  const note = await response.json();
  await page.goto(`/#page/${note.id}`);
  const editor = page.locator(".pm-document"), preview = editor.locator(".pm-html-preview");
  await expect(preview).toHaveCount(1);
  await expect(preview.locator("details h1")).toBeHidden();
  await preview.locator("summary").click();
  await expect(preview.locator("details h1")).toHaveText("Inside");
  await expect(preview.locator("details strong")).toHaveText("body");
  await editor.locator(":scope > p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" edited");
  await page.locator('[data-mode="source"]').click();
  await expectSource(page, body + " edited");
  await page.locator('[data-mode="document"]').click();
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(body + " edited");
  await page.reload();
  await expect(preview.locator("details h1")).toHaveText("Inside");
});
