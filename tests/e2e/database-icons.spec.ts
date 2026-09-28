import { test, expect, type APIRequestContext } from "@playwright/test";

async function createDatabase(request: APIRequestContext, title: string) {
  const response = await request.post("/api/databases", { data: { title } });
  expect(response.status()).toBe(201);
  return response.json();
}

test("database icons reuse Emoji and Lucide, persist across reload and update the sidebar", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const created = await createDatabase(request, "Database icon catalog");
  const body = "# Preserve this host source\r\n\r\n```text\r\nicon: untouched\r\n```\r\n";
  const saved = await request.put(`/api/pages/${created.hostPage.id}`, { data: { baseRevision: created.hostPage.revision, body, properties: { future: { keep: true } } } });
  expect(saved.ok()).toBeTruthy();
  const recordResponse = await request.post(`/api/data-sources/${created.dataSources[0].id}/records`, { data: { title: "Pending icon row", baseRevision: created.dataSources[0].revision } });
  expect(recordResponse.status()).toBe(201);
  const record = await recordResponse.json();
  await page.goto(`/#database/${created.database.id}`);
  const emblem = page.getByRole("button", { name: "Change database icon", exact: true });
  const sidebar = page.locator(`#page-tree [data-open-database="${created.database.id}"]`);
  const picker = page.getByRole("dialog", { name: "Choose database icon", exact: true });
  await page.getByLabel("Name: Pending icon row", { exact: true }).fill("Saved before icon selection");
  await emblem.click();
  await picker.getByRole("button", { name: "Emoji", exact: true }).click();
  await expect(picker.getByRole("button", { name: "Upload", exact: true })).toHaveCount(0);
  await picker.getByLabel("Custom icon", { exact: true }).fill("📚");
  await picker.getByRole("button", { name: "Use icon", exact: true }).click();
  await expect(emblem.locator(".emoji")).toHaveText("📚");
  await expect(sidebar.locator(".emoji")).toHaveText("📚");
  await expect.poll(async () => (await (await request.get(`/api/pages/${created.hostPage.id}`)).json()).icon).toBe("📚");
  expect((await (await request.get(`/api/pages/${record.id}`)).json()).title).toBe("Saved before icon selection");
  await page.reload();
  await expect(emblem.locator(".emoji")).toHaveText("📚");
  await emblem.click();
  await picker.getByRole("button", { name: "Lucide", exact: true }).click();
  await picker.getByRole("searchbox", { name: "Search icons", exact: true }).fill("telescope");
  await expect(picker.getByRole("button", { name: "telescope", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/database-icon-lucide-picker.png" });
  await picker.getByRole("button", { name: "telescope", exact: true }).click();
  await expect(emblem.locator('svg[data-page-icon="telescope"]')).toBeVisible();
  await expect(sidebar.locator('svg[data-page-icon="telescope"]')).toBeVisible();
  await page.reload();
  await expect(emblem.locator('svg[data-page-icon="telescope"]')).toBeVisible();
  await emblem.click();
  await picker.getByRole("button", { name: "Remove", exact: true }).click();
  await expect.poll(async () => (await (await request.get(`/api/pages/${created.hostPage.id}`)).json()).icon).toBe("");
  await expect(emblem.locator('svg[data-page-icon="file-text"]')).toBeVisible();
  await expect(sidebar.locator('svg[data-page-icon="file-text"]')).toBeVisible();
  const current = await (await request.get(`/api/pages/${created.hostPage.id}`)).json();
  expect(current.body).toBe(body);
  expect(current.properties.future).toEqual({ keep: true });
  expect(errors).toEqual([]);
});

test("a stale database icon choice creates a recoverable conflict without replacing newer host content", async ({ page, request }) => {
  const created = await createDatabase(request, "Conflicting database icon");
  await page.goto(`/#database/${created.database.id}`);
  await page.getByRole("button", { name: "Change database icon", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose database icon", exact: true });
  await picker.getByRole("button", { name: "Emoji", exact: true }).click();
  const external = await request.put(`/api/pages/${created.hostPage.id}`, { data: { baseRevision: created.hostPage.revision, body: "Newer external host body\n", icon: "🌿" } });
  expect(external.ok()).toBeTruthy();
  await picker.getByLabel("Custom icon", { exact: true }).fill("🧭");
  await picker.getByRole("button", { name: "Use icon", exact: true }).click();
  await expect(page.locator(".database-message")).toContainText(/modified|conflict|preserved/i);
  const current = await (await request.get(`/api/pages/${created.hostPage.id}`)).json();
  expect(current.body).toBe("Newer external host body\n");
  expect(current.icon).toBe("🌿");
  await expect.poll(async () => (await (await request.get("/api/conflicts")).json()).find((conflict: any) => conflict.pageId === current.id)?.proposed.icon).toBe("🧭");
  const conflict = (await (await request.get("/api/conflicts")).json()).find((item: any) => item.pageId === current.id);
  expect(conflict.current.icon).toBe("🌿");
  expect(conflict.current.body).toBe("Newer external host body\n");
});

test("changing a database icon updates inline and sibling references without rewriting the parent", async ({ page, request }) => {
  const parent = await (await request.post("/api/pages", { data: { title: "Live database icon references", body: "", syntax: { version: 1, variant: "notdown", extensions: {} } } })).json();
  const response = await request.post("/api/databases", { data: { title: "Inline icon target", parent: parent.id, parentRevision: parent.revision } });
  expect(response.status()).toBe(201);
  const database = await response.json();
  const body = `<database url="#page/${database.hostPage.id}" inline="true">Inline icon target</database>\r\n\r\n<database url="#page/${database.hostPage.id}" inline="false">Linked database</database>\r\n`;
  expect((await request.put(`/api/pages/${parent.id}`, { data: { baseRevision: parent.revision, body } })).ok()).toBeTruthy();
  await page.goto(`/#page/${parent.id}`);
  const inline = page.getByRole("region", { name: "Inline database", exact: true });
  const references = page.locator(".pm-database-reference");
  await inline.locator(".pm-database-reference").click();
  await page.getByRole("button", { name: "Change database icon", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose database icon", exact: true });
  await picker.getByRole("button", { name: "Emoji", exact: true }).click();
  await picker.getByLabel("Custom icon", { exact: true }).fill("🚀");
  await picker.getByRole("button", { name: "Use icon", exact: true }).click();
  await expect(page.getByRole("button", { name: "Change database icon", exact: true }).locator(".emoji")).toHaveText("🚀");
  await page.goBack();
  await expect(references.locator(".emoji")).toHaveText(["🚀", "🚀"]);
  await expect(page.locator(`#page-tree [data-open-database="${database.database.id}"] .emoji`)).toHaveText("🚀");
  await expect(references.last()).toContainText("Linked database");
  expect((await (await request.get(`/api/pages/${parent.id}`)).json()).body).toBe(body);
});

test("child database, child page and link-to-page blocks share icon sizing and keep navigation and source", async ({ page, request }) => {
  const parent = await (await request.post("/api/pages", { data: { title: "Aligned page references", body: "", syntax: { version: 1, variant: "notdown", extensions: {} } } })).json();
  const databaseResponse = await request.post("/api/databases", { data: { title: "Child database", parent: parent.id, parentRevision: parent.revision } });
  expect(databaseResponse.status()).toBe(201);
  const database = await databaseResponse.json();
  const child = await (await request.post("/api/pages", { data: { title: "Child page", parent: parent.id, icon: "telescope", body: "Child page body" } })).json();
  const target = await (await request.post("/api/pages", { data: { title: "Linked page", icon: "telescope", body: "Link target body" } })).json();
  expect((await request.put(`/api/databases/${database.database.id}/icon`, { data: { icon: "telescope", baseRevision: database.database.revision, hostRevision: database.hostPage.revision } })).ok()).toBeTruthy();
  const body = `Before references\r\n\r\n<database url="#page/${database.hostPage.id}" inline="false">Child database</database>\r\n\r\n<page url="#page/${child.id}">Child page</page>\r\n\r\n<page-link url="#page/${target.id}">Linked page</page-link>\r\n\r\nAfter references\r\n`;
  expect((await request.put(`/api/pages/${parent.id}`, { data: { baseRevision: parent.revision, body } })).ok()).toBeTruthy();
  await page.goto(`/#page/${parent.id}`);
  const references = page.locator('.pm-document a[data-page-id], .pm-document a.pm-database-reference');
  await expect(references).toHaveCount(3);
  const dimensions = await references.evaluateAll(links => links.map(link => {
    const icon = link.querySelector<SVGElement>('svg[data-page-icon="telescope"]')!;
    const rect = icon.getBoundingClientRect();
    const style = getComputedStyle(link);
    return { width: rect.width, height: rect.height, padding: style.padding, minHeight: style.minHeight, display: style.display, alignItems: style.alignItems };
  }));
  expect(dimensions[0]).toEqual(dimensions[1]);
  expect(dimensions[1]).toEqual(dimensions[2]);
  expect(dimensions[0].width).toBe(16);
  expect(dimensions[0].height).toBe(16);
  const labelTops = await references.evaluateAll(links => links.map(link => link.querySelector(".page-link-label")!.getBoundingClientRect().top));
  const rowSteps = [labelTops[1] - labelTops[0], labelTops[2] - labelTops[1]];
  expect(rowSteps[0]).toBeGreaterThan(0);
  expect(Math.abs(rowSteps[0] - rowSteps[1])).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "test-results/database-page-reference-styles.png" });
  for (const [id, title] of [[child.id, "Child page"], [target.id, "Linked page"]]) {
    await page.locator(`.pm-document a[data-page-id="${id}"]`).click();
    await expect(page.locator("#page-title")).toHaveValue(title);
    await page.goBack();
    await expect(page.locator("#page-title")).toHaveValue("Aligned page references");
  }
  await page.locator('.pm-document a.pm-database-reference').click();
  await expect(page).toHaveURL(new RegExp(`#database/${database.database.id}$`));
  await expect(page.getByRole("textbox", { name: "Database title", exact: true })).toHaveValue("Child database");
  expect((await (await request.get(`/api/pages/${parent.id}`)).json()).body).toBe(body);
});
