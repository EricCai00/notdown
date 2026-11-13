import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createVault } from "../../src/vault/vault";
import { nodeVaultPlatform } from "../../server/vault-platform";
import { createWebDavFixture, davCredentials } from "./webdav-fixture";
import type { SyncRunLifecycle } from "../../src/sync/service";

async function setup(t: test.TestContext, lifecycle: SyncRunLifecycle) {
  const dav = await createWebDavFixture();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-sync-lease-"));
  const vault = createVault(root, nodeVaultPlatform, { syncRunLifecycle: lifecycle });
  t.after(async () => { vault.closeHistory(); await dav.close(); await fs.rm(root, { recursive: true, force: true }); });
  await vault.sync.handle("sign-in", "POST", { provider: "webdav", url: dav.url, folder: "Notdown/Test", ...davCredentials });
  await vault.sync.handle("connect", "POST", { name: "Test" });
  return { vault, dav };
}

test("one native lease covers concurrent callers and is released before the run becomes idle", async t => {
  let starts = 0, finishes = 0;
  const phases: string[] = [];
  let release!: () => void, ending!: () => void;
  const endStarted = new Promise<void>(resolve => { ending = resolve; });
  const endGate = new Promise<void>(resolve => { release = resolve; });
  const { vault } = await setup(t, { async start() {
    starts++;
    return { update(progress) { phases.push(progress.phase!); }, async finish() { finishes++; ending(); await endGate; } };
  } });
  const page = await vault.create({ title: "Preserved", body: "original\n" });
  const first = vault.sync.run(), second = vault.sync.run();
  assert.equal(first, second);
  await endStarted;
  assert.equal((await vault.sync.status()).running, true);
  assert.equal(starts, 1); assert.equal(finishes, 1); assert.ok(phases.includes("complete"));
  release(); await first;
  assert.equal((await vault.sync.status()).running, false);
  assert.equal((await vault.get(page.id)).body, "original\n");
});

test("network failure releases the lease, preserves local content, and does not schedule a retry", async t => {
  let starts = 0, finishes = 0;
  const { vault, dav } = await setup(t, { async start() {
    starts++; return { update() {}, async finish() { finishes++; } };
  } });
  const page = await vault.create({ title: "Offline", body: "keep this\n" });
  dav.flags.unauthorized = true;
  await assert.rejects(vault.sync.run());
  assert.equal(starts, 1); assert.equal(finishes, 1);
  assert.equal((await vault.get(page.id)).body, "keep this\n");
  const status = await vault.sync.status();
  assert.equal(status.running, false); assert.ok(status.error); assert.equal(status.needsSignIn, true);
});

test("failure to acquire native execution prevents cloud transfer and clears the running state", async t => {
  const { vault, dav } = await setup(t, { async start() { throw new Error("Service unavailable"); } });
  const before = dav.requests.length;
  await assert.rejects(vault.sync.run(), /Service unavailable/);
  assert.equal(dav.requests.length, before);
  assert.equal((await vault.sync.status()).running, false);
});

test("an expired platform lease stops at a safe engine boundary and releases once", async t => {
  let finishes = 0;
  const { vault } = await setup(t, { async start() {
    return { update(progress) { if (progress.phase === "scanning") throw new Error("Session expired"); }, async finish() { finishes++; } };
  } });
  const page = await vault.create({ title: "Pending", body: "still saved\n" });
  await assert.rejects(vault.sync.run(), /Session expired/);
  assert.equal(finishes, 1); assert.equal((await vault.get(page.id)).body, "still saved\n");
  assert.equal((await vault.sync.status()).running, false);
});
