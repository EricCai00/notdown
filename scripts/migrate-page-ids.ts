import path from "node:path";
import { createVault } from "../server/vault.js";

const args = process.argv.slice(2);
const directory = args.find(arg => !arg.startsWith("--"));
if (!directory || args.some(arg => arg.startsWith("--") && arg !== "--apply"))
  throw new Error("Usage: node --import tsx scripts/migrate-page-ids.ts <vault-directory> [--apply]");
const vault = createVault(path.resolve(directory));
const plan = await vault.planPageIdMigration();
console.log(JSON.stringify(args.includes("--apply") ? await vault.migratePageIds(plan) : {
  vaultPath: vault.vaultPath, total: plan.pages.length, changing: plan.pages.filter(page => page.id !== page.nextId).length, ...plan,
}, null, 2));
