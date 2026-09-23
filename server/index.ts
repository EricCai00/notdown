import path from "node:path";
import { existsSync } from "node:fs";
import { createApp } from "./app.js";
import { seedNewDefaultVault } from "./seed.js";

const vaultPath = path.resolve(process.env.VAULT_PATH ?? "./vault");
const port = Number(process.env.PORT ?? 4318);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be a valid port number");
const frontendDir = path.resolve("./dist");
const app = createApp({
  vaultPath,
  frontendDir: existsSync(path.join(frontendDir, "index.html"))
    ? frontendDir
    : undefined,
  ...(process.env.ALLOWED_ORIGINS
    ? { allowedOrigins: process.env.ALLOWED_ORIGINS.split(",") }
    : {}),
});
await seedNewDefaultVault(
  app.locals.vault,
  process.env.VAULT_PATH === undefined,
);
await app.locals.vault.init();
app.listen(port, "127.0.0.1", () => {
  console.log(`Notdown: http://127.0.0.1:${port}`);
  console.log(`Vault: ${vaultPath}`);
});
