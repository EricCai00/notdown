import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

async function setup(page: Page, request: APIRequestContext, variant = "notdown") {
  const create = async (data: object) => (await request.post("/api/pages", { data })).json();
  const parent = await create({ title: "Delete child entries", body: "", syntax: { version: 1, variant, extensions: {} } });
  const children = await Promise.all(["Alpha", "Beta"].map(title => create({ title, parent: parent.id, body: `${title} content` })));
  const grandchild = await create({ title: "Grandchild", parent: children[0].id, body: "Keep recoverable" });
  const body = children.map(child => `<page url="#page/${child.id}">${child.title}</page>`).join("\n\n") + "\n\nTail\n";
  expect((await request.put(`/api/pages/${parent.id}`, { data: { body, baseRevision: parent.revision } })).ok()).toBeTruthy();
  await page.goto(`/#page/${parent.id}`);
  await expect(page.locator('.ProseMirror [data-pm-node-type="block.child_page"]')).toHaveCount(2);
  return { parent, children, grandchild, body };
}

async function deleteFromMenu(page: Page) {
  await page.locator('.ProseMirror [data-pm-node-type="block.child_page"]').first().hover();
  await page.locator(".pm-block-handle.visible").click();
  await page.getByRole("menu", { name: "Block actions" }).getByRole("menuitem", { name: "Delete", exact: true }).click();
}

for (const variant of ["notdown", "notion-markdown"]) {
  test(`${variant}: cancel keeps the child; confirmation trashes it and restore recovers descendants`, async ({ page, request }) => {
    const { parent, children, grandchild, body } = await setup(page, request, variant);
    await deleteFromMenu(page);
    const dialog = page.locator("dialog[open]");
    await expect(dialog).toContainText("Delete Alpha?");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect((await (await request.get(`/api/pages/${parent.id}`)).json()).body).toBe(body);
    expect((await (await request.get(`/api/pages/${children[0].id}`)).json()).trashed).not.toBe(true);
    await deleteFromMenu(page);
    await dialog.getByRole("button", { name: "Move to Trash", exact: true }).click();
    await expect(page.locator('.ProseMirror [data-pm-node-type="block.child_page"]')).toHaveCount(1);
    await expect.poll(async () => (await (await request.get(`/api/pages/${parent.id}`)).json()).body).not.toContain(children[0].id);
    const all = await (await request.get("/api/pages?includeTrashed=true")).json();
    expect(all.find((item: { id: string }) => item.id === children[0].id).trashed).toBe(true);
    expect(all.find((item: { id: string }) => item.id === children[0].id).body).toBe("Alpha content");
    const active = await (await request.get("/api/pages")).json();
    expect(active.map((item: { id: string }) => item.id)).not.toContain(grandchild.id);
    await page.getByRole("button", { name: "Trash", exact: true }).click();
    await dialog.locator(".trash-list > div").filter({ hasText: "Alpha" }).getByRole("button", { name: "Restore", exact: true }).click();
    await expect.poll(async () => (await (await request.get("/api/pages")).json()).map((item: { id: string }) => item.id)).toContain(grandchild.id);
  });
}

test("multi-selection uses one confirmation with the first name and total child page count", async ({ page, request }) => {
  const { children, parent } = await setup(page, request);
  const entries = page.locator('.ProseMirror [data-pm-node-type="block.child_page"]');
  const editor = (await page.locator(".pm-document").boundingBox())!;
  const first = (await entries.first().boundingBox())!, last = (await entries.last().boundingBox())!;
  await page.mouse.move(editor.x - 65, first.y + 8);
  await page.mouse.down();
  await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator(".pm-block-selected")).toHaveCount(2);
  await page.keyboard.press("Delete");
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await expect(page.locator("dialog[open]")).toContainText("Delete Alpha and 1 more (2 child pages)?");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(entries).toHaveCount(2);
  for (const child of children)
    expect((await (await request.get(`/api/pages/${child.id}`)).json()).trashed).not.toBe(true);
  await page.locator(".pm-document").focus();
  await page.keyboard.press("Backspace");
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await page.getByRole("button", { name: "Move to Trash", exact: true }).click();
  await expect(entries).toHaveCount(0);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect.poll(async () => (await (await request.get(`/api/pages/${parent.id}`)).json()).body).not.toContain("<page");
  const all = await (await request.get("/api/pages?includeTrashed=true")).json();
  for (const child of children) expect(all.find((item: { id: string }) => item.id === child.id).trashed).toBe(true);
});

test("a child revision conflict retains the block and the externally updated child", async ({ page, request }) => {
  const { children } = await setup(page, request);
  await deleteFromMenu(page);
  expect((await request.put(`/api/pages/${children[0].id}`, { data: { body: "External content", baseRevision: children[0].revision } })).ok()).toBeTruthy();
  await page.getByRole("button", { name: "Move to Trash", exact: true }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator('.ProseMirror [data-pm-node-type="block.child_page"]')).toHaveCount(2);
  const child = await (await request.get(`/api/pages/${children[0].id}`)).json();
  expect(child.body).toBe("External content");
  expect(child.trashed).not.toBe(true);
});

test("deleting a selection containing both a page and its descendant moves the subtree once", async ({ page, request }) => {
  const { children } = await setup(page, request);
  expect((await request.put(`/api/pages/${children[1].id}`, { data: { parent: children[0].id, baseRevision: children[1].revision } })).ok()).toBeTruthy();
  await page.reload();
  await page.locator(".pm-document").focus();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await expect(page.locator("dialog[open]")).toContainText("2 child pages");
  await page.getByRole("button", { name: "Move to Trash", exact: true }).click();
  await expect(page.locator('.ProseMirror [data-pm-node-type="block.child_page"]')).toHaveCount(0);
  const all = await (await request.get("/api/pages?includeTrashed=true")).json();
  expect(all.find((item: { id: string }) => item.id === children[0].id).trashed).toBe(true);
  expect(all.find((item: { id: string }) => item.id === children[1].id).body).toBe("Beta content");
  const active = await (await request.get("/api/pages")).json();
  for (const child of children) expect(active.map((item: { id: string }) => item.id)).not.toContain(child.id);
});
