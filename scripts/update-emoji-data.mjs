import { readFile, writeFile } from "node:fs/promises";
import { parse } from "parse5";

// Regenerate with: node scripts/update-emoji-data.mjs [path/to/emoji-test.txt] [path/to/emoji-list.html]
// Source: Unicode Emoji 18.0, https://www.unicode.org/Public/18.0.0/emoji/emoji-test.txt
const source = "https://www.unicode.org/Public/18.0.0/emoji/emoji-test.txt";
const keywordsSource = "https://www.unicode.org/emoji/charts-18.0/emoji-list.html";
async function sourceText(url, localPath) {
  if (localPath) return readFile(localPath, "utf8");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch ${url}: ${response.status}`);
  return response.text();
}
const input = await sourceText(source, process.argv[2]);

const version = input.match(/^# Version: ([\d.]+)/m)?.[1];
if (version !== "18.0") throw new Error(`Expected Unicode Emoji 18.0, got ${version || "unknown"}`);

const groups = [];
let group;
for (const line of input.split(/\r?\n/)) {
  const heading = line.match(/^# group: (.+)$/);
  if (heading) {
    group = { name: heading[1], entries: [] };
    groups.push(group);
    continue;
  }
  const match = line.match(/^([0-9A-F ]+)\s*;\s*(fully-qualified|component)\s*#\s*\S+\s+E[\d.]+\s+(.+)$/);
  if (!match) continue;
  if (!group) throw new Error(`Emoji without a group: ${line}`);
  const icon = String.fromCodePoint(...match[1].trim().split(/\s+/).map(hex => Number.parseInt(hex, 16)));
  group.entries.push([icon, match[3]]);
}

const count = groups.reduce((total, entry) => total + entry.entries.length, 0);
if (count < 3900) throw new Error(`Only parsed ${count} emoji; check the upstream format`);

// The emoji-test file has CLDR short names, but no search keywords. The
// versioned Emoji List has the CLDR "Other Keywords" column without skin
// tones; a toned sequence uses its unmodified counterpart's keywords.
const chart = await sourceText(keywordsSource, process.argv[3]);
if (!chart.includes("Emoji List, v18.0") || !chart.includes("Other Keywords")) {
  throw new Error("Expected the Unicode Emoji 18.0 keyword chart");
}
const skinTones = /[\u{1F3FB}-\u{1F3FF}]/gu;
const normalize = icon => icon.replace(/\uFE0F/g, "").replace(skinTones, "") || icon;
const chartKeywords = new Map();
const chartNames = new Map();
const textContent = node => node.nodeName === "#text"
  ? node.value
  : (node.childNodes ?? []).map(textContent).join("");
const visit = node => {
  if (node.tagName === "tr") {
    const cells = (node.childNodes ?? []).filter(child => child.tagName === "td");
    if (cells.length === 5) {
      const code = textContent(cells[1]);
      const points = [...code.matchAll(/U\+([0-9A-F]{4,6})/g)];
      if (points.length && code.trim().startsWith("U+")) {
        const icon = String.fromCodePoint(...points.map(([, hex]) => Number.parseInt(hex, 16)));
        const terms = textContent(cells[4]).split("|").map(term => term.trim()).filter(Boolean);
        if (terms.length) {
          chartKeywords.set(normalize(icon), terms);
          chartNames.set(textContent(cells[3]).trim(), terms);
        }
      }
    }
  }
  for (const child of node.childNodes ?? []) visit(child);
};
visit(parse(chart));
const keywords = {};
for (const group of groups) for (const [icon, name] of group.entries) {
  const key = normalize(icon);
  const terms = chartKeywords.get(key) ?? chartNames.get(name) ?? chartNames.get(name.split(":")[0]);
  if (terms) keywords[key] = terms;
}
const indexed = groups.flatMap(group => group.entries).filter(([icon]) => keywords[normalize(icon)]).length;
if (indexed < 3900) {
  const missing = groups.map(group => [group.name, group.entries.filter(([icon]) =>
    !keywords[normalize(icon)]).slice(0, 12)]);
  throw new Error(`Only indexed keywords for ${indexed} emoji; examples: ${JSON.stringify(missing)}`);
}
const data = {
  version,
  source,
  keywordsSource,
  notice: "© 2026 Unicode, Inc. See https://www.unicode.org/terms_of_use.html",
  groups,
  keywords,
};
await writeFile(new URL("../src/blocks/emoji-data.json", import.meta.url), JSON.stringify(data) + "\n");
process.stdout.write(`Wrote ${count} emoji across ${groups.length} groups; ${indexed} have CLDR search keywords.\n`);
