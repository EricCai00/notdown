// Convert a Notion "Markdown & CSV" export into a Notdown vault (pages, hierarchy, assets).
// Usage: node --import tsx scripts/notion-export-vault.ts <export-dir-or-zip> <vault-dir> [--apply]
// Dry run by default: prints what would be written. --apply writes pages/, assets/ and metadata.json.
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { stablePageUuid } from "../server/page-id.js";

const ID_SUFFIX =
  /\s+([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const SKIP_EXT = new Set([".md", ".markdown", ".csv"]);

type PageRow = {
  id: string;
  abs: string;
  rel: string;
  title: string;
  parent: string | null;
  source: string;
};

const args = process.argv.slice(2);
const positional = args.filter(arg => !arg.startsWith("--"));
const apply = args.includes("--apply");
if (positional.length !== 2)
  throw new Error(
    "Usage: node --import tsx scripts/notion-export-vault.ts <export-dir-or-zip> <vault-dir> [--apply]",
  );

const inputPath = path.resolve(positional[0]);
const vaultPath = path.resolve(positional[1]);

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const shortHash = (value: Buffer) => createHash("sha1").update(value).digest("hex").slice(0, 16);

// Notion appends the object id to exported names: "Page Name 0123abcd...". Keep the readable part.
function stripId(name: string) {
  const stripped = name.replace(ID_SUFFIX, "").trim();
  return stripped || name;
}

function pageIdFor(rel: string) {
  return stablePageUuid(`notion-export/${rel}`);
}

async function resolveExportRoot() {
  if (!existsSync(inputPath)) throw new Error(`Export not found: ${inputPath}`);
  const stat = await fs.stat(inputPath);
  if (stat.isDirectory()) return inputPath;
  if (!inputPath.toLowerCase().endsWith(".zip")) throw new Error("Expected a folder or a .zip export.");
  const target = path.join(os.tmpdir(), `notion-export-${Date.now()}`);
  await fs.mkdir(target, { recursive: true });
  if (process.platform === "win32")
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${inputPath}' -DestinationPath '${target}' -Force`]);
  else execFileSync("unzip", ["-q", "-o", inputPath, "-d", target]);
  const entries = await fs.readdir(target, { withFileTypes: true });
  const only = entries.filter(entry => !entry.name.startsWith("."));
  // Some exports wrap everything in one top folder.
  if (only.length === 1 && only[0].isDirectory()) return path.join(target, only[0].name);
  return target;
}

const root = await resolveExportRoot();
const pages: PageRow[] = [];
const assets: Array<{ from: string; name: string }> = [];
const csvFiles: string[] = [];
const visited = new Set<string>();

async function list(dir: string) {
  return (await fs.readdir(dir, { withFileTypes: true })).filter(entry => !entry.name.startsWith("."));
}

async function walk(dir: string, parentId: string | null) {
  if (visited.has(dir)) return;
  visited.add(dir);
  const entries = await list(dir);
  const markdown = entries.filter(
    entry => entry.isFile() && /\.(md|markdown)$/i.test(entry.name),
  );
  const folders = entries.filter(entry => entry.isDirectory());

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (SKIP_EXT.has(ext)) continue;
    const abs = path.join(dir, entry.name);
    const bytes = await fs.readFile(abs);
    assets.push({ from: abs, name: `${shortHash(bytes)}${ext || ".bin"}` });
  }

  for (const entry of markdown) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(root, abs).replace(/\\/g, "/");
    const source = await fs.readFile(abs, "utf8");
    pages.push({
      id: pageIdFor(rel),
      abs,
      rel,
      title: stripId(entry.name.replace(/\.(md|markdown)$/i, "")),
      parent: parentId,
      source,
    });
  }

  for (const folder of folders) {
    const key = stripId(folder.name);
    const owner = pages.find(
      page =>
        path.dirname(page.abs) === dir &&
        stripId(path.basename(page.abs).replace(/\.(md|markdown)$/i, "")) === key,
    );
    await walk(path.join(dir, folder.name), owner ? owner.id : parentId);
  }

  for (const entry of entries)
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
      csvFiles.push(path.relative(root, path.join(dir, entry.name)).replace(/\\/g, "/"));
}

await walk(root, null);

const assetByName = new Map<string, string>();
for (const asset of assets) assetByName.set(asset.from, `assets/${asset.name}`);
const pageByAbs = new Map(pages.map(page => [page.abs, page]));

let unresolvedLinks = 0;
for (const page of pages) {
  const dir = path.dirname(page.abs);
  page.source = page.source.replace(
    /(!?\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g,
    (match, head: string, target: string, tail: string) => {
      if (/^(?:[a-z]+:|\/\/|#|mailto:)/i.test(target)) return match;
      const [rawPath, anchor] = target.split("#");
      if (!rawPath) return match;
      let decoded = rawPath;
      try {
        decoded = decodeURIComponent(rawPath);
      } catch {
        /* keep the raw target */
      }
      const abs = path.resolve(dir, decoded.replace(/\\/g, "/"));
      const asset = assetByName.get(abs);
      if (asset) return `${head}${asset}${anchor ? `#${anchor}` : ""}${tail}`;
      const linked = pageByAbs.get(abs);
      if (linked) return `${head}#page/${linked.id}${tail}`;
      unresolvedLinks += 1;
      return match;
    },
  );
}

const report = {
  exportRoot: root,
  pages: pages.length,
  assets: assets.length,
  databases: csvFiles.length,
  unresolvedLinks,
  topLevel: pages.filter(page => page.parent === null).map(page => page.title),
  csv: csvFiles.slice(0, 20),
};

if (!apply) {
  console.log(JSON.stringify({ applied: false, plan: report }, null, 2));
  process.exit(0);
}

await fs.mkdir(path.join(vaultPath, "pages"), { recursive: true });
await fs.mkdir(path.join(vaultPath, "assets"), { recursive: true });
await fs.mkdir(path.join(vaultPath, "people"), { recursive: true });

for (const asset of assets) {
  const target = path.join(vaultPath, "assets", asset.name);
  if (!existsSync(target)) await fs.copyFile(asset.from, target);
}

const metadata: Record<string, any> = {
  version: 1,
  pages: {},
  databases: {},
  dataSources: {},
  views: {},
};

for (const page of pages) {
  const file = `${page.id}.md`;
  await fs.writeFile(path.join(vaultPath, "pages", file), page.source, "utf8");
  metadata.pages[page.id] = {
    title: page.title,
    parent: page.parent,
    icon: "file-text",
    properties: {},
    bodyFormat: "notion-markdown",
    id: page.id,
    updated: new Date().toISOString(),
    syntax: { version: 1, variant: "notdown", extensions: {} },
    file,
    sourceHash: hash(page.source),
    notionExport: { path: page.rel, batchId: randomUUID() },
  };
}

await fs.writeFile(
  path.join(vaultPath, "metadata.json"),
  `${JSON.stringify(metadata, null, 2)}\n`,
  "utf8",
);

console.log(JSON.stringify({ applied: true, vault: vaultPath, ...report }, null, 2));
