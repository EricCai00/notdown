import path from "node:path";
import { createVault } from "../server/vault.js";
const target = process.argv.slice(2).find(arg => !arg.startsWith('--'));
if (!target) throw new Error('Usage: node --import tsx scripts/migrate-database-files.ts <vault> [--apply]');
const vault = createVault(path.resolve(target));
try {
  const plan = await vault.databaseStorage.plan();
  console.log(JSON.stringify(plan, null, 2));
  if (process.argv.includes('--apply')) console.log(JSON.stringify(await vault.databaseStorage.migrate(plan.baseRevision), null, 2));
} finally { vault.closeHistory(); }
