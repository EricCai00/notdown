import { isEditorKind } from "../document/node-identity";
import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { parseNative } from "./codec.js";
import { syntaxHtml, diagramSource } from "./product-render.js";
import { metadataValues } from "./products.js";
import { mmdMetadataKey } from "./mmd-metadata.js";
import { slug } from "./attributes.js";
import DOMPurify from "dompurify";
import { refreshCitations } from "./citation-view";
import { imageCaptionRange, replaceImageCaption } from "../document/image-caption";
import { refreshMmdCitations } from "./mmd-citation-view";
import { showEditorPanel } from "../editor/editor-panel";
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
  private captionButton = document.createElement("button");
  private captionDialog?: HTMLDialogElement;
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
      const replacement = parsed.childCount === 1 && isEditorKind(first, "syntax_block")
        ? first : null;
      const attrs =
        replacement
          ? { ...replacement.attrs, source: null, sourceFingerprint: null }
          : {
              ...this.node.attrs,
              raw,
              html: "",
              data: {},
              source: null,
              sourceFingerprint: null,
            };
      this.view.dispatch(
        this.view.state.tr.setNodeMarkup(pos, replacement?.type, {
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
    this.captionButton.type = "button"; this.captionButton.textContent = "Edit caption";
    this.captionButton.onclick = () => {
      if (!this.view.editable) return;
      const original = this.node, range = imageCaptionRange(original.attrs.raw);
      if (!range) return;
      this.captionDialog?.remove();
      const dialog = this.captionDialog = document.createElement("dialog"); dialog.className = "pm-link-dialog"; dialog.setAttribute("aria-label", "Image caption");
      const form = document.createElement("form"), label = document.createElement("label"), input = document.createElement("input"), output = document.createElement("output");
      label.textContent = "Caption"; input.setAttribute("aria-label", "Caption");
      input.value = original.attrs.raw.slice(range.from, range.to).replace(/\\([\\\[\]])/g, "$1"); label.append(input);
      const save = document.createElement("button"), cancel = document.createElement("button"); save.type = "submit"; save.textContent = "Save"; cancel.type = "button"; cancel.textContent = "Cancel"; cancel.onclick = () => dialog.close();
      form.append(label, output, save, cancel); dialog.append(form); document.body.append(dialog);
      form.onsubmit = event => {
        event.preventDefault(); const pos = this.getPos();
        if (pos === undefined || !this.node.eq(original)) { output.textContent = "Image changed. Reopen its caption."; return; }
        // An untouched rich caption keeps its exact original Markdown.
        if (input.value === original.attrs.raw.slice(range.from, range.to).replace(/\\([\\\[\]])/g, "$1")) { dialog.close(); return; }
        const parsed = parseNative(replaceImageCaption(original.attrs.raw, input.value), original.attrs.config);
        if (parsed.childCount !== 1) { output.textContent = "The image must remain a single block."; return; }
        this.view.dispatch(this.view.state.tr.replaceWith(pos, pos + original.nodeSize, parsed.firstChild!)); dialog.close(); this.view.focus();
      };
      dialog.onclose = () => dialog.remove(); showEditorPanel(dialog, "Image caption", this.view.dom); input.focus({ preventScroll: true });
    };
    this.dom.append(this.button, this.captionButton, this.preview, this.input);
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
    if (!isEditorKind(node, "syntax_block")) return false;
    if (node.attrs.kind === "raw" && node.attrs.data?.format === "html") return false;
    this.node = node;
    this.dom.dataset.syntaxKind = node.attrs.kind;
    this.captionButton.hidden = node.attrs.kind !== "figure";
    this.dom.hidden = node.attrs.kind === "comment" || node.attrs.kind === "definition" && String(node.attrs.data.key).startsWith("#");
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
    this.captionDialog?.remove();
    this.disposed = true;
    this.controller?.abort();
    clearInterval(this.timer);
  }
}
export function refreshProductViews(view: EditorView) {
  const meta: Record<string, unknown> = {}, definitions: Record<string, string> = {};
  const footnotes = new Map<string, string>();
  view.state.doc.descendants((node) => {
    if (isEditorKind(node, "footnote") && !footnotes.has(node.attrs.label)) footnotes.set(node.attrs.label, node.textBetween(0, node.content.size, "\n", " "));
    if (isEditorKind(node, "syntax_block") && node.attrs.kind === "metadata")
      Object.assign(meta, metadataValues(node.attrs.raw, node.attrs.metadataForm));
    if (isEditorKind(node, "syntax_block") && node.attrs.kind === "definition")
      definitions[node.attrs.data.key] = node.attrs.data.body;
  });
  view.state.doc.descendants((node, pos) => {
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) return;
    if (isEditorKind(node, "footnote_reference")) {
      const missing = !footnotes.has(node.attrs.label);
      dom.title = missing ? "Footnote definition not found: " + node.attrs.label : footnotes.get(node.attrs.label) || "Empty footnote";
      dom.setAttribute("aria-invalid", String(missing));
    }
    if (
      isEditorKind(node, "syntax_inline") &&
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
    if (isEditorKind(node, "syntax_inline") && node.attrs.kind === "variable") {
      const key =
        mmdMetadataKey(/^\[%([^\]]+)\]/.exec(node.attrs.raw)?.[1] || "");
      dom.textContent = String(meta[key] ?? "Undefined: " + key);
    }

  });
  const bib = String(meta.bibliography || meta.bibtex || "");
  refreshCitations(view, meta);
  if (!bib) {
    bibliographyRequests.delete(view);
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
  }
  refreshMmdCitations(view, bibliographyRequests.get(view)?.entries || {});
}
