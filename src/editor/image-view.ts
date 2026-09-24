import { DOMSerializer, type Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
/** Official NFM image captions share the image label; no extra persisted node. */
export function imageView(node: PMNode, view: EditorView, getPos: () => number | undefined, caption: () => boolean): NodeView {
  const dom = document.createElement("span"); dom.className = "pm-image-view"; dom.contentEditable = "false";
  const render = (next: PMNode) => {
    dom.replaceChildren(DOMSerializer.renderSpec(document, next.type.spec.toDOM!(next)).dom);
    const pos = getPos(), parent = pos === undefined ? null : view.state.doc.resolve(pos).parent;
    if (caption() && parent?.type.name === "paragraph" && parent.childCount === 1 && next.attrs.alt) {
      const label = document.createElement("span"); label.className = "pm-image-caption"; label.textContent = next.attrs.alt; dom.append(label);
    }
  };
  render(node);
  return { dom, update(next) { if (next.type !== node.type) return false; node = next; render(next); return true; }, ignoreMutation: () => true };
}
