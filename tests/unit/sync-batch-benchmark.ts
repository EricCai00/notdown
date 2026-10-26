/** Manual comparison against the individual-write adapter; always uses isolated temporary vaults. */
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { createVault } from "../../src/vault/vault";
import { nodeVaultPlatform } from "../../server/vault-platform";
import { synchronize } from "../../src/sync/engine";
import { TestSyncRemote } from "./sync-fixture";
import type { SyncItem } from "../../src/sync/protocol";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-batch-benchmark-"));
try {
  const remote = new TestSyncRemote();
  const items: SyncItem[] = Array.from({ length: 200 }, (_, i) => { const id = randomUUID(); return { kind: "page", key: `page:${id}`,
    value: { file: `${id}.md`, source: `Page ${i}\n` + "Sample notebook text.\n".repeat(780), metadata: { id, title: `Page ${i}` } } }; });
  await remote.push({ id: randomUUID(), mutations: items.map(item => ({ item, expectedVersion: 0 })) });
  const results = [];
  for (const mode of ["per-resource", "batch"]) {
    let scans = 0, reads = 0, metadataWrites = 0, storageCalls = 0;
    const folder = path.join(root, mode);
    const traced = new Proxy(nodeVaultPlatform.fs, { get(target, name) { const fn: unknown = Reflect.get(target, name); if (typeof fn !== "function") return fn;
      return async (...args: unknown[]) => { storageCalls++; if (name === "readFile") reads++;
        if (name === "readdir" && args[0] === path.join(folder, "pages")) scans++;
        return Reflect.apply(fn, target, args); }; } });
    const vault = createVault(folder, { ...nodeVaultPlatform, id: `benchmark-${mode}`, fs: traced, async replaceFile(...args) {
      if (args[1] === path.join(folder, "metadata.json")) metadataWrites++; return nodeVaultPlatform.replaceFile(...args);
    } });
    await vault.list(); scans = reads = metadataWrites = storageCalls = 0;
    const store = mode === "per-resource" ? { ...vault.syncStore, readItems: undefined, applyBatch: undefined } : vault.syncStore;
    const started = performance.now(); const result = await synchronize(store, remote, "benchmark");
    results.push({ mode, milliseconds: Math.round(performance.now() - started), downloaded: result.downloaded, scans, reads, metadataWrites, storageCalls });
  }
  process.stdout.write(JSON.stringify({ pages: items.length, sourceBytes: items.reduce((sum, item) => sum + Buffer.byteLength(item.value!.source), 0), results }, null, 2) + "\n");
} finally { await fs.rm(root, { recursive: true, force: true }); }
