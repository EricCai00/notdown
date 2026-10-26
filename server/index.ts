import path from "node:path";
import { existsSync } from "node:fs";
import { loadLocalEnv, resolveVaultLocation } from "./vault-location.js";
import { createBrowserApp } from "./browser-vaults.js";

// Machine-local settings stay outside version control; shell variables take precedence.
loadLocalEnv();
const { vaultPath, dataPath, isDefault } = resolveVaultLocation();
const port = Number(process.env.PORT ?? 4318);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be a valid port number");
const frontendDir = path.resolve("./dist");
const app = await createBrowserApp({
  vaultPath,
  dataPath,
  seedDefault: isDefault,
  frontendDir: existsSync(path.join(frontendDir, "index.html"))
    ? frontendDir
    : undefined,
  ...(process.env.ALLOWED_ORIGINS
    ? { allowedOrigins: process.env.ALLOWED_ORIGINS.split(",") }
    : {}),
});
await app.locals.vault.init();
const server = app.listen(port, "127.0.0.1", () => {
  console.log(`Notdown: http://127.0.0.1:${port}`);
  console.log(`Vault: ${vaultPath}`);
});
server.once("close", () => app.locals.closeRNotebook());
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => {
  app.locals.closeRNotebook(); server.closeAllConnections(); server.close();
});
