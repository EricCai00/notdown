import type { Node as PMNode } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";
import { closeHistory } from "prosemirror-history";
import { isEditorKind } from "../document/node-identity";
import { imageModel, replaceImageAttributes, replaceImageDestination } from "../document/image-layout";
import { replaceImageCaption } from "../document/image-caption";
import { parseNative } from "../markdown-engine/codec";
import { safeReference as safeUrl } from "../document/notion-syntax";

export interface ImageChange { caption?: string; src?: string; layout?: Record<string, string | null> }
export function imageTransaction(state: EditorState, pos: number, original: PMNode, changes: ImageChange, layoutEnabled: boolean) {
  if (!state.doc.nodeAt(pos)?.eq(original)) throw new Error("This image changed. Reopen its controls.");
  if (changes.layout && !layoutEnabled) throw new Error("This page format does not support image layout properties.");
  if (changes.src !== undefined && (!changes.src || safeUrl(changes.src) !== changes.src || /[\r\n<>]/.test(changes.src)))
    throw new Error("Enter a valid image URL or attachment path.");
  if (changes.caption?.match(/[\r\n]/)) throw new Error("Enter a single-line caption.");
  let replacement: PMNode;
  if (isEditorKind(original, "syntax_block")) {
    let raw = original.attrs.raw;
    if (changes.caption !== undefined) raw = replaceImageCaption(raw, changes.caption);
    if (changes.src !== undefined) raw = replaceImageDestination(raw, changes.src);
    if (changes.layout) raw = replaceImageAttributes(raw, changes.layout);
    const parsed = parseNative(raw, original.attrs.config);
    const node = parsed.firstChild;
    if (parsed.childCount !== 1 || !node || !(imageModel(node) || isEditorKind(node, "paragraph") && node.childCount === 1 && isEditorKind(node.firstChild, "image")))
      throw new Error("The source must remain one image block.");
    replacement = node.type.create({ ...node.attrs, sourceKey: original.attrs.sourceKey,
      sourceStart: original.attrs.sourceStart, sourceEnd: original.attrs.sourceEnd }, node.content, node.marks);
  } else {
    const attrs: Record<string, any> = { ...original.attrs, markdownAttrs: { ...original.attrs.markdownAttrs } };
    if (changes.caption !== undefined) attrs[isEditorKind(original, "image") ? "alt" : "caption"] = changes.caption;
    if (changes.src !== undefined) attrs.src = changes.src;
    for (const [key, value] of Object.entries(changes.layout || {})) {
      if (value === null) delete attrs.markdownAttrs[key]; else attrs.markdownAttrs[key] = value;
    }
    replacement = original.type.create(attrs, original.content, original.marks);
  }
  return closeHistory(state.tr).replaceWith(pos, pos + original.nodeSize, replacement);
}
