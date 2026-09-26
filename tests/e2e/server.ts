import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../../server/app.js";

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
const app = createApp({ vaultPath, frontendDir, recycleFile: (file) => fs.rename(file, path.join(recyclePath, path.basename(file))) });
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
