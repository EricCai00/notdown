import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { createApp } from "../../server/app.js";

test("source-file API resolves renamed files, preserves raw YAML and restricts native opening", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-source-"));
  const opened: string[] = [];
  let failOpen = false;
  const app = createApp({ vaultPath: root, openFile: async (file) => {
    if (failOpen) throw new Error("No association");
    opened.push(file);
  } });
  const page = await app.locals.vault.create({ title: "Source", body: "<script>alert(1)</script>\r\n\n未知语法" });
  const original = path.join(root, "pages", `${page.id}.md`);
  const renamed = path.join(root, "pages", "中文 [notes] $ & ' %.md");
  const raw = await fs.readFile(original, "utf8");
  await fs.writeFile(original, raw);
  await fs.rename(original, renamed);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("notdown-source-"));
    await fs.rm(root, { recursive: true, force: true });
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/pages`;
  const endpoint = `${base}/${page.id}`;
  const info = await fetch(`${endpoint}/source-file`);
  assert.deepEqual(await info.json(), { path: renamed });
  assert.equal(info.headers.get("cache-control"), "no-store");
  const source = await fetch(`${endpoint}/source`);
  assert.equal(await source.text(), raw);
  assert.match(source.headers.get("content-type")!, /^text\/plain; charset=utf-8/);
  assert.equal(source.headers.get("content-disposition"), "inline");
  assert.equal(source.headers.get("x-content-type-options"), "nosniff");
  assert.match(source.headers.get("content-security-policy")!, /sandbox/);
  const post = (body: unknown, extraHeaders = {}) => fetch(`${endpoint}/source-file/open`, {
    method: "POST", headers: { "Content-Type": "application/json", ...extraHeaders }, body: JSON.stringify(body),
  });
  assert.equal((await post({})).status, 200);
  assert.deepEqual(opened, [renamed]);
  assert.equal((await post({ path: "C:\\outside.md" })).status, 400);
  assert.equal((await post({}, { Origin: "https://foreign.example" })).status, 403);
  assert.equal((await fetch(`${endpoint}/source-file/open`, { method: "POST", body: "{}" })).status, 415);
  assert.equal((await fetch(`${base}/missing/source-file`)).status, 404);
  assert.equal((await fetch(`${base}/bad%2Fid/source`)).status, 400);
  assert.deepEqual(opened, [renamed]);
  failOpen = true;
  const failure = await post({});
  assert.equal(failure.status, 503);
  assert.match((await failure.json()).error, /default editor/);
  assert.equal(await fs.readFile(renamed, "utf8"), raw);
});
