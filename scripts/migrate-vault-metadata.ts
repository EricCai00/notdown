import path from "node:path";
import { createVault } from "../server/vault.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const directory = args.find(arg => !arg.startsWith("--"));
if (!directory || args.some(arg => arg.startsWith("--") && arg !== "--apply")) {
  throw new Error("Usage: node --import tsx scripts/migrate-vault-metadata.ts <vault-directory> [--apply]");
}
const vault = createVault(path.resolve(directory));
const plan = await vault.planLegacyMetadataMigration();
if (apply) {
  const result = await vault.migrateLegacyMetadata(plan);
  console.log(JSON.stringify({ vaultPath: vault.vaultPath, ...result }, null, 2));
} else {
  console.log(JSON.stringify({ vaultPath: vault.vaultPath, candidates: plan.pages.length, ...plan }, null, 2));
}
