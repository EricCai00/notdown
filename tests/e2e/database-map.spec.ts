import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import type { DatabaseSnapshot, DatabaseDataSource } from "../../src/features/databases/database-model";

async function fixture(request: APIRequestContext) {
  const snapshot: DatabaseSnapshot = await (await request.post("/api/databases", { data: { title: "Kyoto travel" } })).json();
  const original = snapshot.dataSources[0];
  const source: DatabaseDataSource = await (await request.put(`/api/data-sources/${original.id}`, { data: { baseRevision: original.revision, properties: [...original.properties,
    { id: "place", key: "place", name: "Destination", type: "place" }, { id: "other", key: "other", name: "Hotel", type: "place" },
    { id: "kind", key: "kind", name: "Kind", type: "select", options: [{ id: "food", name: "Food", color: "orange" }, { id: "sights", name: "Sights", color: "purple" }] },
  ] } })).json();
  for (const [title, properties] of [
    ["Kyoto Station", { place: { name: "Kyoto Station", address: "Kyoto, Japan", latitude: 34.985, longitude: 135.759 }, other: { name: "Hotel A", latitude: 35.01, longitude: 135.77 }, kind: "sights" }],
    ["Lunch", { place: { name: "Cafe", address: "Kyoto, Japan", latitude: 35.003, longitude: 135.76 }, kind: "food" }],
    ["Unplanned", {}],
  ] as const) expect((await request.post(`/api/data-sources/${source.id}/records`, { data: { baseRevision: source.revision, title, properties } })).ok()).toBeTruthy();
  return { snapshot, source };
}
async function createMap(page: Page) {
  await page.getByRole("button", { name: "New view", exact: true }).click();
  await page.getByRole("dialog", { name: "New view", exact: true }).getByRole("button", { name: "Map", exact: true }).click();
  await page.getByRole("button", { name: "Create view", exact: true }).click();
  await expect(page.locator(".database-layout-map")).toBeVisible();
}
test("map places, colors, height, cards, filters and narrow layout persist", async ({ page, request }, info) => {
  const { snapshot } = await fixture(request);
  await page.route("https://tile.openstreetmap.org/**", route => route.abort());
  await page.goto(`/#database/${snapshot.database.id}`); await createMap(page);
  const map = page.locator(".database-layout-map");
  await expect(map.locator(".database-map-pin")).toHaveCount(2); await expect(map.locator(".database-map-summary")).toContainText("2 of 3");
  await map.getByRole("combobox", { name: "Color by", exact: true }).selectOption("kind");
  await expect(map.locator(".database-map-legend")).toContainText("Sights"); await expect(map.locator('.database-map-pin[title="Kyoto Station"] .database-map-marker')).toHaveCSS("background-color", "rgb(144, 101, 176)");
  await map.getByRole("combobox", { name: "Height", exact: true }).selectOption("large"); await expect(map.locator(".database-map-canvas")).toHaveCSS("height", "640px");
  await map.getByRole("combobox", { name: "Map by", exact: true }).selectOption("other"); await expect(map.locator(".database-map-pin")).toHaveCount(1);
  await map.getByRole("combobox", { name: "Map by", exact: true }).selectOption("place"); await expect(map.locator(".database-map-pin")).toHaveCount(2);
  const station = map.locator(".database-map-record").filter({ has: page.getByRole("button", { name: "Kyoto Station", exact: true }) });
  await station.getByRole("button", { name: "Show on map", exact: true }).click();
  await expect(map.locator(".leaflet-popup")).toContainText("Kyoto Station"); await expect(map.locator(".leaflet-popup a", { hasText: "Google Maps" })).toHaveAttribute("href", /api=1&query=34.985%2C135.759/);
  await expect(map.locator(".database-map-tile-status")).toContainText("could not load");
  await page.screenshot({ path: info.outputPath("map-desktop.png"), fullPage: true });
  await page.reload(); await expect(map.getByRole("combobox", { name: "Height", exact: true })).toHaveValue("large"); await expect(map.getByRole("combobox", { name: "Color by", exact: true })).toHaveValue("kind");
  await page.getByRole("button", { name: "Search database", exact: true }).click(); await page.getByRole("searchbox").fill("Cafe"); await expect(map.locator(".database-map-pin")).toHaveCount(1); await expect(map.locator(".database-map-record")).toHaveCount(1);
  await page.getByRole("searchbox").fill(""); await expect(map.locator(".database-map-pin")).toHaveCount(2);
  // Existing query engine filters the map and cards together.
  const state: DatabaseSnapshot = await (await request.get(`/api/databases/${snapshot.database.id}`)).json(), view = state.views.find(view => view.type === "map")!;
  expect((await request.put(`/api/database-views/${view.id}`, { data: { baseRevision: view.revision, filters: [{ propertyId: "kind", operator: "equals", value: "food" }] } })).ok()).toBeTruthy();
  await page.reload(); await expect(map.locator(".database-map-pin")).toHaveCount(1); await expect(map.locator(".database-map-legend")).not.toContainText("Sights");
  await page.setViewportSize({ width: 390, height: 844 }); await expect(map.locator(".database-map-canvas")).toBeVisible();
  expect(await map.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("map-mobile.png"), fullPage: true });
});

test("map creates a Place property, supports explicit search and offline editing, and reuses it", async ({ page, request }) => {
  const snapshot: DatabaseSnapshot = await (await request.post("/api/databases", { data: { title: "New travel map" } })).json();
  const source = snapshot.dataSources[0];
  expect((await request.post(`/api/data-sources/${source.id}/records`, { data: { baseRevision: source.revision, title: "New stop" } })).ok()).toBeTruthy();
  let searches = 0;
  await page.route("https://photon.komoot.io/api/**", async route => { searches++; await route.fulfill({ json: { features: [{ geometry: { type: "Point", coordinates: [135.759, 34.985] }, properties: { name: "Kyoto <station>", city: "Kyoto", country: "Japan" } }] } }); });
  await page.route("https://tile.openstreetmap.org/**", route => route.abort());
  await page.goto(`/#database/${snapshot.database.id}`); await createMap(page);
  let state: DatabaseSnapshot = await (await request.get(`/api/databases/${snapshot.database.id}`)).json(); expect(state.dataSources[0].properties.filter(field => field.type === "place")).toHaveLength(1);
  const map = page.locator(".database-layout-map"); await map.getByRole("button", { name: "Add place", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit place", exact: true });
  await dialog.getByRole("textbox", { name: "Search for a place", exact: true }).fill("Kyoto Station"); expect(searches).toBe(0);
  await dialog.getByRole("button", { name: "Search places", exact: true }).click(); await dialog.getByRole("button", { name: "Kyoto <station>, Kyoto, Japan", exact: true }).click();
  await expect(dialog.getByRole("spinbutton", { name: "Latitude", exact: true })).toHaveValue("34.985");
  await dialog.getByRole("button", { name: "Save place", exact: true }).click(); await expect(map.locator(".database-map-pin")).toHaveCount(1); expect(searches).toBe(1); await expect(map.locator("station")).toHaveCount(0);
  await page.reload(); await expect(map.locator(".database-map-record")).toContainText("Kyoto <station>");
  await page.route("https://photon.komoot.io/api/**", route => route.abort());
  await map.getByRole("button", { name: "Edit place", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Search for a place", exact: true }).fill("Offline"); await dialog.getByRole("button", { name: "Search places", exact: true }).click(); await expect(dialog.getByRole("status")).toContainText("unavailable");
  await dialog.getByRole("spinbutton", { name: "Latitude", exact: true }).fill("91"); await dialog.getByRole("button", { name: "Save place", exact: true }).click(); await expect(dialog).toBeVisible();
  await dialog.getByRole("spinbutton", { name: "Latitude", exact: true }).fill("0"); await dialog.getByRole("spinbutton", { name: "Longitude", exact: true }).fill("0"); await dialog.getByRole("button", { name: "Save place", exact: true }).click();
  await expect(map.locator(".database-map-record a")).toHaveAttribute("href", /query=0%2C0/);
  await createMap(page); state = await (await request.get(`/api/databases/${snapshot.database.id}`)).json(); expect(state.dataSources[0].properties.filter(field => field.type === "place")).toHaveLength(1);
});

test("failed map settings retain saved selection and a recoverable proposed view", async ({ page, request }) => {
  const { snapshot } = await fixture(request); await page.goto(`/#database/${snapshot.database.id}`); await createMap(page);
  const state: DatabaseSnapshot = await (await request.get(`/api/databases/${snapshot.database.id}`)).json(), view = state.views.find(view => view.type === "map")!;
  await request.put(`/api/database-views/${view.id}`, { data: { baseRevision: view.revision, layout: { ...view.layout, mapHeight: "small" } } });
  await page.getByRole("combobox", { name: "Height", exact: true }).selectOption("large");
  await expect(page.locator(".database-layout-map [role=status]").first()).toContainText("changed");
  await expect(page.getByRole("combobox", { name: "Height", exact: true })).toHaveValue("medium");
  expect((await (await request.get(`/api/databases/${snapshot.database.id}`)).json()).views.find((item: any) => item.id === view.id).layout.mapHeight).toBe("small");
});

test("Place cells and record panels share edits, preserve extra keys and keep a conflicting draft", async ({ page, request }) => {
  const { snapshot, source } = await fixture(request);
  let state: DatabaseSnapshot = await (await request.get(`/api/databases/${snapshot.database.id}`)).json();
  const record = state.pages.find(page => page.title === "Kyoto Station")!;
  expect((await request.put(`/api/pages/${record.id}`, { data: { baseRevision: record.revision, schemaRevision: source.revision, properties: { ...record.properties, place: { ...(record.properties.place as object), future: { retained: true } } } } })).ok()).toBeTruthy();
  await page.goto(`/#database/${snapshot.database.id}`);
  const cell = page.locator(`tr[data-page-id="${record.id}"] .database-place-cell`).first();
  await cell.getByRole("button").click(); const dialog = page.getByRole("dialog", { name: "Edit place", exact: true });
  await dialog.getByRole("textbox", { name: "Place name", exact: true }).fill("My station"); await dialog.getByRole("button", { name: "Save place", exact: true }).click();
  await expect(cell).toContainText("My station"); await page.getByRole("button", { name: "Open Kyoto Station", exact: true }).click();
  const peek = page.locator(".database-peek-mount"); await expect(peek).toBeVisible(); await expect(cell.getByRole("button")).toBeDisabled();
  await peek.getByRole("button", { name: "Destination: Kyoto Station", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Place name", exact: true }).fill("Panel station"); await dialog.getByRole("button", { name: "Save place", exact: true }).click();
  await expect.poll(async () => (await (await request.get(`/api/pages/${record.id}`)).json()).properties.place.name).toBe("Panel station");
  state = await (await request.get(`/api/databases/${snapshot.database.id}`)).json(); const saved = state.pages.find(page => page.id === record.id)!; expect((saved.properties.place as any).future).toEqual({ retained: true });
  await peek.getByRole("button", { name: "Destination: Kyoto Station", exact: true }).click();
  await request.put(`/api/pages/${record.id}`, { data: { baseRevision: saved.revision, body: "External body" } });
  await dialog.getByRole("textbox", { name: "Place name", exact: true }).fill("Conflicting station"); await dialog.getByRole("button", { name: "Save place", exact: true }).click();
  await expect(peek.locator(".database-peek-status")).toContainText(/modified|changed/);
  await expect(peek.getByRole("button", { name: "Destination: Kyoto Station", exact: true })).toContainText("Conflicting station");
  const external = await (await request.get(`/api/pages/${record.id}`)).json(); expect(external.body).toBe("External body"); expect(external.properties.place.name).toBe("Panel station");
});

test("bulk Place editing keeps its parent panel on Escape and applies only after confirmation", async ({ page, request }) => {
  const { snapshot } = await fixture(request); await page.goto(`/#database/${snapshot.database.id}`);
  const rows = page.locator("tbody tr[data-page-id]:visible"), ids = await rows.evaluateAll(rows => rows.slice(0, 2).map(row => (row as HTMLElement).dataset.pageId!));
  await rows.nth(0).locator(".database-row-select").check(); await rows.nth(1).locator(".database-row-select").check();
  await page.getByRole("button", { name: "Edit property: Destination", exact: true }).click();
  const parent = page.getByRole("dialog", { name: "Edit property", exact: true }), dialog = page.getByRole("dialog", { name: "Edit place", exact: true });
  await parent.getByRole("button", { name: "Destination: Selected rows", exact: true }).click(); await expect(dialog).toBeVisible(); await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(parent).toBeVisible();
  await parent.getByRole("button", { name: "Destination: Selected rows", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Place name", exact: true }).fill("Shared meeting point"); await dialog.getByRole("spinbutton", { name: "Latitude", exact: true }).fill("35"); await dialog.getByRole("spinbutton", { name: "Longitude", exact: true }).fill("135"); await dialog.getByRole("button", { name: "Save place", exact: true }).click();
  await expect(parent).toBeVisible(); await parent.getByRole("button", { name: "Apply to selected rows", exact: true }).click(); await expect(parent).toHaveCount(0);
  for (const id of ids) expect((await (await request.get(`/api/pages/${id}`)).json()).properties.place.name).toBe("Shared meeting point");
});
