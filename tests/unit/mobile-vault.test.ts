import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { createVault, VaultError } from "../../server/vault";
import { createVault as portableVault } from "../../src/vault/vault";
import { nodeVaultPlatform } from "../../server/vault-platform";
import { hashBytes } from "../../src/vault/crypto";
import { stablePageUuid } from "../../src/vault/page-id";
import { MobileDraftSession } from "../../src/mobile/draft-session";
import { readVaultZip, writeVaultZip } from "../../src/mobile/backup";
import { zipSync } from "fflate";
import { mobileVaultApi } from "../../src/mobile/vault-api";
import { ApiError } from "../../src/shared/types";

const temporary = async (t: test.TestContext) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-mobile-"));
  t.after(() => fs.rm(root, { recursive: true, force: true })); return root;
};
function storage() {
  const entries = new Map<string, string>();
  return { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); }, removeItem: (key: string) => { entries.delete(key); } };
}

test("portable revision and page identities match existing Node bytes", () => {
  for (const text of ["", "中文 📝\r\n", "\uFEFF---\ntitle: Note\n---\n"])
    assert.equal(hashBytes(text), createHash("sha256").update(text).digest("hex"));
  const identity = "中文/notes";
  const bytes = createHash("sha1").update(Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex")).update(`notdown/page/${identity}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex");
  assert.equal(stablePageUuid(identity), [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-"));
});

test("vault ZIP roundtrip preserves source bytes, metadata, assets, history and unknown files", async t => {
  const directory = await temporary(t), original = path.join(directory, "original"), restored = path.join(directory, "restored");
  const desktop = createVault(original);
  const page = await desktop.create({ title: "Original", body: "\uFEFF---\r\ntitle: 中文\r\ncustom: [a, b]\r\n---\r\n\r\n```unknown\r\n<a raw=\"yes\">\r\n```\r\n", syntax: { version: 1, variant: "notdown", extensions: {} } });
  await desktop.uploadAsset("pixel.png", "image/png", Buffer.from([0, 255, 38, 10]).toString("base64"));
  await fs.writeFile(path.join(original, "unknown.tmp"), Buffer.from([255, 0, 128]));
  const meta = JSON.parse(await fs.readFile(path.join(original, "metadata.json"), "utf8"));
  meta.future = { version: 8, data: [true, "keep"] }; meta.pages[page.id].futureField = "retained";
  await fs.writeFile(path.join(original, "metadata.json"), JSON.stringify(meta));
  const current = await desktop.get(page.id);
  const mobile = portableVault(restored, { ...nodeVaultPlatform, id: "android-contract" });
  const before = await desktop.exportFiles();
  await mobile.restoreFiles(readVaultZip(writeVaultZip(before)));
  assert.deepEqual(await mobile.get(page.id), current);
  for (const file of before) assert.deepEqual(Buffer.from(await fs.readFile(path.join(restored, file.path))), Buffer.from(file.data));
  await assert.rejects(mobile.restoreFiles(before), (error: unknown) => error instanceof VaultError && error.status === 409);
  const updated = await mobile.update(page.id, { body: current.body + "\r\nMobile edit\r\n" }, current.revision);
  assert.equal((await createVault(restored).get(page.id)).body, updated.body);
  assert.equal(JSON.parse(await fs.readFile(path.join(restored, "metadata.json"), "utf8")).pages[page.id].futureField, "retained");
});

test("restore validates all archive paths before touching any page", async t => {
  const root = await temporary(t), vault = createVault(root);
  const files = [{ path: "pages/a.md", data: new TextEncoder().encode("safe") }, { path: "../escape.md", data: new Uint8Array() }];
  assert.throws(() => vault.restoreFiles(files), /invalid relative/);
  await assert.rejects(fs.stat(path.join(root, "pages/a.md")), { code: "ENOENT" });
  assert.throws(() => readVaultZip(zipSync({ "pages/A.md": new Uint8Array(), "pages/a.md": new Uint8Array() })), /duplicate/);
  // ZIP permits repeated names; reject them before unzipSync collapses its result into an object.
  const duplicate = Buffer.from(zipSync({ "pages/a.md": new Uint8Array(), "pages/b.md": new Uint8Array() }));
  const needle = Buffer.from("pages/b.md"), replacement = Buffer.from("pages/a.md");
  for (let offset = duplicate.indexOf(needle); offset >= 0; offset = duplicate.indexOf(needle, offset + needle.length)) duplicate.set(replacement, offset);
  assert.throws(() => readVaultZip(duplicate), /duplicate/);
});

test("late saves drain new typing and recovery keeps the updated base", async t => {
  const vault = createVault(await temporary(t));
  const page = await vault.create({ title: "Note", body: "initial" });
  const drafts = storage(); let release!: () => void; let writes = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const session = new MobileDraftSession(page, "window-a", drafts, async (id, input, revision) => { if (++writes === 1) await gate; return vault.update(id, input, revision); });
  session.change({ ...page, body: "first input" });
  const saving = session.save(); session.change({ ...page, body: "newer 中文 input" }); release();
  assert.equal(await saving, true); assert.equal(writes, 2);
  assert.equal((await vault.get(page.id)).body, "newer 中文 input"); assert.equal(drafts.getItem("window-a"), null);
  session.change({ ...session.draft, body: "pending after crash" });
  const recovered = new MobileDraftSession(await vault.get(page.id), "window-a", drafts, (id, input, revision) => vault.update(id, input, revision));
  assert.equal(recovered.draft.body, "pending after crash"); assert.equal(recovered.recovered, true);
  assert.equal(await recovered.save(), true);
});

test("stale mobile save preserves both versions and never retries or clears another window draft", async t => {
  const vault = createVault(await temporary(t)), page = await vault.create({ body: "base" });
  const drafts = storage(); drafts.setItem("window-b", "other window"); let writes = 0;
  const session = new MobileDraftSession(page, "window-a", drafts, async (id, input, revision) => { writes++; return vault.update(id, input, revision); });
  session.change({ ...page, body: "mobile draft" });
  await vault.update(page.id, { body: "desktop edit" }, page.revision);
  assert.equal(await session.save(), false); assert.equal(await session.save(), false); assert.equal(await session.retry(), false); assert.equal(writes, 1);
  const conflicts = await vault.listConflicts(); assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].current.body, "desktop edit"); assert.equal(conflicts[0].proposed.body, "mobile draft");
  assert.ok(drafts.getItem("window-a")); assert.equal(drafts.getItem("window-b"), "other window");
});

test("local editor transport returns API conflicts without network access", async t => {
  const vault = createVault(await temporary(t)), page = await vault.create({ body: "base" });
  const api = mobileVaultApi(() => vault);
  await vault.update(page.id, { body: "new version" }, page.revision);
  await assert.rejects(api(`/pages/${page.id}`, { method: "PUT", body: JSON.stringify({ body: "draft", baseRevision: page.revision }) }),
    (error: unknown) => error instanceof ApiError && error.status === 409);
});
