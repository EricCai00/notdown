import { createVault as createPortableVault } from "../src/vault/vault.js";
import { nodeVaultPlatform } from "./vault-platform.js";
export { VaultError, assertId } from "../src/vault/vault.js";
export type { Page, PageInput, Conflict, LegacyMetadataMigrationPlan } from "../src/vault/vault.js";

/** Node service composition; storage semantics live in the shared vault core. */
export function createVault(vaultPath: string, options: { recycleFile?: (filename: string) => Promise<void> } = {}) {
  return createPortableVault(vaultPath, nodeVaultPlatform, options);
}
