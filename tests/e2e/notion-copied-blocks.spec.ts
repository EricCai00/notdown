import { test, expect } from "@playwright/test";
import { copiedSnapshot, multipleCopiedPages, multiRoot } from "../unit/notion-copied-blocks-fixture.js";
import { privateRoot } from "../unit/notion-private-blocks-fixture.js";

test("whole-page copies accumulate across source pages and restore every matched button without leaking templates", async ({ page, request }) => {
  await page.goto("/"); await expect(page.getByRole("button", { name: "Import", exact: true })).toBeVisible();
  await page.evaluate(copies => {
    let index = 0;
    Object.defineProperty(window, "notdownDesktop", { configurable: true, value: { notionImportClipboard: { get: async () => {
      if (index >= copies.length) throw Error("No new copy"); return copies[index++];
    } } } });
  }, multipleCopiedPages().map(copy => JSON.stringify(copy)));
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("button", { name: "Import from Notion API", exact: true }).click();
  const read = page.getByRole("button", { name: "Read copied Notion blocks", exact: true });
  for (let index = 1; index <= 3; index++) {
    await read.click();
    await expect(page.locator("#notion-copied-status")).toContainText(`${index} copied snapshot${index === 1 ? "" : "s"} loaded`);
  }
  await read.click();
  await expect(page.locator("#notion-copied-status")).toContainText("Previously loaded copies are kept");
  await expect(page.getByLabel("Page URL or ID", { exact: true })).toHaveValue(multiRoot);
  await page.getByLabel("Integration token", { exact: true }).fill("multi-button-test-token");
  await page.locator("#notion-assets").uncheck();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator("#notion-status")).toContainText("Ready");
  await expect(page.locator("#notion-preview")).toContainText("3 pages");
  await page.getByRole("button", { name: "Import copies", exact: true }).click();
  await expect(page.locator(".notion-import-dialog")).toHaveCount(0);
  const titles = ["Root buttons", "Child buttons", "Leaf buttons"];
  const imported = await (await request.get("/api/pages")).json();
  const pages = titles.map(title => imported.find((item: any) => item.title === title));
  expect(pages).toHaveLength(3);
  expect(pages.every(Boolean)).toBeTruthy();
  expect(pages[1].parent).toBe(pages[0].id); expect(pages[2].parent).toBe(pages[1].id);
  for (const [index, text] of ["Root template A", "Child template", "Leaf template"].entries()) {
    await page.goto(`/#page/${pages[index].id}`);
    await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
    const buttons = page.locator(".pm-object-button");
    await expect(buttons).toHaveCount(index === 0 ? 2 : 1);
    await buttons.first().getByRole("button", { name: "Insert block", exact: true }).click();
    await expect(page.locator(".pm-document > p").filter({ hasText: new RegExp(`^${text}$`) })).toHaveCount(1);
    if (index === 0) {
      await buttons.nth(1).getByRole("button", { name: "Insert block", exact: true }).click();
      await expect(page.locator(".pm-document > p").filter({ hasText: /^Root template B$/ })).toHaveCount(1);
    }
    await page.keyboard.press("Control+s");
    await expect.poll(async () => (await (await request.get(`/api/pages/${pages[index].id}`)).json()).revision).not.toBe(pages[index].revision);
  }
  await page.reload();
  await expect(page.locator(".pm-document > p").filter({ hasText: /^Leaf template$/ })).toHaveCount(1);
});

test("explicit copied Button data previews, clears, imports and runs locally with undo and reload", async ({ page, request }, info) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Import", exact: true })).toBeVisible();
  await page.evaluate(snapshot => Object.defineProperty(window, "notdownDesktop", { configurable: true, value: { notionImportClipboard: { get: async () => snapshot } } }), JSON.stringify(copiedSnapshot()));
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("button", { name: "Import from Notion API", exact: true }).click();
  await page.getByLabel("Integration token", { exact: true }).fill("copied-button-test-token");
  await page.getByLabel("Import files, media, covers and icons into Attachments", { exact: true }).uncheck();
  await page.locator("#notion-cache").uncheck();
  const read = page.getByRole("button", { name: "Read copied Notion blocks", exact: true });
  const preview = page.getByRole("button", { name: "Preview", exact: true });
  const commit = page.getByRole("button", { name: "Import copies", exact: true });
  await read.click();
  await expect(page.getByLabel("Page URL or ID", { exact: true })).toHaveValue(privateRoot);
  await expect(page.locator("#notion-copied-status")).toContainText("snapshot loaded");
  await preview.click();
  await expect(page.locator("#notion-status")).toContainText("Ready");
  await expect(page.locator("#notion-markdown-source")).toContainText('<button label="Insert block"');
  await page.getByRole("button", { name: "Clear copied blocks", exact: true }).click();
  await expect(commit).toBeDisabled();
  await preview.click();
  await expect(page.locator("#notion-status")).toContainText("Ready");
  await expect(page.locator("#notion-markdown-source")).not.toContainText('<button label="Insert block"');
  await read.click(); await preview.click();
  await expect(page.locator("#notion-status")).toContainText("Ready");
  await page.screenshot({ path: info.outputPath("copied-button-preview.png"), fullPage: true });
  await commit.click();
  await expect(page.locator(".notion-import-dialog")).toHaveCount(0);
  const run = page.locator(".pm-object-button").getByRole("button", { name: "Insert block", exact: true });
  await expect(run).toBeVisible();
  const output = page.locator(".pm-document > p").filter({ hasText: /^Inserted block$/ });
  await expect(output).toHaveCount(0);
  await run.click(); await expect(output).toHaveCount(1);
  await output.click(); await page.keyboard.press("Control+z"); await expect(output).toHaveCount(0);
  await run.click(); await expect(output).toHaveCount(1);
  await page.keyboard.press("Control+s");
  const id = new URL(page.url()).hash.slice(6);
  await expect.poll(async () => (await (await request.get(`/api/pages/${id}`)).json()).body).toContain("Inserted block");
  await page.reload(); await expect(run).toBeVisible(); await expect(output).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("copied-button-run.png"), fullPage: true });
});
