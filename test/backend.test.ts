import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { once } from "node:events";
import { request } from "node:http";
import { createVault, VaultError } from "../server/vault.js";
import { createApp } from "../server/app.js";
import { seedNewDefaultVault, sampleIds } from "../server/seed.js";

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "notdown-"),
  );
  assert.equal(
    path.dirname(path.resolve(directory)),
    path.resolve(os.tmpdir()),
  );
  assert.ok(path.basename(directory).startsWith("notdown-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return { directory, vault: createVault(path.join(directory, "vault")) };
}

test("canonical Markdown survives reopen and metadata edits preserve body and unknown YAML", async (t) => {
  const { vault } = await fixture(t);
  const body = "# 保留原文\r\n\r\n```js\r\nconst value = 1;\r\n```\r\n\r\n";
  const created = await vault.create({
    title: "测试",
    body,
    properties: { tags: ["Markdown"], done: false, count: 0 },
  });
  const file = path.join(vault.vaultPath, "pages", `${created.id}.md`);
  let source = await fs.readFile(file, "utf8");
  assert.match(source, /^---\nid:/);
  source = source.replace(
    "title: 测试",
    "title: 测试\n# keep this comment\nexternal_field:\n  nested: keep",
  );
  await fs.writeFile(file, source);
  const external = await createVault(vault.vaultPath).get(created.id);
  assert.notEqual(external.revision, created.revision);
  assert.equal(external.body, body);
  const updated = await vault.update(
    created.id,
    { title: "新标题" },
    external.revision,
  );
  const saved = await fs.readFile(file, "utf8");
  assert.match(saved, /# keep this comment/);
  assert.match(saved, /external_field:\n  nested: keep/);
  assert.equal(updated.body, body);
  assert.deepEqual(updated.properties, {
    tags: ["Markdown"],
    done: false,
    count: 0,
  });
  assert.equal((await createVault(vault.vaultPath).list())[0].title, "新标题");
  const history = await fs.readFile(
    path.join(
      vault.vaultPath,
      ".history",
      created.id,
      `${external.revision}.md`,
    ),
    "utf8",
  );
  assert.equal(history, source);
});

test("format migration is atomic with body revision and survives conflict preservation", async (t) => {
  const { vault } = await fixture(t);
  const old = await vault.create({ title: "Legacy", body: "one\ncontinued\n\nnext", bodyFormat: "markdown" });
  const newer = await vault.update(old.id, { title: "External" }, old.revision);
  assert.equal(newer.bodyFormat, "markdown");
  let conflictId = "";
  await assert.rejects(vault.update(old.id, { body: "one<br>continued\nnext", bodyFormat: "notion-markdown" }, old.revision), (error: unknown) => {
    assert.ok(error instanceof VaultError);
    conflictId = String(error.details.conflictId);
    const proposed = error.details.proposed as { bodyFormat: string };
    assert.equal(proposed.bodyFormat, "notion-markdown");
    return error.status === 409;
  });
  assert.equal((await vault.get(old.id)).body, old.body);
  const merged = await vault.resolveConflict(conflictId, {}, newer.revision);
  assert.equal(merged.bodyFormat, "notion-markdown");
  assert.equal(merged.body, "one<br>continued\nnext");
  const reopened = await createVault(vault.vaultPath).get(old.id);
  assert.equal(reopened.bodyFormat, "notion-markdown");
  assert.equal((await vault.create({ title: "New page" })).bodyFormat, "notion-markdown");
  await assert.rejects(vault.update(old.id, { bodyFormat: "invalid" as "markdown" }, merged.revision), { status: 400 });
  await assert.rejects(vault.update(old.id, { bodyFormat: "markdown" }, merged.revision), { status: 400 });
});

test("onboarding seeds only a new implicit default vault, preserves existing and explicit vaults", async (t) => {
  const { directory, vault } = await fixture(t);
  const seeded = await seedNewDefaultVault(vault, true);
  assert.equal(seeded.length, 5);
  assert.equal(seeded[0].id, sampleIds.welcome);
  assert.equal((await vault.get(sampleIds.garden)).parent, sampleIds.welcome);
  assert.equal((await vault.get(sampleIds.syntax)).parent, sampleIds.welcome);
  assert.match((await vault.get(sampleIds.welcome)).body, /<columns>\n/);
  assert.equal((await vault.get(sampleIds.welcome)).bodyFormat, "notion-markdown");
  assert.equal((await seedNewDefaultVault(vault, true)).length, 0);
  assert.equal((await vault.list()).length, 5);
  await assert.rejects(
    vault.create({ title: "collision" }, { id: sampleIds.welcome }),
    { status: 409 },
  );
  assert.equal((await vault.get(sampleIds.welcome)).title, "从这里开始");
  const existing = createVault(path.join(directory, "existing-empty"));
  await existing.init();
  assert.equal((await seedNewDefaultVault(existing, true)).length, 0);
  assert.deepEqual(await existing.list(), []);
  const explicit = createVault(path.join(directory, "explicit"));
  assert.equal((await seedNewDefaultVault(explicit, false)).length, 0);
  await assert.rejects(fs.stat(explicit.vaultPath), { code: "ENOENT" });
});

test("CAS preserves both versions and resolution requires current revision", async (t) => {
  const { vault } = await fixture(t);
  const page = await vault.create({ title: "并发", body: "base" });
  const newer = await vault.update(
    page.id,
    { body: "other editor" },
    page.revision,
  );
  let conflictId = "";
  await assert.rejects(
    vault.update(page.id, { body: "my draft" }, page.revision),
    (error) => {
      assert.ok(error instanceof VaultError);
      assert.equal(error.status, 409);
      conflictId = String(error.details.conflictId);
      assert.equal(
        (error.details.current as { body: string }).body,
        "other editor",
      );
      assert.equal(
        (error.details.proposed as { body: string }).body,
        "my draft",
      );
      return true;
    },
  );
  assert.equal((await vault.get(page.id)).body, "other editor");
  assert.match(
    await fs.readFile(
      path.join(vault.vaultPath, ".history", "conflicts", `${conflictId}.md`),
      "utf8",
    ),
    /my draft$/,
  );
  assert.equal((await vault.listConflicts()).length, 1);
  await assert.rejects(
    vault.resolveConflict(conflictId, { body: "merged" }, page.revision),
    { status: 409 },
  );
  assert.equal((await vault.get(page.id)).body, "other editor");
  const merged = await vault.resolveConflict(
    conflictId,
    { body: "other editor\nmy draft" },
    newer.revision,
  );
  assert.equal(merged.body, "other editor\nmy draft");
  assert.ok(
    !(await vault.listConflicts()).some(
      (conflict) => conflict.id === conflictId,
    ),
  );
  await assert.rejects(vault.update(page.id, { body: "bad" }, ""), {
    status: 400,
  });
});

test("parallel saves serialize and only one matching revision succeeds", async (t) => {
  const { vault } = await fixture(t);
  const page = await vault.create({ title: "race", body: "" });
  const results = await Promise.allSettled([
    vault.update(page.id, { body: "one" }, page.revision),
    vault.update(page.id, { body: "two" }, page.revision),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal((await vault.listConflicts()).length, 1);
});

test("parent ownership rejects missing parents, direct and indirect cycles", async (t) => {
  const { vault } = await fixture(t);
  const a = await vault.create({ title: "parent" });
  const b = await vault.create({ title: "child", parent: a.id });
  const c = await vault.create({ title: "grandchild", parent: b.id });
  await assert.rejects(vault.update(a.id, { parent: c.id }, a.revision), {
    status: 400,
  });
  await assert.rejects(vault.update(a.id, { parent: a.id }, a.revision), {
    status: 400,
  });
  await assert.rejects(vault.create({ title: "orphan", parent: "missing" }), {
    status: 400,
  });
  assert.equal((await vault.get(a.id)).parent, null);
});

test("malformed YAML and duplicate IDs stop writes without damaging source", async (t) => {
  const { vault } = await fixture(t);
  const page = await vault.create({ title: "valid", body: "preserve" });
  const directory = path.join(vault.vaultPath, "pages");
  const original = await fs.readFile(
    path.join(directory, `${page.id}.md`),
    "utf8",
  );
  await fs.writeFile(path.join(directory, "duplicate.md"), original);
  await assert.rejects(vault.list(), { status: 422 });
  await assert.rejects(
    vault.update(page.id, { body: "overwrite" }, page.revision),
    { status: 422 },
  );
  assert.equal(
    await fs.readFile(path.join(directory, `${page.id}.md`), "utf8"),
    original,
  );
  await fs.rm(path.join(directory, "duplicate.md"));
  await fs.writeFile(
    path.join(directory, "invalid.md"),
    "---\nid: [broken\n---\nbody",
  );
  await assert.rejects(vault.list(), { status: 422 });
  assert.equal(
    await fs.readFile(path.join(directory, "invalid.md"), "utf8"),
    "---\nid: [broken\n---\nbody",
  );
});

test("invalid IDs and attachment filenames cannot escape the vault", async (t) => {
  const { directory, vault } = await fixture(t);
  for (const id of [
    "../outside",
    "C:\\outside",
    "..",
    "%2e%2e",
    "/absolute",
    "a/b",
  ]) {
    await assert.rejects(vault.get(id), { status: 400 });
  }
  const asset = await vault.uploadAsset(
    "../../attack.html",
    "text/html",
    Buffer.from("<script>test</script>").toString("base64"),
  );
  assert.match(asset.path, /^assets\/[a-f0-9-]+\.bin$/);
  assert.equal(asset.contentType, "application/octet-stream");
  assert.equal(asset.name, "attack.html");
  assert.equal(
    await fs.readFile(path.join(vault.vaultPath, asset.path), "utf8"),
    "<script>test</script>",
  );
  await assert.rejects(
    vault.uploadAsset("bad.png", "image/png", "!notbase64"),
    { status: 400 },
  );
  await assert.rejects(fs.stat(path.join(directory, "attack.html")), {
    code: "ENOENT",
  });
});

test("symlink pages are ignored", async (t) => {
  const { directory, vault } = await fixture(t);
  await vault.init();
  const outside = path.join(directory, "outside.md");
  await fs.writeFile(outside, "outside file");
  try {
    await fs.symlink(outside, path.join(vault.vaultPath, "pages", "linked.md"));
  } catch (error) {
    if (
      ["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")
    ) {
      t.skip("OS does not allow symlinks");
      return;
    }
    throw error;
  }
  assert.deepEqual(await vault.list(), []);
  assert.equal(await fs.readFile(outside, "utf8"), "outside file");
});

test("managed directory junctions cannot redirect storage outside the vault", async (t) => {
  const { directory, vault } = await fixture(t);
  await vault.init();
  const outside = path.join(directory, "outside");
  await fs.mkdir(outside);
  const assets = path.join(vault.vaultPath, "assets");
  await fs.rmdir(assets);
  try {
    await fs.symlink(
      outside,
      assets,
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if (
      ["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")
    ) {
      t.skip("OS does not allow directory links");
      return;
    }
    throw error;
  }
  await assert.rejects(
    vault.uploadAsset("image.png", "image/png", "aGVsbG8="),
    { status: 422 },
  );
  assert.deepEqual(await fs.readdir(outside), []);
});

test("REST rejects foreign Origin, DNS rebinding Host and simple form writes", async (t) => {
  const { directory } = await fixture(t);
  const server = createApp({
    vaultPath: path.join(directory, "api-vault"),
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  assert.equal((await fetch(`${base}/api/status`)).status, 200);
  assert.equal(
    (
      await fetch(`${base}/api/pages`, {
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  const rebindingStatus = await new Promise<number | undefined>(
    (resolve, reject) => {
      const req = request(
        `${base}/api/pages`,
        { headers: { Host: "evil.example" } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      req.on("error", reject);
      req.end();
    },
  );
  assert.equal(rebindingStatus, 403);
  assert.equal(
    (await fetch(`${base}/api/pages`, { method: "POST", body: "title=x" }))
      .status,
    415,
  );
  const response = await fetch(`${base}/api/pages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:5173",
    },
    body: JSON.stringify({ title: "API", body: "source" }),
  });
  assert.equal(response.status, 201);
  const page = await response.json();
  assert.equal((await fetch(`${base}/api/pages/${page.id}`)).status, 200);
  const missingRevision = await fetch(`${base}/api/pages/${page.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: "no revision" }),
  });
  assert.equal(missingRevision.status, 400);
});
