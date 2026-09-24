import { test, expect } from "@playwright/test";

for (const mode of ["document", "split"]) {
  test(`${mode}: line blocks look like paragraphs and double Enter exits the block`, async ({ page, request }, testInfo) => {
    const response = await request.post("/api/pages", { data: {
      title: "Line block interaction", body: "Before\n\n| Alpha\n\nAfter\n\nOther",
      syntax: { version: 1, variant: "notdown", extensions: {} },
    } });
    expect(response.status()).toBe(201);
    const note = await response.json();
    await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
    await page.goto("/");
    await page.locator(`.editing-modes [data-mode="${mode}"]`).click();
    const editor = page.locator("#editor .pm-document");
    const block = editor.locator(".pm-line-block");
    const rows = block.locator(".pm-verse-line");
    await expect(block).toHaveCSS("border-left-width", "0px");
    await expect(block).toHaveCSS("padding-left", "0px");
    const paragraph = editor.locator(":scope > p").first();
    for (const property of ["font-size", "line-height", "padding-left", "padding-right"]) {
      await expect(rows.first()).toHaveCSS(property, await paragraph.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property));
    }
    expect((await rows.first().boundingBox())!.x).toBe((await paragraph.boundingBox())!.x);
    await rows.first().click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await expect(block).toHaveCount(1);
    await expect(rows).toHaveText(["Alpha", ""]);
    await page.keyboard.type("Beta");
    await expect(rows).toHaveText(["Alpha", "Beta"]);
    const first = (await rows.first().boundingBox())!;
    const second = (await rows.last().boundingBox())!;
    const after = (await editor.locator(":scope > p").filter({ hasText: /^After$/ }).boundingBox())!;
    const other = (await editor.locator(":scope > p").filter({ hasText: /^Other$/ }).boundingBox())!;
    const lineHeight = await rows.first().evaluate(element => parseFloat(getComputedStyle(element).lineHeight));
    expect(second.y - first.y).toBe(lineHeight);
    expect(second.y).toBe(first.y + first.height);
    expect(second.y - first.y).toBeLessThan(other.y - after.y);
    await page.keyboard.press("Enter");
    await expect(rows).toHaveText(["Alpha", "Beta", ""]);
    await page.keyboard.press("Enter");
    await expect(rows).toHaveText(["Alpha", "Beta"]);
    await page.keyboard.type("Outside");
    await expect(editor.locator(":scope > p")).toHaveText(["Before", "Outside", "After", "Other"]);
    await page.screenshot({ path: testInfo.outputPath("line-block.png") });
    await page.keyboard.press("Control+s");
    await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe("Before\n\n| Alpha\n| Beta\n\nOutside\n\nAfter\n\nOther");
    await page.reload();
    await expect(rows).toHaveText(["Alpha", "Beta"]);
    await expect(editor.locator(":scope > p")).toHaveText(["Before", "Outside", "After", "Other"]);
  });
}
