import { test, expect } from "@playwright/test";
import { fidelityDatabase } from "../unit/notion-view-fidelity-fixture";
import { stablePageUuid } from "../../src/vault/page-id";

test("database import restores all five views, default table columns, field icons and manual rows", async ({ page, request }, info) => {
  await page.route("https://*.tile.openstreetmap.org/**", route => route.abort());
  const response = await request.post("/api/notion/import/preview", { data: { token: "view-fidelity-test-token", pageId: fidelityDatabase, useDesktopCache: true } });
  expect(response.ok()).toBeTruthy(); const preview = await response.json();
  expect((await request.post("/api/import/commit", { data: { id: preview.id } })).ok()).toBeTruthy();
  const id = stablePageUuid(`notion-${preview.id.slice(0, 24)}-${fidelityDatabase}`);
  const snapshot = await (await request.get(`/api/databases/${id}`)).json();
  expect(snapshot.views.map((v: any) => [v.name, v.type])).toEqual([["Timeline view", "timeline"], ["Table", "table"], ["Calendar", "calendar"], ["Feed", "feed"], ["Map", "map"]]);
  await page.goto(`/#database/${id}`);
  await page.getByRole("tab", { name: "Table", exact: true }).click();
  await expect(page.locator('thead th[data-type]')).toHaveText(["Name", "Assign", "Blocked by", "Blocking", "Date", "Place", "Status"]);
  for (const [type, icon] of [["title", "a-large-small"], ["people", "users"], ["relation", "arrow-up-right"], ["place", "map-pin"]])
    await expect(page.locator(`th[data-type="${type}"] [data-property-icon="${icon}"]`).first()).toBeVisible();
  expect(await page.locator('tbody tr input[aria-label^="Name:"]').evaluateAll(inputs => inputs.slice(0, 4).map(input => (input as HTMLInputElement).value))).toEqual(["Card 1", "Card 3", "Card 2", "Card 4"]);
  await page.getByRole("button", { name: "Edit Assign property", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Property settings", exact: true }).getByRole("button", { name: "Change type", exact: true })).toContainText("Person");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Property settings", exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("database-1-table.png"), fullPage: true });
  await page.getByRole("tab", { name: "Feed", exact: true }).click();
  await expect(page.locator(".database-layout-feed .database-record-card")).toHaveCount(7);
  await expect(page.locator('.database-view-tabs [data-view-icon="newspaper"]')).toBeVisible();
  await page.getByRole("tab", { name: "Map", exact: true }).click();
  await expect(page.getByRole("region", { name: "Record map", exact: true })).toBeVisible();
  await expect(page.locator('.database-view-tabs [data-view-icon="map"]')).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Record map", exact: true })).toBeVisible();
  expect((await (await request.get(`/api/databases/${id}`)).json()).views).toHaveLength(5);
});
