import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createVault, VaultError } from "../../server/vault.js";
import { comparePageOrder, orderBetween, pageOrderKey, planPageMove } from "../../src/features/pages/page-order.js";

test("fractional sidebar positions remain between neighbors and break concurrent ties", () => {
  const pages = ["a", "b", "c"].map((id) => ({ id, parent: null, revision: "0".repeat(64) }));
  for (const [lower, upper] of [[null, "0005"], ["5995", "6"], ["5", "5005"], ["9995", null]] as const) {
    const key = orderBetween(lower, upper) + "0995";
    if (lower) assert.ok(key > lower);
    if (upper) assert.ok(key < upper);
  }
  const move = planPageMove(pages, "c", "a", "before")!;
  assert.deepEqual([...pages.slice(0, 2), { ...pages[2], ...move }].sort(comparePageOrder).map((page) => page.id), ["c", "a", "b"]);
  assert.equal(planPageMove(pages, "b", "a", "after"), null);
  const tied = [{ ...pages[0], sidebarOrder: "4" }, { ...pages[1], sidebarOrder: "4" }];
  const middle = orderBetween(pageOrderKey(tied[0]), pageOrderKey(tied[1]));
  assert.ok(pageOrderKey({ id: "c", sidebarOrder: middle }) < pageOrderKey(tied[1]));
  assert.throws(() => planPageMove([...pages, { id: "child", parent: "a", revision: "0".repeat(64) }], "a", "child", "inside"), /children/);
});

async function fixture(t: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-order-"));
  t.after(async () => {
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("notdown-order-")) throw new Error("Unsafe test cleanup");
    await fs.rm(root, { recursive: true, force: true });
  });
  return { root, vault: createVault(root) };
}

test("sidebar moves persist order and parent without rewriting siblings or Markdown", async (t) => {
  const { root, vault } = await fixture(t);
  const a = await vault.create({ title: "A", body: "a\r\n" }, { id: "a" });
  const b = await vault.create({ title: "B", body: "```odd\r\nraw\r\n```\r\n", properties: { extra: true } }, { id: "b" });
  const child = await vault.create({ title: "Child", parent: b.id, body: "child" }, { id: "child" });
  const file = path.join(root, "pages", "b.md");
  await fs.writeFile(file, (await fs.readFile(file, "utf8")).replace("---\n", "---\nunknown: keep\n"));
  let pages = await vault.list(), source = await vault.get(b.id);
  let moved = await vault.move(b.id, planPageMove(pages, b.id, a.id, "before")!, source.revision);
  assert.deepEqual((await vault.list()).filter((page) => !page.parent).map((page) => page.id), ["b", "a"]);
  assert.equal((await vault.get(a.id)).revision, a.revision);
  assert.equal((await vault.get(child.id)).revision, child.revision);
  assert.equal(moved.body, b.body);
  assert.match(await fs.readFile(file, "utf8"), /unknown: keep/);
  pages = await vault.list();
  moved = await vault.move(b.id, planPageMove(pages, b.id, a.id, "inside")!, moved.revision);
  assert.equal(moved.parent, a.id);
  assert.equal((await vault.get(child.id)).parent, b.id);
  moved = await vault.move(b.id, planPageMove(await vault.list(), b.id, null, "root")!, moved.revision);
  assert.equal(moved.parent, null);
  assert.deepEqual((await createVault(root).list()).filter((page) => !page.parent).map((page) => page.id), ["a", "b"]);
});

test("a stale destination preserves the proposed move and never overwrites either page", async (t) => {
  const { vault } = await fixture(t);
  const a = await vault.create({ title: "A" }, { id: "a" });
  const b = await vault.create({ title: "B" }, { id: "b" });
  const move = planPageMove(await vault.list(), b.id, a.id, "inside")!;
  const changed = await vault.update(a.id, { body: "External edit" }, a.revision);
  await assert.rejects(vault.move(b.id, move, b.revision), (error: unknown) => error instanceof VaultError && error.status === 409);
  assert.equal((await vault.get(a.id)).revision, changed.revision);
  assert.equal((await vault.get(b.id)).revision, b.revision);
  const [conflict] = await vault.listConflicts();
  assert.equal(conflict.proposed.parent, a.id);
  assert.equal(conflict.proposed.sidebarOrder, move.sidebarOrder);
});
