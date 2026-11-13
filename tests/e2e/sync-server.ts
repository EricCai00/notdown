import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { AddressInfo } from "node:net";
import express from "express";
import { createApp } from "../../server/app";
import { createBrowserApp } from "../../server/browser-vaults";
import { createSyncCloudFixture } from "../unit/sync-cloud-fixture";
import { createWebDavFixture } from "../unit/webdav-fixture";
import type { WebDavConnection } from "../../src/sync/webdav";

const cloud = await createSyncCloudFixture();
const dav = await createWebDavFixture();
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-sync-e2e-"));
const mobile = express(); mobile.use(express.static(path.resolve(".run/sync-mobile-frontend")));
const mobileServer = mobile.listen(0, "127.0.0.1");
await new Promise<void>(resolve => mobileServer.once("listening", resolve));
const desktop = createApp({ vaultPath: path.join(directory, "desktop"), frontendDir: path.resolve(".run/sync-frontend") });
const davDesktop = await createBrowserApp({ vaultPath: path.join(directory, "webdav-desktop"), dataPath: path.join(directory, "vaults"), frontendDir: path.resolve(".run/sync-frontend") });
const davServer = davDesktop.listen(0, "127.0.0.1"); await new Promise<void>(resolve => davServer.once("listening", resolve));
// Test-only bootstrap data. These endpoints do not exist in the production app.
const wrapper = express();
wrapper.get("/__sync-test/context", (_req, res) => res.json({ cloudUrl: cloud.url, davUrl: dav.url, davDesktopUrl: `http://127.0.0.1:${(davServer.address() as AddressInfo).port}`, mobileUrl: `http://127.0.0.1:${(mobileServer.address() as AddressInfo).port}` }));
wrapper.post("/__sync-test/webdav-quota", async (req, res) => {
  const store = davDesktop.locals.vault.syncStore;
  const connection = await store.readConnection() as WebDavConnection | null;
  if (!connection || connection.provider !== "webdav") return res.status(409).json({ error: "Connect the isolated WebDAV vault first" });
  connection.quota = { startedAt: Date.now() - (req.query.expired === "true" ? 1800001 : 0), requests: 240 };
  await store.writeConnection(connection);
  return res.json({ ok: true });
});
wrapper.use(desktop);
const server = wrapper.listen(Number(process.env.NOTDOWN_SYNC_E2E_PORT || 4368), "127.0.0.1");
async function close() {
  for (const item of [server, mobileServer, davServer]) { item.closeAllConnections(); await new Promise<void>(resolve => item.close(() => resolve())); }
  await Promise.all([desktop.locals.closeRNotebook(), davDesktop.locals.closeRNotebook()]); await cloud.close(); await dav.close();
  if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("notdown-sync-e2e-")) throw new Error("Unsafe test cleanup path");
  await fs.rm(directory, { recursive: true, force: true });
}
process.once("SIGTERM", () => { void close().then(() => process.exit()); });
process.once("SIGINT", () => { void close().then(() => process.exit()); });
