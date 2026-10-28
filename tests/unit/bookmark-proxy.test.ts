import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { bookmarkPageReader, bookmarks } from "../../server/bookmarks";

async function proxy(handler: (req: IncomingMessage, res: ServerResponse) => void) {
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    server, route: `PROXY 127.0.0.1:${address.port}`,
    close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
const lookupHost = async () => ["93.184.216.34"];

test("system proxy receives a pinned public destination and original Host across redirects", async () => {
  const requests: { url: string | undefined; host: string | undefined; cookie: string | undefined }[] = [];
  const urls: string[] = [];
  const p = await proxy((req, res) => {
    requests.push({ url: req.url, host: req.headers.host, cookie: req.headers.cookie });
    if (requests.length === 1) { res.writeHead(302, { Location: "/target", "Set-Cookie": "session=not-forwarded" }); res.end(); }
    else { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end('<title>代理预览</title><meta property="og:image" content="/cover.png">'); }
  });
  try {
    const service = bookmarks(bookmarkPageReader({ lookupHost, resolveProxy: async url => { urls.push(url); return p.route; } }));
    const data = await service.resolve({ url: "http://example.test/start#local-anchor" });
    assert.equal(data.title, "代理预览");
    assert.equal(data.image, "http://example.test/cover.png");
    assert.deepEqual(urls, ["http://example.test/start#local-anchor", "http://example.test/target"]);
    assert.deepEqual(requests, [
      { url: "http://93.184.216.34/start", host: "example.test", cookie: undefined },
      { url: "http://93.184.216.34/target", host: "example.test", cookie: undefined },
    ]);
  } finally { await p.close(); }
});

test("HTTPS proxy tunneling uses the checked IP instead of asking the proxy to resolve a hostname", async () => {
  const p = await proxy((_req, res) => { res.writeHead(500); res.end(); });
  const targets: string[] = [];
  p.server.on("connect", (req, socket) => {
    targets.push(req.url!);
    socket.end("HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n");
  });
  try {
    await assert.rejects(bookmarks(bookmarkPageReader({ lookupHost, resolveProxy: async () => p.route })).resolve({ url: "https://example.test/page" }), /Could not load/);
    assert.deepEqual(targets, ["93.184.216.34:443"]);
  } finally { await p.close(); }
});

test("proxy cannot reach private, mixed DNS, or nonstandard-port destinations", async () => {
  let proxyCalls = 0;
  const resolveProxy = async () => { proxyCalls++; return "PROXY 127.0.0.1:1"; };
  for (const url of ["http://127.0.0.1", "https://[::1]", "http://169.254.169.254", "https://example.test:8443"]) {
    await assert.rejects(bookmarks(bookmarkPageReader({ lookupHost, resolveProxy })).resolve({ url }), /Could not load/);
  }
  await assert.rejects(bookmarks(bookmarkPageReader({ lookupHost: async () => ["93.184.216.34", "10.0.0.1"], resolveProxy })).resolve({ url: "http://example.test" }), /Could not load/);
  assert.equal(proxyCalls, 0);
});

test("redirect to a private host is blocked before making another proxy request", async () => {
  let requests = 0;
  const p = await proxy((_req, res) => { requests++; res.writeHead(302, { Location: "http://127.0.0.1/private" }); res.end(); });
  try {
    await assert.rejects(bookmarks(bookmarkPageReader({ lookupHost, resolveProxy: async () => p.route })).resolve({ url: "http://example.test" }), /Could not load/);
    assert.equal(requests, 1);
  } finally { await p.close(); }
});

test("PAC proxy fallback and proxy changes are applied to each new request", async () => {
  const first = await proxy((_req, res) => { res.writeHead(502); res.end(); });
  const second = await proxy((_req, res) => { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<title>Fallback proxy</title>"); });
  let route = `${first.route}; ${second.route}`;
  const service = bookmarks(bookmarkPageReader({ lookupHost, resolveProxy: async () => route }));
  try {
    assert.equal((await service.resolve({ url: "http://example.test" })).title, "Fallback proxy");
    route = first.route;
    await assert.rejects(service.resolve({ url: "http://example.test" }), /Could not load/);
    route = "SOCKS5 127.0.0.1:1";
    await assert.rejects(service.resolve({ url: "http://example.test" }), /Could not load/);
  } finally { await first.close(); await second.close(); }
});

test("proxied response size and abort limits close the connection", async () => {
  const p = await proxy((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    if (req.url?.endsWith("/large")) res.end("x".repeat(2_000_001));
    else res.write("<title>Stalled");
  });
  const read = bookmarkPageReader({ lookupHost, resolveProxy: async () => p.route });
  try {
    await assert.rejects(read(new URL("http://example.test/large"), AbortSignal.timeout(2000)), /too large/);
    await assert.rejects(read(new URL("http://example.test/stalled"), AbortSignal.timeout(100)), /aborted/);
  } finally { await p.close(); }
});
