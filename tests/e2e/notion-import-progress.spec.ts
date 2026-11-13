import { test, expect } from "@playwright/test";
import { notionRoot } from "../unit/notion-import-fixture.js";
import { largeNotionRoot } from "../unit/notion-large-import-fixture.js";

test("a missing completed preview disables Import copies and requires a fresh review without retrying writes", async ({ page, request }) => {
  const seed = await (await request.post("/api/pages", { data: { title: "Lost completed preview", body: "Keep existing content" } })).json();
  await page.goto(`/#page/${seed.id}`);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("button", { name: "Import from Notion API", exact: true }).click();
  await page.getByLabel("Integration token", { exact: true }).fill("test-secret-not-saved");
  await page.getByLabel("Page URL or ID", { exact: true }).fill(notionRoot);
  await page.getByLabel("Include descendant pages", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator("#notion-status")).toContainText("Ready");
  const count = (await (await request.get("/api/pages")).json()).length;
  // Other windows can replace the oldest of three retained snapshots.
  for (let index = 0; index < 3; index++) {
    const response = await request.post("/api/import/preview", { data: { name: `Eviction ${index}`, dialect: "gfm", files: [{ path: "page.md", data: Buffer.from(`Eviction ${index}`).toString("base64") }] } });
    expect(response.ok()).toBeTruthy();
  }
  let commits = 0;
  page.on("request", request => { if (request.url().endsWith("/api/import/commit")) commits++; });
  await page.getByRole("button", { name: "Import copies", exact: true }).click();
  await expect(page.locator("#notion-status")).toContainText("Preview again before importing");
  await expect(page.getByRole("button", { name: "Import copies", exact: true })).toBeDisabled();
  await expect(page.locator("#notion-markdown-source")).not.toBeEmpty();
  expect((await (await request.get("/api/pages")).json()).length).toBe(count);
  expect(commits).toBe(1);
  await page.locator("#notion-status").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/notion-missing-preview.png" });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator("#notion-status")).toContainText("Ready");
  await expect(page.getByRole("button", { name: "Import copies", exact: true })).toBeEnabled();
  expect(commits).toBe(1);
  await page.getByRole("button", { name: "Import copies", exact: true }).click();
  await expect(page.locator(".notion-import-dialog")).toHaveCount(0);
  expect(commits).toBe(2);
  expect((await (await request.get(`/api/pages/${seed.id}`)).json()).body).toBe("Keep existing content");
});

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
  await expect(page.locator("#notion-token")).toHaveValue("progress-test-notion-token");
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

test("batched preview pauses on request, retries failed reads automatically, and enables import only after the complete plan", async ({ page, request }) => {
  const before = await (await request.post("/api/pages", { data: { title: "Batch preview", body: "Keep this" } })).json();
  const count = (await (await request.get("/api/pages")).json()).length;
  await page.goto(`/#page/${before.id}`);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("button", { name: "Import from Notion API", exact: true }).click();
  await page.getByLabel("Integration token", { exact: true }).fill("batch-retry-notion-token");
  await page.getByLabel("Page URL or ID", { exact: true }).fill(notionRoot);
  let continueSession: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { continueSession = resolve; });
  let held = false;
  const requests: any[] = [];
  await page.route("**/api/notion/import/preview", async route => {
    const data = route.request().postDataJSON(); requests.push(data);
    if (data.continuationId && !held) { held = true; await gate; }
    await route.continue();
  });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause after this batch", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pause after this batch", exact: true }).click();
  continueSession!();
  await expect(page.locator("#notion-status")).toContainText("Paused");
  await expect(page.getByRole("button", { name: "Import copies", exact: true })).toBeDisabled();
  expect((await (await request.get("/api/pages")).json()).length).toBe(count);
  await page.locator("#notion-status").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/notion-import-batch-paused.png" });
  await page.getByRole("button", { name: "Resume preview", exact: true }).click();
  await expect(page.locator("#notion-status")).toContainText("No action is needed while retrying");
  await expect(page.getByRole("button", { name: "Import copies", exact: true })).toBeDisabled();
  await expect(page.locator("#notion-status")).toContainText("Ready");
  await expect(page.locator("#notion-preview")).toContainText("3 pages");
  await expect(page.getByRole("button", { name: "Import copies", exact: true })).toBeEnabled();
  expect(requests.filter(data => data.token)).toHaveLength(1);
  expect(requests.filter(data => data.continuationId).length).toBeGreaterThan(3);
  await page.getByRole("button", { name: "Import copies", exact: true }).click();
  await expect(page.locator(".notion-import-dialog")).toHaveCount(0);
  expect((await (await request.get("/api/pages")).json()).length).toBe(count + 3);
});

test("an expired streamed session rebuilds its preview automatically without importing partial pages", async ({ page, request }) => {
  const before = await (await request.post("/api/pages", { data: { title: "Expired session", body: "Keep this" } })).json();
  const count = (await (await request.get("/api/pages")).json()).length;
  await page.goto(`/#page/${before.id}`);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("button", { name: "Import from Notion API", exact: true }).click();
  await page.getByLabel("Integration token", { exact: true }).fill("test-secret-not-saved");
  await page.getByLabel("Page URL or ID", { exact: true }).fill(notionRoot);
  let expired = false, starts = 0;
  const sessions = new Set<string>();
  await page.route("**/api/notion/import/preview", async route => {
    const input = route.request().postDataJSON();
    if (!input.continuationId) starts++;
    else sessions.add(input.continuationId);
    if (input.continuationId && !expired) {
      expired = true;
      await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: JSON.stringify({ type: "error", status: 410, retryable: false, error: "Notion reading session expired. Prepare a new preview." }) + "\n" });
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator("#notion-batch")).toContainText("Rebuilding the preview automatically");
  await expect(page.getByRole("button", { name: "Import copies", exact: true })).toBeDisabled();
  await expect(page.locator("#notion-status")).toContainText("Ready");
  await expect(page.getByRole("button", { name: "Import copies", exact: true })).toBeEnabled();
  expect(starts).toBe(2); expect(sessions.size).toBe(2);
  expect((await (await request.get("/api/pages")).json()).length).toBe(count);
  await page.screenshot({ path: "test-results/notion-import-auto-recovered.png" });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("pausing interrupts a long automatic retry wait and preserves its continuation", async ({ page, request }) => {
  const before = await (await request.post("/api/pages", { data: { title: "Pause retry", body: "Keep this" } })).json();
  await page.goto(`/#page/${before.id}`);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("button", { name: "Import from Notion API", exact: true }).click();
  await page.getByLabel("Integration token", { exact: true }).fill("test-secret-not-saved");
  await page.getByLabel("Page URL or ID", { exact: true }).fill(notionRoot);
  let interrupted: string | undefined;
  const continuations: string[] = [];
  await page.route("**/api/notion/import/preview", async route => {
    const input = route.request().postDataJSON();
    if (input.continuationId) continuations.push(input.continuationId);
    if (input.continuationId && !interrupted) {
      interrupted = input.continuationId;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ continuationId: interrupted, batch: 1, progress: { phase: "reading", completed: 0 }, error: "Temporarily rate limited", retryAfterMs: 60_000 }) });
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator("#notion-batch")).toContainText("Retrying automatically in 60s");
  await page.getByRole("button", { name: "Pause after this batch", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume preview", exact: true })).toBeEnabled({ timeout: 1500 });
  await expect(page.locator("#notion-status")).toContainText("Paused");
  await page.getByRole("button", { name: "Resume preview", exact: true }).click();
  await expect(page.locator("#notion-status")).toContainText("Ready");
  expect(new Set(continuations)).toEqual(new Set([interrupted]));
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("a 601-page tree previews and commits beyond the old page, request and byte caps", async ({ page, request }) => {
  test.setTimeout(180_000);
  const seed = await (await request.post("/api/pages", { data: { title: "Before large import", body: "Keep original" } })).json();
  const count = (await (await request.get("/api/pages")).json()).length;
  await page.goto(`/#page/${seed.id}`);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("button", { name: "Import from Notion API", exact: true }).click();
  await page.getByLabel("Integration token", { exact: true }).fill("large-import-test-token");
  await page.getByLabel("Page URL or ID", { exact: true }).fill(largeNotionRoot);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator("#notion-status")).toContainText("Ready", { timeout: 60_000 });
  await expect(page.locator("#notion-preview")).toContainText("601 pages");
  expect((await (await request.get("/api/pages")).json()).length).toBe(count);
  await page.locator("#notion-status").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/notion-large-preview.png" });
  await page.getByRole("button", { name: "Import copies", exact: true }).click();
  await expect(page.locator(".notion-import-dialog")).toHaveCount(0, { timeout: 120_000 });
  await expect(page.locator("#page-title")).toHaveValue("Large tree 0");
  const pages = await (await request.get("/api/pages")).json();
  expect(pages.length).toBe(count + 601);
  const root = pages.find((entry: any) => entry.id === new URL(page.url()).hash.slice(6));
  const children = pages.filter((entry: any) => entry.parent === root.id);
  expect(children).toHaveLength(600);
  expect(root.body).toContain(`#page/${children.find((entry: any) => entry.title === "Large tree 600").id}`);
  expect((await (await request.get(`/api/pages/${seed.id}`)).json()).body).toBe("Keep original");
});

test("a terminal source error clears the dead continuation and offers a fresh preview", async ({ page, request }) => {
  const seed = await (await request.post("/api/pages", { data: { title: "Terminal preview", body: "Keep original" } })).json();
  await page.goto(`/#page/${seed.id}`);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("button", { name: "Import from Notion API", exact: true }).click();
  await page.getByLabel("Integration token", { exact: true }).fill("test-secret-not-saved");
  await page.getByLabel("Page URL or ID", { exact: true }).fill(notionRoot);
  let failed = false;
  await page.route("**/api/notion/import/preview", async route => {
    if (route.request().postDataJSON().continuationId && !failed) {
      failed = true;
      await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: JSON.stringify({ type: "error", status: 413, retryable: false, error: "Snapshot budget exceeded. Start a new preview." }) + "\n" });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator("#notion-status")).toContainText("Snapshot budget exceeded");
  await expect(page.locator("#notion-status")).not.toContainText("Completed reads are kept");
  await expect(page.getByRole("button", { name: "Resume preview", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Import copies", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator("#notion-status")).toContainText("Ready");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});
