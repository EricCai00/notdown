import { parseNative } from "../../markdown-engine/codec";
import { defaultSyntax, enabled, usesNotionSyntax } from "../../markdown-engine/config";
import { internalReference, nodeReference, resolveReferencePage } from "../../document/internal-reference";
import { escapeXml, pageUrl } from "../../document/notion-syntax";
import { editorKind } from "../../document/node-identity";
import type { Page } from "../../shared/types";

type EntryPage = Pick<Page, "id" | "title" | "legacyIds">;
type ParentPage = Pick<Page, "id" | "body" | "syntax" | "bodyFormat">;

/** Count actual entries, including nested ones, without treating code or mentions as child blocks. */
export function insertedChildPageIds(parent: ParentPage, pages: readonly EntryPage[]): Set<string> {
  const config = parent.syntax ?? defaultSyntax(parent.bodyFormat ?? "markdown");
  const native = usesNotionSyntax(config) && enabled(config, "notion_pages");
  const result = new Set<string>();
  parseNative(parent.body, config).descendants(node => {
    let reference = node.type.name === "block.child_page" ? nodeReference(node) : null;
    // Other dialects have no owned-page block. A standalone Markdown link is their native entry.
    if (!native && editorKind(node) === "paragraph" && node.childCount === 1 && node.firstChild?.isText) {
      const link = node.firstChild.marks.find(mark => editorKind(mark) === "link");
      if (link) reference = internalReference(link.attrs.href);
    }
    const page = reference && reference.kind === "page" && resolveReferencePage(reference, pages, parent.id);
    if (page) result.add(page.id);
  });
  return result;
}

/** Append only; preserve every byte of existing source and verify that the added entries parse. */
export function appendChildPageEntries(parent: ParentPage, children: readonly EntryPage[], pages: readonly EntryPage[]) {
  if (!children.length) return { body: parent.body, inserted: 0 };
  const inserted = insertedChildPageIds(parent, pages);
  const missing = children.filter(child => !inserted.has(child.id));
  if (!missing.length) return { body: parent.body, inserted: 0 };
  const config = parent.syntax ?? defaultSyntax(parent.bodyFormat ?? "markdown");
  const native = usesNotionSyntax(config) && enabled(config, "notion_pages");
  const newline = parent.body.includes("\r\n") ? "\r\n" : "\n";
  const entries = missing.map(child => native
    ? `<page url="${escapeXml(pageUrl(child.id))}">${escapeXml(child.title)}</page>`
    : `[${child.title.replace(/[\\\[\]]/g, "\\$&").replace(/[\r\n]+/g, " ")}](${pageUrl(child.id)})`);
  const body = parent.body + (parent.body ? newline.repeat(2) : "") + entries.join(newline.repeat(2)) + newline;
  const verified = insertedChildPageIds({ ...parent, body }, pages);
  if (missing.some(child => !verified.has(child.id)))
    throw new Error("Child page entries could not be appended outside the existing content. Close any unfinished code fence or block in the parent page first.");
  return { body, inserted: missing.length };
}
