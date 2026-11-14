import { test, expect } from "@playwright/test";
import { notionSubitemWarning } from "../../src/features/databases/database-import-presentation.js";

test("imported cells remain compact, legacy empty Place is blank, and compatibility details are available on demand", async ({ page, request }, info) => {
  const response = await request.post("/api/databases", { data: { title: "Imported presentation" } });
  expect(response.ok()).toBeTruthy();
  const database = await response.json(), source = database.dataSources[0];
  for (const title of ["Card 1", "Card 2", "Untitled"]) expect((await request.post(`/api/data-sources/${source.id}/records`, { data: { baseRevision: source.revision, title } })).ok()).toBeTruthy();
  const original = await (await request.get(`/api/databases/${database.database.id}`)).json();
  // Replay an old imported snapshot at the UI boundary. The backing vault stays
  // isolated and unchanged, including revisions and the raw legacy envelopes.
  const snapshot = structuredClone(original), schema = snapshot.dataSources[0], view = snapshot.views[0];
  const blank = snapshot.pages.find((record: any) => record.title === "Untitled"); blank.importedEmptyTitle = true;
  const card2 = snapshot.pages.find((record: any) => record.title === "Card 2");
  schema.properties.push(
    { id: "place", key: "place", name: "Place", type: "unknown", readOnly: true, notion: { type: "place" } },
    { id: "people", key: "people", name: "Assign", type: "people", readOnly: true },
    { id: "relation", key: "relation", name: "Blocking", type: "relation", readOnly: true },
    { id: "result", key: "result", name: "Result", type: "formula", readOnly: true },
  );
  view.propertyIds = schema.properties.map((field: any) => field.id);
  view.notion = { configuration: { subtasks: { toggle_column_id: "title" } } };
  view.importWarnings = [notionSubitemWarning];
  for (const record of snapshot.pages) record.properties = {
    ...record.properties, place: { id: "KHBf", type: "place", place: record.title === "Card 1" ? null : { name: "Library", address: "Main Street", latitude: 0, longitude: 0 }, snapshot: true },
    people: [], relation: record.title === "Card 1" ? [{ pageId: card2.id, notionPageId: "d7000000-0000-4000-8000-000000000099" }] : record.title === "Card 2" ? [{ pageId: blank.id }] : [], result: { type: "formula", formula: { type: "number", number: 12 }, snapshot: true },
  };
  await page.route(`**/api/databases/${database.database.id}`, route => route.fulfill({ json: snapshot }));
  await page.goto(`/#database/${database.database.id}`);
  await expect(page.getByLabel("Place: Card 1", { exact: true })).toHaveText("");
  await expect(page.getByLabel("Place: Card 2", { exact: true })).toHaveText("Library, Main Street");
  const result = page.getByLabel("Result: Card 1", { exact: true });
  await expect(result).toHaveText("12");
  await expect(result).toHaveAttribute("title", "Imported result — does not recalculate locally");
  await expect(result).toHaveAttribute("aria-description", "Imported result — does not recalculate locally");
  await expect(page.locator(".database-cell-readonly small")).toHaveCount(0);
  await expect(page.locator(".database-import-note")).toHaveCount(0);
  const namedRelation = page.getByRole("link", { name: "Card 2", exact: true });
  await expect(namedRelation.locator(".page-link-icon")).toBeVisible();
  await expect(page.getByRole("link", { name: "New page", exact: true }).locator(".page-link-icon")).toBeVisible();
  const emptyTitle = page.locator(`tr[data-page-id="${blank.id}"] .database-title-cell`);
  await expect(emptyTitle.locator("input")).toHaveValue("");
  await expect(emptyTitle.locator(".database-page-icon")).not.toBeVisible();
  const titleWeight = await page.getByLabel("Name: Card 1", { exact: true }).evaluate(node => getComputedStyle(node).fontWeight);
  expect(await namedRelation.evaluate(node => getComputedStyle(node).fontWeight)).toBe(titleWeight);
  const heights = await page.locator("tbody tr").evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height));
  expect(Math.max(...heights)).toBeLessThanOrEqual(36);
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("imported-database-presentation.png"), fullPage: true });
  await namedRelation.click();
  await expect(page).toHaveURL(new RegExp(`#page/${card2.id}$`));
  const relation = schema.properties.find((field: any) => field.id === "relation"); relation.readOnly = false; relation.localRelation = true;
  await page.goto(`/#database/${database.database.id}`);
  await expect(page.locator('.database-reference-cell .database-page-reference-label').first()).toHaveText("Card 2");
  await expect(page.locator('.database-reference-cell .database-page-reference .page-link-icon').first()).toBeVisible();
  await expect(page.locator('.database-reference-cell .database-tag')).toHaveCount(0);
  view.importWarnings.push("Notion sorting could not be applied; source query order is used.");
  await page.goto(`/#database/${database.database.id}`);
  await expect(page.locator(".database-import-note")).toHaveCount(0);
  await expect(page.getByText(view.importWarnings[1], { exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "View settings", exact: true }).click();
  await page.getByRole("button", { name: "Import details", exact: true }).click();
  const details = page.getByRole("dialog", { name: "Import details", exact: true });
  await expect(details.locator(".database-import-detail")).toHaveText(view.importWarnings[1]);
  expect(await (await request.get(`/api/databases/${database.database.id}`)).json()).toEqual(original);
});
