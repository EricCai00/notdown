import { DOMSerializer, type Node as PMNode } from "prosemirror-model";
import type { NodeView } from "prosemirror-view";
import { fileSizeLabel } from "../document/media";
import { assetDisplayUrl } from "../shared/asset-display";
import { assetInfo } from "../shared/asset-info";

/** Resource metadata is presentation only; it never changes the document or its revision. */
export class MediaView implements NodeView {
  dom: HTMLElement;
  private request?: AbortController;
  constructor(private node: PMNode) {
    this.dom = this.render(node);
    this.loadSize();
  }
  private render(node: PMNode) {
    const dom = DOMSerializer.renderSpec(document, node.type.spec.toDOM!(node)).dom as HTMLElement;
    for (const item of [dom, ...Array.from(dom.querySelectorAll("[src], [href], [data]"))]) {
      for (const attribute of ["src", "href", "data"]) {
        const value = item.getAttribute(attribute);
        if (value) item.setAttribute(attribute, assetDisplayUrl(value));
      }
    }
    return dom;
  }
  private loadSize() {
    this.request?.abort();
    const size = this.dom.querySelector<HTMLElement>(".pm-file-size");
    if (!size || !this.node.attrs.src) return;
    const controller = this.request = new AbortController();
    void assetInfo(this.node.attrs.src, controller.signal).then(info => {
      if (!info || controller.signal.aborted) return;
      if (info.size !== null) size.textContent = fileSizeLabel(info.size);
      if (info.name) {
        const name = this.dom.querySelector<HTMLElement>(".pm-file-name");
        if (name && !this.node.attrs.caption) name.textContent = info.name;
        const link = this.dom.querySelector<HTMLAnchorElement>(".pm-file-card");
        if (link) link.download = info.name;
      }
    }).catch(() => { /* Missing assets retain their original name and link. */ });
  }
  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    if (node.sameMarkup(this.node)) { this.node = node; return true; }
    this.node = node;
    const next = this.render(node);
    this.dom.replaceChildren(...Array.from(next.childNodes));
    for (const attribute of Array.from(this.dom.attributes)) this.dom.removeAttribute(attribute.name);
    for (const attribute of Array.from(next.attributes)) this.dom.setAttribute(attribute.name, attribute.value);
    this.loadSize();
    return true;
  }
  stopEvent(event: Event) {
    return event.target instanceof Element && !!event.target.closest("audio, video, iframe, object, a");
  }
  ignoreMutation() { return true; }
  destroy() { this.request?.abort(); }
}
