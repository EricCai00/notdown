import { test, expect } from "@playwright/test";

test("a backend without database endpoints still opens and saves ordinary pages", async ({ page, request }) => {
  const note = await (await request.post("/api/pages", { data: { title: "Old server compatible note", body: "Original Markdown" } })).json();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/databases", route => route.fulfill({ status: 404, json: { error: "API endpoint not found" } }));
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator("#page-title")).toHaveValue(note.title);
  await expect(page.locator(".boot-error")).toHaveCount(0);
  await expect(page.locator("#database-api-notice")).toContainText("Restart the backend");
  await page.locator(".pm-document").fill("Editing still works with the old backend");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("Editing still works");
  await page.getByRole("button", { name: "Databases", exact: true }).click();
  await expect(page.locator("#main")).toContainText("updated local server");
  await expect(page.locator(".boot-error")).toHaveCount(0);
  await page.locator(`#page-tree [data-open="${note.id}"]`).click();
  await expect(page.locator("#page-title")).toHaveValue(note.title);
  expect(errors).toEqual([]);
});

test("a direct database URL shows recovery instructions and recovers after the server updates", async ({ page }) => {
  let available = false;
  await page.route("**/api/databases", route => available ? route.continue() : route.fulfill({ status: 404, json: { error: "API endpoint not found" } }));
  await page.goto("/#databases");
  await expect(page.getByRole("heading", { name: "Databases", exact: true })).toBeVisible();
  await expect(page.locator("#main")).toContainText("Restart the backend");
  await expect(page.locator("#app")).not.toHaveAttribute("inert", "");
  available = true;
  await page.locator("#main").getByRole("button", { name: "Check connection", exact: true }).click();
  await expect(page.locator("#database-api-notice")).toBeHidden();
  await expect(page.locator("#main").getByRole("button", { name: "New database", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#databases$/);
});

test("database storage failures are reported instead of being treated as an old server", async ({ page, request }) => {
  const note = await (await request.post("/api/pages", { data: { title: "Visible backend error", body: "Keep this file" } })).json();
  await page.route("**/api/databases", route => route.fulfill({ status: 422, json: { error: "Invalid database metadata; original file preserved" } }));
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator(".boot-error")).toContainText("Invalid database metadata");
  await expect(page.locator("#app")).not.toHaveAttribute("inert", "");
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe("Keep this file");
});
