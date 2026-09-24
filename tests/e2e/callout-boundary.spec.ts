import { test, expect } from "@playwright/test";
import { expectSource } from "./source-helper.js";

for (const variant of ["commonmark", "markdown", "gfm", "typora", "obsidian", "notdown"]) {
  test(`${variant}: callout titles and folding obey dialect boundaries after editing`, async ({ page, request }) => {
    const body = "> [!NOTE]\n> Basic\n\n> [!NOTE]+ Expanded\n> Open body\n\n> [!NOTE]- Collapsed\n> Closed body\n\n> [!NOTE] Custom title\n> Titled body\n\nTail";
    const response = await request.post("/api/pages", { data: {
      title: `Callout boundary ${variant}`, body,
      bodyFormat: variant === "notdown" ? "notion-markdown" : "markdown",
      syntax: { version: 1, variant, extensions: { alerts: true } },
    } });
    expect(response.status()).toBe(201);
    const note = await response.json();
    await page.goto(`/#page/${note.id}`);
    const editor = page.locator(".pm-document");
    const extended = variant === "obsidian" || variant === "notdown";
    await expect(editor.locator(".pm-alert")).toHaveCount(extended ? 4 : 1);
    await expect(editor.locator("details.pm-alert")).toHaveCount(extended ? 2 : 0);
    if (extended) {
      await expect(editor.locator("details.pm-alert").nth(0)).toHaveAttribute("open");
      await expect(editor.locator("details.pm-alert").nth(1)).not.toHaveAttribute("open");
      await expect(editor.locator("aside.pm-alert").last()).toContainText("Custom title");
    } else {
      await expect(editor.locator("blockquote")).toHaveCount(3);
      await expect(editor.locator("blockquote").nth(0)).toContainText("[!NOTE]+ Expanded");
      await expect(editor.locator("blockquote").nth(1)).toContainText("[!NOTE]- Collapsed");
      await expect(editor.locator("blockquote").nth(2)).toContainText("[!NOTE] Custom title");
    }
    await editor.locator(".pm-alert p").filter({ hasText: /^Basic$/ }).click();
    await page.keyboard.press("End");
    await page.keyboard.type(" edited");
    await page.locator('[data-mode="source"]').click();
    const expected = body.replace("Basic", "Basic edited");
    await expectSource(page, expected);
    await page.locator('[data-mode="document"]').click();
    await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(expected);
    await page.reload();
    await expect(editor.locator(".pm-alert")).toHaveCount(extended ? 4 : 1);
    await expect(editor.locator(".pm-alert").first()).toContainText("Basic edited");
  });
}
