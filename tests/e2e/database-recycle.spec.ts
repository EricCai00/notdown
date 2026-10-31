import { test, expect } from "@playwright/test";

test("two same-title collections stay deleted after Trash recycling, reload and stale tab navigation", async ({ page, request }) => {
  const snapshots = [];
  for (const kind of ["database", "wiki"]) {
    const response = await request.post("/api/databases", { data: { title: "Deleted twin collection", kind } });
    expect(response.ok()).toBeTruthy(); snapshots.push(await response.json());
  }
  for (const snapshot of snapshots) {
    await page.goto(`/#database/${snapshot.database.id}?view=${snapshot.views[0].id}`);
    await expect(page.getByRole("textbox", { name: "Database title", exact: true })).toHaveValue("Deleted twin collection");
    // Another window moves the host to Trash while this collection remains open.
    const host = await (await request.get(`/api/pages/${snapshot.hostPage.id}`)).json();
    expect((await request.put(`/api/pages/${host.id}`, { data: { baseRevision: host.revision, trashed: true } })).ok()).toBeTruthy();
    await page.getByRole("button", { name: "Trash", exact: true }).click();
    await page.locator(`[data-recycle="${host.id}"]`).click();
    await expect(page.locator(`[data-recycle="${host.id}"]`)).toHaveCount(0);
    await expect(page.locator(`#page-tree [data-page-row="${host.id}"]`)).toHaveCount(0);
    await expect(page.locator(".database-heading")).toHaveCount(0);
    expect((await request.get(`/api/pages/${host.id}`)).status()).toBe(404);
    await page.reload();
    await expect(page.locator(`#page-tree [data-page-row="${host.id}"]`)).toHaveCount(0);
    await page.goto(`/#database/${snapshot.database.id}?view=${snapshot.views[0].id}`);
    await expect(page.getByRole("textbox", { name: "Database title", exact: true })).toHaveCount(0);
    await expect(page.locator("#app")).not.toHaveAttribute("inert", "");
    await page.getByRole("button", { name: "Databases", exact: true }).first().click();
    await expect(page.locator(".database-list")).toBeVisible();
    await expect(page.locator(`[data-db-open="${snapshot.database.id}"]`)).toHaveCount(0);
    await expect(page.locator("#app")).not.toHaveAttribute("inert", "");
  }
  const active = await (await request.get("/api/databases")).json();
  for (const snapshot of snapshots) {
    expect(active.some((db: any) => db.id === snapshot.database.id)).toBe(false);
    await expect(page.locator(`#page-tree [data-page-row="${snapshot.hostPage.id}"]`)).toHaveCount(0);
  }
});
