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
    calls.filter((p) => p === `/v1/pages/${notionSibling}/markdown`).length,
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
  assert.deepEqual(new Set(saved.pageEntryEvidence?.childTargets), new Set(plan.pages.slice(1).map(p => p.id)));
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

test("single-page import skips hierarchy requests and identical snapshots have stable identities", async () => {
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
  assert.ok(calls.every((p) => p.startsWith("/v1/pages/")));
});

test("truncated, inaccessible, malformed and ambiguous-metadata responses never produce importable plans", async () => {
  for (const overrides of [
    { truncated: true },
    { unknown_block_ids: [notionChild] },
    { markdown: null },
    { id: notionChild },
    { markdown: "---\ntitle: Wrong\n---\nBody" },
  ]) {
    const fixture = notionFixture();
    const mock: typeof fetch = async (input, init) => {
      const response = await fixture(input, init);
      return String(input).endsWith("/markdown")
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
