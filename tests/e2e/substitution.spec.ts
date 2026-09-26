import { test, expect } from "@playwright/test";
import { expectSource } from "./source-helper";

for (const variant of ["notdown", "markdown_mmd"]) {
  test(`${variant}: substitution displays both revisions and preserves editing and decisions`, async ({ page, request }) => {
    const body = "Before {~~old <text>~>new **text**~~} after. Highlight {==highlight==}.";
    const response = await request.post("/api/pages", { data: {
      title: "Substitution regression", body,
      bodyFormat: variant === "notdown" ? "notion-markdown" : "markdown",
      syntax: { version: 1, variant, extensions: {} },
    } });
    expect(response.status()).toBe(201);
    const note = await response.json();
    await page.goto(`/#page/${note.id}`);
    const revision = page.locator(".pm-document .pm-critic-substitution");
    const old = revision.locator("del"), replacement = revision.locator("ins");
    await expect(revision).toHaveCount(1);
    await expect(old).toHaveText("old <text>");
    await expect(old).toHaveAttribute("contenteditable", "false");
    await expect(old).toHaveCSS("text-decoration-line", "line-through");
    await expect(replacement).toHaveText("new text");
    await expect(replacement.locator("strong")).toHaveText("text");
    await expect(revision).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(replacement).toHaveCSS("background-color", "rgb(218, 241, 220)");
    await expect(page.locator("mark.pm-critic")).toHaveText("highlight");

    // Edit within the replacement; the presentation-only old text must not enter the document.
    await replacement.evaluate(element => {
      (element.closest(".pm-document") as HTMLElement).focus();
      const range = document.createRange(); range.setStart(element.firstChild!, 3); range.collapse(true);
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
    await page.keyboard.type("er");
    await expect(replacement).toHaveText("newer text");
    await replacement.dblclick();
    await page.getByRole("textbox", { name: "Original text" }).fill("original <text>");
    await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
    await expect(old).toHaveText("original <text>");
    await page.locator('[data-mode="source"]').click();
    await expectSource(page, /\{~~original <text>~>newer \*\*text\*\*~~\}/);
    await page.locator('[data-mode="document"]').click();
    await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("{~~original <text>~>newer **text**~~}");
    await page.reload();
    await expect(old).toHaveText("original <text>");
    await expect(replacement).toHaveText("newer text");

    await replacement.dblclick();
    await page.getByRole("button", { name: "Reject revision" }).click();
    await expect(revision).toHaveCount(0);
    await expect(page.locator(".pm-document > p")).toContainText("Before original <text> after.");
    await page.keyboard.press("Control+z");
    await expect(replacement).toHaveText("newer text");
    await replacement.locator("strong").dblclick();
    await page.getByRole("button", { name: "Accept revision" }).click();
    await expect(revision).toHaveCount(0);
    await expect(page.locator(".pm-document > p")).toContainText("Before newer text after.");
    await expect(page.locator(".pm-document > p > strong")).toHaveText("text");
  });

  test(`${variant}: pasted substitution HTML retains the original once without turning into highlight`, async ({ page, request }) => {
    const response = await request.post("/api/pages", { data: {
      title: "Copy substitution", body: "Before {~~old~>new **text**~~} after.\n\nPaste here: ",
      bodyFormat: variant === "notdown" ? "notion-markdown" : "markdown",
      syntax: { version: 1, variant, extensions: {} },
    } });
    expect(response.status()).toBe(201);
    await page.goto(`/#page/${(await response.json()).id}`);
    const revision = page.locator(".pm-document .pm-critic-substitution");
    const html = await revision.evaluate(element => element.outerHTML);
    await page.locator(".pm-document > p").last().click();
    await page.keyboard.press("End");
    await page.locator(".pm-document").evaluate((element, html) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/html", html);
      element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }));
    }, html);
    await expect(revision).toHaveCount(2);
    await expect(revision.last().locator("del")).toHaveText("old");
    await expect(revision.last().locator("ins")).toHaveText("new text");
    await expect(revision.last().locator("strong")).toHaveText("text");
    await page.locator('[data-mode="source"]').click();
    await expectSource(page, /Paste here(?::|&#58;) *\{~~old~>new \*\*text\*\*~~\}/);
  });
}
