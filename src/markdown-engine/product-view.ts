import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { parseNative } from "./codec.js";
import { syntaxHtml, diagramSource } from "./product-render.js";
import { metadataValues } from "./products.js";
import { mmdMetadataKey } from "./mmd-metadata.js";
import { slug } from "./attributes.js";
import DOMPurify from "dompurify";
import { refreshCitations } from "./citation-view";
let diagramId = 0;
const bibliographyRequests = new WeakMap<
  EditorView,
  { key: string; entries: Record<string, string>; time: number }
>();

export function inlineTransclusionView(node: PMNode): NodeView {
  const dom = document.createElement("span");
  dom.className = "md-inline-transclusion";
  dom.contentEditable = "false";
  dom.title = node.attrs.raw;
  let disposed = false,
    serial = 0,
    revision = "";
  let controller: AbortController | undefined;
  const render = async () => {
    const current = ++serial;
    controller?.abort();
    controller = new AbortController();
    if (!revision) dom.textContent = "Loading included file…";
    try {
      const response = await fetch("/api/syntax/transclusion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: node.attrs.label,
          config: node.attrs.config,
        }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (disposed || current !== serial) return;
      if (!response.ok) throw new Error(data.error);
      if (revision !== data.revision)
        dom.innerHTML = DOMPurify.sanitize(data.html);
      revision = data.revision;
      dom.dispatchEvent(new Event("load", { bubbles: true }));
    } catch (error) {
      if (!disposed && current === serial) {
        revision = "";
        dom.textContent = "Unable to display: " + String(error);
      }
    }
  };
  void render();
  const timer = setInterval(() => {
    if (document.visibilityState !== "hidden") void render();
  }, 4000);
  return {
    dom,
    ignoreMutation: () => true,
    destroy: () => {
      disposed = true;
      controller?.abort();
      clearInterval(timer);
    },
  };
}

export class SyntaxBlockView implements NodeView {
  dom = document.createElement("section");
  preview = document.createElement("div");
  input = document.createElement("textarea");
  button = document.createElement("button");
  private serial = 0;
  private disposed = false;
  private lastRaw = "";
  private controller?: AbortController;
  private timer?: ReturnType<typeof setInterval>;
  private lastInclude = "";
  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
  ) {
    this.dom.className = "pm-syntax-block";
    this.dom.contentEditable = "false";
    this.preview.className = "pm-syntax-preview";
    this.button.type = "button";
    this.button.textContent = "Edit source";
    this.input.hidden = true;
    this.input.spellcheck = false;
    this.input.setAttribute("aria-label", "Extension block source");
    this.button.onclick = () => {
      this.input.hidden = !this.input.hidden;
      if (!this.input.hidden) this.input.focus();
    };
    this.input.oninput = () => {
      if (!this.view.editable) { this.input.value = this.node.attrs.raw; return; }
      const pos = this.getPos();
      if (pos === undefined) return;
      const raw = this.input.value,
        parsed = parseNative(raw, this.node.attrs.config),
        first = parsed.firstChild;
      // Keep unfinished input editable in its existing carrier until syntax is complete.
      const attrs =
        first?.type === this.node.type && parsed.childCount === 1
          ? { ...first.attrs, source: null, sourceFingerprint: null }
          : {
              ...this.node.attrs,
              raw,
              html: "",
              data: {},
              source: null,
              sourceFingerprint: null,
            };
      this.view.dispatch(
        this.view.state.tr.setNodeMarkup(pos, undefined, {
          ...attrs,
          sourceKey: this.node.attrs.sourceKey,
        }),
      );
    };
    this.input.onkeydown = (e) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.isComposing &&
        ["z", "y"].includes(e.key.toLowerCase())
      ) {
        this.view.someProp("handleKeyDown", (handler) => handler(this.view, e));
        e.preventDefault();
        const pos = this.getPos();
        const dom = pos === undefined ? null : this.view.nodeDOM(pos);
        if (dom instanceof HTMLElement) {
          const input = dom.querySelector("textarea");
          if (input) {
            input.hidden = false;
            input.focus();
          } else if (this.input.isConnected && this.input.closest("dialog[open]")) this.input.focus();
          else this.view.focus();
        }
      }
    };
    this.dom.append(this.button, this.preview, this.input);
    this.update(node);
    if (this.node.attrs.kind === "transclusion")
      this.timer = setInterval(() => {
        if (
          this.node.attrs.kind === "transclusion" &&
          document.visibilityState !== "hidden"
        )
          void this.render();
      }, 4000);
  }
  update(node: PMNode) {
    if (node.type.name !== "syntax_block") return false;
    this.node = node;
    this.dom.dataset.syntaxKind = node.attrs.kind;
    if (this.input.value !== node.attrs.raw) this.input.value = node.attrs.raw;
    if (this.lastRaw !== node.attrs.raw || !this.preview.childNodes.length) {
      this.lastRaw = node.attrs.raw;
      void this.render();
    }
    return true;
  }
  private async render() {
    const n = ++this.serial;
    this.controller?.abort();
    this.controller = new AbortController();
    if (this.node.attrs.kind !== "transclusion" || !this.lastInclude)
      this.preview.innerHTML = syntaxHtml(this.node);
    const { kind, data, config } = this.node.attrs;
    try {
      if (kind === "diagram") {
        const { default: mermaid } = await import("mermaid");
        if (this.disposed || n !== this.serial) return;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          htmlLabels: false,
          maxTextSize: 100000,
        });
        const rendered = await mermaid.render(
          "notdown-diagram-" + ++diagramId,
          diagramSource(data.language || "mermaid", data.code || ""),
        );
        if (this.disposed || n !== this.serial) return;
        this.preview.innerHTML = DOMPurify.sanitize(rendered.svg, {
          USE_PROFILES: { svg: true, svgFilters: true },
          FORBID_TAGS: ["foreignObject"],
        });
      } else if (kind === "embed") {
        const src = String(data.src || "");
        if (!/^https?:\/\//i.test(src))
          throw new Error("Embed address must be an HTTP(S) URL");
        const iframe = document.createElement("iframe");
        iframe.src = src;
        iframe.title = data.title || "Embedded page";
        iframe.sandbox.add(
          "allow-scripts",
          "allow-forms",
          "allow-presentation",
        );
        iframe.referrerPolicy = "no-referrer";
        iframe.style.width = "100%";
        iframe.style.height = /^\d{1,4}$/.test(data.height)
          ? data.height + "px"
          : "320px";
        this.preview.replaceChildren(iframe);
      } else if (kind === "transclusion") {
        if (!this.lastInclude) this.preview.textContent = "Loading included file…";
        const response = await fetch("/api/syntax/transclusion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: data.path, config }),
          signal: this.controller.signal,
        });
        const result = await response.json();
        if (this.disposed || n !== this.serial) return;
        if (!response.ok) throw new Error(result.error);
        if (result.revision !== this.lastInclude) {
          this.preview.innerHTML = DOMPurify.sanitize(result.html);
          this.lastInclude = result.revision;
        }
        this.preview.dataset.dependencies =
          result.dependencies?.join(",") || "";
      }
      this.dom.dispatchEvent(new Event("load", { bubbles: true }));
    } catch (error) {
      if (this.disposed || n !== this.serial) return;
      this.preview.textContent =
        "Unable to display: " + (error instanceof Error ? error.message : String(error));
    }
  }
  stopEvent(e: Event) {
    return this.dom.contains(e.target as Node);
  }
  ignoreMutation() {
    return true;
  }
  destroy() {
    this.disposed = true;
    this.controller?.abort();
    clearInterval(this.timer);
  }
}
export function refreshProductViews(view: EditorView) {
  const meta: Record<string, unknown> = {}, definitions: Record<string, string> = {};
  const footnotes = new Set<string>();
  view.state.doc.descendants((node) => {
    if (node.type.name === "footnote") footnotes.add(node.attrs.label);
    if (node.type.name === "syntax_block" && node.attrs.kind === "metadata")
      Object.assign(meta, metadataValues(node.attrs.raw, node.attrs.metadataForm));
    if (node.type.name === "syntax_block" && node.attrs.kind === "definition")
      definitions[node.attrs.data.key] = node.attrs.data.body;
  });
  view.state.doc.descendants((node, pos) => {
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) return;
    if (node.type.name === "footnote_reference") {
      const missing = !footnotes.has(node.attrs.label);
      dom.title = missing ? "Footnote definition not found: " + node.attrs.label : "Footnote: " + node.attrs.label;
      dom.setAttribute("aria-invalid", String(missing));
    }
    if (
      node.type.name === "syntax_inline" &&
      ["abbreviation", "glossary", "citation"].includes(node.attrs.kind)
    ) {
      const match = /\[([>#?])([^\]]+)\]/.exec(node.attrs.raw);
      if (match && !match[2].startsWith("(")) {
        const key = match[1] + match[2].replace(/;$/, "");
        dom.title = definitions[key] ?? node.attrs.title;
        if (definitions[key] && node.attrs.kind !== "abbreviation")
          dom.setAttribute("href", "#md-def-" + slug(key));
        else if (node.attrs.kind === "citation") dom.removeAttribute("href");
      }
    }
    if (node.type.name === "syntax_inline" && node.attrs.kind === "variable") {
      const key =
        mmdMetadataKey(/^\[%([^\]]+)\]/.exec(node.attrs.raw)?.[1] || "");
      dom.textContent = String(meta[key] ?? "Undefined: " + key);
    }

  });
  const bib = String(meta.bibliography || meta.bibtex || "");
  if (refreshCitations(view, meta)) { bibliographyRequests.delete(view); view.dom.parentElement?.querySelector(".md-bibliography")?.remove(); return; }
  if (!bib) {
    bibliographyRequests.delete(view);
    view.dom.parentElement?.querySelector(".md-bibliography")?.remove();
  }
  if (bib) {
    const prior = bibliographyRequests.get(view);
    if (!prior || prior.key !== bib || Date.now() - prior.time > 4000) {
      bibliographyRequests.set(view, {
        key: bib,
        entries: prior?.key === bib ? prior.entries : {},
        time: Date.now(),
      });
      void fetch("/api/syntax/bibliography", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: bib }),
      })
        .then((r) => r.json())
        .then((r) => {
          if (
            !view.dom.isConnected ||
            bibliographyRequests.get(view)?.key !== bib
          )
            return;
          bibliographyRequests.set(view, {
            key: bib,
            entries: r.entries || {},
            time: Date.now(),
          });
          refreshProductViews(view);
        })
        .catch(() => {});
    }
    const entries = bibliographyRequests.get(view)?.entries || {},
      used = new Set<string>();
    view.state.doc.descendants((node, pos) => {
      if (node.type.name !== "syntax_inline" || node.attrs.kind !== "citation")
        return;
      const key =
        /\[#([^\]]+)\]/.exec(node.attrs.raw)?.[1].replace(/;$/, "") || "";
      const dom = view.nodeDOM(pos);
      if (entries[key] && dom instanceof HTMLElement) {
        dom.title = entries[key];
        dom.setAttribute("href", "#md-bib-" + slug(key));
        used.add(key);
      } else if (dom instanceof HTMLElement) {
        dom.title =
          definitions["#" + key] || node.attrs.title || "Citation not found: " + key;
        if (definitions["#" + key])
          dom.setAttribute("href", "#md-def-" + slug(key));
        else dom.removeAttribute("href");
      }
    });
    let panel =
      view.dom.parentElement?.querySelector<HTMLElement>(".md-bibliography");
    if (!panel && used.size) {
      panel = document.createElement("aside");
      panel.className = "md-bibliography";
      view.dom.parentElement?.append(panel);
    }
    if (panel) {
      panel.replaceChildren();
      for (const key of used) {
        const p = document.createElement("p");
        p.id = "md-bib-" + slug(key);
        p.textContent = entries[key];
        panel.append(p);
      }
    }
  }
}
