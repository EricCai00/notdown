import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../server/app";
import { PageSnapshots } from "../../server/page-snapshots";
import { WorkspacePageSnapshots } from "../../src/features/pages/page-snapshots";
import { pageSnapshotHeader, type PageSnapshot } from "../../src/shared/page-snapshot";
import type { Page } from "../../src/shared/types";

const page = (id: string): Page => ({ id, title: id, body: "body ".repeat(1000), parent: null, icon: "", properties: {}, revision: "1", updated: "" });

test("incremental lists preserve order, additions, deletions and projected metadata; evicted baselines reset", () => {
  const server = new PageSnapshots(), a = page("a"), b = page("b");
  const first = server.encode([a, b], "initial");
  const same = server.encode([b, a], first.snapshot);
  assert.deepEqual(same.pages, ["b", "a"]);
  assert.ok(JSON.stringify(same).length < JSON.stringify(first).length / 20);
  const changed = { ...a, body: "changed", revision: "2" }, c = page("c");
  assert.deepEqual(server.encode([changed, c], same.snapshot).pages, [changed, c]);
  assert.deepEqual(server.encode([{ ...b, trashed: true }], same.snapshot).pages, [{ ...b, trashed: true }]);
  for (let i = 0; i < 8; i++) server.encode([a], "initial");
  assert.deepEqual(server.encode([a, b], first.snapshot).pages, [a, b]);
  assert.deepEqual(new PageSnapshots().encode([a], first.snapshot).pages, [a]);
});

test("overlapping client reads use their own baseline and workspace mutations cannot poison it", async () => {
  const server = new PageSnapshots(), a = page("a");
  let calls = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tokens: string[] = [];
  const client = new WorkspacePageSnapshots(async token => {
    tokens.push(token);
    const call = ++calls;
    const response = server.encode([call === 3 ? { ...a, body: "new", revision: "2" } : a], token);
    if (call === 2) await gate;
    return structuredClone(response);
  });
  const initial = await client.load();
  initial[0].body = "unsaved window draft";
  const slow = client.load();
  const latest = await client.load();
  assert.equal(latest[0].body, "new");
  release();
  assert.equal((await slow)[0].body, a.body);
  await client.load();
  assert.notEqual(tokens[3], tokens[2]);
  const oldServer = new WorkspacePageSnapshots(async () => [a]);
  assert.deepEqual(await oldServer.load(), [a]);
});

test("HTTP snapshots see exact-byte external edits, metadata, renames, removal, and retain CAS conflicts", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-page-snapshots-"));
  const app = createApp({ vaultPath: root }), server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await app.locals.closeRNotebook();
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("notdown-page-snapshots-"));
    await fs.rm(root, { recursive: true, force: true });
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/pages`;
  const vault = app.locals.vault;
  const original = await vault.create({ title: "Original", body: "AAAA" });
  const read = async (token: string): Promise<PageSnapshot> => {
    const response = await fetch(url, { headers: { [pageSnapshotHeader]: token } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    return response.json();
  };
  const first = await read("initial");
  assert.deepEqual((await read(first.snapshot)).pages, [original.id]);
  // Mutating a returned vault snapshot must not corrupt cached decoded metadata.
  const mutable = await vault.get(original.id);
  mutable.properties.poison = true;
  assert.deepEqual((await vault.get(original.id)).properties, {});
  const file = path.join(root, "pages", `${original.id}.md`), stat = await fs.stat(file);
  await fs.writeFile(file, "BBBB");
  await fs.utimes(file, stat.atime, stat.mtime);
  const changed = await read(first.snapshot);
  assert.equal((changed.pages[0] as Page).body, "BBBB");
  await assert.rejects(vault.update(original.id, { body: "draft" }, original.revision), { status: 409 });
  assert.equal(await fs.readFile(file, "utf8"), "BBBB");
  const metadataPath = path.join(root, "metadata.json");
  const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
  metadata.pages[original.id].title = "External title";
  await fs.writeFile(metadataPath, JSON.stringify(metadata));
  const renamedTitle = await read(changed.snapshot);
  assert.equal((renamedTitle.pages[0] as Page).title, "External title");
  // Restore sourceHash's bytes, then rename outside the application.
  await fs.writeFile(file, "AAAA");
  const beforeRename = await read(renamedTitle.snapshot);
  const renamedFile = path.join(root, "pages", "renamed.md");
  await fs.rename(file, renamedFile);
  assert.deepEqual((await read(beforeRename.snapshot)).pages, [original.id]);
  await fs.unlink(renamedFile);
  assert.deepEqual((await read(beforeRename.snapshot)).pages, []);
  assert.deepEqual(await (await fetch(url)).json(), []);
});
