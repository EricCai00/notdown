import { Fragment, type Node as PMNode } from "prosemirror-model";
import { parseNative, serializeNative } from "../src/markdown-engine/codec.js";
import { editorKind, createEditorNode } from "../src/document/node-identity.js";
import { editorSchema as schema } from "../src/document/editor-schema.js";

/** Notion images are blocks, including images inside CommonMark list items.
 * Transform parsed content so code, unknown syntax and untouched blocks retain
 * their original source, and text on either side keeps its inline formatting. */
export function blockifyNotionImages(source: string, variant: "notdown" | "notion-markdown"): string {
  const config = { version: 1 as const, variant, notionVersion: "v2" as const, extensions: {} };
  const doc = parseNative(source, config);
  let changed = false;
  const visit = (node: PMNode): PMNode[] => {
    if (node.isTextblock && !node.type.spec.code &&
        Array.from({ length: node.childCount }, (_, i) => node.child(i)).some(child => editorKind(child) === "image")) {
      changed = true;
      const blocks: PMNode[] = [], text: PMNode[] = [];
      const flush = () => {
        if (!text.length) return;
        blocks.push(node.type.create({ ...node.attrs, source: null, sourceFingerprint: null,
          sourceStart: null, sourceEnd: null, sourceKey: null }, text.splice(0), node.marks));
      };
      node.forEach(child => {
        if (editorKind(child) !== "image") { text.push(child); return; }
        flush();
        blocks.push(createEditorNode(schema, "image_block", { syntaxForm: "notion",
          src: child.attrs.src, caption: child.attrs.alt || "", title: child.attrs.title || "",
          markdownAttrs: child.attrs.markdownAttrs }));
      });
      flush();
      // Only the first replacement inherits the original root block's gap key.
      blocks[0] = blocks[0].type.create({ ...blocks[0].attrs, sourceKey: node.attrs.sourceKey }, blocks[0].content, blocks[0].marks);
      return blocks;
    }
    if (node.isLeaf) return [node];
    const children: PMNode[] = [];
    node.forEach(child => children.push(...visit(child)));
    if (["blockquote", "toggle_block"].includes(editorKind(node)) && !children[0]?.isTextblock)
      children.unshift(createEditorNode(schema, "paragraph"));
    const content = Fragment.from(children);
    if (content.eq(node.content)) return [node];
    // Lists and titled containers still need their leading paragraph when their
    // first paragraph contained only an image.
    const next = node.type.createAndFill(node.attrs, content, node.marks);
    if (!next) throw new Error("Cannot preserve the Notion container while converting images to blocks.");
    return [next];
  };
  const normalized = visit(doc)[0];
  if (!changed) return source;
  normalized.check();
  return serializeNative(normalized, config);
}
