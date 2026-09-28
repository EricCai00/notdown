import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function fixture(request: APIRequestContext, title: string) {
  const created = await request.post("/api/databases", { data: { title } });
  expect(created.ok()).toBeTruthy();
  const snapshot = await created.json(), fieldId = randomUUID();
  const schema = snapshot.dataSources[0];
  const response = await request.put(`/api/data-sources/${schema.id}`, { data: { baseRevision: schema.revision, properties: [...schema.properties, { id: fieldId, key: fieldId, name: "Note", type: "text" }] } });
  expect(response.ok()).toBeTruthy();
  const source = await response.json();
  const row = await (await request.post(`/api/data-sources/${source.id}/records`, { data: { title: "Inline record", properties: { [fieldId]: "Original" }, baseRevision: source.revision } })).json();
  const hostId = snapshot.hostPage.id;
  const body = `Before database\n\n<database future="preserve" url="#page/${hostId}" inline="true">${title}</database>\n\nAfter database\n`;
  const page = await (await request.post("/api/pages", { data: { title: "Inline database page", body, syntax: { version: 1, variant: "notdown", extensions: {} }, bodyFormat: "notion-markdown" } })).json();
  return { page, row, fieldId, source, database: snapshot.database, body };
}

test("inline database edits save before switching source or opening the full database without rewriting Markdown", async ({ page, request }) => {
  const data = await fixture(request, "Inline tasks");
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/#page/${data.page.id}`);
  const inline = page.getByRole("region", { name: "Inline database", exact: true });
  const note = inline.getByLabel("Note: Inline record", { exact: true });
  await expect(note).toHaveValue("Original");
  await inline.getByRole("button", { name: "Add row", exact: true }).click();
  await page.getByRole("dialog", { name: "Add row", exact: true }).getByLabel("Row title", { exact: true }).fill("Created inside database");
  await page.getByRole("button", { name: "Create row", exact: true }).click();
  await expect(inline.getByRole("button", { name: "Open Created inside database", exact: true })).toBeVisible();
  await note.fill("Saved before source");
  await page.locator("#editing-workspace > .editing-toolbar").getByRole("button", { name: "Source", exact: true }).click();
  await expect(page.locator("#editing-workspace")).toHaveAttribute("data-mode", "source");
  await expect.poll(async () => (await (await request.get(`/api/pages/${data.row.id}`)).json()).properties[data.fieldId]).toBe("Saved before source");
  await expect(page.locator("#source-editor")).toContainText('<database future="preserve"');
  await page.locator("#editing-workspace > .editing-toolbar").getByRole("button", { name: "Page", exact: true }).click();
  await expect(note).toHaveValue("Saved before source");
  await note.fill("Saved before open");
  await inline.locator(":scope > .pm-database-reference").click();
  await expect(page).toHaveURL(new RegExp(`#database/${data.database.id}$`));
  await expect.poll(async () => (await (await request.get(`/api/pages/${data.row.id}`)).json()).properties[data.fieldId]).toBe("Saved before open");
  expect((await (await request.get(`/api/pages/${data.page.id}`)).json()).body).toBe(data.body);
  expect(errors).toEqual([]);
});

test("inline database conflicts retain the draft and block source switching and navigation", async ({ page, request }) => {
  const data = await fixture(request, "Inline conflicts");
  await page.goto(`/#page/${data.page.id}`);
  const inline = page.getByRole("region", { name: "Inline database", exact: true });
  const note = inline.getByLabel("Note: Inline record", { exact: true });
  await expect(note).toHaveValue("Original");
  const external = await request.put(`/api/pages/${data.row.id}`, { data: { body: "External newer body", baseRevision: data.row.revision } });
  expect(external.ok()).toBeTruthy();
  await note.fill("Unsaved conflicting cell");
  await page.locator("#editing-workspace > .editing-toolbar").getByRole("button", { name: "Source", exact: true }).click();
  await expect(inline.locator(".database-message")).toContainText(/preserved/i);
  await expect(page.locator("#editing-workspace")).toHaveAttribute("data-mode", "document");
  await expect(note).toHaveValue("Unsaved conflicting cell");
  await inline.locator(":scope > .pm-database-reference").click();
  await expect(page).toHaveURL(new RegExp(`#page/${data.page.id}$`));
  expect((await (await request.get(`/api/pages/${data.row.id}`)).json()).body).toBe("External newer body");
  expect((await (await request.get(`/api/pages/${data.row.id}`)).json()).properties[data.fieldId]).toBe("Original");
  await expect.poll(async () => JSON.stringify(await (await request.get("/api/conflicts")).json())).toContain("Unsaved conflicting cell");
});
