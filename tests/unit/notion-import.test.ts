import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import {
  notionPageId,
  prepareNotionImport,
} from "../../server/notion-import.js";
import { createVault } from "../../server/vault.js";
import { createApp } from "../../server/app.js";
import { enrichmentFixture, enrichmentRoot, unknownTag } from "./notion-block-import-fixture.js";
import {
  notionRoot,
  notionChild,
  notionSibling,
  notionFixture,
  notionSource,
} from "./notion-import-fixture.js";

const request = {
  token: "test-secret-not-saved",
  pageId: notionRoot,
  includeChildren: true,
};
const wait = async () => {};
test("missing Notion icons use the native default; explicit page emoji stays intact", async () => {
  const fixture = notionFixture();
  for (const icon of [null, { type: "emoji", emoji: "📄" }]) {
    const plan = await prepareNotionImport({ ...request, includeChildren: false }, {
      wait,
      fetch: async (input, init) => {
        const response = await fixture(input, init);
        const json = await response.json();
        return Response.json(json.object === "page" ? { ...json, icon } : json);
      },
    });
    assert.equal(plan.pages[0].metadata.icon, icon ? "📄" : "file-text");
  }
});
async function temporary(t: { after(fn: () => Promise<void>): void }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notdown-notion-"));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("notdown-notion-"));
    await fs.rm(root, { recursive: true, force: true });
  });
  return root;
}

test("Notion page IDs use only a validated path, never a query view ID or arbitrary host", () => {
  assert.equal(
    notionPageId(
      `https://www.notion.so/Title-${notionRoot.replace(/-/g, "")}?v=${notionChild}`,
    ),
    notionRoot,
  );
  assert.equal(
    notionPageId(`https://team.notion.site/${notionRoot}#${notionChild}`),
    notionRoot,
  );
  for (const value of [
    `https://evil.test/${notionRoot}`,
    `https://app.notion.com.evil.test/${notionRoot}`,
    `https://notion.com@evil.test/${notionRoot}`,
    `https://notion.so/?v=${notionRoot}`,
    `garbage-${notionRoot}`,
    {},
    "",
    `http://notion.so/${notionRoot}`,
  ])
    assert.throws(() => notionPageId(value));
});

test("Notion app Copy link paths resolve the page ID without query or fragment IDs", () => {
  for (const host of ["app.notion.com", "www.notion.com", "notion.com"]) {
    assert.equal(
      notionPageId(`https://${host}/p/workspace/CS-${notionRoot.replace(/-/g, "")}?source=copy_link&v=${notionChild}#${notionSibling}`),
      notionRoot,
    );
  }
});

test("API Enhanced Markdown stays byte-exact, pagination and nested descendants retain real page parents", async (t) => {
  const calls: string[] = [];
  const plan = await prepareNotionImport(request, {
    fetch: notionFixture(calls),
    wait,
  });
  assert.equal(plan.pages.length, 3);
  assert.equal(plan.pages[0].source, notionSource);
  assert.equal(plan.pages[1].metadata.title, "Same title");
  assert.equal(plan.pages[2].metadata.title, "Same title");
  assert.notEqual(plan.pages[1].id, plan.pages[2].id);
  assert.ok(
    plan.pages.slice(1).every((p) => p.metadata.parent === plan.pages[0].id),
  );
  assert.ok(
    plan.pages.every(
      (p) => (p.metadata.syntax as any).variant === "notion-markdown",
    ),
  );
  assert.equal(
    calls.filter((p) => p === `/v1/pages/${notionSibling}/markdown?markdown_version=v2&include_transcript=true`).length,
    1,
  );
  assert.ok(
    calls.some((p) => p.includes("start_cursor=second%20page%26cursor")),
  );
  assert.ok(plan.warnings.some((w) => w.includes("child database")));
  assert.ok(
    plan.originals.some(
      (f) =>
        f.path === `pages/${notionRoot}.md` &&
        f.data.equals(Buffer.from(notionSource)),
    ),
  );
  assert.ok(!JSON.stringify(plan).includes(request.token));
  const vault = createVault(await temporary(t));
  const existing = await vault.create({ title: "Keep", body: "Existing" });
  await vault.importBatch(plan);
  const saved = await vault.get(plan.pages[0].id);
  assert.deepEqual(new Set((await vault.list()).filter(p => p.parent === saved.id).map(p => p.id)), new Set(plan.pages.slice(1).map(p => p.id)));
  assert.equal(saved.body, notionSource);
  assert.equal(saved.syntax?.variant, "notion-markdown");
  assert.equal((await vault.get(existing.id)).revision, existing.revision);
  const metadata = JSON.parse(
    await fs.readFile(path.join(vault.vaultPath, "metadata.json"), "utf8"),
  );
  assert.ok(JSON.stringify(metadata).includes(notionRoot));
  await vault.update(saved.id, { body: "Local edits" }, saved.revision);
  assert.equal((await vault.importBatch(plan)).alreadyImported, true);
  assert.equal((await vault.get(saved.id)).body, "Local edits");
  const manifest = JSON.parse(
    await fs.readFile(
      path.join(vault.vaultPath, ".history/imports", plan.id, "manifest.json"),
      "utf8",
    ),
  );
  const raw = manifest.originals.find(
    (f: any) => f.path === `pages/${notionRoot}.md`,
  );
  assert.equal(
    await fs.readFile(
      path.join(vault.vaultPath, ".history/imports", plan.id, raw.archive),
      "utf8",
    ),
    notionSource,
  );
});

test("single-page import with known code languages skips hierarchy requests and keeps snapshot identities stable", async () => {
  const calls: string[] = [];
  const options = { fetch: notionFixture(calls), wait };
  const first = await prepareNotionImport(
    { ...request, includeChildren: false },
    options,
  );
  const second = await prepareNotionImport(
    { ...request, includeChildren: false },
    options,
  );
  assert.equal(first.pages.length, 1);
  assert.equal(first.id, second.id);
  assert.match(first.pages[0].id, /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(first.pages[0].id, second.pages[0].id);
  assert.equal((first.pages[0].metadata.notionImport as any).batchId, first.id);
  assert.ok(calls.every(p => p.startsWith(`/v1/pages/${notionRoot}`)));
});

test("unknown blocks warn but allow preview and import, including responses also marked truncated", async (t) => {
  for (const truncated of [false, true]) {
    const fixture = notionFixture();
    const app = createApp({
      vaultPath: await temporary(t),
      notionImportTransport: {
        wait,
        fetch: async (input, init) => {
          const response = await fixture(input, init);
          return new URL(String(input)).pathname.endsWith(`/pages/${notionRoot}/markdown`)
            ? Response.json({ ...(await response.json()), truncated, unknown_block_ids: [notionChild] })
            : response;
        },
      },
    });
    await app.locals.vault.init();
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      app.locals.closeRNotebook();
    });
    const base = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/api`;
    const response = await fetch(`${base}/notion/import/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    assert.equal(response.status, 200);
    const preview = await response.json();
    assert.equal(preview.pages, 3);
    assert.equal(preview.documents[0].source, notionSource);
    const warning = preview.warnings.find((w: string) => w.includes("unknown_block_ids"));
    assert.ok(warning?.includes(notionRoot));
    assert.match(warning, /1 block\(s\).*content may be incomplete/);
    assert.equal(warning.includes("marked this response as truncated"), truncated);
    assert.equal((await app.locals.vault.list()).length, 0);
    const committed = await fetch(`${base}/import/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: preview.id }),
    });
    assert.equal(committed.status, 200);
    assert.equal((await app.locals.vault.get(preview.documents[0].id)).body, notionSource);
    const archiveDir = path.join(app.locals.vault.vaultPath, ".history/imports", preview.id);
    const manifest = JSON.parse(await fs.readFile(path.join(archiveDir, "manifest.json"), "utf8"));
    assert.ok(manifest.warnings.includes(warning));
    const archivedResponses = await Promise.all(manifest.originals
      .filter((file: { path: string }) => file.path.startsWith("api/"))
      .map(async (file: { archive: string }) => JSON.parse(await fs.readFile(path.join(archiveDir, file.archive), "utf8"))));
    const markdownResponse = archivedResponses.find(value => value.object === "page_markdown" && value.id === notionRoot);
    assert.deepEqual(markdownResponse.unknown_block_ids, [notionChild]);
    assert.equal(markdownResponse.truncated, truncated);
  }
});

test("truncation without unknown blocks, inaccessible pages, malformed and ambiguous-metadata responses never produce importable plans", async () => {
  for (const overrides of [
    { truncated: true },
    { markdown: null },
    { id: notionChild },
    { markdown: "---\ntitle: Wrong\n---\nBody" },
  ]) {
    const fixture = notionFixture();
    const mock: typeof fetch = async (input, init) => {
      const response = await fixture(input, init);
      return new URL(String(input)).pathname.endsWith("/markdown")
        ? Response.json({ ...(await response.json()), ...overrides })
        : response;
    };
    await assert.rejects(prepareNotionImport(request, { fetch: mock, wait }));
  }
  const unavailable: typeof fetch = async () =>
    Response.json({ message: request.token }, { status: 404 });
  await assert.rejects(
    prepareNotionImport(request, { fetch: unavailable, wait }),
    (error) =>
      error instanceof Error &&
      /Share the page/.test(error.message) &&
      !error.message.includes(request.token),
  );
  const invalid: typeof fetch = async () => new Response("not JSON");
  await assert.rejects(
    prepareNotionImport(request, { fetch: invalid, wait }),
    /invalid JSON/,
  );
});

test("rate limits retry bounded read requests, cancellation and request validation stop without writes", async () => {
  let count = 0;
  const waits: number[] = [];
  const fixture = notionFixture();
  const mock: typeof fetch = async (input, init) =>
    ++count === 1
      ? new Response(null, { status: 429, headers: { "Retry-After": "2" } })
      : fixture(input, init);
  await prepareNotionImport(
    { ...request, includeChildren: false },
    {
      fetch: mock,
      wait: async (ms) => {
        waits.push(ms);
      },
    },
  );
  assert.ok(waits.includes(2000));
  // Page + Markdown + one retry; known code languages add no requests.
  assert.equal(count, 3);
  count = 0;
  await assert.rejects(
    prepareNotionImport(request, {
      fetch: async () => {
        count++;
        return new Response(null, { status: 429 });
      },
      wait,
    }),
    /429/,
  );
  assert.equal(count, 3);
  const controller = new AbortController();
  controller.abort();
  count = 0;
  await assert.rejects(
    prepareNotionImport(request, {
      fetch: async () => {
        count++;
        throw new Error();
      },
      wait,
      signal: controller.signal,
    }),
  );
  assert.equal(count, 0);
  for (const value of [
    null,
    {},
    { ...request, token: "bad\nsecret" },
    { ...request, includeChildren: "yes" },
  ])
    await assert.rejects(
      prepareNotionImport(value, { fetch: notionFixture(), wait }),
    );
});

test("non-advancing pagination and oversized bodies fail closed", async () => {
  const fixture = notionFixture();
  await assert.rejects(
    prepareNotionImport(request, {
      fetch: async (input, init) =>
        String(input).includes("/children")
          ? Response.json({ results: [], has_more: true, next_cursor: "same" })
          : fixture(input, init),
      wait,
    }),
    /pagination/,
  );
  await assert.rejects(
    prepareNotionImport(request, {
      fetch: async () => new Response(Buffer.alloc(20 * 1024 * 1024 + 1)),
      wait,
    }),
    /20 MB/,
  );
});

test("HTTP preview is read-only, hides tokens and commit reuses exact archived snapshot", async (t) => {
  const app = createApp({
    vaultPath: await temporary(t),
    notionImportTransport: { fetch: notionFixture(), wait },
  });
  await app.locals.vault.init();
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    app.locals.closeRNotebook();
  });
  const base = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/api`;
  const response = await fetch(`${base}/notion/import/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const text = await response.text();
  assert.ok(!text.includes(request.token));
  const preview = JSON.parse(text);
  assert.equal(preview.documents[0].source, notionSource);
  assert.equal((await app.locals.vault.list()).length, 0);
  const committed = await fetch(`${base}/import/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: preview.id }),
  });
  assert.equal(committed.status, 200);
  assert.equal(
    (await app.locals.vault.get(preview.documents[0].id)).body,
    notionSource,
  );
});

test("HTTP previews resolve prior Notion imports without modifying them and exclude ambiguous or trashed targets", async t => {
  const calls: string[] = [], fixture = enrichmentFixture(calls);
  let denyLinkedTitle = false;
  const source = `<mention-page url="https://www.notion.so/${notionChild}">Mention</mention-page>\n\n${unknownTag(1)}\n`;
  const app = createApp({ vaultPath: await temporary(t), notionImportTransport: { wait, fetch: async (input, init) => {
    const response = await fixture(input, init);
    if (denyLinkedTitle && new URL(String(input)).pathname === `/v1/pages/${notionChild}`)
      return Response.json({ object: "error" }, { status: 404 });
    if (new URL(String(input)).pathname === `/v1/pages/${enrichmentRoot}/markdown`)
      return Response.json({ ...(await response.json()), markdown: source });
    return response;
  } } });
  await app.locals.vault.init();
  const vault = app.locals.vault;
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    app.locals.closeRNotebook();
  });
  const base = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/api`;
  const preview = async (pageId: string, variant = "notdown") => {
    const response = await fetch(`${base}/notion/import/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...request, pageId, variant, includeChildren: false }) });
    assert.equal(response.status, 200);
    return response.json();
  };
  const commit = async (id: string) => {
    const response = await fetch(`${base}/import/commit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    assert.equal(response.status, 200);
    return response.json();
  };
  const prior = await preview(notionChild);
  await commit(prior.id);
  const target = await vault.get(prior.documents[0].id);
  const edited = await vault.update(target.id, { title: "Renamed locally", body: "Local draft" }, target.revision);
  calls.length = 0;
  const root = await preview(enrichmentRoot);
  assert.equal(root.pages, 1);
  assert.ok(root.documents[0].source.includes(`<mention-page url="#page/${target.id}">Mention</mention-page>`));
  assert.ok(root.documents[0].source.includes(`<page-link future="keep" url="#page/${target.id}">`));
  assert.ok(!calls.some(call => call.includes(`/pages/${notionChild}/markdown`) || call.includes(`/blocks/${notionChild}/children`)));
  assert.deepEqual(await vault.get(target.id), edited);
  await commit(root.id);
  const repeat = await preview(enrichmentRoot);
  assert.equal(repeat.id, root.id);
  assert.equal((await commit(repeat.id)).alreadyImported, true);
  assert.deepEqual(await vault.get(target.id), edited);
  denyLinkedTitle = true;
  const unreadable = await preview(enrichmentRoot);
  assert.ok(unreadable.documents[0].source.includes(`<page-link future="keep" url="#page/${target.id}">Linked page</page-link>`));
  assert.ok(unreadable.warnings.some((w: string) => w.includes(notionChild) && w.includes("title unavailable")));
  denyLinkedTitle = false;
  const duplicate = await preview(notionChild, "notion-markdown");
  await commit(duplicate.id);
  const ambiguous = await preview(enrichmentRoot);
  assert.ok(ambiguous.documents[0].source.includes(`url="https://www.notion.so/${notionChild}"`));
  assert.ok(ambiguous.warnings.some((w: string) => w.includes(notionChild) && w.includes("multiple existing local copies")));
  const copy = await vault.get(duplicate.documents[0].id);
  await vault.update(copy.id, { trashed: true }, copy.revision);
  assert.equal((await preview(enrichmentRoot)).id, root.id);
  const folder = await vault.create({ title: "Trashed parent" });
  await vault.update(target.id, { parent: folder.id }, edited.revision);
  await vault.update(folder.id, { trashed: true }, folder.revision);
  const unavailable = await preview(enrichmentRoot);
  assert.ok(!unavailable.documents[0].source.includes(`#page/${target.id}`));
  assert.ok(unavailable.warnings.some((w: string) => w.includes(notionChild) && w.includes("not imported")));
});
