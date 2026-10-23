import http from "node:http";
import type { AddressInfo } from "node:net";
import { hashBytes } from "../../src/vault/crypto";

export const davCredentials = { email: "notdown@example.invalid", password: "test-application-password" };
export async function createWebDavFixture() {
  const files = new Map<string, Buffer>(), directories = new Set(["/dav/"]);
  const requests: { method: string; path: string; ifMatch?: string }[] = [];
  const flags = { ignoreIfMatch: false, ignoreIfNoneMatch: true, dropHeadResponse: false, unauthorized: false, throttle: false, weakEtag: false };
  const authorization = "Basic " + Buffer.from(`${davCredentials.email}:${davCredentials.password}`).toString("base64");
  const server = http.createServer(async (req, res) => {
    const path = new URL(req.url!, "http://localhost").pathname, method = req.method!;
    requests.push({ method, path, ifMatch: req.headers["if-match"] as string | undefined });
    res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,PUT,DELETE,OPTIONS,PROPFIND,MKCOL");
    res.setHeader("Access-Control-Allow-Headers", "authorization,content-type,depth,if-match,if-none-match,cache-control"); res.setHeader("Access-Control-Expose-Headers", "etag,content-length,retry-after");
    if (method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    if (flags.unauthorized || req.headers.authorization !== authorization) { res.writeHead(401); res.end(); return; }
    if (flags.throttle) { res.writeHead(429, { "Retry-After": "120" }); res.end(); return; }
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk)); const body = Buffer.concat(chunks);
    const current = files.get(path), etag = current ? `"${hashBytes(current)}"` : undefined;
    if (method === "MKCOL") {
      if (directories.has(path) || files.has(path)) { res.writeHead(405); res.end(); return; }
      const parent = path.replace(/[^/]+\/$/, "");
      if (!directories.has(parent)) { res.writeHead(409); res.end(); return; }
      directories.add(path); res.writeHead(201); res.end(); return;
    }
    if (method === "PROPFIND") {
      if (req.headers.depth !== "0") { res.writeHead(400); res.end("The adapter must not enumerate the entire disk"); return; }
      if (!directories.has(path)) { res.writeHead(404); res.end(); return; }
      res.writeHead(207, { "Content-Type": "application/xml" }); res.end('<d:multistatus xmlns:d="DAV:"><d:response><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>'); return;
    }
    if (method === "PUT") {
      if (!directories.has(path.slice(0, path.lastIndexOf("/") + 1))) { res.writeHead(409); res.end(); return; }
      if (!flags.ignoreIfMatch && req.headers["if-match"] && req.headers["if-match"] !== etag || !flags.ignoreIfNoneMatch && req.headers["if-none-match"] === "*" && current) {
        res.writeHead(412); res.end(); return;
      }
      files.set(path, body);
      if (flags.dropHeadResponse && path.endsWith("/head.json") && current) { flags.dropHeadResponse = false; req.socket.destroy(); return; }
      res.writeHead(current ? 204 : 201, { ETag: `"${hashBytes(body)}"` }); res.end(); return;
    }
    if (method === "GET" || method === "HEAD") {
      if (!current) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { ETag: (flags.weakEtag ? "W/" : "") + etag, "Content-Length": current.length, "Content-Type": path.endsWith(".json") ? "application/json" : "application/octet-stream" });
      res.end(method === "HEAD" ? undefined : current); return;
    }
    if (method === "DELETE") {
      if (!current && !directories.has(path)) { res.writeHead(404); res.end(); return; }
      files.delete(path); for (const key of files.keys()) if (key.startsWith(path)) files.delete(key);
      directories.delete(path); for (const key of directories) if (key.startsWith(path)) directories.delete(key);
      res.writeHead(204); res.end(); return;
    }
    res.writeHead(405); res.end();
  });
  server.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/dav/`, files, directories, requests, flags,
    close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}
