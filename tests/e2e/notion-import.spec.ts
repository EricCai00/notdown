import { test, expect } from "@playwright/test";
import { notionRoot, notionSource } from "../unit/notion-import-fixture.js";

test("Notion API preview, exact Markdown import and duplicate snapshot preserve local edits", async ({
  page,
  request,
}) => {
  const before = await (
    await request.post("/api/pages", {
      data: { title: "Before Notion import", body: "Keep me" },
    })
  ).json();
  await page.goto(`/#page/${before.id}`);
  await expect(page.locator("#page-title")).toHaveValue("Before Notion import");
  await page.locator("#page-title").fill("Save pending Notion import title");
  const open = async () => {
    await page
      .getByRole("button", { name: "Import from Notion API", exact: true })
      .click();
    await page
      .getByLabel("Integration token", { exact: true })
      .fill("test-secret-not-saved");
    await page
      .getByLabel("Page URL or ID", { exact: true })
      .fill(`https://www.notion.so/${notionRoot}`);
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.locator("#notion-status")).toContainText("Ready");
  };
  await open();
  await expect(page.locator("#notion-token")).toHaveValue("");
  await expect(page.locator("#notion-preview")).toContainText("3 pages");
  await expect(page.locator("#notion-markdown-source")).toContainText(
    '<callout icon="📘" color="blue_bg">',
  );
  expect(await page.locator("#notion-markdown-source").textContent()).toBe(
    notionSource,
  );
  await page.screenshot({ path: "test-results/notion-import-preview.png" });
  await page
    .getByRole("button", { name: "Import copies", exact: true })
    .click();
  await expect(page.locator(".notion-import-dialog")).toHaveCount(0);
  await expect(page.locator("#page-title")).toHaveValue("Notion API fixture");
  const imported = await (await request.get("/api/pages")).json();
  const root = imported.find((p: any) => p.title === "Notion API fixture");
  expect(root.body).toBe(notionSource);
  expect(root.syntax.variant).toBe("notion-markdown");
  expect(imported.filter((p: any) => p.parent === root.id)).toHaveLength(2);
  expect(
    (await (await request.get(`/api/pages/${before.id}`)).json()).title,
  ).toBe("Save pending Notion import title");
  await page
    .locator(".page-pane .ProseMirror")
    .fill("Local edit after API import");
  await page.keyboard.press("Control+s");
  await expect(page.locator("#save-status")).toContainText("Saved locally");
  await open();
  await page
    .getByRole("button", { name: "Import copies", exact: true })
    .click();
  await expect(page.locator(".notion-import-dialog")).toHaveCount(0);
  expect((await (await request.get("/api/pages")).json()).length).toBe(
    imported.length,
  );
  expect(
    (await (await request.get(`/api/pages/${root.id}`)).json()).body,
  ).toContain("Local edit after API import");
});

test("changing selection or a failed preview invalidates the old Notion import", async ({
  page,
  request,
}) => {
  const existing = await (
    await request.post("/api/pages", {
      data: { title: "Notion preview validation", body: "" },
    })
  ).json();
  await page.goto(`/#page/${existing.id}`);
  await page
    .getByRole("button", { name: "Import from Notion API", exact: true })
    .click();
  await page
    .getByLabel("Integration token", { exact: true })
    .fill("test-secret-not-saved");
  await page.getByLabel("Page URL or ID", { exact: true }).fill(notionRoot);
  await page.getByLabel("Include descendant pages").uncheck();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator("#notion-status")).toContainText("Ready");
  await expect(page.locator("#notion-preview")).toContainText("1 pages");
  await page.getByLabel("Page URL or ID", { exact: true }).fill("invalid");
  await expect(
    page.getByRole("button", { name: "Import copies", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Integration token", { exact: true })
    .fill("test-secret-not-saved");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator("#notion-status")).toContainText(
    "Enter a Notion page",
  );
  await expect(
    page.getByRole("button", { name: "Import copies", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".notion-import-dialog")).toHaveCount(0);
});

test("a failed pending-page save prevents committing a Notion preview", async ({
  page,
  request,
}) => {
  const existing = await (
    await request.post("/api/pages", {
      data: { title: "Pending save guard", body: "Before" },
    })
  ).json();
  await page.goto(`/#page/${existing.id}`);
  await expect(page.locator("#page-title")).toHaveValue("Pending save guard");
  await page.route(`**/api/pages/${existing.id}`, (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Simulated save failure" }),
        })
      : route.continue(),
  );
  await page.locator("#page-title").fill("Unsaved draft");
  await page
    .getByRole("button", { name: "Import from Notion API", exact: true })
    .click();
  await page
    .getByLabel("Integration token", { exact: true })
    .fill("test-secret-not-saved");
  await page.getByLabel("Page URL or ID", { exact: true }).fill(notionRoot);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator("#notion-status")).toContainText("Ready");
  let committed = false;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/import/commit")) committed = true;
  });
  await page
    .getByRole("button", { name: "Import copies", exact: true })
    .click();
  await expect(page.locator("#notion-status")).toContainText("Save or resolve");
  expect(committed).toBe(false);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator("#page-title")).toHaveValue("Unsaved draft");
});
