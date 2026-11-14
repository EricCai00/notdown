import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { notionViewName, readNotionViewNames, type CachedNotionViewName } from "../../server/notion-view-names.js";
import { importNotionView } from "../../server/notion-view-import.js";

const database = "11111111-1111-4111-8111-111111111111", id = "22222222-2222-4222-8222-222222222222";
const raw = { id, type: "table", name: "Untitled", parent: { database_id: database } };
const cached: CachedNotionViewName = { id, type: "table", name: null, parentId: database, version: 5 };

test("unnamed views use source layout labels while explicit names and raw definitions remain intact", () => {
  for (const [type, label] of Object.entries({ table: "Table", calendar: "Calendar", timeline: "Timeline", board: "Board", list: "List", gallery: "Gallery", chart: "Chart", feed: "Feed", map: "Map", form: "Form", dashboard: "Dashboard", future: "Table" })) {
    for (const name of [undefined, null, "", " \t"]) {
      const source = { type, name, future: { keep: true } };
      const result = importNotionView(source, [], "source");
      assert.equal(result.name, label);
      assert.deepEqual(result.notion, source);
      if (type === "map") assert.equal(result.type, "map");
    }
  }
  assert.equal(notionViewName({ type: "__proto__" }), "Table");
  for (const name of ["Untitled", "Imported view", "My calendar", "待办", "  Exact spacing  "])
    assert.equal(notionViewName({ type: "calendar", name }), name);
});

test("Untitled requires exact unnamed cache evidence; conflicting or explicit cache names stay untouched", () => {
  for (const name of [null, "", " "]) assert.equal(notionViewName(raw, { ...cached, name }), "Table");
  for (const evidence of [undefined, { ...cached, name: "Untitled" }, { ...cached, name: "Custom" }, { ...cached, type: "calendar" }, { ...cached, id: database }, { ...cached, parentId: id }])
    assert.equal(notionViewName(raw, evidence), "Untitled");
  assert.equal(notionViewName({ ...raw, parent: undefined }, cached), "Untitled");
  assert.equal(notionViewName({ ...raw, name: "Custom" }, cached), "Custom");
});

test("view-name SQLite reads are bounded to live unique views in the owning database, account and space", async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-view-names-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "notion.db"), db = new DatabaseSync(file);
  db.exec("CREATE TABLE block(id TEXT,meta_user_id TEXT,space_id TEXT,alive INTEGER,type TEXT); CREATE TABLE collection_view(id TEXT,type TEXT,name TEXT,version INTEGER,parent_id TEXT,parent_table TEXT,meta_user_id TEXT,space_id TEXT,alive INTEGER)");
  db.prepare("INSERT INTO block VALUES(?,?,?,?,?)").run(database, "owner", "space", 1, "collection_view_page");
  const insert = db.prepare("INSERT INTO collection_view VALUES(?,?,?,?,?,?,?,?,?)");
  insert.run(id, "table", null, 5, database, "block", "owner", "space", 1);
  for (const [parent, table, owner, space, alive] of [[id, "block", "owner", "space", 1], [database, "other", "owner", "space", 1], [database, "block", "other", "space", 1], [database, "block", "owner", "other", 1], [database, "block", "owner", "space", 0]])
    insert.run(id, "table", "must not export", 1, parent, table, owner, space, alive);
  db.close();
  const before = await fs.readFile(file);
  assert.deepEqual(await readNotionViewNames(database, [id, id], file), { views: [cached] });
  assert.deepEqual(await fs.readFile(file), before);
  assert.deepEqual((await readNotionViewNames(id, [id], file)).views, []);
  assert.deepEqual((await readNotionViewNames(database, ["invalid"], file)).views, []);
  assert.deepEqual((await readNotionViewNames(database, [id], path.join(dir, "missing.db"))).views, []);
  assert.equal(await fs.stat(path.join(dir, "missing.db")).catch(() => null), null);
  const writer = new DatabaseSync(file);
  writer.prepare("INSERT INTO collection_view VALUES(?,?,?,?,?,?,?,?,?)").run(id, "table", "ambiguous", 6, database, "block", "owner", "space", 1);
  writer.close();
  assert.deepEqual((await readNotionViewNames(database, [id], file)).views, []);
});
