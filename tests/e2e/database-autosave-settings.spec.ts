import { test, expect } from "@playwright/test";
import { createBlockDatabase } from "./database-fixture";

test("view settings apply and persist while their menus stay open", async ({ page, request }, info) => {
  const data = await createBlockDatabase(request);
  const snapshot = () => request.get(`/api/databases/${data.database.id}`).then(response => response.json());
  await page.goto(`/#database/${data.database.id}`);
  await page.getByRole("button", { name: "View settings", exact: true }).click();
  const root = page.getByRole("dialog", { name: "View settings", exact: true });
  await expect(root.getByRole("button", { name: /^(Done|Save view)$/ })).toHaveCount(0);
  await root.getByLabel("View name", { exact: true }).fill("Live table");
  await expect(page.getByRole("tab", { name: "Live table", exact: true })).toBeVisible();
  await root.getByRole("button", { name: "Layout", exact: true }).click();
  const layout = page.getByRole("dialog", { name: "Layout", exact: true });
  await expect(layout.getByRole("button", { name: "Done", exact: true })).toHaveCount(0);
  await layout.getByRole("switch", { name: "Show vertical lines", exact: true }).click();
  await expect(page.locator(".database-workspace")).toHaveAttribute("data-vertical-lines", "false");
  await expect(layout).toBeVisible();
  await layout.getByRole("button", { name: "Back", exact: true }).click();
  await root.getByRole("button", { name: "Property visibility", exact: true }).click();
  const visibility = page.getByRole("dialog", { name: "Property visibility", exact: true });
  await visibility.getByRole("switch", { name: "AFFINE", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: "AFFINE", exact: true })).toHaveCount(0);
  await expect(visibility).toBeVisible();
  const revision = (await snapshot()).views[0].revision;
  await visibility.getByLabel("Search for a property...", { exact: true }).fill("Markdown");
  await page.waitForTimeout(350);
  expect((await snapshot()).views[0].revision).toBe(revision);
  await visibility.getByRole("button", { name: "Back", exact: true }).click();
  await root.getByRole("button", { name: "Sort", exact: true }).click();
  const sort = page.getByRole("dialog", { name: "Sort", exact: true });
  await sort.getByLabel("Sort by", { exact: true }).selectOption({ label: "Name" });
  await sort.getByLabel("Direction", { exact: true }).selectOption("descending");
  await expect.poll(async () => (await snapshot()).views[0].sorts?.[0]?.direction).toBe("descending");
  await expect(sort).toBeVisible();
  await sort.getByRole("button", { name: "Back", exact: true }).click();
  await root.getByRole("button", { name: "Filter", exact: true }).click();
  const filter = page.getByRole("dialog", { name: "Filter", exact: true });
  await filter.getByLabel("Filter property", { exact: true }).selectOption({ label: "Name" });
  await filter.getByLabel("Contains", { exact: true }).fill("Text");
  await expect(page.locator("tbody tr[data-page-id]:visible")).toHaveCount(1);
  await expect(filter).toBeVisible();
  await page.screenshot({ path: info.outputPath("live-settings-no-done.png") });
  await filter.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("tab", { name: "Live table", exact: true })).toBeVisible();
  await expect(page.locator("tbody tr[data-page-id]:visible")).toHaveCount(1);
});

test("edits made during a pending save are serialized with the new revision", async ({ page, request }) => {
  const data = await createBlockDatabase(request);
  await page.goto(`/#database/${data.database.id}`);
  let release!: () => void;
  const gate = new Promise<void>(resolve => release = resolve);
  const submitted: any[] = [];
  await page.route("**/api/database-views/*", async route => {
    if (route.request().method() === "PUT") {
      submitted.push(route.request().postDataJSON());
      if (submitted.length === 1) await gate;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "View settings", exact: true }).click();
  await page.getByRole("dialog", { name: "View settings", exact: true }).getByRole("button", { name: "Layout", exact: true }).click();
  const layout = page.getByRole("dialog", { name: "Layout", exact: true });
  try {
    await layout.getByRole("switch", { name: "Show vertical lines", exact: true }).click();
    await expect.poll(() => submitted.length).toBe(1);
    await layout.getByRole("switch", { name: "Show page icon", exact: true }).click();
    await layout.getByRole("switch", { name: "Wrap all content", exact: true }).click();
    await layout.getByRole("button", { name: "Close", exact: true }).click();
    await expect(layout).toBeVisible();
  } finally { release(); }
  await expect(layout).toHaveCount(0);
  await expect.poll(() => submitted.length).toBe(2);
  expect(submitted[1].baseRevision).not.toBe(submitted[0].baseRevision);
  expect(submitted[0].layout.showPageIcon).toBeUndefined();
  const saved = await (await request.get(`/api/databases/${data.database.id}`)).json();
  expect(saved.views[0].layout).toMatchObject({ showVerticalLines: false, showPageIcon: false, wrapContent: true });
  await page.reload();
  await expect(page.locator(".database-workspace")).toHaveClass(/database-wrap-content/);
});

test("automatic saves retain conflicting drafts and stop retrying; new views still require Create", async ({ page, request }) => {
  const data = await createBlockDatabase(request);
  await page.goto(`/#database/${data.database.id}`);
  await page.getByRole("button", { name: "New view", exact: true }).click();
  await page.getByLabel("View name", { exact: true }).fill("Unconfirmed view");
  await expect(page.getByRole("button", { name: "Create view", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  const baseline = await (await request.get(`/api/databases/${data.database.id}`)).json();
  expect(baseline.views).toHaveLength(1);
  await page.getByRole("button", { name: "View settings", exact: true }).click();
  const view = baseline.views[0];
  expect((await request.put(`/api/database-views/${view.id}`, { data: { baseRevision: view.revision, name: "External name" } })).ok()).toBeTruthy();
  let writes = 0;
  page.on("request", req => { if (req.method() === "PUT" && req.url().includes("/api/database-views/")) writes++; });
  const root = page.getByRole("dialog", { name: "View settings", exact: true });
  await root.getByLabel("View name", { exact: true }).fill("Local draft");
  await expect(root.getByRole("status")).toContainText(/changed|preserved/i);
  await expect(root.getByLabel("View name", { exact: true })).toHaveValue("Local draft");
  await root.getByLabel("View name", { exact: true }).fill("Revised local draft");
  await page.waitForTimeout(400);
  expect(writes).toBe(1);
  expect((await (await request.get(`/api/databases/${data.database.id}`)).json()).views[0].name).toBe("External name");
  await root.getByRole("button", { name: "Discard menu changes", exact: true }).click();
  await expect(root).toHaveCount(0);
});
