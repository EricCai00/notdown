import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBrowserApp } from "../../server/browser-vaults.js";
import { enrichmentFixture } from "../unit/notion-block-import-fixture.js";
import { inlineDatabaseFixture } from "../unit/notion-inline-database-fixture.js";
import { v2Fixture, v2Asset, v2Id } from "../unit/notion-v2-fixture.js";
import { setTimeout as delay } from "node:timers/promises";

// This test server deliberately does not read VAULT_PATH, the normal seed, or
// the application's user vault. A new temporary vault is created on every run.
const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const frontendDir = path.resolve(project, process.env.NOTDOWN_E2E_FRONTEND_DIR || "dist");
await fs.access(path.join(frontendDir, "index.html"));
const temporaryRoot = path.resolve(os.tmpdir());
const vaultPath = await fs.mkdtemp(path.join(temporaryRoot, "notdown-e2e-"));
// Browser tests use a private stand-in; native Windows recycling is tested separately.
const recyclePath = path.join(vaultPath, "test-system-recycle-bin");
await fs.mkdir(recyclePath);
const notionFetch = v2Fixture(inlineDatabaseFixture(enrichmentFixture()));
const app = await createBrowserApp({ vaultPath, dataPath: path.join(vaultPath, "test-managed-vaults"), frontendDir, recycleFile: (file) => fs.rename(file, path.join(recyclePath, path.basename(file))),
  notionImportTransport: { fetch: async (input, init) => {
    // Only the progress test simulates network latency; abort cancels its delay.
    if (new Headers(init?.headers).get("Authorization") === "Bearer progress-test-notion-token")
      await delay(new URL(String(input)).pathname.endsWith("/markdown") ? 1000 : 350, undefined, { signal: init?.signal ?? undefined });
    if (new Headers(init?.headers).get("Authorization") === "Bearer progress-slow-start-token")
      await delay(5000, undefined, { signal: init?.signal ?? undefined });
    return notionFetch(input, init);
  }, readAsset: v2Asset, readCache: async pageId => ({ blocks: pageId === v2Id(82) ? [{ id: v2Id(84), type: "text", version: 131, lastEdited: Date.parse("2026-10-27T07:04:57.915Z"), properties: { title: [["Cache words", [["h", "blue"], ["h", "yellow_background"]]]] } }] : pageId === v2Id(80) ? [{ id: v2Id(81), type: "text", version: 117, lastEdited: Date.parse("2026-10-26T15:53:59.832Z"), properties: { title: [["‣", [["d", { start_date: "2026-10-24", start_time: "09:00", time_zone: "America/Los_Angeles", date_format: "relative", reminder: { unit: "day", value: 0, time: "09:00", defaultTimeZone: "America/Los_Angeles" } }]]]] } }] : [] }), wait: async () => {} },
});
const vault = app.locals.vault;
await vault.init();
const target = await vault.create({
  title: "E2E 链接目标",
  body: "这是独立的链接目标。",
});
await vault.create({ title: "E2E 空白页面", body: "" });
await vault.create({
  title: "E2E 嵌套列表",
  body: "- [ ] Parent\n  - [x] Child\n    - Grandchild\n- [ ] Sibling\n- Last\n",
});
await vault.create({
  title: "E2E 页面链接",
  body: `Before [[${target.id}|链接目标]] after.\n\n::page{id="${target.id}"}\n`,
});

const port = Number(process.env.NOTDOWN_E2E_PORT || 4329);
const server = app.listen(port, "127.0.0.1", () => {
  console.log(
    `Isolated editor test server: http://127.0.0.1:${port} (${vaultPath})`,
  );
});
let shuttingDown = false;
server.once("close", () => app.locals.closeRNotebook());
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const targetPath = path.resolve(vaultPath);
  if (
    path.dirname(targetPath) !== temporaryRoot ||
    !path.basename(targetPath).startsWith("notdown-e2e-")
  )
    throw new Error("Refusing cleanup outside this run's temporary test vault");
  await fs.rm(targetPath, { recursive: true, force: true });
}
process.once("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});
process.once("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});
server.once("error", (error) => {
  console.error(error);
  void shutdown().then(() => process.exit(1));
});
