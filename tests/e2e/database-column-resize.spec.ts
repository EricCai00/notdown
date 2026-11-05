import { test, expect, type Page, type Locator } from "@playwright/test";
import { createBlockDatabase } from "./database-fixture";

test("hidden OPEN buttons leave the full title width available and reveal on hover or focus", async ({ page, request }, info) => {
  const fixture = await createBlockDatabase(request);
  await page.goto(`/#database/${fixture.database.id}`);
  const row = page.locator(`tr[data-page-id="${fixture.records[0].id}"]`);
  const cell = row.locator('td[data-type="title"]');
  const input = cell.locator("input");
  const open = cell.getByRole("button", { name: "Open Text", exact: true });
  await expect(input).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(open).toHaveCSS("opacity", "0");
  const fullWidth = (await input.boundingBox())!.width;
  const cellRight = (await cell.boundingBox())!;
  const inputBox = (await input.boundingBox())!;
  expect(Math.abs(cellRight.x + cellRight.width - inputBox.x - inputBox.width)).toBeLessThan(3);
  await input.hover();
  await expect(open).toHaveCSS("opacity", "1");
  expect((await input.boundingBox())!.width).toBeLessThan(fullWidth - 50);
  await page.mouse.move(5, 5);
  await expect(open).toHaveCSS("opacity", "0");
  expect((await input.boundingBox())!.width).toBeCloseTo(fullWidth, 0);
  await input.focus();
  await expect(open).toHaveCSS("opacity", "1");
  await input.press("Tab"); await expect(open).toBeFocused();
  await page.screenshot({ path: info.outputPath("title-open-focus.png") });
  await open.press("Enter");
  await expect(page.locator(".database-peek")).toBeVisible();
});

async function drag(page: Page, handle: Locator, delta: number, cancel = false) {
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + delta, box.y + box.height / 2, { steps: 8 });
  if (cancel) await page.keyboard.press("Escape");
  else await expect(handle).toHaveClass(/is-resizing/);
  await page.mouse.up();
}

test("table header resizing previews, cancels, persists and keeps neighbours stable", async ({ page, request }, info) => {
  const fixture = await createBlockDatabase(request);
  await page.goto(`/#database/${fixture.database.id}`);
  const headers = page.locator("thead th[data-property-id]");
  const handle = headers.first().getByRole("separator");
  const before = (await headers.first().boundingBox())!.width;
  const neighbour = (await headers.nth(1).boundingBox())!.width;
  await drag(page, handle, 95);
  await expect.poll(async () => (await headers.first().boundingBox())!.width).toBeCloseTo(before + 95, 0);
  expect((await headers.nth(1).boundingBox())!.width).toBeCloseTo(neighbour, 0);
  await expect(page.locator(".database-message")).toHaveText("Saved locally");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await drag(page, handle, -60, true);
  expect((await headers.first().boundingBox())!.width).toBeCloseTo(before + 95, 0);
  await page.reload();
  await expect(handle).toHaveAttribute("aria-valuenow", String(before + 95));
  await handle.focus(); await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".database-message")).toHaveText("Saved locally");
  await expect(handle).toHaveAttribute("aria-valuenow", String(before + 85));
  const last = headers.last().getByRole("separator");
  await drag(page, last, 80);
  await expect(page.locator(".database-message")).toHaveText("Saved locally");
  expect(await page.locator(".database-table-scroll").evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  await handle.scrollIntoViewIfNeeded(); await handle.hover();
  await page.screenshot({ path: info.outputPath("header-resize.png") });
});

test("grouped table header resizing updates every group and survives reload", async ({ page, request }) => {
  const fixture = await createBlockDatabase(request);
  const snapshot = await (await request.get(`/api/databases/${fixture.database.id}`)).json();
  const view = snapshot.views[0];
  expect((await request.put(`/api/database-views/${view.id}`, { data: { baseRevision: view.revision, layout: { groupBy: fixture.fields[1].id } } })).ok()).toBeTruthy();
  await page.goto(`/#database/${fixture.database.id}`);
  const handles = page.locator(".database-group-columns th[data-type='title'] .database-column-resizer");
  await expect(handles).toHaveCount(4);
  await drag(page, handles.first(), 70);
  await expect(page.locator(".database-message")).toHaveText("Saved locally");
  await expect.poll(async () => await page.locator(".database-group-columns th[data-type='title']").evaluateAll(els => els.every(el => Math.abs(el.getBoundingClientRect().width - 300) < 1))).toBe(true);
  await page.reload(); await expect(handles.first()).toHaveAttribute("aria-valuenow", "300");
});

test("stale width saves preserve the local draft without overwriting the remote view", async ({ page, request }) => {
  const fixture = await createBlockDatabase(request);
  await page.goto(`/#database/${fixture.database.id}`);
  await expect(page.locator("thead th[data-property-id]").first().getByRole("separator")).toBeVisible();
  const snapshot = await (await request.get(`/api/databases/${fixture.database.id}`)).json(), view = snapshot.views[0];
  expect((await request.put(`/api/database-views/${view.id}`, { data: { baseRevision: view.revision, layout: { columnWidths: { [fixture.fields[0].id]: 410 } } } })).ok()).toBeTruthy();
  const handle = page.locator("thead th[data-property-id]").first().getByRole("separator");
  await drag(page, handle, 50);
  await expect(page.locator(".database-message")).toContainText("Your column width draft is preserved");
  await page.reload(); await expect(handle).toHaveAttribute("aria-valuenow", "280");
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(page.locator(".database-message")).toContainText("Your column width draft is preserved");
  const remote = await (await request.get(`/api/databases/${fixture.database.id}`)).json();
  expect(remote.views[0].layout.columnWidths[fixture.fields[0].id]).toBe(410);
  await page.getByRole("button", { name: "Discard draft and reload", exact: true }).click();
  await expect(handle).toHaveAttribute("aria-valuenow", "410");
});

test("inline tables resize frozen columns and keep the outer Markdown unchanged", async ({ page, request }) => {
  const fixture = await createBlockDatabase(request);
  const snapshot = await (await request.get(`/api/databases/${fixture.database.id}`)).json(), view = snapshot.views[0];
  expect((await request.put(`/api/database-views/${view.id}`, { data: { baseRevision: view.revision, layout: { frozenPropertyId: fixture.fields[0].id } } })).ok()).toBeTruthy();
  const body = `Before\n\n<database url="#page/${snapshot.hostPage.id}" inline="true">Resize table</database>\n\nAfter\n`;
  const outer = await (await request.post("/api/pages", { data: { title: "Resize host", body, syntax: { version: 1, variant: "notdown", extensions: {} }, bodyFormat: "notion-markdown" } })).json();
  await page.goto(`/#page/${outer.id}`);
  const inline = page.getByRole("region", { name: "Inline database", exact: true });
  const handle = inline.locator("thead th[data-property-id]").first().getByRole("separator");
  await drag(page, handle, -190);
  await expect(handle).toHaveAttribute("aria-valuenow", "64");
  await expect(inline.locator(".database-message")).toHaveText("Saved locally");
  await page.reload(); await expect(handle).toHaveAttribute("aria-valuenow", "64");
  expect((await (await request.get(`/api/pages/${outer.id}`)).json()).body).toBe(body);
});
