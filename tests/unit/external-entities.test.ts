import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { createVault } from "../../server/vault";
import { createApp } from "../../server/app";
import { stablePageUuid } from "../../src/vault/page-id";
import { hashBytes } from "../../src/vault/crypto";
import { externalIdentity, externalKey } from "../../src/features/references/external-entity";
import { pageExternalReferences } from "../../src/features/references/external-source";
import { synchronize } from "../../src/sync/engine";
import { TestSyncRemote } from "./sync-fixture";
import type { ImportPlan } from "../../server/markdown-import";
import { mobileVaultApi } from "../../src/mobile/vault-api";

const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", u = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const syntax = { version: 1, variant: "notdown", notionVersion: "v2", extensions: {} } as const;
const key = (kind: "page" | "user", id: string) => externalKey({ provider: "notion", kind, id });
function plan(seed: string, origin: string, body = "", properties: Record<string, unknown> = {}, users: unknown[] = []): ImportPlan {
  const id = stablePageUuid(seed);
  return { id: hashBytes(seed), name: seed, pages: [{ id, path: `${id}.md`, source: body, metadata: { id, title: seed, parent: null, syntax, bodyFormat: "notion-markdown", properties, notionImport: { pageId: origin } } }],
    originals: [{ path: `pages/${origin}.md`, data: Buffer.from(body) }, { path: "users.json", data: Buffer.from(JSON.stringify(users)) }], assets: [], warnings: [], errors: [] };
}
async function fixture(t: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-external-"));
  const vault = createVault(root);
  t.after(async () => { vault.closeHistory(); await fs.rm(root, { recursive: true, force: true }); });
  await vault.init(); return { root, vault };
}

test("late page and user imports resolve existing references without changing note bytes or revisions", async t => {
  const { root, vault } = await fixture(t);
  const body = `<mention url="https://www.notion.so/${b}">Saved page</mention> [Link](https://www.notion.so/${b}) <mention url="user://${u}">Saved user</mention>\n`;
  const initial = plan("source", a, body, { related: [{ notionPageId: b, unresolved: true, url: `https://www.notion.so/${b}` }] });
  await vault.importBatch(initial);
  const before = await vault.get(initial.pages[0].id), source = await fs.readFile(path.join(root, "pages", `${before.id}.md`));
  let library = await vault.externalEntities.list();
  assert.equal(library.entities.find(entity => entity.key === key("page", b))?.status, "unresolved");
  assert.equal(library.entities.find(entity => entity.key === key("user", u))?.status, "unresolved");
  assert.equal((await vault.people.list()).length, 0);
  const target = plan("target", b);
  await vault.importBatch(target);
  const contact = await vault.people.create({ name: "Ada", notionUserId: u });
  library = await vault.externalEntities.list();
  assert.equal(library.entities.find(entity => entity.key === key("page", b))?.localId, target.pages[0].id);
  assert.equal(library.entities.find(entity => entity.key === key("user", u))?.localId, contact.id);
  assert.deepEqual(library.entities.find(entity => entity.key === key("page", b))?.references.map(ref => ref.location).sort(), ["Body", "Properties"]);
  assert.equal((await vault.get(before.id)).revision, before.revision);
  assert.deepEqual(await fs.readFile(path.join(root, "pages", `${before.id}.md`)), source);
  const stored = JSON.parse(await fs.readFile(path.join(root, "metadata.json"), "utf8"));
  assert.ok(stored.externalEntities[key("page", b)].importIds.includes(initial.id));
});

test("duplicate copies require a choice; bindings survive imports and stale saves preserve both proposals", async t => {
  const { root, vault } = await fixture(t);
  const first = plan("first", b), second = plan("second", b);
  await vault.importBatch(first); await vault.importBatch(second);
  let library = await vault.externalEntities.list();
  assert.equal(library.entities.find(entity => entity.key === key("page", b))?.status, "ambiguous");
  const revision = library.revision;
  library = await vault.externalEntities.bind(key("page", b), first.pages[0].id, revision);
  await assert.rejects(vault.externalEntities.bind(key("page", b), second.pages[0].id, revision), { status: 409 });
  const conflicts = await fs.readdir(path.join(root, ".history", "external-entity-conflicts"));
  const conflict = JSON.parse(await fs.readFile(path.join(root, ".history", "external-entity-conflicts", conflicts[0]), "utf8"));
  assert.equal(conflict.current.externalEntities[key("page", b)].binding, first.pages[0].id);
  assert.equal(conflict.proposed.externalEntities[key("page", b)].binding, second.pages[0].id);
  await vault.importBatch(plan("third", b));
  library = await vault.externalEntities.list();
  assert.equal(library.entities.find(entity => entity.key === key("page", b))?.localId, first.pages[0].id);
  const page = await vault.get(first.pages[0].id);
  await vault.update(page.id, { trashed: true }, page.revision);
  assert.equal((await vault.externalEntities.list()).entities.find(entity => entity.key === key("page", b))?.localId, undefined);
});

test("named API users become local contacts once; partial users and local edits remain intact", async t => {
  const { vault } = await fixture(t);
  const imported = plan("people", a, `<mention url="user://${u}"/>`, {}, [{ object: "user", id: u, name: "Imported user", person: { email: "ada@example.test" }, future: { preserve: true } }]);
  await vault.importBatch(imported);
  const [person] = await vault.people.list();
  assert.equal(person.notionUserId, u); assert.equal(person.email, "ada@example.test");
  await vault.people.update(person.id, { name: "Local name" }, person.revision);
  await vault.importBatch(imported);
  assert.equal((await vault.people.list()).length, 1);
  assert.equal((await vault.people.get(person.id)).name, "Local name");
  const entity = (await vault.externalEntities.list()).entities.find(entity => entity.key === key("user", u))!;
  assert.equal(entity.label, "Local name"); assert.deepEqual(entity.data?.future, { preserve: true });
});

test("external identities and live references exclude lookalike hosts, code and unknown containers", () => {
  assert.equal(externalIdentity(`https://notion.so.evil.test/${b}`), undefined);
  assert.equal(externalIdentity(`https://www.notion.so/?id=${b}`), undefined);
  assert.equal(externalIdentity(`https://www.notion.so/${a}#${b}`)?.kind, "block");
  assert.equal(externalIdentity(`https://www.notion.so/Title-${b.replaceAll("-", "").toUpperCase()}`)?.id, b);
  const body = `\`\`\`xml\n<mention url="user://${u}"/>\n\`\`\`\n\n<future><mention url="user://${u}"/></future>\n\n<mention url="https://www.notion.so/${b}"/>`;
  const found = pageExternalReferences({ id: a, body, syntax, properties: {} } as any);
  assert.equal(found.uncertain, false);
  assert.deepEqual(found.observations.map(entity => entity.id), [b]);
});

test("external entity records and user identities travel through the resource sync protocol", async t => {
  const { root, vault } = await fixture(t), other = createVault(path.join(root, "replica")), remote = new TestSyncRemote();
  t.after(() => other.closeHistory());
  await vault.importBatch(plan("sync-source", a, `<mention url="https://www.notion.so/${b}"/>`));
  const target = await other.create({ title: "Manual target", body: "" });
  await synchronize(vault.syncStore, remote, "test/external");
  await synchronize(other.syncStore, remote, "test/external");
  let library = await other.externalEntities.list();
  assert.ok(library.entities.some(entity => entity.key === key("page", b)));
  await other.externalEntities.bind(key("page", b), target.id, library.revision);
  await synchronize(other.syncStore, remote, "test/external");
  await synchronize(vault.syncStore, remote, "test/external");
  library = await vault.externalEntities.list();
  assert.equal(library.entities.find(entity => entity.key === key("page", b))?.localId, target.id);
});

test("external reference HTTP API validates bindings and requires the current revision", async t => {
  const { vault } = await fixture(t), page = await vault.create({ title: "References", body: `<mention-page url="https://www.notion.so/${b}"/>`, syntax: { ...syntax, notionVersion: undefined } });
  const app = createApp(vault), server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/external-entities`;
  const library = await (await fetch(base)).json();
  assert.equal(library.entities[0].status, "unresolved");
  const response = await fetch(`${base}/binding`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: key("page", b), localId: page.id, baseRevision: library.revision }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).entities[0].localId, page.id);
});

test("registry imports preserve unknown metadata and malformed registries are never replaced", async t => {
  const { root, vault } = await fixture(t);
  await vault.importBatch(plan("unknown-fields", a, `<mention url="https://www.notion.so/${b}"/>`));
  const filename = path.join(root, "metadata.json"), metadata = JSON.parse(await fs.readFile(filename, "utf8"));
  metadata.future = { keep: [1, 2] }; metadata.externalEntities[key("page", b)].future = { keep: "entry" };
  await fs.writeFile(filename, JSON.stringify(metadata));
  await vault.importBatch(plan("another-import", b));
  const updated = JSON.parse(await fs.readFile(filename, "utf8"));
  assert.deepEqual(updated.future, metadata.future);
  assert.deepEqual(updated.externalEntities[key("page", b)].future, { keep: "entry" });
  updated.externalEntities = ["invalid"];
  const invalid = JSON.stringify(updated); await fs.writeFile(filename, invalid);
  await assert.rejects(vault.externalEntities.list(), { status: 422 });
  assert.equal(await fs.readFile(filename, "utf8"), invalid);
});

test("offline mobile transport shares the entity library and binding revision checks", async t => {
  const { vault } = await fixture(t), api = mobileVaultApi(() => vault);
  await vault.importBatch(plan("mobile-source", a, `<mention url="https://www.notion.so/${b}"/>`));
  const target = await vault.create({ title: "Mobile target", body: "" });
  const library = await api("/external-entities", {}) as any;
  const saved = await api("/external-entities/binding", { method: "PUT", body: JSON.stringify({ key: key("page", b), localId: target.id, baseRevision: library.revision }) }) as any;
  assert.equal(saved.entities.find((entity: any) => entity.key === key("page", b)).localId, target.id);
  await assert.rejects(api("/external-entities/binding", { method: "PUT", body: JSON.stringify({ key: key("page", b), localId: null, baseRevision: library.revision }) }), { status: 409 });
});
