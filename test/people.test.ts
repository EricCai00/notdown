import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse } from "yaml";
import { createVault, VaultError } from "../server/vault.js";
import { createApp } from "../server/app.js";
import { personId, personMention, searchPeople } from "../src/person.js";
import { parseNotionMarkdown, serializeNotionMarkdown } from "../src/notion-markdown.js";
import { EditorState } from "prosemirror-state";

async function fixture(t: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-people-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const vault = createVault(root);
  await vault.init();
  return { root, vault };
}
test("people CRUD keeps stable identities, duplicate names, YAML comments, unknown fields and note bytes", async t => {
  const { root, vault } = await fixture(t);
  const a = await vault.people.create({ name: " Eric Cai ", email: "eric@example.test", organization: "Design", notes: "line one\nline two" });
  const b = await vault.people.create({ name: "Eric Cai", phone: "123" });
  assert.notEqual(a.id, b.id);
  assert.equal(a.name, "Eric Cai");
  const note = await vault.create({ title: "Meeting", body: `Before ${personMention(a)} after` });
  const noteFile = path.join(root, "pages", `${note.id}.md`), noteSource = await fs.readFile(noteFile, "utf8");
  const file = path.join(root, "people", `${a.id}.yaml`);
  const customFile = path.join(root, "people", "my-contact.yml");
  await fs.rename(file, customFile);
  await fs.appendFile(customFile, "# external comment\ncustom: {keep: [one, two]}\n");
  const read = await vault.people.get(a.id);
  const beforeEdit = await fs.readFile(customFile, "utf8");
  const updated = await vault.people.update(a.id, { name: "Eric Chen" }, read.revision);
  assert.equal(updated.id, a.id);
  assert.equal(updated.notes, a.notes);
  assert.equal(updated.created, a.created);
  const source = await fs.readFile(customFile, "utf8");
  assert.match(source, /# external comment/);
  assert.deepEqual(parse(source).custom, { keep: ["one", "two"] });
  const removed = await vault.people.update(a.id, { deleted: true }, updated.revision);
  assert.deepEqual((await vault.people.list()).map(person => person.id), [b.id]);
  assert.equal((await vault.people.list(true)).length, 2);
  assert.equal((await vault.people.get(a.id)).name, "Eric Chen");
  const restored = await vault.people.update(a.id, { deleted: false }, removed.revision);
  assert.equal(restored.id, a.id);
  assert.equal((await createVault(root).people.get(a.id)).deleted, false);
  assert.equal(await fs.readFile(noteFile, "utf8"), noteSource);
  assert.equal(await fs.readFile(path.join(root, ".history", "people", a.id, `${read.revision}.yaml`), "utf8"), beforeEdit);
});

test("stale edits and deletes preserve both complete sources and never overwrite the latest person", async t => {
  const { root, vault } = await fixture(t);
  const person = await vault.people.create({ name: "Original", notes: "shared" });
  const latest = await vault.people.update(person.id, { name: "Other window", notes: "external" }, person.revision);
  let conflictId = "";
  await assert.rejects(vault.people.update(person.id, { name: "My draft", notes: "mine" }, person.revision), error => {
    assert.ok(error instanceof VaultError);
    assert.equal(error.status, 409);
    assert.equal((error.details.current as any).name, "Other window");
    assert.equal((error.details.proposed as any).notes, "mine");
    conflictId = String(error.details.conflictId);
    return true;
  });
  const folder = path.join(root, ".history", "people", "conflicts");
  assert.equal(parse(await fs.readFile(path.join(folder, `${conflictId}.current.yaml`), "utf8")).notes, "external");
  assert.equal(parse(await fs.readFile(path.join(folder, `${conflictId}.proposed.yaml`), "utf8")).notes, "mine");
  await assert.rejects(vault.people.update(person.id, { deleted: true }, person.revision), error => error instanceof VaultError && error.status === 409);
  assert.equal((await vault.people.get(person.id)).revision, latest.revision);
  assert.equal((await vault.people.get(person.id)).deleted, false);
  assert.deepEqual(await vault.listConflicts(), []);
});

test("people validation rejects invalid writes and preserves unrelated files", async t => {
  const { root, vault } = await fixture(t);
  for (const input of [null, [], {}, { name: " " }, { name: "ok", email: 7 }, { name: "ok", deleted: "yes" }]) {
    await assert.rejects(vault.people.create(input as any), error => error instanceof VaultError && error.status === 400);
  }
  const person = await vault.people.create({ name: "Valid" });
  await assert.rejects(vault.people.update(person.id, { name: "Wrong" }, ""), /baseRevision/);
  await assert.rejects(vault.people.get("../escape"), /Invalid/);
  await fs.writeFile(path.join(root, "people", "README.txt"), "keep this");
  assert.equal((await vault.people.list()).length, 1);
  assert.equal(await fs.readFile(path.join(root, "people", "README.txt"), "utf8"), "keep this");
  await fs.writeFile(path.join(root, "people", "unknown.yaml"), "unexpected: preserved\n");
  await assert.rejects(vault.people.list(), /Invalid person YAML/);
  assert.equal(await fs.readFile(path.join(root, "people", "unknown.yaml"), "utf8"), "unexpected: preserved\n");
});

test("person references round-trip labels and unknown attributes without rewriting code or external user references", async t => {
  const { vault } = await fixture(t);
  const person = await vault.people.create({ name: '蔡 <Eric> & "team"' });
  const mention = personMention(person);
  const source = `Before ${mention.replace('url=', 'custom="keep" url=')} after\n\n<mention-user url="user://notion-user">External user</mention-user>\n\n\`\`\`xml\n${mention}\n\`\`\``;
  const doc = parseNotionMarkdown(source);
  assert.equal(serializeNotionMarkdown(doc), source);
  const updated = EditorState.create({ doc }).tr.insertText("Edited ", 1).doc;
  const output = serializeNotionMarkdown(updated);
  assert.match(output, /custom="keep"/);
  assert.ok(output.includes(`person://${person.id}`));
  assert.ok(output.includes('<mention-user url="user://notion-user">External user</mention-user>'));
  assert.ok(output.includes(`\`\`\`xml\n${mention}\n\`\`\``));
  const labels: string[] = [];
  parseNotionMarkdown(output).descendants(node => { if (node.type.name === "mention") labels.push(node.attrs.label); });
  assert.deepEqual(labels, [person.name, "External user"]);
  assert.equal(personId(`person://${person.id}`), person.id);
  assert.equal(personId("user://notion-user"), null);
  assert.equal(personId("person://../escape"), null);
  const contacts = [person, await vault.people.create({ name: "Other", email: "HELLO@example.test", organization: "Lab", deleted: true })];
  assert.equal(searchPeople(contacts, "蔡 eric").length, 1);
  assert.equal(searchPeople(contacts, "hello").length, 0);
  assert.equal(searchPeople(contacts, "hello lab", true).length, 1);
});

test("People HTTP API enforces revisions for edit, delete and restore", async t => {
  const { root } = await fixture(t);
  const app = createApp({ vaultPath: root });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address() as { port: number };
  const endpoint = `http://127.0.0.1:${address.port}/api/people`;
  const write = (url: string, method: string, body: unknown) => fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const create = await write(endpoint, "POST", { name: "API person" });
  assert.equal(create.status, 201);
  const person = await create.json();
  assert.equal((await write(`${endpoint}/${person.id}`, "PUT", { name: "No revision" })).status, 400);
  const removed = await (await write(`${endpoint}/${person.id}`, "PUT", { deleted: true, baseRevision: person.revision })).json();
  assert.equal(removed.deleted, true);
  assert.deepEqual(await (await fetch(endpoint)).json(), []);
  assert.equal((await (await fetch(`${endpoint}?includeDeleted=true`)).json()).length, 1);
  assert.equal((await write(`${endpoint}/${person.id}`, "PUT", { deleted: false, baseRevision: person.revision })).status, 409);
  assert.equal((await write(`${endpoint}/${person.id}`, "PUT", { deleted: false, baseRevision: removed.revision })).status, 200);
});
