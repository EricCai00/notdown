import MarkdownIt from "markdown-it";
import { openingTag, decodeXml, attributesXml } from "../src/document/notion-syntax.js";
import type { createVault } from "./vault.js";

type Vault = ReturnType<typeof createVault>;
export interface HtmlEmbedReplacement {
  start: number;
  end: number;
  html: string;
  attributes: Record<string, string>;
}

/** Migration-only reader. Markdown's tokenizer protects fences, indented code and raw HTML. */
export function findHtmlEmbeds(source: string): HtmlEmbedReplacement[] {
  const replacements: HtmlEmbedReplacement[] = [];
  const lines = source.split(/\r\n|\n|\r/);
  const offsets = [0];
  for (const match of source.matchAll(/\r\n|\n|\r/g)) offsets.push(match.index! + match[0].length);
  const md = new MarkdownIt({ html: true });
  md.block.ruler.before("hr", "migration_metadata", (state, start, end, silent) => {
    if (start !== 0 || !/^(?:\uFEFF)?---[\t ]*$/.test(lines[0])) return false;
    const close = lines.findIndex((line, index) => index > 0 && /^(?:---|\.\.\.)[\t ]*$/.test(line));
    if (close < 0) return false;
    if (!silent) state.line = close + 1;
    return true;
  });
  md.block.ruler.before("html_block", "migrate_html_embed", (state, start, end, silent) => {
    if (state.sCount[start] - state.blkIndent >= 4) return false;
    const first = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]);
    const tag = openingTag(first);
    if (tag?.tag !== "html-embed") return false;
    let last = start, body = "";
    if (tag.selfClosing) {
      if (first.slice(tag.length).trim()) throw new Error(`Ambiguous html-embed at line ${start + 1}`);
    } else {
      const after = first.slice(tag.length), close = "</html-embed>";
      if (after.endsWith(close)) body = after.slice(0, -close.length);
      else {
        const content = [after];
        for (last = start + 1; last < end; last++) {
          const line = state.src.slice(state.bMarks[last] + state.tShift[last], state.eMarks[last]);
          if (line.trimEnd() === close) break;
          content.push(state.src.slice(state.bMarks[last] + state.blkIndent, state.eMarks[last]));
        }
        if (last === end) throw new Error(`Unclosed html-embed at line ${start + 1}`);
        body = content.filter((value, index) => index || value).join("\n");
      }
    }
    if (silent) return true;
    // The retired writer added one framing newline on each side of its payload.
    // Its reader retained the final payload newline but removed the initial framing newline.
    const html = decodeXml(body || tag.attrs.html || "");
    replacements.push({ start: offsets[start] + lines[start].indexOf("<html-embed"), end: offsets[last] + lines[last].trimEnd().length, html, attributes: tag.attrs });
    state.line = last + 1;
    return true;
  }, { alt: ["paragraph", "reference", "blockquote", "list"] });
  md.parse(source, {});
  return replacements;
}

export async function planHtmlEmbedMigration(vault: Vault) {
  const pages = await vault.list({ includeTrashed: true });
  return pages.flatMap(page => {
    const replacements = findHtmlEmbeds(page.body);
    return replacements.length ? [{ id: page.id, baseRevision: page.revision, body: page.body, replacements }] : [];
  });
}

export async function migrateHtmlEmbeds(vault: Vault, plan: Awaited<ReturnType<typeof planHtmlEmbedMigration>>) {
  const migrated: string[] = [], assets: string[] = [];
  for (const page of plan) {
    let body = page.body;
    for (const item of [...page.replacements].reverse()) {
      const attrs = { ...item.attributes };
      delete attrs.html;
      if (Object.hasOwn(attrs, "url")) {
        let key = "data-html-embed-url";
        while (Object.hasOwn(attrs, key)) key += "-original";
        attrs[key] = attrs.url;
        delete attrs.url;
      }
      if (item.html) {
        const asset = await vault.uploadAsset("embedded.html", "text/html", Buffer.from(item.html).toString("base64"));
        assets.push(asset.path); attrs.url = asset.path;
      }
      body = body.slice(0, item.start) + `<web-embed${attributesXml(attrs)}/>` + body.slice(item.end);
    }
    // createVault snapshots the original and retains both versions on a CAS conflict.
    // Never retry with a newer revision: a concurrent edit must stop the migration.
    await vault.update(page.id, { body }, page.baseRevision);
    migrated.push(page.id);
  }
  return { migrated, assets };
}
