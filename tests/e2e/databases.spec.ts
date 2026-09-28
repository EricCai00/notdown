import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { createBlockDatabase } from "./database-fixture";
import { renameDatabaseTitle } from "./database-ui-helper";

async function createDatabase(page: Page, name: string) {
  await page.getByRole("button", { name: "Databases", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Databases", exact: true })).toBeVisible();
  await page.locator("#main").getByRole("button", { name: "New database", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Database title", exact: true })).toHaveValue("New database");
  await renameDatabaseTitle(page, name);
  return page.url();
}

async function addProperty(page: Page, name: string, type = "text") {
  await page.getByRole("button", { name: "Add property", exact: true }).click();
  await page.getByLabel("Property name", { exact: true }).fill(name);
  await page.getByRole("combobox", { name: "Property type", exact: true }).selectOption(type);
  await page.getByRole("button", { name: "Save property", exact: true }).click();
  await expect(page.getByRole("button", { name: `Edit ${name} property`, exact: true })).toBeVisible();
}

async function addRow(page: Page, title: string) {
  await page.getByRole("button", { name: "Add row", exact: true }).click();
  await page.getByLabel("Row title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Create row", exact: true }).click();
  await expect(page.getByRole("button", { name: `Open ${title}`, exact: true })).toBeVisible();
}

async function savedRow(request: APIRequestContext, title: string) {
  const rows = await (await request.get("/api/pages")).json();
  return rows.find((row: any) => row.title === title);
}

test("database records share page properties, preserve pending body and survive reopening", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const original = await (await request.post("/api/pages", { data: { title: "Before database", body: "Pending original" } })).json();
  await page.goto(`/#page/${original.id}`);
  await expect(page.locator(".pm-document")).toBeVisible();
  await page.locator(".pm-document").fill("Body collected before opening databases");
  const url = await createDatabase(page, "Tasks E2E");
  await expect.poll(async () => (await (await request.get(`/api/pages/${original.id}`)).json()).body).toContain("Body collected before opening databases");
  await addProperty(page, "Estimate", "number");
  await addRow(page, "Database task E2E");
  const cell = page.getByLabel("Estimate: Database task E2E", { exact: true });
  await cell.fill("0");
  await cell.press("Tab");
  await expect.poll(async () => Object.values((await savedRow(request, "Database task E2E")).properties)).toContain(0);
  const record = await savedRow(request, "Database task E2E");
  expect(record.dataSourceId).toBeTruthy();
  const propertyKey = Object.keys(record.properties).find(key => record.properties[key] === 0)!;
  await page.reload();
  await expect(cell).toHaveValue("0");
  await page.getByRole("button", { name: "Open Database task E2E", exact: true }).click();
  await page.getByRole("button", { name: "Open as full page", exact: true }).click();
  await expect(page.locator("#page-title")).toHaveValue("Database task E2E");
  await page.locator(".pm-document").fill("This database row is a normal Markdown page.");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${record.id}`)).json()).body).toContain("normal Markdown page");
  await page.locator("#database-page-properties").getByLabel("Estimate: Database task E2E", { exact: true }).fill("7");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${record.id}`)).json()).properties[propertyKey]).toBe(7);
  await page.goto(url);
  await expect(cell).toHaveValue("7");
  await page.getByRole("button", { name: "Edit Estimate property", exact: true }).click();
  await page.getByLabel("Property name", { exact: true }).fill("Effort");
  await page.getByRole("button", { name: "Save property", exact: true }).click();
  await expect(page.getByLabel("Effort: Database task E2E", { exact: true })).toHaveValue("7");
  expect((await (await request.get(`/api/pages/${record.id}`)).json()).properties[propertyKey]).toBe(7);
  await page.reload();
  await expect(page.getByLabel("Effort: Database task E2E", { exact: true })).toHaveValue("7");
  await page.screenshot({ path: "test-results/databases-table.png" });
  expect(errors).toEqual([]);
});

test("a stale database cell cannot overwrite newer page content and retains a conflict copy", async ({ page, request }) => {
  await page.goto("/");
  const url = await createDatabase(page, "Conflict database E2E");
  await addProperty(page, "Note");
  await addRow(page, "Conflict record E2E");
  const cell = page.getByLabel("Note: Conflict record E2E", { exact: true });
  await cell.fill("Original value");
  await cell.press("Tab");
  await expect.poll(async () => Object.values((await savedRow(request, "Conflict record E2E")).properties)).toContain("Original value");
  const record = await savedRow(request, "Conflict record E2E");
  const propertyKey = Object.keys(record.properties).find(key => record.properties[key] === "Original value")!;
  const source = await (await request.get(`/api/data-sources/${record.dataSourceId}`)).json();
  expect((await request.put(`/api/pages/${record.id}`, { data: { body: "Newer external Markdown", properties: { ...record.properties, [propertyKey]: "External value" }, baseRevision: record.revision, schemaRevision: source.revision } })).ok()).toBeTruthy();
  await cell.fill("Stale local draft");
  await cell.press("Tab");
  await expect(page.getByRole("status").filter({ hasText: /modified this page.*preserved/i })).toBeVisible();
  const current = await (await request.get(`/api/pages/${record.id}`)).json();
  expect(current.body).toBe("Newer external Markdown");
  expect(current.properties[propertyKey]).toBe("External value");
  await expect.poll(async () => JSON.stringify(await (await request.get("/api/conflicts")).json())).toContain("Stale local draft");
  await expect(cell).toHaveValue("Stale local draft");
  await page.getByRole("button", { name: "Databases", exact: true }).click();
  await expect(page).toHaveURL(url);
  await expect(cell).toHaveValue("Stale local draft");
  await page.reload();
  await expect(cell).toHaveValue("Stale local draft");
  await expect(page.getByRole("status").filter({ hasText: "Recovered unsaved edits" })).toBeVisible();
  await page.getByLabel("Database options", { exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /modified this page.*preserved/i })).toBeVisible();
  expect((await (await request.get(`/api/pages/${record.id}`)).json()).properties[propertyKey]).toBe("External value");
});

test("document metadata overrides are visible and read-only in a database", async ({ page, request }) => {
  await page.goto("/");
  const url = await createDatabase(page, "Metadata database E2E");
  await addProperty(page, "Origin");
  await addRow(page, "Metadata record E2E");
  const cell = page.getByLabel("Origin: Metadata record E2E", { exact: true });
  await cell.fill("JSON default");
  await cell.press("Tab");
  await expect.poll(async () => Object.values((await savedRow(request, "Metadata record E2E")).properties)).toContain("JSON default");
  const record = await savedRow(request, "Metadata record E2E");
  const propertyKey = Object.keys(record.properties).find(key => record.properties[key] === "JSON default")!;
  const body = `---\nproperties:\n  ${JSON.stringify(propertyKey)}: Document override\n---\n\nUntouched Markdown.\n`;
  expect((await request.put(`/api/pages/${record.id}`, { data: { body, baseRevision: record.revision } })).ok()).toBeTruthy();
  await page.goto(url);
  await expect(cell).toContainText("Document override");
  await expect(cell).toHaveAttribute("title", "Defined in document metadata — edit in source");
  await expect(cell.locator("input,select,textarea")).toHaveCount(0);
  expect((await (await request.get(`/api/pages/${record.id}`)).json()).body).toBe(body);
});

test("saved table views filter, sort and hide fields without duplicating pages", async ({ page, request }) => {
  await page.goto("/");
  const url = await createDatabase(page, "Views database E2E");
  await addProperty(page, "Notes");
  await addRow(page, "View task A");
  await addRow(page, "View task B");
  await addRow(page, "Unrelated record");
  await page.getByRole("button", { name: "New view", exact: true }).click();
  await page.getByLabel("View name", { exact: true }).fill("Only tasks");
  await page.getByRole("button", { name: "Create view", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Only tasks", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "View settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "View settings", exact: true });
  await dialog.getByRole("combobox", { name: "Sort by", exact: true }).selectOption({ label: "Name" });
  await dialog.getByRole("combobox", { name: "Direction", exact: true }).selectOption("descending");
  await dialog.getByRole("combobox", { name: "Filter property", exact: true }).selectOption({ label: "Name" });
  await dialog.getByLabel("Contains", { exact: true }).fill("View task");
  await dialog.getByRole("checkbox", { name: "Notes", exact: true }).uncheck();
  await dialog.getByRole("button", { name: "Save view", exact: true }).click();
  await expect(page.locator(".database-table tbody tr:visible")).toHaveCount(2);
  await expect(page.locator(".database-table tbody tr:visible").first().getByRole("button", { name: "Open View task B", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Notes property", exact: true })).toHaveCount(0);
  await page.goto(url);
  await expect(page.getByRole("tab", { name: "Only tasks", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".database-table tbody tr:visible")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Edit Notes property", exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Table", exact: true }).click();
  await expect(page.locator(".database-table tbody tr:visible")).toHaveCount(3);
  const record = await savedRow(request, "View task A");
  const records = await (await request.get("/api/pages")).json();
  expect(records.filter((row: any) => row.dataSourceId === record.dataSourceId)).toHaveLength(3);
  await page.getByRole("tab", { name: "Only tasks", exact: true }).click();
  const titleCell = page.getByLabel("Name: View task B", { exact: true });
  await titleCell.fill("Renamed outside this filter");
  await titleCell.press("Tab");
  await expect(titleCell).not.toBeVisible();
  await expect(page.locator(".database-table tbody tr:visible")).toHaveCount(1);
  await expect(page.locator(".database-row-count")).toHaveText("1 page");
  const renamed = await savedRow(request, "Renamed outside this filter");
  expect(renamed.dataSourceId).toBe(record.dataSourceId);
});

test("opening a record collects the focused cell and browser Back returns to its saved table", async ({ page, request }) => {
  await page.goto("/");
  const url = await createDatabase(page, "Navigation database E2E");
  await addProperty(page, "Summary");
  await addRow(page, "Navigation record E2E");
  const cell = page.getByLabel("Summary: Navigation record E2E", { exact: true });
  await cell.fill("Focused cell survives navigation");
  await expect(cell).toBeFocused();
  await page.getByRole("button", { name: "Open Navigation record E2E", exact: true }).click();
  await page.getByRole("button", { name: "Open as full page", exact: true }).click();
  await expect(page.locator("#page-title")).toHaveValue("Navigation record E2E");
  await expect(page.locator(".pm-document")).toBeVisible();
  const record = await savedRow(request, "Navigation record E2E");
  expect(Object.values(record.properties)).toContain("Focused cell survives navigation");
  await page.locator(".pm-document").fill("Pending record body survives Back.");
  await page.goBack();
  await expect(page).toHaveURL(url);
  await expect(cell).toHaveValue("Focused cell survives navigation");
  await expect.poll(async () => (await (await request.get(`/api/pages/${record.id}`)).json()).body).toContain("Pending record body survives Back.");
});

test("editing a cell during its pending save retains and saves the newer input", async ({ page, request }) => {
  await page.goto("/");
  await createDatabase(page, "Pending database E2E");
  await addProperty(page, "Draft");
  await addRow(page, "Pending record E2E");
  const cell = page.getByLabel("Draft: Pending record E2E", { exact: true });
  let releaseFirst!: () => void;
  const holdFirst = new Promise<void>(resolve => { releaseFirst = resolve; });
  const sentValues: unknown[] = [];
  await page.route("**/api/data-sources/*/records/*", async route => {
    if (route.request().method() === "PUT") {
      sentValues.push(route.request().postDataJSON().value);
      if (sentValues.length === 1) await holdFirst;
    }
    await route.continue();
  });
  try {
    await cell.fill("First submitted value");
    await cell.press("Enter");
    await expect.poll(() => sentValues).toEqual(["First submitted value"]);
    await expect(cell).toBeEditable();
    await cell.fill("Newer input while saving");
  } finally {
    releaseFirst();
  }
  await expect.poll(async () => Object.values((await savedRow(request, "Pending record E2E")).properties)).toContain("Newer input while saving");
  await expect(page.locator(".database-message")).toHaveText("Saved locally");
  expect(sentValues).toEqual(["First submitted value", "Newer input while saving"]);
  await expect(cell).toHaveValue("Newer input while saving");
  await page.reload();
  await expect(cell).toHaveValue("Newer input while saving");
});

test("a realistic database has colored properties and an editable responsive record peek", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1919, height: 975 });
  const fixture = await createBlockDatabase(request);
  await page.goto(`/#database/${fixture.database.id}`);
  await expect(page.getByRole("textbox", { name: "Database title", exact: true })).toHaveValue("Notion Blocks");
  await expect(page.locator(".database-table tbody tr")).toHaveCount(15);
  await expect(page.locator(".database-table thead th[data-type]")).toHaveCount(6);
  await page.getByRole("button", { name: "Search database", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search database records", exact: true }).fill("Callout");
  await expect(page.locator(".database-table tbody tr:visible")).toHaveCount(1);
  await expect(page.locator(".database-row-count")).toHaveText("1 page");
  await page.getByRole("button", { name: "Close database search", exact: true }).click();
  await expect(page.locator(".database-table tbody tr:visible")).toHaveCount(15);
  for (const control of ["Filter", "Sort"]) {
    await page.getByRole("button", { name: control, exact: true }).click();
    const settings = page.getByRole("dialog", { name: control, exact: true });
    await expect(settings).toBeVisible();
    await settings.getByRole("button", { name: "Cancel", exact: true }).click();
  }
  await page.screenshot({ path: "test-results/databases-reference-table.png" });
  await page.getByRole("button", { name: "Open Callout", exact: true }).click();
  const peek = page.getByRole("region", { name: "Record peek", exact: true });
  await expect(peek.getByLabel("Record title", { exact: true })).toHaveValue("Callout");
  await expect(peek.locator(".pm-document")).toContainText("The table and this page share the same properties.");
  await expect(page).toHaveURL(new RegExp(`#database/${fixture.database.id}$`));
  await page.screenshot({ path: "test-results/databases-reference-peek.png" });
  await peek.getByLabel("Notion Syntax: Callout", { exact: true }).fill("Updated from the side peek");
  await peek.locator(".pm-document").fill("Edited Markdown in the record peek.");
  await peek.getByLabel("Record title", { exact: true }).fill("Callout note");
  await peek.getByRole("button", { name: "Close record", exact: true }).click();
  await expect(peek).toHaveCount(0);
  await expect.poll(async () => (await (await request.get(`/api/pages/${fixture.callout.id}`)).json()).body).toContain("Edited Markdown in the record peek.");
  await expect(page.getByLabel("Notion Syntax: Callout note", { exact: true })).toHaveValue("Updated from the side peek");
  await page.getByRole("button", { name: "Open Callout note", exact: true }).click();
  await expect(peek.locator(".pm-document")).toContainText("Edited Markdown in the record peek.");
  await expect(peek.getByLabel("Notion Syntax: Callout note", { exact: true })).toHaveValue("Updated from the side peek");
  await peek.getByRole("button", { name: "In Markdown: Callout note", exact: true }).click();
  await page.screenshot({ path: "test-results/databases-select-menu.png" });
  await page.getByRole("listbox", { name: "In Markdown", exact: true }).getByRole("option", { name: "Not Available", exact: true }).click();
  await peek.getByRole("checkbox", { name: "AFFINE: Callout note", exact: true }).uncheck();
  await peek.getByRole("button", { name: "Save record", exact: true }).click();
  await expect.poll(async () => (await (await request.get(`/api/pages/${fixture.callout.id}`)).json()).properties.inMarkdown).toBe("no");
  expect((await (await request.get(`/api/pages/${fixture.callout.id}`)).json()).properties.affine).toBe(false);
  await expect(page.locator("#breadcrumb")).toHaveText("Databases");
  await page.setViewportSize({ width: 900, height: 975 });
  await expect(peek).toBeVisible();
  const bounds = await peek.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(901);
  await page.screenshot({ path: "test-results/databases-reference-peek-narrow.png" });
  await peek.getByRole("button", { name: "Close record", exact: true }).click();
  await page.screenshot({ path: "test-results/databases-reference-table-narrow.png" });
  await page.getByRole("button", { name: "Open Callout note", exact: true }).click();
  await peek.getByRole("button", { name: "Add a property", exact: true }).click();
  await page.getByLabel("Property name", { exact: true }).fill("Context");
  await page.getByRole("combobox", { name: "Property type", exact: true }).selectOption("text");
  await page.getByRole("button", { name: "Save property", exact: true }).click();
  await peek.getByLabel("Context: Callout note", { exact: true }).fill("Created from the record peek");
  await peek.getByRole("button", { name: "Close record", exact: true }).click();
  await page.getByRole("button", { name: "Open Callout note", exact: true }).click();
  await expect(peek.getByLabel("Context: Callout note", { exact: true })).toHaveValue("Created from the record peek");
  expect(errors).toEqual([]);
});

test("a record peek preserves conflicting Markdown and blocks closing or navigation", async ({ page, request }) => {
  await page.goto("/");
  const url = await createDatabase(page, "Peek conflict E2E");
  await addProperty(page, "Notes");
  await addRow(page, "Peek conflict record");
  await page.getByRole("button", { name: "Open Peek conflict record", exact: true }).click();
  const peek = page.getByRole("region", { name: "Record peek", exact: true });
  await expect(peek.locator(".pm-document")).toBeVisible();
  const record = await savedRow(request, "Peek conflict record");
  expect((await request.put(`/api/pages/${record.id}`, { data: { baseRevision: record.revision, body: "Newer external peek body" } })).ok()).toBeTruthy();
  await peek.locator(".pm-document").fill("Local conflicting peek draft");
  await peek.getByRole("button", { name: "Close record", exact: true }).click();
  await expect(peek).toBeVisible();
  await expect(peek.getByRole("status")).toContainText(/modified|conflict|preserved/i);
  expect((await (await request.get(`/api/pages/${record.id}`)).json()).body).toBe("Newer external peek body");
  await expect.poll(async () => JSON.stringify(await (await request.get("/api/conflicts")).json())).toContain("Local conflicting peek draft");
  await peek.getByRole("button", { name: "Open as full page", exact: true }).click();
  await expect(page).toHaveURL(url);
  await expect(peek.locator(".pm-document")).toContainText("Local conflicting peek draft");
  await page.getByRole("button", { name: "Databases", exact: true }).click();
  await expect(page).toHaveURL(url);
  await expect(peek).toBeVisible();
  await peek.getByRole("button", { name: "Discard draft and reload", exact: true }).click();
  await expect(peek.locator(".pm-document")).toContainText("Newer external peek body");
  await expect(peek.locator(".pm-document")).not.toContainText("Local conflicting peek draft");
  await peek.getByRole("button", { name: "Close record", exact: true }).click();
  await expect(peek).toHaveCount(0);
  expect(JSON.stringify(await (await request.get("/api/conflicts")).json())).toContain("Local conflicting peek draft");
});
