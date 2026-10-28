import { test, expect } from "@playwright/test";

const target = "de111111-1111-4111-8111-111111111111", user = "de222222-2222-4222-8222-222222222222", database = "de333333-3333-4333-8333-333333333333";
const syntax = { version: 1, variant: "notdown", notionVersion: "v2", extensions: {} };

test("reference review defaults to unresolved internal links, preserves URLs and returns to each occurrence", async ({ page, request }, info) => {
  const remote = "ea999999-9999-4999-8999-999999999999", urlOnly = "ea888888-8888-4888-8888-888888888888";
  const destination = await (await request.post("/api/pages", { data: { title: "Panel linked destination", body: "Destination body" } })).json();
  const body = `First occurrence <mention url="https://www.notion.so/${remote}">Remote page</mention>\n\n${Array.from({ length: 25 }, (_, i) => `Spacer paragraph ${i + 1}.`).join("\n\n")}\n\nSecond occurrence <mention url="https://www.notion.so/${remote}">Remote page</mention>\n\n[[Panel missing destination|First local]] and [[Panel missing destination|Second local]]\n\n[[${destination.id}|Panel linked destination]]\n\n[Ordinary URL](https://www.notion.so/${urlOnly}) [Broken website](https://example.test/missing)`;
  const note = await (await request.post("/api/pages", { data: { title: "Panel referring note", body, syntax } })).json();
  await page.goto(`/#page/${destination.id}`);
  const openPanel = async () => {
    await page.locator('.sidebar [data-action="import"]').click();
    await page.getByRole("button", { name: "External references", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "External references" });
    await expect(panel.locator("output")).not.toHaveText("Loading…");
    return panel;
  };
  let panel = await openPanel();
  await expect(panel.getByRole("checkbox", { name: "Include resolved references" })).not.toBeChecked();
  await panel.getByRole("searchbox").fill(destination.id);
  await expect(panel.locator(".external-library-row")).toHaveCount(0);
  await panel.getByRole("checkbox", { name: "Include resolved references" }).check();
  await expect(panel.locator(".external-library-row")).toHaveCount(1);
  await panel.getByRole("checkbox", { name: "Include resolved references" }).uncheck();
  await panel.getByRole("searchbox").fill(urlOnly);
  await expect(panel.locator(".external-library-row")).toHaveCount(0);
  await panel.getByRole("searchbox").fill(remote);
  await expect(panel.getByRole("button", { name: /Go to reference/ })).toHaveCount(2);
  await panel.screenshot({ path: info.outputPath("unresolved-reference-panel.png") });
  await panel.getByRole("button", { name: /Go to reference/ }).nth(1).click();
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`#page/${note.id}$`));
  const selected = page.locator(".ProseMirror-selectednode");
  await expect(selected.locator("..")).toContainText("Second occurrence");
  await expect(selected).toBeInViewport();
  const editor = page.locator(".page-pane .ProseMirror");
  await expect(editor.getByRole("link", { name: "Ordinary URL", exact: true })).toHaveAttribute("href", `https://www.notion.so/${urlOnly}`);
  await expect(editor.getByRole("link", { name: "Broken website", exact: true })).toHaveAttribute("href", "https://example.test/missing");
  await page.locator("#page-options > summary").click();
  await page.locator('[data-view="source"]').click();
  await expect(page.locator(".markdown-workspace")).toHaveAttribute("data-mode", "source");
  panel = await openPanel();
  await panel.getByRole("searchbox").fill("Panel missing destination");
  await expect(panel.getByRole("button", { name: /Go to reference/ })).toHaveCount(2);
  await panel.getByRole("button", { name: /Go to reference/ }).nth(1).click();
  await expect(page.locator(".ProseMirror-selectednode .page-link-label")).toHaveText("Unknown page");
  // The second of two same-target links must be selected, without following the missing target.
  await expect(editor.locator('[data-page-target="Panel missing destination"]').nth(1)).toHaveClass(/ProseMirror-selectednode/);
  await expect(page.locator(".markdown-workspace")).toHaveAttribute("data-mode", "document");
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(note.body);
});

test("unknown references are inert chips; later imports and new contacts resolve without rewriting a draft", async ({ page, request }, info) => {
  const body = `<p>Page <mention url="https://www.notion.so/${target}">Original page</mention> and [Original link](https://www.notion.so/${target}).</p>\n\n<p>User <mention url="user://${user}">Original user</mention>.</p>\n\n<database url="https://www.notion.so/${database}" inline="true"/>\n\n<p>Draft text.</p>`;
  const note = await (await request.post("/api/pages", { data: { title: "Deferred references", body, syntax } })).json();
  await page.goto(`/#page/${note.id}`);
  const editor = page.locator(".page-pane .ProseMirror");
  const mention = editor.locator(".page-mention.external-unresolved");
  await expect(mention).toHaveText(/Unknown page/);
  await expect(mention.locator(".page-link-label")).toBeVisible();
  await expect(mention).not.toHaveAttribute("href");
  const link = editor.getByRole("link", { name: "Original link", exact: true });
  await expect(link).toHaveAttribute("href", `https://www.notion.so/${target}`);
  await expect(link).not.toHaveAttribute("aria-disabled");
  await expect(editor.locator('[data-mention-kind="user"]')).toHaveText("@Unknown user");
  await expect(editor.locator(".pm-database-reference")).toContainText("Unknown database");
  await expect(editor.locator(".pm-database-reference .page-link-label")).toBeVisible();
  await expect(editor.locator(".pm-database-reference")).not.toHaveAttribute("href");
  await mention.click(); await expect(page).toHaveURL(new RegExp(`#page/${note.id}$`));
  await page.locator(".page-pane").screenshot({ path: info.outputPath("unknown-references.png") });
  const paragraph = editor.locator("p").filter({ hasText: "Draft text." });
  await paragraph.click(); await page.keyboard.press("End"); await page.keyboard.type(" Live draft.");
  const previewResponse = await request.post("/api/notion/import/preview", { data: { token: "test-secret-not-saved", pageId: target, includeChildren: false, downloadAssets: false } });
  expect(previewResponse.ok()).toBeTruthy();
  const preview = await previewResponse.json();
  expect((await request.post("/api/import/commit", { data: { id: preview.id } })).ok()).toBeTruthy();
  const person = await (await request.post("/api/people", { data: { name: "Resolved user", notionUserId: user } })).json();
  await expect(editor.locator('[data-mention-kind="user"]')).toHaveText("@Resolved user", { timeout: 15000 });
  await expect(editor).toContainText("Live draft.");
  await expect(editor.locator(".page-mention")).toHaveAttribute("href", `#page/${preview.documents[0].id}`);
  await expect(link).toHaveAttribute("href", `https://www.notion.so/${target}`);
  await page.reload();
  const resolved = page.locator(`.page-pane .ProseMirror .page-mention[href="#page/${preview.documents[0].id}"]`);
  await expect(resolved).toBeVisible();
  await expect(editor.getByRole("link", { name: "Original link", exact: true })).toHaveAttribute("href", `https://www.notion.so/${target}`);
  const saved = await (await request.get(`/api/pages/${note.id}`)).json();
  expect(saved.body).toContain(`https://www.notion.so/${target}`);
  expect(saved.body).toContain(`user://${user}`);
  await page.locator('.ProseMirror [data-mention-kind="user"]').click();
  await expect(page.locator('.people-dialog input[name="name"]')).toHaveValue("Resolved user");
  await page.getByRole("button", { name: "Close people", exact: true }).click();
  await resolved.click(); await expect(page).toHaveURL(new RegExp(`#page/${preview.documents[0].id}$`));
  expect(person.id).toBeTruthy();
});

test("Relation and People fields resolve live while the table keeps other pending cells", async ({ page, request }) => {
  const remote = "de555555-5555-4555-8555-555555555555", personId = "de666666-6666-4666-8666-666666666666";
  const snapshot = await (await request.post("/api/databases", { data: { title: "External fields" } })).json();
  const source = snapshot.dataSources[0];
  const schemaResponse = await request.put(`/api/data-sources/${source.id}`, { data: { baseRevision: source.revision, properties: [...source.properties,
    { id: "external-relation", key: "related", name: "Related", type: "relation" },
    { id: "external-people", key: "people", name: "People", type: "people" },
    { id: "external-notes", key: "notes", name: "Notes", type: "text" }] } });
  expect(schemaResponse.ok()).toBeTruthy(); const schema = await schemaResponse.json();
  const rowResponse = await request.post(`/api/data-sources/${source.id}/records`, { data: { baseRevision: schema.revision, title: "Referenced record", properties: { related: [{ notionPageId: remote, unresolved: true, url: `https://www.notion.so/${remote}` }], people: [{ object: "user", id: personId }], notes: "Original notes" } } });
  expect(rowResponse.ok()).toBeTruthy();
  const record = await rowResponse.json();
  await page.goto(`/#database/${snapshot.database.id}`);
  const row = page.locator(`tbody tr[data-page-id="${record.id}"]`);
  await expect(row).toContainText("Unknown page"); await expect(row).toContainText("@Unknown user");
  const input = row.getByRole("textbox", { name: "Notes: Referenced record", exact: true });
  await input.fill("Pending notes");
  const preview = await (await request.post("/api/notion/import/preview", { data: { token: "test-secret-not-saved", pageId: remote, includeChildren: false, downloadAssets: false } })).json();
  expect((await request.post("/api/import/commit", { data: { id: preview.id } })).ok()).toBeTruthy();
  expect((await request.post("/api/people", { data: { name: "Table user", notionUserId: personId } })).ok()).toBeTruthy();
  await expect(row.getByRole("button", { name: "@Table user", exact: true })).toBeVisible({ timeout: 15000 });
  await expect(row.locator(`a[href="#page/${preview.documents[0].id}"]`)).toBeVisible();
  await expect(input).toHaveValue("Pending notes");
});

test("the external reference library binds an unknown page to a manually created object", async ({ page, request }) => {
  const remote = "de444444-4444-4444-8444-444444444444";
  const note = await (await request.post("/api/pages", { data: { title: "Manual reference", body: `<mention-page url="https://www.notion.so/${remote}">Saved label</mention-page>`, syntax: { version: 1, variant: "notdown", extensions: {} } } })).json();
  const local = await (await request.post("/api/pages", { data: { title: "Manually added target", body: "Target body" } })).json();
  await page.goto(`/#page/${note.id}`);
  await page.locator('.sidebar [data-action="import"]').click();
  await page.getByRole("button", { name: "External references", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "External references" });
  await dialog.getByRole("searchbox").fill(remote);
  const row = dialog.locator(".external-library-row");
  await row.getByRole("combobox").selectOption(local.id);
  await row.getByRole("button", { name: "Save link" }).click();
  await expect(dialog.locator("output")).toContainText("Link saved");
  await dialog.getByRole("button", { name: "Close external references" }).click();
  await expect(page.locator(".ProseMirror .page-mention")).toHaveAttribute("href", `#page/${local.id}`);
  const saved = await (await request.get(`/api/pages/${note.id}`)).json();
  expect(saved.body).toContain(`https://www.notion.so/${remote}`);
});

test("database references resolve, follow explicit rebindings and become inert after target deletion", async ({ page, request }) => {
  const remote = "de777777-7777-4777-8777-777777777777";
  const first = await (await request.post("/api/databases", { data: { title: "First reference database" } })).json();
  const second = await (await request.post("/api/databases", { data: { title: "Second reference database" } })).json();
  const note = await (await request.post("/api/pages", { data: { title: "Deferred database", syntax, body: `<database url="https://www.notion.so/${remote}" inline="true"/>` } })).json();
  await page.goto(`/#page/${note.id}`);
  const block = page.locator(".page-pane .pm-object-database");
  await expect(block.locator(".pm-database-reference")).toHaveText("Unknown database");
  const bind = async (id: string) => {
    const library = await (await request.get("/api/external-entities")).json();
    expect((await request.put("/api/external-entities/binding", { data: { key: `notion:database:${remote}`, localId: id, baseRevision: library.revision } })).ok()).toBeTruthy();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  };
  await bind(first.hostPage.id);
  await expect(block.locator(".pm-database-reference")).toHaveAttribute("href", `#database/${first.database.id}`);
  await expect(block.locator(".database-toolbar")).toBeVisible();
  await bind(second.hostPage.id);
  await expect(block.locator(".pm-database-reference")).toHaveAttribute("href", `#database/${second.database.id}`);
  const host = await (await request.get(`/api/pages/${second.hostPage.id}`)).json();
  expect((await request.put(`/api/pages/${host.id}`, { data: { baseRevision: host.revision, trashed: true } })).ok()).toBeTruthy();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(block.locator(".pm-database-reference")).toHaveText("Unknown database");
  await expect(block.locator(".pm-database-reference")).not.toHaveAttribute("href");
  expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe(note.body);
});
