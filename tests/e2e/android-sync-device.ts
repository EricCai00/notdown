/** Opt-in physical-device acceptance; production app data is never opened by this harness. */
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createVault } from "../../server/vault";
import { createWebDavFixture, davCredentials } from "../unit/webdav-fixture";
import type { WebDavConnection } from "../../src/sync/webdav";

const appId = "app.notdown.mobile.syncacceptance";
const run = promisify(execFile);
const adbPath = path.join(process.env.ANDROID_HOME!, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb");
const serial = process.env.NOTDOWN_ANDROID_SERIAL;
const prefix = serial ? ["-s", serial] : [];
const adb = async (...args: string[]) => {
  const invoke = () => run(adbPath, [...prefix, ...args], { windowsHide: true, timeout: 15000, maxBuffer: 12 * 1024 * 1024 });
  try { return (await invoke()).stdout.trim(); }
  catch (error) {
    const address = process.env.NOTDOWN_ANDROID_RECONNECT;
    if (!address || !/not found|no devices|offline|closed|protocol fault/.test(String(error))) throw error;
    await run(adbPath, ["connect", address], { windowsHide: true, timeout: 15000 });
    return (await invoke()).stdout.trim();
  }
};
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until<T>(read: () => Promise<T>, accepts: (value: T) => boolean, timeout = 150000): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await read(); if (accepts(value)) return value; await wait(1500); }
  throw new Error("Physical-device acceptance timed out");
}
const replica = "files/notdown-vaults/main";
const read = async (file: string) => JSON.parse(await adb("exec-out", "run-as", appId, "cat", replica + "/" + file));
const service = () => adb("shell", "dumpsys", "activity", "services", appId);
const active = (text: string) => text.includes("isForeground=true") && text.includes("SyncForegroundService");
async function idle() {
  await until(service, value => !active(value));
  assert.ok(!(await adb("shell", "dumpsys", "power")).split("\n").some(line => line.includes("PARTIAL_WAKE_LOCK") && line.includes(appId + ":active-sync")));
}
async function configurePrivateReplica(connection: WebDavConnection) {
  // Credentials travel on stdin straight into the acceptance app's private directory.
  // They never enter a shell command, public temporary file, UI locator, or log.
  const command = "'mkdir -p files/notdown-vaults/main/.notdown/sync && cat > files/notdown-vaults/main/.notdown/sync/connection.json'";
  const child = spawn(adbPath, [...prefix, "shell", "-T", "run-as", appId, "sh", "-c", command], { windowsHide: true, stdio: ["pipe", "ignore", "pipe"] });
  child.stdin.end(JSON.stringify(connection));
  await new Promise<void>((resolve, reject) => { child.once("error", reject); child.once("exit", code => code === 0 ? resolve() : reject(new Error("Acceptance replica configuration failed"))); });
}
const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-device-sync-"));
const desktop = createVault(root);
const connectionFile = process.env.NOTDOWN_ANDROID_CONNECTION_FILE;
const external = connectionFile ? JSON.parse(await fs.readFile(connectionFile, "utf8")) as WebDavConnection : undefined;
if (external && (external.provider !== "webdav" || !external.url.startsWith("https://"))) throw new Error("Device acceptance requires an existing HTTPS WebDAV configuration");
const folder = external ? "Notdown-checks/accept-" + randomUUID().replaceAll("-", "").slice(0, 12) : "Notdown/Device";
const dav = external ? undefined : await createWebDavFixture();
const credentials = external ? { email: external.username, password: external.password } : davCredentials;
const serverUrl = external?.url ?? dav!.url;
const authorization = "Basic " + Buffer.from(`${credentials.email}:${credentials.password}`).toString("base64");
const folderUrl = new URL(folder.split("/").map(encodeURIComponent).join("/") + "/", serverUrl);
const remoteFetch = (relative: string, method = "GET") => fetch(new URL(relative, folderUrl), { method, headers: { Authorization: authorization, "Cache-Control": "no-cache", ...(method === "DELETE" ? { Depth: "infinity" } : {}) }, redirect: "error", signal: AbortSignal.timeout(45000) });
let gate: Promise<void> | undefined, releaseGate: (() => void) | undefined;
let held = 0, recording = false, backgroundRequests = 0, failOnce = false, gateHead = false;
const proxy = dav ? http.createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  try {
    const route = new URL(request.url!, "http://fixture.invalid");
    if (route.origin !== "http://fixture.invalid" || !route.pathname.startsWith("/dav/")) { response.writeHead(404); response.end(); return; }
    if (request.headers.authorization !== authorization) { response.writeHead(401); response.end(); return; }
    if (recording) backgroundRequests++;
    if (request.method === "GET" && (route.pathname.includes("/objects/") || gateHead && route.pathname.endsWith("/head.json")) && gate) { held++; await gate; }
    if (failOnce) { failOnce = false; response.writeHead(500); response.end(); return; }
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of request) { size += chunk.length; if (size > 34 * 1024 * 1024) { response.writeHead(413); response.end(); return; } chunks.push(Buffer.from(chunk)); }
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) if (!["host", "connection", "content-length", "transfer-encoding", "keep-alive", "te", "trailer", "upgrade", "expect"].includes(name) && value) headers.set(name, String(value));
    const upstream = new URL(serverUrl); upstream.pathname = route.pathname; upstream.search = route.search;
    const result = await fetch(upstream, { method: request.method, headers, body: ["GET", "HEAD"].includes(request.method!) ? undefined : Buffer.concat(chunks) });
    const responseHeaders = Object.fromEntries(result.headers); delete responseHeaders["keep-alive"]; delete responseHeaders["transfer-encoding"]; responseHeaders.connection = "close";
    response.writeHead(result.status, responseHeaders); response.end(Buffer.from(await result.arrayBuffer()));
  } catch { response.writeHead(502); response.end(); }
}) : undefined;
let port: number | undefined, forward: string | undefined, ownedRemoteId: string | undefined;
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
const report: Record<string, unknown> = { appId, startedAt: new Date().toISOString(), transport: external ? "Configured HTTPS WebDAV; isolated temporary cloud notebook" : "Temporary WebDAV fixture over ADB reverse" };
const arm = (head = false) => { gateHead = head; held = 0; backgroundRequests = 0; gate = new Promise(resolve => { releaseGate = resolve; }); };
const release = () => { const done = releaseGate; gate = undefined; releaseGate = undefined; done?.(); };
async function seed(start: number, count: number) {
  for (let index = start; index < start + count; index++) await desktop.create({ title: `Device acceptance ${index}`, body: `Device acceptance body ${index}\n` });
  await desktop.sync.run();
  const response = await remoteFetch("head.json"); assert.equal(response.status, 200);
  const head = await response.json(); assert.equal(head.vaultId, ownedRemoteId); return head.sequence as number;
}
async function verifyPages() {
  const state = await read(".notdown/sync/state.json");
  const pages = Object.values(state.bases).filter((entry: any) => entry.item.kind === "page" && entry.item.value).map((entry: any) => entry.item.value);
  assert.equal(pages.length, 240); assert.equal(Object.keys(state.conflicts).length, 0); assert.equal(state.pending, undefined); assert.ok(state.lastSyncedAt);
  const hashes = new Map((await adb("exec-out", "run-as", appId, "find", replica + "/pages", "-type", "f", "-name", "*.md", "-exec", "sha256sum", "{}", "+")).split("\n").map(line => {
    const match = /^([a-f0-9]{64})\s+(.+)$/.exec(line.trim()); assert.ok(match); return [path.posix.basename(match[2]), match[1]];
  }));
  assert.equal(hashes.size, 240);
  const indexes: number[] = [];
  for (const page of pages) {
    assert.equal(hashes.get(page.file), createHash("sha256").update(page.source).digest("hex"));
    const index = /^Device acceptance body (\d+)\r?$/m.exec(page.source); assert.ok(index); indexes.push(Number(index[1]));
  }
  assert.deepEqual(indexes.sort((a, b) => a - b), Array.from({ length: 240 }, (_, index) => index));
  return { pages: 240, markdownByteHashesMatched: 240, conflicts: 0, outboxEmpty: true };
}
try {
  if (proxy) {
    proxy.listen(0, "127.0.0.1"); await new Promise<void>(resolve => proxy.once("listening", resolve));
    port = (proxy.address() as { port: number }).port; await adb("reverse", `tcp:${port}`, `tcp:${port}`);
  }
  await desktop.sync.handle("sign-in", "POST", { provider: "webdav", url: serverUrl, folder, ...credentials });
  const connected = await desktop.sync.handle("connect", "POST", { name: "Android active sync acceptance" }) as { vaultId: string };
  ownedRemoteId = connected.vaultId; assert.ok(ownedRemoteId);
  if (external) await fs.writeFile(".run/logs/android-active-sync-remote.json", JSON.stringify({ localRoot: root, folder, vaultId: ownedRemoteId, connectionFile }, null, 2));
  const firstCursor = await seed(0, 120);
  const nativeConnection = await desktop.syncStore.readConnection<WebDavConnection>(); assert.ok(nativeConnection);
  await configurePrivateReplica({ ...nativeConnection, url: external ? serverUrl : `http://127.0.0.1:${port}/dav/` });
  assert.equal((await read(".notdown/sync/connection.json")).vaultId, ownedRemoteId);
  console.log("Isolated cloud prepared; starting initial download");
  await adb("shell", "am", "start", "-W", "-n", `${appId}/app.notdown.mobile.MainActivity`);
  const pid = (await adb("shell", "pidof", appId)).split(" ")[0];
  forward = await adb("forward", "tcp:0", `localabstract:webview_devtools_remote_${pid}`);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${forward}`);
  const page = browser.contexts()[0].pages()[0]; page.setDefaultTimeout(30000);
  await expect(page.locator("#mobile-app")).toHaveAttribute("data-ready", "true");
  if (proxy) arm();
  await page.locator("[data-sync-run]").click();
  await until(service, active, 30000);
  if (proxy) await until(async () => held, value => value > 0, 30000);
  assert.ok((await read(".notdown/sync/state.json")).cursor < firstCursor);
  await adb("shell", "input", "keyevent", "KEYCODE_HOME");
  assert.ok(!(await adb("shell", "dumpsys", "window")).split("\n").find(line => line.includes("mCurrentFocus="))?.includes(appId));
  recording = true; release();
  await until(async () => (await read(".notdown/sync/state.json")).cursor, value => value === firstCursor);
  await idle(); assert.equal(Object.keys((await read("metadata.json")).pages).length, 120);
  report.home = { cursor: firstCursor, pages: 120, serviceReleased: true, wakeLockReleased: true };
  console.log("PASS: 120-page initial download completed in background");
  recording = false;
  await adb("shell", "am", "start", "-W", "-n", `${appId}/app.notdown.mobile.MainActivity`);
  await expect(page.locator(".mobile-sync-dialog[open]")).toHaveCount(0);
  await page.getByRole("button", { name: "Notebook options", exact: true }).click();
  await page.getByRole("button", { name: "Cloud sync", exact: true }).click();
  if (proxy) {
    arm(true); await page.locator("[data-sync-run]").click(); await until(service, active, 30000);
    await until(async () => held, value => value > 0, 30000); failOnce = true; release();
    await expect(page.locator("[data-sync-stage]")).toContainText("Sync stopped", { timeout: 30000 });
    await idle(); assert.equal(Object.keys((await read("metadata.json")).pages).length, 120);
    report.networkFailure = { localPagesPreserved: 120, serviceReleased: true, wakeLockReleased: true };
    console.log("PASS: injected failure released service and wake lock");
  }
  const secondCursor = await seed(120, 120);
  if (proxy) arm();
  await page.locator("[data-sync-run]").click(); await until(service, active, 30000);
  if (proxy) await until(async () => held, value => value > 0, 30000);
  assert.ok((await read(".notdown/sync/state.json")).cursor < secondCursor);
  await adb("shell", "input", "keyevent", "KEYCODE_SLEEP");
  await until(() => adb("shell", "dumpsys", "power"), power => /mWakefulness=(Asleep|Dozing)/.test(power), 10000);
  recording = true; release();
  console.log("Screen-off transfer started; no ADB polling for 45 seconds");
  await wait(45000);
  assert.equal((await read(".notdown/sync/state.json")).cursor, secondCursor);
  assert.ok(/mWakefulness=(Asleep|Dozing)/.test(await adb("shell", "dumpsys", "power")));
  await idle();
  report.screenOff = { cursor: secondCursor, pages: 240, noAdbPollingSeconds: 45, serviceReleased: true, wakeLockReleased: true };
  console.log("PASS: another 120 pages downloaded with the screen off");
  report.integrity = await verifyPages();
  const before = await read(".notdown/sync/connection.json"), lastSyncedAt = (await read(".notdown/sync/state.json")).lastSyncedAt, requestsAfter = backgroundRequests;
  await wait(65000);
  const after = await read(".notdown/sync/connection.json");
  assert.equal(after.quota.requests, before.quota.requests); assert.equal((await read(".notdown/sync/state.json")).lastSyncedAt, lastSyncedAt);
  assert.equal(backgroundRequests, requestsAfter); await idle();
  report.noPeriodicBackgroundRun = { observedSeconds: 65, cloudRequestCountUnchanged: true };
  console.log("PASS: no new background run after completion");
  report.completedAt = new Date().toISOString();
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  console.error("Device acceptance failed", error instanceof Error ? error.message : String(error));
  throw error;
} finally {
  release();
  await adb("shell", "am", "force-stop", appId).catch(() => {});
  await adb("shell", "pm", "clear", appId).catch(() => {});
  if (forward) await adb("forward", "--remove", `tcp:${forward}`).catch(() => {});
  if (port) await adb("reverse", "--remove", `tcp:${port}`).catch(() => {});
  await browser?.close().catch(() => {});
  let cleanupError: unknown;
  try {
    if (external && ownedRemoteId) {
      assert.match(folder, /^Notdown-checks\/accept-[a-f0-9]{12}$/);
      const response = await remoteFetch("head.json"); assert.equal(response.status, 200);
      const head = await response.json(); assert.equal(head.format, "notdown-webdav"); assert.equal(head.vaultId, ownedRemoteId);
      const removed = await remoteFetch("", "DELETE"); assert.ok([200, 204, 404].includes(removed.status), "Could not remove the owned temporary cloud notebook: " + removed.status);
      report.temporaryCloudNotebookRemoved = true;
    }
  } catch (error) { cleanupError = error; report.cleanupError = error instanceof Error ? error.message : String(error); }
  if (proxy) { proxy.closeAllConnections(); await new Promise<void>(resolve => proxy.close(() => resolve())); }
  desktop.closeHistory(); await dav?.close();
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir())); assert.match(path.basename(root), /^notdown-device-sync-/);
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(".run/logs", { recursive: true }); await fs.writeFile(".run/logs/android-active-sync-device.json", JSON.stringify(report, null, 2));
  if (cleanupError) throw cleanupError;
}
