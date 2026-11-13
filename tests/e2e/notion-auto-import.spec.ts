import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { notionRoot } from "../unit/notion-import-fixture.js";

const label = "Import automatically after reading";

async function open(page: Page, request: APIRequestContext) {
  const seed = await (await request.post("/api/pages", { data: { title: "Automatic import", body: "Keep existing content" } })).json();
  await page.goto(`/#page/${seed.id}`);
  await expect(page.locator(".pm-document")).toBeVisible();
  if (!await page.getByRole("button", { name: "Import", exact: true }).isVisible())
    await page.getByRole("button", { name: "Toggle sidebar", exact: true }).click();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("button", { name: "Import from Notion API", exact: true }).click();
  await page.getByLabel("Integration token", { exact: true }).fill("test-secret-not-saved");
  await page.getByLabel("Page URL or ID", { exact: true }).fill(notionRoot);
  // Keep this selection separate from the other import regression fixtures.
  await page.getByLabel("Include descendant pages", { exact: true }).uncheck();
  await page.getByLabel("Import files, media, covers and icons into Attachments", { exact: true }).uncheck();
  return seed;
}

async function holdComplete(page: Page) {
  let release!: () => void, ready!: (value: any) => void, finished!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const prepared = new Promise<any>(resolve => { ready = resolve; });
  const delivered = new Promise<void>(resolve => { finished = resolve; });
  let held = false;
  await page.route("**/api/notion/import/preview", async route => {
    const response = await route.fetch();
    const result = JSON.parse((await response.text()).trim().split("\n").at(-1)!).result;
    if (result?.id && !held) {
      held = true; ready(result); await gate;
      try { await route.fulfill({ response }); } finally { finished(); }
    } else await route.fulfill({ response });
  });
  return { release, prepared, delivered };
}

test("opting in during reading imports the complete snapshot once and saves the current page", async ({ page, request }) => {
  const seed = await open(page, request);
  const automatic = page.getByRole("checkbox", { name: label, exact: true });
  await expect(automatic).not.toBeChecked();
  await expect(automatic).toBeInViewport();
  const gate = await holdComplete(page);
  let commits = 0;
  page.on("request", req => { if (req.url().endsWith("/api/import/commit")) commits++; });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const snapshot = await gate.prepared;
  try {
    expect(commits).toBe(0);
    await expect(page.getByRole("button", { name: "Import copies", exact: true })).toBeDisabled();
    await automatic.check();
    await page.screenshot({ path: "test-results/notion-auto-import-reading.png" });
  } finally { gate.release(); }
  const submitted = await page.waitForResponse(response => response.url().endsWith("/api/import/commit"));
  expect(submitted.request().postDataJSON()).toEqual({ id: snapshot.id });
  await expect(page.locator(".notion-import-dialog")).toHaveCount(0);
  expect(commits).toBe(1);
  await expect(page.locator("#page-title")).toHaveValue("Notion API fixture");
  expect((await (await request.get(`/api/pages/${seed.id}`)).json()).body).toBe("Keep existing content");
});

test("unchecking while reading keeps the complete preview for review and resets on reopening", async ({ page, request }) => {
  await page.setViewportSize({ width: 480, height: 840 });
  await open(page, request);
  const automatic = page.getByRole("checkbox", { name: label, exact: true });
  await automatic.check();
  const gate = await holdComplete(page);
  let commits = 0;
  page.on("request", req => { if (req.url().endsWith("/api/import/commit")) commits++; });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await gate.prepared;
  try { await automatic.uncheck(); } finally { gate.release(); }
  await expect(page.locator("#notion-status")).toContainText("Ready");
  expect(commits).toBe(0);
  await expect(page.getByRole("button", { name: "Import copies", exact: true })).toBeEnabled();
  await expect(automatic).toBeInViewport();
  await page.locator("#notion-status").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/notion-auto-import-narrow.png" });
  await automatic.check(); // This choice applies to completion of a read, not an already-reviewed result.
  expect(commits).toBe(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  if (!await page.getByRole("button", { name: "Import", exact: true }).isVisible())
    await page.getByRole("button", { name: "Toggle sidebar", exact: true }).click();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("button", { name: "Import from Notion API", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: label, exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("pausing a final batch prevents automatic import even if that batch completes the snapshot", async ({ page, request }) => {
  await open(page, request);
  await page.getByRole("checkbox", { name: label, exact: true }).check();
  const gate = await holdComplete(page);
  let commits = 0;
  page.on("request", req => { if (req.url().endsWith("/api/import/commit")) commits++; });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await gate.prepared;
  try { await page.getByRole("button", { name: "Pause after this batch", exact: true }).click(); } finally { gate.release(); }
  await expect(page.locator("#notion-status")).toContainText("Ready");
  expect(commits).toBe(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("a failed automatic commit stays open for manual retry and is never resubmitted automatically", async ({ page, request }) => {
  await open(page, request);
  await page.getByRole("checkbox", { name: label, exact: true }).check();
  let commits = 0;
  await page.route("**/api/import/commit", async route => {
    commits++;
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Import temporarily unavailable" }) });
  });
  await page.getByLabel("Page URL or ID", { exact: true }).fill("invalid");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator("#notion-status")).toContainText("Enter a Notion page");
  expect(commits).toBe(0);
  await page.getByLabel("Page URL or ID", { exact: true }).fill(notionRoot);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator("#notion-status")).toContainText("Import temporarily unavailable");
  await expect(page.getByRole("button", { name: "Import copies", exact: true })).toBeEnabled();
  expect(commits).toBe(1);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(commits).toBe(1);
});

test("closing the dialog before the final response prevents a late automatic import", async ({ page, request }) => {
  await open(page, request);
  await page.getByRole("checkbox", { name: label, exact: true }).check();
  const gate = await holdComplete(page);
  let commits = 0;
  page.on("request", req => { if (req.url().endsWith("/api/import/commit")) commits++; });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await gate.prepared;
  try {
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.locator(".notion-import-dialog")).toHaveCount(0);
  } finally { gate.release(); }
  await gate.delivered;
  expect(commits).toBe(0);
});
