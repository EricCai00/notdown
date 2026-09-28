import path from "node:path";
import { createVault } from "../server/vault.js";
import { planHtmlEmbedMigration, migrateHtmlEmbeds } from "../server/html-embed-migration.js";

const args = process.argv.slice(2), directory = args.find(arg => !arg.startsWith("--"));
if (!directory || args.some(arg => arg.startsWith("--") && arg !== "--apply"))
  throw new Error("Usage: node --import tsx scripts/migrate-html-embeds.ts <vault-directory> [--apply]");
const vault = createVault(path.resolve(directory));
const plan = await planHtmlEmbedMigration(vault);
console.log(JSON.stringify(args.includes("--apply") ? await migrateHtmlEmbeds(vault, plan) : {
  vaultPath: vault.vaultPath, pages: plan.map(page => ({ id: page.id, baseRevision: page.baseRevision, embeds: page.replacements.length })),
}, null, 2));
