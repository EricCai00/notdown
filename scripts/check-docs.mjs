import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const normalize = value => value.replaceAll("\\", "/");
const relative = filename => normalize(path.relative(root, filename));
const chinesePath = filename => filename.replace(/\.md$/, ".zh-CN.md");
const proseDocument = filename => filename.startsWith("docs/") && filename.endsWith(".md") && !/\.(?:en|zh-CN)\.md$/.test(filename) &&
  (!filename.startsWith("docs/fixtures/") || /(?:^|\/)README\.md$|UPSTREAM-LICENSE\.md$/.test(filename));
const text = node => node.type === "image" ? node.alt ?? "" : node.type === "html" ? "" : node.value ?? (node.children ?? []).map(text).join("");
export const slug = value => value.toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "").replace(/\s/g, "-");
const files = fs.readdirSync(path.join(root, "docs"), { recursive: true }).filter(name => name.endsWith(".md")).map(name => `docs/${normalize(name)}`);
const originals = files.filter(proseDocument);
const paired = new Map(originals.map(name => [name, chinesePath(name)]));
paired.set("AGENTS.md", "AGENTS.zh-CN.md");
paired.set("README.md", "README.zh-CN.md");
const reverse = new Map([...paired].map(([en, zh]) => [zh, en]));
const checked = [...new Set(["README.md", "README.zh-CN.md", "AGENTS.md", "AGENTS.zh-CN.md", ...files.filter(name => proseDocument(name) || reverse.has(name))])];
const parsed = new Map(), failures = [];
const fail = (file, message) => failures.push(`${file}: ${message}`);
for (const [en, zh] of paired) if (!fs.existsSync(path.join(root, zh))) fail(en, `missing Chinese counterpart ${zh}`);
for (const file of files.filter(name => name.endsWith('.zh-CN.md'))) {
  const english = file.replace(/\.zh-CN\.md$/, '.md');
  if (!fs.existsSync(path.join(root, english))) fail(file, `missing English source ${english}`);
}
function parse(file) {
  if (parsed.has(file)) return parsed.get(file);
  const source = fs.readFileSync(path.join(root, file), "utf8"), tree = fromMarkdown(source, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  const anchors = new Set(), links = [], definitions = new Map(), references = [];
  function walk(node) {
    if (node.type === "heading") {
      const base = slug(text(node)); let id = base, n = 0;
      while (anchors.has(id)) id = `${base}-${++n}`;
      anchors.add(id);
    }
    if (node.type === "link" || node.type === "image") links.push({ url: node.url, label: text(node), line: node.position.start.line });
    if (node.type === "definition") definitions.set(node.identifier.toLowerCase(), node.url);
    if (node.type === "linkReference" || node.type === "imageReference") references.push(node);
    if (node.type === "html") {
      for (const match of node.value.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) anchors.add(match[1]);
      for (const match of node.value.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)) links.push({ url: match[1], label: node.value.slice(match.index).match(/^[^>]*>([^<]*)/)?.[1] ?? "", line: node.position.start.line });
    }
    for (const child of node.children ?? []) walk(child);
  }
  walk(tree);
  for (const node of references) { const url = definitions.get(node.identifier.toLowerCase()); if (url) links.push({ url, label: text(node), line: node.position.start.line }); }
  const result = { source, tree, anchors, links }; parsed.set(file, result); return result;
}
let linkCount = 0;
for (const file of checked) {
  if (!fs.existsSync(path.join(root, file))) continue;
  const isEnglish = paired.has(file);
  if (isEnglish) {
    const heading = parse(file).tree.children.find(node => node.type === "heading" && node.depth === 1);
    if (heading && /\p{Script=Han}/u.test(text(heading))) fail(file, "the canonical document title must be English");
  }
  for (const link of parse(file).links) {
    if (/^(?:[\w+.-]+:|\/\/)/.test(link.url)) continue;
    linkCount++;
    let url;
    try { url = decodeURIComponent(link.url); } catch { fail(file, `line ${link.line}: invalid encoded URL ${link.url}`); continue; }
    const [pathname, fragment] = url.split("#"), target = pathname ? relative(path.resolve(root, path.dirname(file), pathname.split("?")[0])) : file;
    if (!fs.existsSync(path.join(root, target))) { fail(file, `line ${link.line}: missing target ${link.url}`); continue; }
    if (fragment && target.endsWith(".md") && !parse(target).anchors.has(fragment)) fail(file, `line ${link.line}: missing anchor ${link.url}`);
    if (isEnglish && reverse.has(target) && link.label !== "简体中文") fail(file, `line ${link.line}: English navigation points to Chinese document ${link.url}`);
    if (!isEnglish && paired.has(target) && link.label !== "English") fail(file, `line ${link.line}: Chinese navigation points to English document ${link.url}`);
  }
  if (paired.has(file) && !parse(file).links.some(link => link.url === path.basename(paired.get(file)) && link.label === "简体中文")) fail(file, "missing Chinese language switch");
  if (reverse.has(file) && !parse(file).links.some(link => link.url === path.basename(reverse.get(file)) && link.label === "English")) fail(file, "missing English language switch");
}
for (const [en, zh] of paired) {
  if (!fs.existsSync(path.join(root, en)) || !fs.existsSync(path.join(root, zh))) continue;
  const code = tree => {
    const result = [];
    function walk(node) {
      if (node.type === "code") result.push(["code", node.lang, node.meta, node.value]);
      if (node.type === "inlineCode") result.push(["inlineCode", node.value]);
      for (const child of node.children ?? []) walk(child);
    }
    walk(tree); return JSON.stringify(result);
  };
  if (en.startsWith("docs/") && code(parse(en).tree) !== code(parse(zh).tree)) fail(en, "code examples or inline identifiers differ from the Chinese counterpart");
}
console.log(`${paired.size} bilingual document pairs; ${checked.length} documents; ${linkCount} local links checked.`);
if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1; }
else console.log("Documentation language routing, local targets, anchors and language switches are valid.");
