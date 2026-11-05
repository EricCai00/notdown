import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { createBrowserApp } from "../../server/browser-vaults.js";

test("browser vault URLs isolate writes, assets and CAS and survive service restart", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-browser-vaults-"));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith("notdown-browser-vaults-"));
    await fs.rm(root, { recursive: true, force: true });
  });
  let browseResult: string | null = root;
  const options = { vaultPath: path.join(root, "Default"), dataPath: root, browseFolder: async () => browseResult };
  let app = await createBrowserApp(options);
  let server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = () => `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const call = (url: string, body?: object, method = "POST") => fetch(origin() + url, body ? { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const close = async () => {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await app.locals.closeRNotebook();
  };
  t.after(close);
  assert.equal((await (await call("/api/vaults")).json()).createLocation, "");
  const browse = () => call("/api/vaults/browse", { path: root });
  assert.deepEqual(await (await browse()).json(), { path: root });
  browseResult = null;
  assert.deepEqual(await (await browse()).json(), { path: null });
  const deniedBrowse = await fetch(origin() + "/api/vaults/browse", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example" }, body: "{}" });
  assert.equal(deniedBrowse.status, 403);
  const remembered = path.join(root, "Uncreated 中文");
  assert.equal((await call("/api/vaults/create-location", { path: remembered })).status, 200);
  await assert.rejects(fs.access(remembered)); // Remembering a draft must never create its directory.
  const before = await (await call("/api/pages", { title: "Root only", body: "original" })).json();
  const created = await call("/api/vaults/open", { mode: "create", name: "Work 中文" }); assert.equal(created.status, 200);
  const work = await created.json();
  const reopen = await (await call("/api/vaults/open", { mode: "open", path: work.path })).json();
  assert.equal(reopen.url, work.url);
  assert.match(work.url, /^\/v\/[a-f0-9]{16}\/$/);
  const digest = createHash("sha256").update(process.platform === "win32" ? work.path.toLowerCase() : work.path).digest("hex");
  const legacyUrl = `/v/${digest}/`;
  assert.equal(work.url, `/v/${digest.slice(0, 16)}/`);
  const wrongDigest = digest.slice(0, -1) + (digest.endsWith("0") ? "1" : "0");
  assert.equal((await call(`/v/${wrongDigest}/api/pages`)).status, 404);
  for (const id of [digest.slice(0, 15), digest.slice(0, 17), digest.slice(0, 32), "g".repeat(16)])
    assert.equal((await call(`/v/${id}/api/pages`)).status, 404);
  const redirect = await fetch(origin() + work.url.slice(0, -1), { redirect: "manual" });
  assert.equal(redirect.status, 308); assert.equal(redirect.headers.get("location"), work.url);
  assert.deepEqual(await (await call(work.url + "api/pages")).json(), []);
  const second = await (await call(work.url + "api/pages", { title: "Work only", body: "second" })).json();
  assert.equal((await (await call(legacyUrl + `api/pages/${second.id}`)).json()).body, "second");
  assert.equal((await call(legacyUrl + `api/pages/${before.id}`)).status, 404);
  const legacyRedirect = await fetch(origin() + legacyUrl.slice(0, -1) + "?keep=1", { redirect: "manual" });
  assert.equal(legacyRedirect.status, 308); assert.equal(legacyRedirect.headers.get("location"), legacyUrl + "?keep=1");
  assert.equal((await call(work.url + `api/pages/${before.id}`)).status, 404);
  assert.equal((await call(`/api/pages/${second.id}`)).status, 404);
  assert.equal((await call(`/api/pages/${before.id}`, { body: "changed", baseRevision: before.revision }, "PUT")).status, 200);
  assert.equal((await call(`/api/pages/${before.id}`, { body: "stale", baseRevision: before.revision }, "PUT")).status, 409);
  const upload = await (await call(work.url + "api/assets", { name: "proof.txt", contentType: "text/plain", data: Buffer.from("Work attachment").toString("base64") })).json();
  assert.equal(await (await call(work.url + upload.path)).text(), "Work attachment");
  assert.equal(await (await call(legacyUrl + upload.path)).text(), "Work attachment");
  assert.equal((await call("/" + upload.path)).status, 404);
  assert.equal((await call("/api/vaults/open", { mode: "create", name: "Work 中文" })).status, 400);
  assert.equal((await call("/api/vaults/open", { mode: "create", name: "../escape" })).status, 400);
  const denied = await fetch(origin() + "/api/vaults/open", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example" }, body: JSON.stringify({ mode: "create", name: "Evil" }) });
  assert.equal(denied.status, 403); await assert.rejects(fs.access(path.join(root, "Evil")));
  const relocated = path.join(root, "New location"); await fs.mkdir(relocated);
  assert.equal((await call("/api/vaults/location", { path: work.path })).status >= 400, true);
  assert.equal((await call("/api/vaults/location", { path: relocated })).status, 200);
  const custom = await (await call("/api/vaults/open", { mode: "create", name: "Custom", path: root })).json();
  assert.equal(custom.path, path.join(root, "Custom"));
  const afterLocation = await (await call("/api/vaults/open", { mode: "create", name: "New" })).json();
  assert.equal(afterLocation.path, path.join(relocated, "New"));
  assert.equal((await (await call("/api/vaults")).json()).vaults.some((v: {path:string}) => v.path === work.path), true);
  await close(); app = await createBrowserApp(options); server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  assert.equal((await (await call("/api/vaults")).json()).dataPath, relocated);
  assert.equal((await (await call("/api/vaults")).json()).createLocation, remembered);
  assert.equal((await (await call(work.url + "api/status")).json()).vaultPath, work.path);
  assert.equal((await (await call(work.url + "api/pages")).json())[0].id, second.id);
  assert.equal((await (await call(legacyUrl + "api/pages")).json())[0].id, second.id);
  assert.equal((await call(`/v/${"a".repeat(64)}/api/pages`)).status, 404);
  const moved = path.join(root, "Moved"); await fs.rename(work.path, moved);
  assert.equal((await call(work.url + "api/pages")).status, 404);
  assert.equal((await call(legacyUrl + "api/pages")).status, 404);
  await assert.rejects(fs.access(work.path));
  const reopened = await (await call("/api/vaults/open", { mode: "open", path: moved })).json();
  assert.notEqual(reopened.url, work.url);
  assert.equal((await (await call(reopened.url + "api/pages")).json())[0].id, second.id);
});

test("opening normal Markdown folders does not initialize or change them; custom create requires empty folder", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-browser-open-"));
  const plain = path.join(root, "plain"); await fs.mkdir(plain); await fs.writeFile(path.join(plain, "note.md"), "untouched");
  const app = await createBrowserApp({ vaultPath: path.join(root, "Default"), dataPath: root });
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await app.locals.closeRNotebook(); assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith("notdown-browser-open-")); await fs.rm(root, { recursive: true, force: true }); });
  const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/vaults/open`;
  for (const mode of ["create", "open"]) {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, path: plain }) }); assert.equal(response.status, 400);
  }
  assert.deepEqual(await fs.readdir(plain), ["note.md"]);
  assert.equal(await fs.readFile(path.join(plain, "note.md"), "utf8"), "untouched");
});
