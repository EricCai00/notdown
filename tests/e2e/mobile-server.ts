import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
const root = path.resolve(".run/android-frontend");
const types: Record<string, string> = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf" };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url!, "http://localhost").pathname);
    if (pathname.startsWith("/api/")) { res.writeHead(501, { "Content-Type": "application/json" }); res.end('{"error":"Desktop-only service is unavailable in the mobile preview"}'); return; }
    const file = path.resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    const data = await fs.readFile(file);
    res.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
server.listen(Number(process.env.NOTDOWN_MOBILE_E2E_PORT || 4347), "127.0.0.1");
process.on("SIGTERM", () => server.close(() => process.exit()));
