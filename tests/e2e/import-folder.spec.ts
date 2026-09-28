import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

test("folder preview, import, editing and repeated import preserve existing pages", async ({ page, request }) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-import-browser-"));
  try {
    const source = path.join(root, "Sample notes"); await fs.mkdir(path.join(source, "nested"), { recursive: true });
    await fs.writeFile(path.join(source, "welcome.md"), "# Welcome\n\n[Next](nested/next.md)\n\n```md\n[Next](nested/next.md)\n```\n");
    await fs.writeFile(path.join(source, "nested/next.md"), "Imported child body\n");
    const original = await (await request.post("/api/pages", { data: { title: "Before import", body: "Existing content" } })).json();
    await page.goto(`/#page/${original.id}`);
    await page.locator("#page-title").fill("Saved before import");
    await page.getByRole("button", { name: "Import Markdown folder", exact: true }).click();
    await page.locator("#import-files").setInputFiles(source);
    await expect(page.locator("#import-status")).toContainText("Ready");
    await expect(page.locator("#import-preview")).toContainText("nested/next.md");
    await page.screenshot({ path: "test-results/import-folder-preview.png" });
    await page.getByRole("button", { name: "Import copies", exact: true }).click();
    await expect(page.locator(".import-dialog")).toHaveCount(0);
    await expect(page.locator("#page-title")).toHaveValue("Sample notes");
    const imported = await (await request.get("/api/pages")).json();
    const child = imported.find((p: any) => p.body === "Imported child body\n");
    expect(child).toBeTruthy();
    expect(child.id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    expect((await (await request.get(`/api/pages/${original.id}`)).json()).title).toBe("Saved before import");
    await page.goto(`/#page/${child.id}`);
    await expect(page.locator("#page-title")).toHaveValue("next");
    await expect(page.locator(".page-pane .ProseMirror")).toContainText("Imported child body");
    await page.locator(".page-pane .ProseMirror").fill("Edited imported child");
    await page.keyboard.press("Control+s");
    await expect(page.locator("#save-status")).toContainText("Saved locally");
    await expect.poll(async () => (await (await request.get(`/api/pages/${child.id}`)).json()).body).toContain("Edited imported child");
    await page.getByRole("button", { name: "Import Markdown folder", exact: true }).click();
    await page.locator("#import-files").setInputFiles(source);
    await expect(page.locator("#import-status")).toContainText("Ready");
    await page.getByRole("button", { name: "Import copies", exact: true }).click();
    await expect(page.locator(".import-dialog")).toHaveCount(0);
    expect((await (await request.get("/api/pages")).json()).length).toBe(imported.length);
    expect((await (await request.get(`/api/pages/${child.id}`)).json()).body).toContain("Edited imported child");
    expect(await fs.readFile(path.join(source, "nested/next.md"), "utf8")).toBe("Imported child body\n");
  } finally {
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("notdown-import-browser-")) throw new Error("Unsafe test cleanup");
    await fs.rm(root, { recursive: true, force: true });
  }
});
