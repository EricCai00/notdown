import type { Node as PMNode } from "prosemirror-model";
import { parseNative } from "../../markdown-engine/codec";
import { defaultSyntax } from "../../markdown-engine/config";
import { editorKind } from "../../document/node-identity";
import type { Page } from "../../shared/types";
import { documentMetadata } from "../metadata/document-metadata";

export type CardPreviewMode = "none" | "cover" | "content" | "first-image" | "first-blocks";
export const defaultGalleryPreview: CardPreviewMode = "first-image";
export const cardPreviewChoices: [CardPreviewMode, string][] = [
  ["first-image", "First image"], ["content", "First block"], ["first-blocks", "Page preview"], ["cover", "Page cover"], ["none", "None"],
];

/** Metadata is not a body block. Parse complete source so fences and unknown syntax
 * retain their boundaries; this read-only projection is never written to the page. */
export function cardPreviewDocument(page: Pick<Page, "body" | "bodyFormat" | "syntax">): PMNode {
  let body = page.body;
  try {
    const metadata = documentMetadata(body);
    if (metadata.form === "yaml") body = body.replace(/^(?:\uFEFF)?---[\t ]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/, "");
    if (metadata.form === "pandoc") body = body.replace(/^(?:\uFEFF)?(?:%(?:[^\r\n]*)(?:\r?\n|$)(?:[\t ]+\S[^\r\n]*(?:\r?\n|$))*){1,3}/, "");
  } catch { /* Malformed metadata remains visible as source. */ }
  return parseNative(body, page.syntax ?? defaultSyntax(page.bodyFormat));
}

export function firstCardBlock(doc: PMNode): PMNode | undefined {
  let first: PMNode | undefined;
  doc.forEach(node => {
    if (!first && !node.attrs.metadataForm && node.attrs.kind !== "metadata" &&
      !(editorKind(node) === "paragraph" && !node.content.size)) first = node;
  });
  return first;
}
