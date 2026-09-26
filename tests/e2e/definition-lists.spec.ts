import { test, expect } from "@playwright/test";
import { expectSource } from "./source-helper";

for (const variant of ["notdown", "markdown"]) {
  test(`${variant}: definition spacing survives editing, source switching and reload`, async ({ page, request }, testInfo) => {
    const body = "Term\n:   First part.\n\n    Second part.\n\n:   Another definition.\n\nLoose\n\n~   First paragraph.\n\n    Second paragraph.\n\nCompact again\n~   Last definition.";
    const response = await request.post("/api/pages", { data: {
      title: "Definition spacing", body, bodyFormat: variant === "notdown" ? "notion-markdown" : "markdown",
      syntax: { version: 1, variant, extensions: {} },
    } });
    expect(response.status()).toBe(201);
    const note = await response.json();
    await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
    await page.goto("/");
    const definitions = page.locator(".pm-definition-list > .pm-definition-item > dd");
    await expect(definitions).toHaveCount(4);
    const compact = definitions.nth(0).locator(":scope > p");
    const loose = definitions.nth(2).locator(":scope > p");
    await expect(compact.first()).toHaveCSS("display", "inline");
    await expect(compact.last()).toHaveCSS("display", "inline");
    expect((await compact.first().boundingBox())!.y).toBe((await compact.last().boundingBox())!.y);
    await expect(loose.first()).toHaveCSS("display", "block");
    expect((await loose.last().boundingBox())!.y).toBeGreaterThan((await loose.first().boundingBox())!.y);
    await expect(definitions.last()).toHaveAttribute("data-definition-tight", "true");
    await compact.last().click();
    await page.keyboard.press("End");
    await page.keyboard.insertText(" edited");
    await expect(compact.last()).toHaveText("Second part. edited");
    await loose.first().click();
    await page.keyboard.press("End");
    await page.keyboard.insertText(" edited");
    await page.locator('.editing-modes [data-mode="source"]').click();
    await expectSource(page, /Term\n:   First part\./);
    await expectSource(page, /Loose\n\n~   First paragraph\. edited/);
    await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("First paragraph. edited");
    await page.locator('.editing-modes [data-mode="document"]').click();
    await page.reload();
    await expect(compact.last()).toHaveText("Second part. edited");
    await expect(compact.last()).toHaveCSS("display", "inline");
    await expect(loose.first()).toHaveText("First paragraph. edited");
    await expect(loose.first()).toHaveCSS("display", "block");
    await page.screenshot({ path: testInfo.outputPath("definition-spacing.png") });
  });
}
