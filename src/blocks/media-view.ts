import { DOMSerializer, type Node as PMNode } from "prosemirror-model";
import type { NodeView } from "prosemirror-view";
import { fileSizeLabel } from "../document/media";
import { assetDisplayUrl } from "../shared/asset-display";

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
    let url: URL;
    try { url = new URL(this.node.attrs.src, document.baseURI); } catch { return; }
    // No cross-origin probes, full-file downloads or persistence of derived sizes.
    if (url.origin !== location.origin || !/^\/assets\/[^/]+$/.test(url.pathname)) return;
    const controller = this.request = new AbortController();
    void fetch(url, { method: "HEAD", signal: controller.signal }).then(response => {
      const length = response.headers.get("content-length");
      if (!response.ok || controller.signal.aborted || length === null || !/^\d+$/.test(length)) return;
      const bytes = Number(length);
      if (Number.isSafeInteger(bytes)) size.textContent = fileSizeLabel(bytes);
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
