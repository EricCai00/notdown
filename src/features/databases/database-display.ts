import { parseNative } from "../../markdown-engine/codec";
import { defaultSyntax, enabled, usesNotionSyntax } from "../../markdown-engine/config";
import { editorKind } from "../../document/node-identity";
import { escapeXml, localPageTarget, openingTag } from "../../document/notion-syntax";
import type { Page } from "../../shared/types";

/** Change the parent's existing entry, retaining the database identity and every unrelated block. */
export function databaseDisplaySource(parent: Pick<Page, "body" | "syntax" | "bodyFormat">, id: string, inline: boolean) {
  const config = parent.syntax ?? defaultSyntax(parent.bodyFormat ?? "markdown");
  if (!usesNotionSyntax(config) || !enabled(config, "notion_databases")) throw new Error("This page format does not support inline databases. Change the parent page format first.");
  const doc = parseNative(parent.body, config), matches: { pos: number; database: boolean }[] = [];
  doc.descendants((node, pos) => {
    if (editorKind(node) === "database" && localPageTarget(node.attrs.url) === id) matches.push({ pos, database: true });
    if (editorKind(node) === "paragraph" && node.childCount === 1 && node.firstChild?.isText) {
      const href = node.firstChild.marks.find(mark => editorKind(mark) === "link")?.attrs.href;
      if (href === `#database/${id}` || href === `#page/${id}`) matches.push({ pos, database: false });
    }
  });
  if (matches.length > 1) throw new Error("This parent has several entries for the database. Convert the intended block from its own menu.");
  if (!matches.length) {
    const newline = parent.body.includes("\r\n") ? "\r\n" : "\n";
    const body = parent.body + (parent.body ? newline.repeat(2) : "") + `<database url="#page/${escapeXml(id)}" inline="${inline}"></database>` + newline;
    let found = false; parseNative(body, config).descendants(node => { if (editorKind(node) === "database" && localPageTarget(node.attrs.url) === id && node.attrs.inline === inline) found = true; });
    if (!found) throw new Error("Close unfinished syntax in the parent before inserting the database entry.");
    return body;
  }
  const match = matches[0], node = doc.nodeAt(match.pos)!;
  if (match.database && node.attrs.inline === inline) return parent.body;
  const { sourceStart: start, sourceEnd: end, source } = node.attrs;
  if (typeof start !== "number" || typeof end !== "number" || typeof source !== "string" || parent.body.slice(start, end) !== source) throw new Error("The database entry cannot be converted without changing unrelated source. Use its block menu instead.");
  const indent = source.match(/^[\t ]*/)?.[0] ?? "";
  let replacement: string;
  if (!match.database) replacement = `${indent}<database url="#page/${escapeXml(id)}" inline="${inline}">${escapeXml(node.textContent)}</database>`;
  else {
    const tag = openingTag(source.slice(indent.length));
    if (!tag || tag.tag !== "database") throw new Error("The original database tag is not safely editable");
    const head = source.slice(indent.length, indent.length + tag.length);
    // Tokenize the already-parsed opening tag so attribute-looking text inside another value is untouched.
    const attribute = [...head.matchAll(/([a-zA-Z][\w-]*)(\s*=\s*)(["'])([\s\S]*?)\3/g)].find(match => match[1] === "inline");
    if (attribute) {
      const valueStart = indent.length + attribute.index! + attribute[1].length + attribute[2].length + 1;
      replacement = source.slice(0, valueStart) + String(inline) + source.slice(valueStart + attribute[4].length);
    } else {
      const at = indent.length + tag.length - (tag.selfClosing ? 2 : 1);
      replacement = source.slice(0, at) + ` inline="${inline}"` + source.slice(at);
    }
  }
  return parent.body.slice(0, start) + replacement + parent.body.slice(end);
}
