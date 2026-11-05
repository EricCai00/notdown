import { test, expect, type APIRequestContext } from "@playwright/test";
import { createHash } from "node:crypto";

async function fixture(request: APIRequestContext, prefix = "", variant = "notdown") {
  const created = await request.post(`${prefix}/api/databases`, { data: { title: "Linked database views" } });
  expect(created.ok()).toBeTruthy();
  let snapshot = await created.json();
  for (const type of ["board", "gallery", "list", "calendar", "timeline", "chart", "feed"]) {
    const response = await request.post(`${prefix}/api/databases/${snapshot.database.id}/views`, {
      data: { baseRevision: snapshot.database.revision, type, name: `View ${type}` },
    });
    expect(response.ok()).toBeTruthy();
    snapshot = await response.json();
  }
  const links = snapshot.views.map((view: { id: string; type: string }) => ({
    label: `Open ${view.type}`, type: view.type,
    href: `#database/${snapshot.database.id}?view=${view.id}`,
  }));
  const body = links.map((link: { label: string; href: string }) => `- [${link.label}](${link.href})`).join("\n")
    + "\n\n[All databases](#databases)\n\n[Vault list](#vault/list)\n\n[Details](#details)\n\n## Details\n\nPending text";
  const response = await request.post(`${prefix}/api/pages`, { data: {
    title: "Database view links", body, syntax: { version: 1, variant, extensions: {} },
  } });
  expect(response.ok()).toBeTruthy();
  return { note: await response.json(), links, body };
}

for (const mode of ["root", "short", "legacy"] as const) test(`${mode} vault: Markdown links open all eight database layouts and retain history`, async ({ page, request }) => {
  test.setTimeout(90_000);
  let prefix = "";
  if (mode !== "root") {
    const response = await request.post("/api/vaults/open", { data: { mode: "create", name: `Database links ${Date.now()}` } });
    expect(response.ok()).toBeTruthy();
    const entry = await response.json();
    expect(entry.url).toMatch(/^\/v\/[a-f0-9]{16}\/$/);
    prefix = mode === "short" ? entry.url.replace(/\/$/, "")
      : `/v/${createHash("sha256").update(process.platform === "win32" ? entry.path.toLowerCase() : entry.path).digest("hex")}`;
  }
  const { note, links, body } = await fixture(request, prefix, mode === "short" ? "markdown" : "notdown");
  await page.goto(`${prefix}/#page/${note.id}`);
  await expect(page.locator(".pm-document")).toBeVisible();
  const sourceUrl = page.url();
  const historyLength = await page.evaluate(() => history.length);
  for (const link of links) {
    await page.getByRole("link", { name: link.label, exact: true }).click();
    await expect(page).toHaveURL(new URL(`${prefix}/${link.href}`, sourceUrl).href);
    await expect(page.locator(link.type === "table" ? ".database-table" : `.database-layout-${link.type}`)).toBeVisible();
    await expect(page.locator(".toast").filter({ hasText: "Linked location not found" })).toHaveCount(0);
    expect(await page.evaluate(() => history.length)).toBe(historyLength + 1);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL(sourceUrl);
    await expect(page.locator(".pm-document")).toContainText("Pending text");
  }
  await page.getByRole("button", { name: "Forward", exact: true }).click();
  await expect(page.locator(".database-layout-feed")).toBeVisible();
  await page.reload();
  await expect(page.locator(".database-layout-feed")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(sourceUrl);
  for (const [label, hash] of [["All databases", "#databases"], ["Vault list", "#vault/list"]]) {
    await page.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new URL(`${prefix}/${hash}`, sourceUrl).href);
    await page.goBack();
    await expect(page).toHaveURL(sourceUrl);
  }
  await page.getByRole("link", { name: "Details", exact: true }).click();
  await expect(page.locator(".toast").filter({ hasText: "Linked location not found" })).toHaveCount(0);
  expect((await (await request.get(`${prefix}/api/pages/${note.id}`)).json()).body).toBe(body);
});

test("database links save pending input and stop on a recoverable revision conflict", async ({ page, request }) => {
  const { note, links } = await fixture(request);
  await page.goto(`/#page/${note.id}`);
  const paragraph = page.locator(".pm-document > p").filter({ hasText: /^Pending text/ });
  await paragraph.click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" saved before navigation");
  await page.getByRole("link", { name: links[0].label, exact: true }).click();
  await expect(page.locator(".database-table")).toBeVisible();
  let saved = await (await request.get(`/api/pages/${note.id}`)).json();
  expect(saved.body).toContain("saved before navigation");
  await page.goBack();
  await expect(paragraph).toContainText("saved before navigation");
  // Edit the disk version while the mounted editor still holds its old revision.
  const external = await request.put(`/api/pages/${note.id}`, { data: { baseRevision: saved.revision, body: saved.body + "\n\nExternal newer text" } });
  expect(external.ok()).toBeTruthy();
  await paragraph.click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" local conflicting text");
  await page.getByRole("link", { name: links[0].label, exact: true }).click();
  await expect(page.locator("#save-status")).toContainText("Conflict");
  await expect(page).toHaveURL(new RegExp(`#page/${note.id}$`));
  await expect(paragraph).toContainText("local conflicting text");
  saved = await (await request.get(`/api/pages/${note.id}`)).json();
  expect(saved.body).toContain("External newer text");
  expect(saved.body).not.toContain("local conflicting text");
  await expect.poll(async () => JSON.stringify(await (await request.get("/api/conflicts")).json())).toContain("local conflicting text");
});
