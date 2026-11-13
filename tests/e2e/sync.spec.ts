import { test, expect, devices, type Locator, type Page } from "@playwright/test";
const syncTestAccount = { email: "sync@example.invalid", password: "isolated-test-password" };
const syncTestKey = "sb_publishable_notdown_test_only";
let cloudUrl: string;
async function login(page: Page) {
  const settings = page.getByRole("region", { name: "Cloud sync", exact: true });
  await settings.getByRole("combobox", { name: "Sync provider", exact: true }).selectOption("supabase");
  await settings.getByLabel("Supabase project URL").fill(cloudUrl);
  await settings.getByLabel("Publishable key").fill(syncTestKey);
  await settings.getByLabel("Email", { exact: true }).fill(syncTestAccount.email);
  await settings.getByLabel("Password", { exact: true }).fill(syncTestAccount.password);
  await settings.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(settings.getByRole("combobox", { name: "Cloud notebook", exact: true })).toBeVisible();
  return settings;
}
async function mobileSettings(page: Page) {
  if (await page.locator(".mobile-sync-dialog[open]").isVisible()) return page.getByRole("region", { name: "Cloud sync", exact: true });
  await page.getByRole("button", { name: "Notebook options" }).click();
  await page.getByRole("button", { name: "Cloud sync", exact: true }).click();
  return page.getByRole("region", { name: "Cloud sync", exact: true });
}

async function mobileSource(page: Page) {
  await page.getByRole("button", { name: "Notebook options", exact: true }).click();
  const menu = page.locator("#mobile-menu");
  await menu.getByRole("combobox", { name: "Page view", exact: true }).selectOption("source");
  await expect(menu).toBeHidden();
}

test("desktop and Android UI sync offline changes and resolve conflicts using the shared core", async ({ page, browser, request }, testInfo) => {
  const contextInfo = await (await request.get("/__sync-test/context")).json(); cloudUrl = contextInfo.cloudUrl;
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const note = await (await request.post("/api/pages", { data: { title: "Across my devices", body: "Shared baseline\n" } })).json();
  await page.goto(`/#page/${note.id}`);
  await expect(page.locator(".pm-document")).toContainText("Shared baseline");
  await page.getByRole("button", { name: "Workspace settings", exact: false }).last().click();
  const desktop = await login(page);
  await desktop.getByLabel("New notebook name").fill("Personal cloud notebook");
  await desktop.getByRole("button", { name: "Enable sync" }).click();
  await expect(desktop.locator("[data-sync-feedback]")).toContainText("First sync completed");
  await page.screenshot({ path: testInfo.outputPath("desktop-cloud-settings.png"), fullPage: true });
  const status = await (await request.get("/api/sync/status")).json();
  await desktop.getByRole("button", { name: "Sign in again", exact: true }).click();
  await desktop.getByLabel("Password", { exact: true }).fill(syncTestAccount.password);
  await desktop.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(desktop.locator("[data-sync-login]")).toBeHidden();
  expect((await (await request.get("/api/sync/status")).json()).vaultId).toBe(status.vaultId);

  const context = await browser.newContext({ ...devices["Pixel 7"], reducedMotion: "reduce" });
  const mobile = await context.newPage(); mobile.on("pageerror", error => errors.push(error.message));
  try {
    await mobile.goto(contextInfo.mobileUrl); await expect(mobile.locator("#mobile-app")).toHaveAttribute("data-ready", "true");
    await mobileSettings(mobile); const settings = await login(mobile);
    await settings.getByRole("combobox", { name: "Cloud notebook", exact: true }).selectOption(status.vaultId);
    await settings.getByRole("button", { name: "Enable sync" }).click();
    await expect(mobile.locator(".mobile-sync-dialog[open]")).toHaveCount(0);
    await expect(mobile.locator(".pm-document")).toContainText("Shared baseline");
    await context.setOffline(true);
    await mobileSource(mobile);
    await mobile.locator(".cm-content").click(); await mobile.keyboard.press("ControlOrMeta+A"); await mobile.keyboard.insertText("手机离线修改\n");
    await expect(mobile.locator("#mobile-save-state")).toHaveText("Saved on this device");
    const latest = await (await request.get(`/api/pages/${note.id}`)).json();
    await request.put(`/api/pages/${note.id}`, { data: { body: "Desktop concurrent edit\n", baseRevision: latest.revision } }); await request.post("/api/sync/run", { data: {} });
    await context.setOffline(false);
    const conflictSettings = await mobileSettings(mobile);
    await conflictSettings.getByRole("button", { name: "Sync now", exact: true }).click();
    const conflict = conflictSettings.locator(".sync-conflict"); await expect(conflict).toHaveCount(1);
    await conflict.locator("summary").first().click();
    await expect(conflict.locator(".diff-removed")).toContainText("手机离线修改");
    await expect(conflict.locator(".diff-added")).toContainText("Desktop concurrent edit");
    await conflictSettings.getByRole("button", { name: "Sync now", exact: true }).click();
    await expect(conflictSettings.getByRole("button", { name: "Sync now", exact: true })).toBeEnabled();
    await expect(conflict).toHaveAttribute("open", "");
    await expect(mobile.locator(".mobile-sync-dialog")).toBeVisible();
    expect(await mobile.locator(".mobile-sync-dialog").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await mobile.screenshot({ path: testInfo.outputPath("android-cloud-conflict.png"), fullPage: true });
    await conflict.getByText("Edit merged version", { exact: true }).click();
    await conflict.getByLabel("Merged source", { exact: true }).fill("Desktop concurrent edit\n手机离线修改\n");
    await conflict.getByRole("button", { name: "Save merged version" }).click();
    await expect(conflictSettings.locator("[data-sync-feedback]")).toContainText("Conflict resolved locally");
    await conflictSettings.getByRole("button", { name: "Sync now", exact: true }).click();
    await expect(conflictSettings.locator("[data-sync-feedback]")).toContainText("Synced");
    await request.post("/api/sync/run", { data: {} }); expect((await (await request.get(`/api/pages/${note.id}`)).json()).body).toBe("Desktop concurrent edit\n手机离线修改\n");
    await mobile.reload(); await expect(mobile.locator("#mobile-app")).toHaveAttribute("data-ready", "true");
    await expect(mobile.locator(".pm-document")).toContainText("手机离线修改");
    await mobileSettings(mobile); await expect(mobile.getByRole("region", { name: "Cloud sync", exact: true }).locator("[data-sync-summary]")).toContainText("Personal cloud notebook");
    await mobile.screenshot({ path: testInfo.outputPath("android-cloud-settings.png"), fullPage: true });
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test("Nutstore WebDAV settings connect desktop and Android preview with offline conflict recovery", async ({ page, browser, request }, testInfo) => {
  const info = await (await request.get("/__sync-test/context")).json();
  const endpoint = (route: string) => info.davDesktopUrl + "/api" + route;
  const note = await (await request.post(endpoint("/pages"), { data: { title: "WebDAV notebook", body: "Original WebDAV note\n" } })).json();
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${info.davDesktopUrl}/#page/${note.id}`);
  await page.getByRole("button", { name: "Workspace settings", exact: false }).last().click();
  async function davLogin(target: Page) {
    const panel = target.getByRole("region", { name: "Cloud sync", exact: true });
    await panel.getByRole("combobox", { name: "Sync provider", exact: true }).selectOption("webdav");
    await expect(panel.getByLabel("WebDAV server URL")).toHaveValue("https://dav.jianguoyun.com/dav/");
    await panel.getByLabel("WebDAV server URL").fill(info.davUrl);
    await panel.getByLabel("Remote notebook folder").fill("Notdown/My-notebook");
    await panel.getByLabel("WebDAV account", { exact: true }).fill("notdown@example.invalid");
    await panel.getByLabel("Application password", { exact: true }).fill("test-application-password");
    await panel.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(panel.getByRole("combobox", { name: "Cloud notebook", exact: true })).toBeVisible();
    await expect(panel.locator("[data-sync-feedback]")).toContainText("conditional-write protection verified");
    return panel;
  }
  const desktop = await davLogin(page);
  await desktop.getByLabel("New notebook name").fill("My WebDAV notes"); await desktop.getByRole("button", { name: "Enable sync" }).click();
  await expect(desktop.locator("[data-sync-feedback]")).toContainText("First sync completed");
  const status = await (await request.get(endpoint("/sync/status"))).json(); expect(status.provider).toBe("webdav");
  await page.screenshot({ path: testInfo.outputPath("webdav-desktop.png"), fullPage: true });
  const context = await browser.newContext({ ...devices["Pixel 7"], reducedMotion: "reduce" });
  const mobile = await context.newPage(); mobile.on("pageerror", error => errors.push(error.message));
  try {
    await mobile.goto(info.mobileUrl); await expect(mobile.locator("#mobile-app")).toHaveAttribute("data-ready", "true");
    await mobileSettings(mobile); const panel = await davLogin(mobile);
    await panel.getByRole("combobox", { name: "Cloud notebook", exact: true }).selectOption(status.vaultId);
    await panel.getByRole("button", { name: "Enable sync" }).click();
    await expect(mobile.locator(".mobile-sync-dialog[open]")).toHaveCount(0);
    await expect(mobile.locator(".pm-document")).toContainText("Original WebDAV note");
    await context.setOffline(true); await mobileSource(mobile);
    await mobile.locator(".cm-content").click(); await mobile.keyboard.press("ControlOrMeta+A"); await mobile.keyboard.insertText("安卓离线 WebDAV 修改\n");
    await expect(mobile.locator("#mobile-save-state")).toHaveText("Saved on this device");
    const latest = await (await request.get(endpoint(`/pages/${note.id}`))).json();
    await request.put(endpoint(`/pages/${note.id}`), { data: { body: "Computer WebDAV edit\n", baseRevision: latest.revision } });
    expect((await request.post(endpoint("/sync/run"), { data: {} })).ok()).toBe(true);
    await context.setOffline(false); const settings = await mobileSettings(mobile);
    await settings.getByRole("button", { name: "Sync now", exact: true }).click();
    const conflict = settings.locator(".sync-conflict"); await expect(conflict).toHaveCount(1); await conflict.locator("summary").first().click();
    await expect(conflict.locator(".diff-removed")).toContainText("安卓离线"); await expect(conflict.locator(".diff-added")).toContainText("Computer WebDAV edit");
    expect(await mobile.locator(".mobile-sync-dialog").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await mobile.screenshot({ path: testInfo.outputPath("webdav-android-conflict.png"), fullPage: true });
    await conflict.getByText("Edit merged version", { exact: true }).click(); await conflict.getByLabel("Merged source", { exact: true }).fill("Computer WebDAV edit\n安卓离线 WebDAV 修改\n");
    await conflict.getByRole("button", { name: "Save merged version" }).click(); await expect(settings.locator("[data-sync-feedback]")).toContainText("Conflict resolved locally");
    await settings.getByRole("button", { name: "Sync now", exact: true }).click(); await expect(settings.locator("[data-sync-feedback]")).toContainText("Synced");
    await request.post(endpoint("/sync/run"), { data: {} }); expect((await (await request.get(endpoint(`/pages/${note.id}`))).json()).body).toBe("Computer WebDAV edit\n安卓离线 WebDAV 修改\n");
    await mobile.reload(); await expect(mobile.locator(".pm-document")).toContainText("安卓离线 WebDAV 修改");
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test("separate vaults choose their own WebDAV folders and explicitly select existing notebooks", async ({ page, request }, testInfo) => {
  const info = await (await request.get("/__sync-test/context")).json();
  const credentials = { provider: "webdav", url: info.davUrl, email: "notdown@example.invalid", password: "test-application-password" };
  async function localVault(name: string) {
    const response = await request.post(info.davDesktopUrl + "/api/vaults/open", { data: { mode: "create", name } });
    expect(response.ok()).toBe(true);
    const entry = await response.json();
    return info.davDesktopUrl + entry.url + "api";
  }
  async function openSettings(endpoint: string) {
    await page.goto(endpoint.replace(/api$/, ""));
    await page.getByRole("button", { name: "Workspace settings", exact: false }).last().click();
    return page.getByRole("region", { name: "Cloud sync", exact: true });
  }
  async function signIn(panel: Locator, folder: string) {
    await panel.getByRole("combobox", { name: "Sync provider", exact: true }).selectOption("webdav");
    await panel.getByLabel("WebDAV server URL").fill(info.davUrl);
    await panel.getByLabel("Remote notebook folder").fill(folder);
    await panel.getByLabel("WebDAV account", { exact: true }).fill(credentials.email);
    await panel.getByLabel("Application password", { exact: true }).fill(credentials.password);
    await panel.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(panel.getByRole("combobox", { name: "Cloud notebook", exact: true })).toBeEnabled();
  }
  const first = await localVault("WebDAV first"), second = await localVault("WebDAV second");
  await request.post(first + "/pages", { data: { title: "First vault only", body: "Keep the first vault separate\n" } });
  expect((await request.post(first + "/sync/sign-in", { data: { ...credentials, folder: "Notdown/First-vault" } })).ok()).toBe(true);
  const firstStatus = await (await request.post(first + "/sync/connect", { data: { name: "First remote notebook" } })).json();
  expect((await request.post(first + "/sync/run", { data: {} })).ok()).toBe(true);
  await request.post(second + "/pages", { data: { title: "Second vault only", body: "Keep the second vault separate\n" } });
  const panel = await openSettings(second);
  await panel.getByRole("combobox", { name: "Sync provider", exact: true }).selectOption("webdav");
  await expect(panel.getByLabel("Remote notebook folder")).toHaveValue("Notdown/WebDAV-second");
  await panel.getByLabel("Remote notebook folder").fill("Notdown/Custom-folder");
  await panel.getByRole("combobox", { name: "Sync provider", exact: true }).selectOption("supabase");
  await panel.getByRole("combobox", { name: "Sync provider", exact: true }).selectOption("webdav");
  await expect(panel.getByLabel("Remote notebook folder")).toHaveValue("Notdown/Custom-folder");
  await signIn(panel, "Notdown/First-vault");
  const notebooks = panel.getByRole("combobox", { name: "Cloud notebook", exact: true });
  await expect(notebooks).toHaveValue("");
  await expect(notebooks.locator("option")).toHaveText(["Choose an existing cloud notebook", "First remote notebook"]);
  await expect(panel.getByLabel("New notebook name")).toBeHidden();
  await expect(panel.locator("[data-sync-folder-help]")).toContainText("already contains a cloud notebook");
  await expect(panel.locator("[data-sync-summary]")).toContainText("Choose a cloud notebook");
  await panel.screenshot({ path: testInfo.outputPath("webdav-existing-folder.png") });
  let connectRequests = 0;
  page.on("request", message => { if (message.url() === second + "/sync/connect") connectRequests++; });
  await panel.getByRole("button", { name: "Enable sync" }).click();
  expect(await notebooks.evaluate((element: HTMLSelectElement) => element.validity.valueMissing)).toBe(true);
  expect((await (await request.get(second + "/sync/status")).json()).vaultId).toBeUndefined();
  expect(connectRequests).toBe(0);
  await panel.getByRole("button", { name: "Change remote folder" }).click();
  await expect(panel.getByLabel("Remote notebook folder")).toBeEnabled();
  await expect(panel.getByLabel("Remote notebook folder")).toHaveValue("Notdown/WebDAV-second");
  await expect(panel.getByLabel("WebDAV server URL")).toHaveValue(info.davUrl);
  await expect(panel.getByLabel("WebDAV account", { exact: true })).toHaveValue(credentials.email);
  await panel.getByLabel("Application password", { exact: true }).fill(credentials.password);
  await panel.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(panel.getByLabel("New notebook name")).toBeEnabled();
  await panel.getByLabel("New notebook name").fill("Second remote notebook");
  await panel.getByRole("button", { name: "Enable sync" }).click();
  await expect(panel.locator("[data-sync-feedback]")).toContainText("First sync completed");
  const secondStatus = await (await request.get(second + "/sync/status")).json();
  expect(secondStatus.folder).toBe("Notdown/WebDAV-second"); expect(secondStatus.vaultId).not.toBe(firstStatus.vaultId);
  expect((await (await request.get(first + "/sync/status")).json()).vaultId).toBe(firstStatus.vaultId);
  expect((await (await request.get(second + "/pages")).json()).map((note: { title: string }) => note.title)).toEqual(["Second vault only"]);
  expect((await request.post(first + "/sync/run", { data: {} })).ok()).toBe(true);
  expect((await (await request.get(first + "/pages")).json()).map((note: { title: string }) => note.title)).toEqual(["First vault only"]);
  const replica = await localVault("WebDAV replica"), replicaPanel = await openSettings(replica);
  await signIn(replicaPanel, "Notdown/First-vault");
  await replicaPanel.getByRole("combobox", { name: "Cloud notebook", exact: true }).selectOption(firstStatus.vaultId);
  await replicaPanel.getByRole("button", { name: "Enable sync" }).click();
  await expect(replicaPanel.locator("[data-sync-feedback]")).toContainText("First sync completed");
  expect((await (await request.get(replica + "/pages")).json()).map((note: { title: string }) => note.title)).toEqual(["First vault only"]);
  await replicaPanel.getByRole("button", { name: "Sign in again", exact: true }).click();
  await expect(replicaPanel.getByLabel("Remote notebook folder")).toHaveValue("Notdown/First-vault");
});

test("WebDAV budget waits show a stable countdown and keep progress until sync resumes", async ({ page, request }, testInfo) => {
  const info = await (await request.get("/__sync-test/context")).json();
  const endpoint = (route: string) => info.davDesktopUrl + "/api" + route;
  expect((await request.post(endpoint("/sync/disconnect"), { data: {} })).ok()).toBe(true);
  expect((await request.post(endpoint("/sync/sign-in"), { data: {
    provider: "webdav", url: info.davUrl, folder: "Notdown/Budget-window",
    email: "notdown@example.invalid", password: "test-application-password",
  } })).ok()).toBe(true);
  expect((await request.post(endpoint("/sync/connect"), { data: { name: "Budget recovery notebook" } })).ok()).toBe(true);
  await request.post(endpoint("/pages"), { data: { title: "Before the wait", body: "Saved sync progress" } });
  expect((await request.post(endpoint("/sync/run"), { data: {} })).ok()).toBe(true);
  const before = (await (await request.get(endpoint("/sync/progress"))).json()).progress;
  expect(before.uploaded).toBeGreaterThan(0);
  expect((await request.post("/__sync-test/webdav-quota")).ok()).toBe(true);
  await page.goto(info.davDesktopUrl);
  await page.getByRole("button", { name: "Workspace settings", exact: false }).last().click();
  const panel = page.getByRole("region", { name: "Cloud sync", exact: true });
  let progressReads = 0;
  page.on("response", response => { if (response.url() === endpoint("/sync/progress")) progressReads++; });
  await expect(panel.locator("[data-sync-summary]")).toContainText("Waiting to resume");
  await expect(panel.getByRole("button", { name: "Sync now", exact: true })).toBeDisabled();
  await expect(panel.locator("[data-sync-progress]")).toHaveAttribute("data-state", "waiting");
  await expect.poll(() => progressReads).toBeGreaterThan(2);
  await expect(panel.locator("[data-sync-retry]")).toContainText("Next automatic attempt after");
  await expect(panel.locator("[data-sync-retry]")).toContainText("remaining");
  await expect(panel.locator("[data-sync-counts]")).toContainText(`Uploaded ${before.uploaded}`);
  expect((await request.post(endpoint("/sync/run"), { data: {} })).status()).toBe(429);
  expect((await (await request.get(endpoint("/sync/progress"))).json()).progress).toEqual(before);
  await page.reload();
  await page.getByRole("button", { name: "Workspace settings", exact: false }).last().click();
  await expect(panel.locator("[data-sync-retry]")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Sync now", exact: true })).toBeDisabled();
  await panel.screenshot({ path: testInfo.outputPath("webdav-budget-wait.png") });
  await request.post(endpoint("/pages"), { data: { title: "Queued during the wait", body: "Sync after the window" } });
  expect((await request.post("/__sync-test/webdav-quota?expired=true")).ok()).toBe(true);
  const resumed = await request.post(endpoint("/sync/run"), { data: {} });
  expect(resumed.ok()).toBe(true);
  expect((await resumed.json()).uploaded).toBeGreaterThan(0);
  await expect(panel.locator("[data-sync-retry]")).toBeHidden();
  await expect(panel.getByRole("button", { name: "Sync now", exact: true })).toBeEnabled();
  await expect(panel.locator("[data-sync-progress]")).toHaveAttribute("data-state", "complete");
  await expect(panel.locator("[data-sync-feedback]")).toBeEmpty();
});
