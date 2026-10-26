import { test, expect } from "@playwright/test";
import { notionRoot } from "../unit/notion-import-fixture.js";

test("Notion shows live page counts and titles, cancels reading, and imports with progress", async ({ page, request }) => {
  const before = await (await request.post("/api/pages", { data: { title: "Progress test", body: "Keep existing content" } })).json();
  const count = (await (await request.get("/api/pages")).json()).length;
  await page.goto(`/#page/${before.id}`);
  const open = async () => {
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await page.getByRole("button", { name: "Import from Notion API", exact: true }).click();
    await page.getByRole("combobox", { name: "Import dialect", exact: true }).selectOption("notion-markdown");
    await page.getByLabel("Integration token", { exact: true }).fill("progress-test-notion-token");
    await page.getByLabel("Page URL or ID", { exact: true }).fill(notionRoot);
    await page.getByRole("button", { name: "Preview", exact: true }).click();
  };
  await open();
  const status = page.locator("#notion-status");
  const progress = page.getByRole("progressbar", { name: "Notion import progress" });
  await expect(status).toContainText("1 pages read. Reading pages… Current page: Same title");
  await expect(page.locator("#notion-step")).toContainText("Reading page Markdown");
  await expect(progress).toBeVisible();
  await expect(progress).not.toHaveAttribute("value");
  await expect(page.getByRole("button", { name: "Import copies", exact: true })).toBeDisabled();
  await page.screenshot({ path: "test-results/notion-import-progress.png" });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".notion-import-dialog")).toHaveCount(0);
  expect((await (await request.get("/api/pages")).json()).length).toBe(count);
  // Closing must cancel the old read and release the server's preview guard.
  await open();
  await expect(status).toContainText("Ready", { timeout: 15_000 });
  await expect(progress).toBeHidden();
  await expect(page.locator("#notion-token")).toHaveValue("");
  await page.getByLabel("Page URL or ID", { exact: true }).fill("invalid");
  await page.getByLabel("Integration token", { exact: true }).fill("progress-test-notion-token");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(status).toContainText("Enter a Notion page");
  await expect(progress).toBeHidden();
  await expect(page.getByRole("button", { name: "Import copies", exact: true })).toBeDisabled();
  await page.getByLabel("Page URL or ID", { exact: true }).fill(notionRoot);
  await page.getByLabel("Integration token", { exact: true }).fill("test-secret-not-saved");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(status).toContainText("Ready");
  const committed = page.waitForResponse(response => response.url().endsWith("/api/import/commit"));
  await page.getByRole("button", { name: "Import copies", exact: true }).click();
  expect((await committed).headers()["content-type"]).toContain("application/x-ndjson");
  await expect(page.locator(".notion-import-dialog")).toHaveCount(0);
  await expect(page.locator("#page-title")).toHaveValue("Notion API fixture");
  expect((await (await request.get("/api/pages")).json()).length).toBe(count + 3);
});

test("a slow first Notion request shows its operation, request count and advancing wait time at zero pages", async ({ page, request }) => {
  const before = await (await request.post("/api/pages", { data: { title: "Slow start progress", body: "" } })).json();
  await page.goto(`/#page/${before.id}`);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("button", { name: "Import from Notion API", exact: true }).click();
  await page.getByLabel("Integration token", { exact: true }).fill("progress-slow-start-token");
  await page.getByLabel("Page URL or ID", { exact: true }).fill(notionRoot);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator("#notion-status")).toContainText("0 pages read");
  await expect(page.locator("#notion-step")).toContainText("Reading page details — waiting for Notion");
  await expect(page.locator("#notion-step")).toContainText("Notion requests: 1");
  await expect(page.locator("#notion-step")).toContainText("Pages discovered: 1");
  await expect(page.locator("#notion-timing")).toContainText(/This step: [1-4]s/);
  await page.getByText("Recent steps", { exact: true }).click();
  await expect(page.locator("#notion-progress-history")).toContainText("Checking the local vault");
  await page.screenshot({ path: "test-results/notion-import-slow-start.png" });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".notion-import-dialog")).toHaveCount(0);
});
