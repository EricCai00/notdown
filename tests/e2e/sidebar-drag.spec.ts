import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

async function create(request: APIRequestContext, title: string, parent: string | null = null) {
  return (await request.post("/api/pages", { data: { title, parent, body: "Original body" } })).json();
}
const row = (page: Page, id: string) => page.locator(`#page-tree [data-page-row="${id}"]`);
const source = (page: Page, id: string) => row(page, id).locator(".tree-page");
async function drop(page: Page, id: string, targetId: string, position: "before" | "after" | "inside") {
  await expect(page.locator("#app")).not.toHaveAttribute("inert", "");
  const target = row(page, targetId), box = await target.boundingBox();
  await source(page, id).dragTo(target, { targetPosition: { x: 90, y: position === "before" ? 2 : position === "after" ? box!.height - 2 : box!.height / 2 } });
  await expect(page.locator("#app")).not.toHaveAttribute("inert", "");
}

test("dragging sidebar pages reorders siblings and persists after reload", async ({ page, request }) => {
  const a = await create(request, "Drag order A"), b = await create(request, "Drag order B"), c = await create(request, "Drag order C");
  await page.goto(`/#page/${a.id}`);
  await expect(page.locator("#page-title")).toHaveValue(a.title);
  await drop(page, c.id, a.id, "before");
  await drop(page, b.id, c.id, "after");
  const order = () => page.locator("#page-tree [data-page-row]").evaluateAll((rows, ids) => rows.map((el) => el.getAttribute("data-page-row")).filter((id) => ids.includes(id!)), [a.id, b.id, c.id]);
  await expect.poll(order).toEqual([c.id, b.id, a.id]);
  await expect(page.locator("#page-title")).toHaveValue(a.title);
  await page.reload();
  await expect.poll(order).toEqual([c.id, b.id, a.id]);
  expect((await (await request.get(`/api/pages/${a.id}`)).json()).parent).toBeNull();
});

test("dragging changes parent, returns to root, and trashes a subtree without losing pending input", async ({ page, request }) => {
  const parent = await create(request, "Drag destination"), note = await create(request, "Dragged note"), child = await create(request, "Dragged child", note.id);
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator("#page-title")).toHaveValue(note.title);
  await page.locator(".pm-document").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" pending drag edit");
  await drop(page, note.id, parent.id, "inside");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).parent).toBe(parent.id);
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("pending drag edit");
  expect((await (await request.get(`/api/pages/${child.id}`)).json()).parent).toBe(note.id);
  await source(page, note.id).dragTo(page.locator(".section-label[data-page-root-drop]"));
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).parent).toBeNull();
  await expect(page.locator("#app")).not.toHaveAttribute("inert", "");
  await source(page, note.id).dragTo(page.locator("[data-page-trash-drop]"));
  await expect(row(page, note.id)).toHaveCount(0);
  await expect(row(page, child.id)).toHaveCount(0);
  await expect(page.locator("#main h1")).toHaveText("Vault");
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).trashed).toBe(true);
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await page.locator(`[data-restore="${note.id}"]`).click();
  await expect(page.locator(`[data-restore="${note.id}"]`)).toHaveCount(0);
  await page.locator("#dialog").getByRole("button", { name: "Close", exact: true }).click();
  await row(page, note.id).hover();
  await row(page, note.id).locator(".tree-toggle").click();
  await expect(row(page, child.id)).toBeVisible();
});

test("dragging into a descendant or canceling a drag never changes hierarchy", async ({ page, request }) => {
  const parent = await create(request, "Invalid drag parent"), child = await create(request, "Invalid drag child", parent.id);
  await page.goto(`/#page/${parent.id}`);
  await expect(page.locator("#page-title")).toHaveValue(parent.title);
  await row(page, parent.id).hover();
  await row(page, parent.id).locator(".tree-toggle").click();
  await drop(page, parent.id, child.id, "inside");
  expect((await (await request.get(`/api/pages/${parent.id}`)).json()).parent).toBeNull();
  await source(page, parent.id).hover();
  await page.mouse.down();
  const box = await source(page, parent.id).boundingBox();
  await page.mouse.move(box!.x + 30, box!.y + 45, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".sidebar")).not.toHaveClass(/is-page-dragging/);
  expect((await (await request.get(`/api/pages/${child.id}`)).json()).parent).toBe(parent.id);
});

test("destination changes during a drag keep the original hierarchy and a recoverable conflict", async ({ page, request }) => {
  const active = await create(request, "Drag conflict active"), note = await create(request, "Drag conflict source"), target = await create(request, "Drag conflict destination");
  await page.goto(`/#page/${active.id}`);
  await expect(page.locator("#page-title")).toHaveValue(active.title);
  await source(page, note.id).hover();
  await page.mouse.down();
  const box = await source(page, note.id).boundingBox();
  await page.mouse.move(box!.x + 25, box!.y + 40, { steps: 5 });
  await expect(page.locator(".sidebar")).toHaveClass(/is-page-dragging/);
  await request.put(`/api/pages/${target.id}`, { data: { baseRevision: target.revision, body: "Changed elsewhere" } });
  // Keep edge autoscroll from moving the target after measuring a long sidebar.
  await page.mouse.move(900, 500);
  await row(page, target.id).evaluate(element => element.scrollIntoView({ block: "center" }));
  const destination = await row(page, target.id).boundingBox();
  await page.mouse.move(destination!.x + 95, destination!.y + destination!.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".toast")).toContainText("Both versions are preserved");
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).parent).toBeNull();
  expect((await (await request.get(`/api/pages/${target.id}`)).json()).body).toBe("Changed elsewhere");
});
