import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";

const test = base.extend<{ isolated: { request: APIRequestContext; url: string } }>({
  isolated: async ({ request, playwright, baseURL }, use) => {
    const response = await request.post("/api/vaults/open", { data: { mode: "create", name: "Trash test " + Date.now() } });
    expect(response.ok()).toBeTruthy();
    const entry = await response.json();
    const isolated = await playwright.request.newContext({ baseURL: new URL(entry.url, baseURL).href });
    try { await use({ request: isolated, url: entry.url }); } finally { await isolated.dispose(); }
  },
});

async function create(request: APIRequestContext, title: string, parent: string | null = null, body = "Body") {
  const response = await request.post("api/pages", { data: { title, parent, body } });
  expect(response.ok()).toBeTruthy(); return response.json();
}
async function trash(request: APIRequestContext, id: string) {
  const page = await (await request.get(`api/pages/${id}`)).json();
  expect((await request.put(`api/pages/${id}`, { data: { baseRevision: page.revision, trashed: true } })).ok()).toBeTruthy();
}
async function openTrash(page: Page) {
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  return page.getByRole("dialog", { name: "Trash", exact: true });
}
async function confirmEmpty(page: Page) {
  await page.getByRole("button", { name: "Empty Trash", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Empty Trash?", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("Empty Trash confirms once, supports cancellation, and recycles every subtree and unshared attachment", async ({ page, isolated }, testInfo) => {
  const { request, url } = isolated;
  const upload = async (name: string) => (await (await request.post("api/assets", { data: { name, contentType: "text/plain", data: Buffer.from(name).toString("base64") } })).json());
  const only = await upload("empty-only.txt"), shared = await upload("empty-shared.txt");
  const parent = await create(request, "Empty parent", null, `[only](${only.path}) [shared](${shared.path})`);
  const child = await create(request, "Empty child", parent.id);
  const nestedTrash = await create(request, "Already trashed child", parent.id);
  const other = await create(request, "Empty other");
  const active = await create(request, "Keep active", null, `[shared](${shared.path})`);
  await trash(request, nestedTrash.id); await trash(request, parent.id); await trash(request, other.id);
  await page.goto(`${url}#page/${active.id}`);
  await expect(page.locator("#page-title")).toHaveValue(active.title);
  const dialog = await openTrash(page);
  await expect(dialog.getByRole("button", { name: "Empty Trash", exact: true })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("trash-with-empty-button.png") });
  await (await confirmEmpty(page)).getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await request.get(`api/pages/${parent.id}`)).ok()).toBeTruthy();
  const posts: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/pages/*/recycle", async route => { posts.push(route.request().url()); if (posts.length === 1) await gate; await route.continue(); });
  const confirmation = await confirmEmpty(page);
  await confirmation.getByRole("button", { name: "Empty Trash", exact: true }).click();
  await expect(confirmation.locator("[data-confirm-empty-trash]")).toBeDisabled();
  await expect(confirmation).toHaveAttribute("inert", "");
  await page.keyboard.press("Escape");
  await expect(confirmation).toBeVisible();
  release();
  await expect(dialog.locator(".empty-small")).toHaveText("Trash is empty.");
  await expect(dialog.getByRole("button", { name: "Empty Trash", exact: true })).toBeDisabled();
  expect(posts.filter(url => url.includes(parent.id))).toHaveLength(1);
  expect(posts.filter(url => url.includes(nestedTrash.id))).toHaveLength(0);
  for (const item of [parent, child, nestedTrash, other]) expect((await request.get(`api/pages/${item.id}`)).status()).toBe(404);
  expect((await request.get(`api/pages/${active.id}`)).ok()).toBeTruthy();
  expect((await request.get(only.path)).status()).toBe(404);
  expect((await request.get(shared.path)).ok()).toBeTruthy();
});

test("Empty Trash removes multiple sources from one active owner, including a source with no records", async ({ page, isolated }) => {
  const { request, url } = isolated;
  let owner = await (await request.post("api/databases", { data: { title: "Keep source owner" } })).json();
  const source = owner.dataSources[0];
  const row = await (await request.post(`api/data-sources/${source.id}/records`, { data: { baseRevision: source.revision, title: "Trashed source record" } })).json();
  expect(row.id).toBeTruthy();
  const child = await create(request, "Source record child", row.id);
  owner = await (await request.get(`api/databases/${owner.database.id}`)).json();
  owner = await (await request.post(`api/databases/${owner.database.id}/data-sources`, { data: { baseRevision: owner.database.revision, title: "Empty source" } })).json();
  for (const item of owner.dataSources) {
    const response = await request.post(`api/data-sources/${item.id}/trash`, { data: { baseRevision: item.revision, databaseRevision: owner.database.revision, trashed: true } });
    expect(response.ok()).toBeTruthy(); owner = await response.json();
  }
  await page.goto(`${url}#database/${owner.database.id}`);
  await expect(page.getByRole("textbox", { name: "Database title", exact: true })).toHaveValue("Keep source owner");
  await openTrash(page);
  await (await confirmEmpty(page)).getByRole("button", { name: "Empty Trash", exact: true }).click();
  await expect(page.locator(".trash-list .empty-small")).toHaveText("Trash is empty.");
  expect((await request.get(`api/pages/${row.id}`)).status()).toBe(404);
  expect((await request.get(`api/pages/${child.id}`)).status()).toBe(404);
  const kept = await (await request.get(`api/databases/${owner.database.id}`)).json();
  expect(kept.dataSources).toHaveLength(0);
  await expect(page.getByRole("textbox", { name: "Database title", exact: true })).toHaveValue("Keep source owner");
});

test("Empty Trash stops after a stale revision, refreshes remaining entries, and never retries", async ({ page, isolated }) => {
  const { request, url } = isolated;
  const one = await create(request, "Conflict first"), two = await create(request, "Conflict second");
  await trash(request, one.id); await trash(request, two.id);
  await page.goto(`${url}#vault/gallery`); await openTrash(page);
  const calls: string[] = [];
  await page.route("**/api/pages/*/recycle", async route => {
    calls.push(route.request().url());
    if (calls.length === 1) {
      await route.continue(); return;
    }
    const id = new URL(route.request().url()).pathname.split("/").at(-2);
    const original = await (await request.get(`api/pages/${id}`)).json();
    expect((await request.put(`api/pages/${id}`, { data: { baseRevision: original.revision, body: "External change" } })).ok()).toBeTruthy();
    await route.continue();
  });
  await (await confirmEmpty(page)).getByRole("button", { name: "Empty Trash", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("Empty Trash stopped");
  expect(calls).toHaveLength(2);
  const remainingId = new URL(calls[1]).pathname.split("/").at(-2)!;
  await expect(page.locator(`[data-restore="${remainingId}"]`)).toBeVisible();
  expect((await (await request.get(`api/pages/${remainingId}`)).json()).body).toBe("External change");
  await expect(page.locator("#app")).not.toHaveAttribute("inert", "");
});

test("Empty Trash is disabled when the server has no system recycle adapter", async ({ page, isolated }) => {
  const { request, url } = isolated;
  const note = await create(request, "Unsupported recycle"); await trash(request, note.id);
  await page.route("**/api/status", async route => {
    const response = await route.fetch(), info = await response.json();
    info.capabilities.systemRecycleBin = false;
    await route.fulfill({ response, json: info });
  });
  await page.goto(`${url}#vault/gallery`);
  const dialog = await openTrash(page);
  await expect(dialog.getByRole("button", { name: "Empty Trash", exact: true })).toBeDisabled();
  await expect(dialog.locator(`[data-restore="${note.id}"]`)).toBeEnabled();
});
