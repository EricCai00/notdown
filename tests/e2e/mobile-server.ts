import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createWebDavFixture, davCredentials } from "../unit/webdav-fixture";
import { createWebDavClient } from "../../src/sync/webdav";
import { hashBytes } from "../../src/vault/crypto";
const dav = await createWebDavFixture();
const root = path.resolve(process.env.NOTDOWN_MOBILE_E2E_FRONTEND_DIR || ".run/android-frontend");
const types: Record<string, string> = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf" };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url!, "http://localhost").pathname);
    if (pathname === "/__mobile-test/notebook" && req.method === "POST") {
      const folder = `Notdown/${randomUUID()}`;
      const client = createWebDavClient({ provider: "webdav", url: dav.url, folder,
        username: davCredentials.email, password: davCredentials.password, enabled: false }, async () => {});
      await client.createVault(randomUUID(), "Computer notebook");
      let delayedChunk: string | undefined;
      if (new URL(req.url!, "http://localhost").searchParams.has("databases")) {
        const parent = randomUUID(), inline = randomUUID(), full = randomUUID(), source = randomUUID(), fullSource = randomUUID(), view = randomUUID(), fullView = randomUUID(), row = randomUUID(), note = randomUUID();
        const body = `Before imported databases\n\n<database future="preserve" url="#page/${inline}" inline="true">Imported inline</database>\n\n<database url="#page/${full}" inline="false">Imported full</database>\n\nAfter imported databases\n`;
        const syntax = { version: 1, variant: "notdown", notionVersion: "v2", extensions: {} };
        const entries = [
          { id: parent, title: "Desktop database parent", parent: null, body, futurePage: { keep: true } },
          { id: inline, title: "Imported inline", parent, databaseId: inline, body: "" },
          { id: full, title: "Imported full", parent, databaseId: full, body: "" },
          { id: row, title: "Imported row", parent: inline, dataSourceId: source, properties: { [note]: "Imported value" }, body: "Record body from desktop\n" },
        ];
        const title = { id: "title", key: "title", name: "Name", type: "title" };
        const resources = [
          ["databases", inline, { id: inline, title: "Imported inline", pageId: inline, parent, dataSourceIds: [source], viewIds: [view], futureDatabase: { keep: true } }],
          ["databases", full, { id: full, title: "Imported full", pageId: full, parent, dataSourceIds: [fullSource], viewIds: [fullView] }],
          ["dataSources", source, { id: source, title: "Imported inline", ownerDatabaseId: inline, properties: [title, { id: note, key: note, name: "Note", type: "text" }] }],
          ["dataSources", fullSource, { id: fullSource, title: "Imported full", ownerDatabaseId: full, properties: [title] }],
          ["views", view, { id: view, databaseId: inline, dataSourceId: source, name: "Table", type: "table", propertyIds: ["title", note] }],
          ["views", fullView, { id: fullView, databaseId: full, dataSourceId: fullSource, name: "Table", type: "table" }],
        ] as const;
        await client.remote.push({ id: randomUUID(), mutations: [
          ...entries.map(({ body, ...metadata }) => ({ expectedVersion: 0, item: { key: `page:${metadata.id}`, kind: "page" as const,
            value: { file: `${metadata.id}.md`, source: body, metadata: { ...metadata, bodyFormat: "notion-markdown", syntax } } } })),
          ...resources.map(([group, id, data]) => ({ expectedVersion: 0, item: { key: `metadata:${group}/${id}`, kind: "metadata" as const, value: { data } } })),
        ] });
      }
      if (new URL(req.url!, "http://localhost").searchParams.has("v2")) {
        const id = randomUUID();
        await client.remote.push({ id: randomUUID(), mutations: [{ expectedVersion: 0, item: {
          key: `page:${id}`, kind: "page", value: { file: `${id}.md`,
            source: '<h2>Heading</h2>\n\n<ul><li>First</li><li>Second</li></ul>\n\n<p>Style me</p>\n',
            metadata: { id, title: "V2 formatting", bodyFormat: "notion-markdown", syntax: { version: 1, variant: "notdown", notionVersion: "v2", extensions: {} } },
          },
        } }] });
      }
      if (new URL(req.url!, "http://localhost").searchParams.has("tree")) {
        const root = randomUUID(), child = randomUUID();
        const entries = [
          { id: randomUUID(), title: "Z last root", parent: null, sidebarOrder: "8" },
          { id: randomUUID(), title: "Second child", parent: root, sidebarOrder: "7" },
          { id: randomUUID(), title: "Grandchild", parent: child, sidebarOrder: "4" },
          { id: root, title: "A first root", parent: null, sidebarOrder: "2" },
          { id: child, title: "First child", parent: root, sidebarOrder: "3" },
        ];
        await client.remote.push({ id: randomUUID(), mutations: entries.map(metadata => ({ expectedVersion: 0,
          item: { key: `page:${metadata.id}`, kind: "page" as const, value: { file: `${metadata.id}.md`, source: `${metadata.title} content\n`, metadata } },
        })) });
      }
      if (new URL(req.url!, "http://localhost").searchParams.has("progress")) {
        const bytes = Buffer.alloc(2 * 1024 * 1024 + 37); for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
        const hash = hashBytes(bytes); await client.remote.upload(hash, bytes);
        delayedChunk = hashBytes(bytes.subarray(1024 * 1024, 2 * 1024 * 1024));
        const id = randomUUID(), secondId = randomUUID();
        await client.remote.push({ id: randomUUID(), mutations: [
          { expectedVersion: 0, item: { key: `page:${id}`, kind: "page", value: { file: `${id}.md`, source: "Progress test note\n", metadata: { id, title: "Progress test" } } } },
          { expectedVersion: 0, item: { key: `page:${secondId}`, kind: "page", value: { file: `${secondId}.md`, source: "Progress test note 2\n", metadata: { id: secondId, title: "Progress test 2" } } } },
          { expectedVersion: 0, item: { key: "asset:assets/progress.bin", kind: "asset", value: { hash, size: bytes.length } } },
        ] });
      }
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ url: dav.url, folder, delayedChunk, ...davCredentials })); return;
    }
    if (pathname.startsWith("/api/")) { res.writeHead(501, { "Content-Type": "application/json" }); res.end('{"error":"Desktop-only service is unavailable in the mobile preview"}'); return; }
    const file = path.resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    const data = await fs.readFile(file);
    res.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
server.listen(Number(process.env.NOTDOWN_MOBILE_E2E_PORT || 4347), "127.0.0.1");
process.on("SIGTERM", () => server.close(() => { void dav.close().then(() => process.exit()); }));
